import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { alertsRepository } from '../../src/repositories/alerts.repository';
import { password } from '../../src/utils/password';
import {
  MockAIProvider,
  resetAIProvider,
  setAIProvider,
} from '../../src/services/gemini.provider';
import { AppError } from '../../src/utils/app-error';

/**
 * Régression des correctifs de l'assistant :
 *  1. `getPublishedAlerts` applique réellement ses filtres (commune, événement)
 *     au lieu de renvoyer toutes les alertes publiées ;
 *  2. `getHistoricalEvents` retrouve un événement cité par identifiant même
 *     s'il est hors des 50 plus récents ;
 *  3. un tour dont la génération échoue n'laisse ni question orpheline, ni
 *     conversation vide.
 *
 * Fichier isolé : la limite de débit `/ai/chat` (30/15 min) est comptée par
 * utilisateur et n'est pas remise à zéro entre les tests.
 */

let user: { id: string; token: string };

let communeA: { id: string; name: string };
let communeB: { id: string; name: string };

let alertA: string;
let alertB: string;

const fillerEventIds: string[] = [];

function makeEmail(): string {
  return `ai_fix_${Date.now()}@madarisk.test`;
}

async function createUserAndLogin(): Promise<{ id: string; token: string }> {
  const email = makeEmail();
  const hash = await password.hash('Passw0rd!');
  const created = await usersRepository.create({
    email,
    passwordHash: hash,
    firstName: 'AI',
    lastName: 'Fixes',
    role: 'ADMIN',
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'Passw0rd!',
  });
  return { id: created.id, token: login.body.data.accessToken };
}

function chat(message: string) {
  return request(app)
    .post('/api/v1/ai/chat')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ message });
}

async function countMessages(conversationId: string): Promise<number> {
  const res = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM ai_messages WHERE conversation_id = $1',
    [conversationId],
  );
  return parseInt(res.rows[0].count, 10);
}

beforeAll(async () => {
  user = await createUserAndLogin();

  // Deux communes aux noms suffisamment distincts : la recherche de
  // territoire est une correspondance de sous-chaîne, un nom qui serait le
  // fragment d'un autre ferait remonter la mauvaise commune en premier. Les
  // noms mono-mots sont retenus seuls : `extractTerritoryQuery` s'arrête au
  // premier mot non capitalisé, un nom en plusieurs mots serait tronqué.
  const communes = await db.query<{ id: string; name: string }>(
    `SELECT c1.id, c1.name
     FROM communes c1
     WHERE c1.name ~ '^[A-Z][a-zà-ÿ]+$'
       AND NOT EXISTS (
         SELECT 1 FROM communes c2
         WHERE c2.id <> c1.id
           AND (c2.name ILIKE '%' || c1.name || '%' OR c1.name ILIKE '%' || c2.name || '%')
       )
     ORDER BY c1.name
     LIMIT 2`,
  );
  communeA = communes.rows[0];
  communeB = communes.rows[1];

  // Deux alertes publiées, actives, sur deux communes distinctes : le filtre
  // doit n'en renvoyer qu'une seule par commune.
  alertA = (
    await alertsRepository.create({
      communeId: communeA.id,
      type: 'CYCLONE',
      severity: 'ELEVEE',
      status: 'PUBLIEE',
      title: `Alerte filtre commune ${communeA.name}`,
      message: 'Alerte de test pour la commune A.',
      publishedAt: new Date().toISOString(),
    })
  ).id;
  alertB = (
    await alertsRepository.create({
      communeId: communeB.id,
      type: 'CYCLONE',
      severity: 'MODEREE',
      status: 'PUBLIEE',
      title: `Alerte filtre commune ${communeB.name}`,
      message: 'Alerte de test pour la commune B.',
      publishedAt: new Date().toISOString(),
    })
  ).id;
});

afterAll(async () => {
  resetAIProvider();
  await db.query('DELETE FROM alerts WHERE id = ANY($1::uuid[])', [[alertA, alertB]]);
  if (fillerEventIds.length > 0) {
    await db.query('DELETE FROM hazard_events WHERE id = ANY($1::uuid[])', [fillerEventIds]);
  }
  await db.query('DELETE FROM ai_conversations WHERE user_id = $1', [user.id]);
  await db.query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1', [user.id]);
  await db.query('DELETE FROM users WHERE id = $1', [user.id]);
  await db.pool.end();
});

describe('AI - getPublishedAlerts applique ses filtres', () => {
  it('ne renvoie que les alertes de la commune demandée (chemin déterministe)', async () => {
    const mock = new MockAIProvider();
    setAIProvider(mock);
    try {
      const res = await chat(
        `Quelles alertes publiées concernent la commune de ${communeA.name} ?`,
      );
      expect(res.status).toBe(200);

      expect(mock.lastRequest).not.toBeNull();
      const entry = mock
        .lastRequest!.context.toolResults.find((r) => r.tool === 'getPublishedAlerts');
      expect(entry).toBeDefined();

      const items = entry!.result as Array<{ id: string; communeId: string | null }>;
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.communeId).toBe(communeA.id);
      }
      const ids = items.map((item) => item.id);
      expect(ids).toContain(alertA);
      expect(ids).not.toContain(alertB);
    } finally {
      resetAIProvider();
    }
  });

  it('transmet le filtre commune fourni par le modèle (function calling)', async () => {
    // Question sans aucun mot-clé d'alerte : le socle déterministe ne tourne
    // que le tableau de bord, et le modèle réclame ensuite `getPublishedAlerts`
    // en ciblant explicitement la commune B.
    const mock = new MockAIProvider({
      toolCalls: [{ name: 'getPublishedAlerts', args: { communeId: communeB.id } }],
    });
    setAIProvider(mock);
    try {
      const res = await chat('Peux-tu examiner ce dossier ?');
      expect(res.status).toBe(200);

      const sources = res.body.data.internalSources as string[];
      expect(sources).toContain('getPublishedAlerts');

      // Le repli déterministe a déjà tourné l'outil sans filtre : c'est la
      // DERNIÈRE exécution — celle demandée par le modèle — qui doit être
      // ciblée sur la commune B.
      const entries = mock
        .lastRequest!.context.toolResults.filter((r) => r.tool === 'getPublishedAlerts');
      expect(entries.length).toBeGreaterThanOrEqual(2);

      const items = entries[entries.length - 1].result as Array<{
        id: string;
        communeId: string | null;
      }>;
      const ids = items.map((item) => item.id);
      expect(ids).toContain(alertB);
      expect(ids).not.toContain(alertA);
      for (const item of items) {
        expect(item.communeId).toBe(communeB.id);
      }
    } finally {
      resetAIProvider();
      mock.toolCalls = [];
    }
  });
});

describe('AI - getHistoricalEvents retrouve un événement par identifiant', () => {
  it('renvoie un événement clos hors des 50 plus récents', async () => {
    // Cible : un événement clos volontairement ancien.
    const target = await db.query<{ id: string }>(
      `INSERT INTO hazard_events
         (event_code, name, type, status, severity, started_at, created_by)
       VALUES ($1, 'AI FIX — cible historique', 'CYCLONE', 'CLOTURE', 'MODEREE', $2, $3)
       RETURNING id`,
      [`AIFIX-TARGET-${Date.now()}`, new Date('2019-01-01T00:00:00Z'), user.id],
    );
    const targetId = target.rows[0].id;
    fillerEventIds.push(targetId);

    // 60 événements clos plus récents : la cible ne figure plus dans la liste
    // des 50 plus récents, seul un accès par identifiant peut la retrouver.
    const fillers = await db.query<{ id: string }>(
      `INSERT INTO hazard_events
         (event_code, name, type, status, severity, started_at, created_by)
       SELECT
         'AIFIX-FILLER-' || g,
         'AI FIX — remplissage ' || g,
         'CYCLONE', 'CLOTURE', 'FAIBLE',
         $1::timestamptz + (g || ' minutes')::interval,
         $2
       FROM generate_series(1, 60) g
       RETURNING id`,
      [new Date('2020-01-01T00:00:00Z'), user.id],
    );
    fillerEventIds.push(...fillers.rows.map((row) => row.id));

    const mock = new MockAIProvider({
      toolCalls: [{ name: 'getHistoricalEvents', args: { eventId: targetId } }],
    });
    setAIProvider(mock);
    try {
      const res = await chat('Peux-tu examiner ce dossier ?');
      expect(res.status).toBe(200);

      const entry = mock
        .lastRequest!.context.toolResults.find((r) => r.tool === 'getHistoricalEvents');
      expect(entry).toBeDefined();

      const payload = entry!.result as { events: Array<{ id: string }> };
      expect(payload.events.map((event) => event.id)).toContain(targetId);
    } finally {
      resetAIProvider();
      mock.toolCalls = [];
    }
  });

  it('n’expose jamais un événement non clos comme donnée historique', async () => {
    const mock = new MockAIProvider({
      toolCalls: [
        {
          name: 'getHistoricalEvents',
          args: { eventId: '11111111-2222-4333-8444-555555555555' },
        },
      ],
    });
    setAIProvider(mock);
    try {
      const res = await chat('Peux-tu examiner ce dossier ?');
      expect(res.status).toBe(200);

      const entry = mock
        .lastRequest!.context.toolResults.find((r) => r.tool === 'getHistoricalEvents');
      expect(entry).toBeDefined();

      const payload = entry!.result as { events: unknown[] };
      expect(payload.events).toEqual([]);
    } finally {
      resetAIProvider();
      mock.toolCalls = [];
    }
  });
});

describe('AI - un tour échoué ne laisse aucune trace', () => {
  it('supprime la conversation créée pour un tour dont la génération échoue', async () => {
    const failing = new MockAIProvider();
    failing.generateAnswerStream = async function* () {
      throw AppError.tooManyRequests('Quota du fournisseur IA dépassé', 60);
    };
    setAIProvider(failing);
    try {
      const before = await db.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM ai_conversations WHERE user_id = $1',
        [user.id],
      );
      const beforeCount = parseInt(before.rows[0].count, 10);

      const res = await chat('Situation globale du test de nettoyage.');
      expect(res.status).toBe(429);

      const after = await db.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM ai_conversations WHERE user_id = $1',
        [user.id],
      );
      expect(parseInt(after.rows[0].count, 10)).toBe(beforeCount);

      // Ni la question, ni les messages d'outils du tour ne subsistent.
      const orphans = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ai_messages m
         JOIN ai_conversations c ON c.id = m.conversation_id
         WHERE c.user_id = $1 AND m.content LIKE '%nettoyage%'`,
        [user.id],
      );
      expect(parseInt(orphans.rows[0].count, 10)).toBe(0);
    } finally {
      resetAIProvider();
    }
  });

  it('efface le tour échoué d’une conversation existante, sans toucher aux tours précédents', async () => {
    // Un tour réussi d'abord : la conversation et ses messages doivent
    // survivre à l'échec suivant.
    const ok = new MockAIProvider();
    setAIProvider(ok);
    const first = await chat('Décris la situation globale du test.');
    expect(first.status).toBe(200);
    const conversationId = first.body.data.conversationId as string;
    const keptCount = await countMessages(conversationId);

    const failing = new MockAIProvider();
    failing.generateAnswerStream = async function* () {
      throw new AppError('Panne du fournisseur IA', 502);
    };
    setAIProvider(failing);
    try {
      const res = await chat('Seconde question qui va échouer.', conversationId);
      expect(res.status).toBe(502);

      // La conversation est toujours là, amputée du tour échoué.
      const conv = await db.query('SELECT id FROM ai_conversations WHERE id = $1', [
        conversationId,
      ]);
      expect(conv.rows).toHaveLength(1);
      expect(await countMessages(conversationId)).toBe(keptCount);

      const orphan = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ai_messages
         WHERE conversation_id = $1 AND content LIKE '%qui va échouer%'`,
        [conversationId],
      );
      expect(parseInt(orphan.rows[0].count, 10)).toBe(0);
    } finally {
      resetAIProvider();
    }
  });
});
