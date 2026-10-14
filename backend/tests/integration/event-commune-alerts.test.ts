import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

type Role = 'ADMIN' | 'SUPER_ADMIN' | 'CLIENT';

let admin: { id: string; token: string };
let eventId: string;
/** VERT officiel limité à une fenêtre passée. */
let communeVert: string;
/** JAUNE hérité d'un district (estimation spatiale). */
let communeJaune: string;
/** ROUGE d'impact observé, puis BLEU (danger résiduel) après le passage. */
let communeRougeBleu: string;
/** JAUNE hérité d'une région ET ROUGE d'impact : l'impact doit primer. */
let communeJauneImpactee: string;
/** Aucune ligne : hors alerte (GRIS). */
let communeGris: string;

function makeEmail(): string {
  return `commune_alerts_${Date.now()}@madarisk.test`;
}

async function createUserAndLogin(role: Role): Promise<{ id: string; token: string }> {
  const email = makeEmail();
  const hash = await password.hash('Passw0rd!');
  const user = await usersRepository.create({
    email,
    passwordHash: hash,
    firstName: role,
    lastName: 'Tester',
    role,
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'Passw0rd!',
  });
  return { id: user.id, token: login.body.data.accessToken as string };
}

async function alertsAt(at: string) {
  return request(app)
    .get(`/api/v1/events/${eventId}/communes-alerts`)
    .query({ at })
    .set('Authorization', `Bearer ${admin.token}`);
}

async function summaryAt(at: string) {
  return request(app)
    .get(`/api/v1/events/${eventId}/communes-alerts/summary`)
    .query({ at })
    .set('Authorization', `Bearer ${admin.token}`);
}

interface AlertRow {
  communeId: string;
  alertLevel: string;
  infoType: string;
  territoryScope: string;
  validFrom: string;
  validTo: string | null;
  sourceName: string | null;
}

function rowFor(rows: AlertRow[], communeId: string): AlertRow | undefined {
  return rows.find((r) => r.communeId === communeId);
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');

  const created = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      eventCode: `TEST-ALERTES-${Date.now()}`,
      name: 'Événement de test — alertes communales',
      type: 'CYCLONE',
      status: 'CLOTURE',
      severity: 'EXTREME',
    });
  expect(created.status).toBe(201);
  eventId = created.body.data.id as string;

  const communes = await db.query<{ id: string }>(
    'SELECT id FROM communes ORDER BY created_at ASC LIMIT 5',
  );
  if (communes.rows.length < 5) {
    throw new Error('Moins de cinq communes en base : impossible de tester les alertes communales');
  }
  [communeVert, communeJaune, communeRougeBleu, communeJauneImpactee, communeGris] = communes.rows
    .map((r) => r.id);

  await db.query(
    `INSERT INTO event_commune_alert_history
       (event_id, commune_id, alert_level, valid_from, valid_to, info_type,
        territory_scope, source_name, source_url, comment)
     VALUES
       ($1, $2, 'VERT',  '2022-02-01T16:00:00+03', '2022-02-03T16:00:00+03',
        'OFFICIELLE', 'COMMUNE', 'Bulletin test du 1er février', 'https://example.test/b1',
        'Vert officiel communal de test.'),
       ($1, $3, 'JAUNE', '2022-02-04T16:00:00+03', '2022-02-08T00:00:00+03',
        'ESTIMATION', 'DISTRICT', 'Bulletin test du 4 février', 'https://example.test/b4',
        'Jaune hérité du district (estimation spatiale).'),
       ($1, $4, 'ROUGE', '2022-02-05T06:00:00Z',  '2022-02-06T06:00:00Z',
        'IMPACT_OBSERVE', 'COMMUNE', 'Impact observé de test', 'https://example.test/impact',
        'Impact observé daté.'),
       ($1, $4, 'BLEU',  '2022-02-06T06:00:00Z', '2022-02-11T00:00:00Z',
        'ESTIMATION', 'COMMUNE', 'Danger résiduel de test', 'https://example.test/residuel',
        'Danger résiduel documenté.'),
       ($1, $5, 'JAUNE', '2022-02-04T16:00:00+03', '2022-02-08T16:00:00+03',
        'ESTIMATION', 'REGION', 'Bulletin test région', 'https://example.test/r',
        'Jaune hérité de la région, en plus d''un impact observé.'),
       ($1, $5, 'ROUGE', '2022-02-05T06:00:00Z', '2022-02-06T06:00:00Z',
        'IMPACT_OBSERVE', 'COMMUNE', 'Impact observé région', 'https://example.test/ri',
        'Impact observé : doit primer sur le jaune hérité.')`,
    [eventId, communeVert, communeJaune, communeRougeBleu, communeJauneImpactee],
  );
});

afterAll(async () => {
  await db.query('DELETE FROM event_commune_alert_history WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM hazard_events WHERE id = $1', [eventId]);
  await db.query('DELETE FROM user_sessions WHERE user_id = $1', [admin.id]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1', [admin.id]);
  await db.query('DELETE FROM users WHERE id = $1', [admin.id]);
  await db.pool.end();
});

describe('Alertes communales — accès', () => {
  it('refuse un accès non authentifié (401)', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/communes-alerts`)
      .query({ at: '2022-02-05T12:00:00Z' });
    expect(res.status).toBe(401);
  });

  it('rejette un paramètre at invalide (422)', async () => {
    const res = await alertsAt('pas-une-date');
    expect(res.status).toBe(422);
  });

  it('renvoie 404 pour un événement inconnu', async () => {
    const res = await request(app)
      .get('/api/v1/events/00000000-0000-4000-8000-000000000000/communes-alerts')
      .query({ at: '2022-02-05T12:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });
});

describe('Alertes communales — niveaux et temporalité', () => {
  it('ne colore aucune commune hors période documentée (toutes GRIS)', async () => {
    const res = await alertsAt('2022-01-15T00:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
    expect(res.body.data.communes).toHaveLength(0);
  });

  it('affiche le vert officiel tant qu’il est valide, puis plus rien', async () => {
    const actif = await alertsAt('2022-02-02T00:00:00Z');
    expect(rowFor(actif.body.data.communes, communeVert)?.alertLevel).toBe('VERT');
    expect(rowFor(actif.body.data.communes, communeVert)?.infoType).toBe('OFFICIELLE');

    const expire = await alertsAt('2022-02-03T20:00:00Z');
    expect(rowFor(expire.body.data.communes, communeVert)).toBeUndefined();
  });

  it('hérite du niveau jaune d’un district en le signalant comme estimation', async () => {
    const res = await alertsAt('2022-02-04T18:00:00Z');
    const row = rowFor(res.body.data.communes, communeJaune);
    expect(row?.alertLevel).toBe('JAUNE');
    expect(row?.infoType).toBe('ESTIMATION');
    expect(row?.territoryScope).toBe('DISTRICT');
    expect(row?.sourceName).toBe('Bulletin test du 4 février');
  });

  it('colore en rouge les communes à impact observé documenté', async () => {
    const res = await alertsAt('2022-02-05T12:00:00Z');
    const row = rowFor(res.body.data.communes, communeRougeBleu);
    expect(row?.alertLevel).toBe('ROUGE');
    expect(row?.infoType).toBe('IMPACT_OBSERVE');
    expect(row?.territoryScope).toBe('COMMUNE');
  });

  it('fait primer l’impact observé sur un niveau hérité (pas jaune)', async () => {
    const pendant = await alertsAt('2022-02-05T20:00:00Z');
    const row = rowFor(pendant.body.data.communes, communeJauneImpactee);
    expect(row?.alertLevel).toBe('ROUGE');
    expect(row?.infoType).toBe('IMPACT_OBSERVE');
  });

  it('passe du rouge au bleu après le passage, sans bleu automatique ailleurs', async () => {
    const apres = await alertsAt('2022-02-07T00:00:00Z');
    const row = rowFor(apres.body.data.communes, communeRougeBleu);
    expect(row?.alertLevel).toBe('BLEU');
    expect(row?.infoType).toBe('ESTIMATION');
    // Le jaune hérité reprend après la fenêtre d'impact.
    expect(rowFor(apres.body.data.communes, communeJauneImpactee)?.alertLevel).toBe('JAUNE');
    // Une commune sans ligne reste hors alerte.
    expect(rowFor(apres.body.data.communes, communeGris)).toBeUndefined();
  });

  it('retourne la traçabilité (dates, source, commentaire) de chaque niveau', async () => {
    const res = await alertsAt('2022-02-05T12:00:00Z');
    const row = rowFor(res.body.data.communes, communeRougeBleu);
    expect(typeof row?.validFrom).toBe('string');
    expect(typeof row?.validTo).toBe('string');
    expect(row?.sourceName).toBe('Impact observé de test');
    expect(res.body.data.source).toBeTruthy();
    expect(res.body.data.method).toContain('distance');
  });
});

describe('Alertes communales — synthèse (légende)', () => {
  it('compte les communes par niveau et signale la présence de données', async () => {
    const res = await summaryAt('2022-02-05T12:00:00Z');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.eventHasAlertData).toBe(true);
    expect(data.total).toBeGreaterThanOrEqual(5);
    expect(data.levels.ROUGE).toBeGreaterThanOrEqual(2);
    const sum = data.levels.VERT + data.levels.JAUNE + data.levels.ROUGE + data.levels.BLEU;
    expect(data.levels.GRIS).toBe(data.total - sum);
    expect(Array.isArray(data.sources)).toBe(true);
    expect(data.sources.length).toBeGreaterThan(0);
  });

  it('compte le vert comme les autres niveaux pendant sa période de validité', async () => {
    const res = await summaryAt('2022-02-02T00:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.data.levels.VERT).toBeGreaterThanOrEqual(1);
    const sum =
      res.body.data.levels.VERT +
      res.body.data.levels.JAUNE +
      res.body.data.levels.ROUGE +
      res.body.data.levels.BLEU;
    expect(res.body.data.levels.GRIS).toBe(res.body.data.total - sum);
  });

  it('repasse toutes les communes en GRIS après la fin des alertes', async () => {
    const res = await summaryAt('2022-03-01T00:00:00Z');
    const data = res.body.data;
    expect(data.eventHasAlertData).toBe(true);
    expect(data.levels.VERT + data.levels.JAUNE + data.levels.ROUGE + data.levels.BLEU).toBe(0);
    expect(data.levels.GRIS).toBe(data.total);
  });
});

describe('Alertes communales — historique par commune', () => {
  it('renvoie toutes les lignes documentées avec le drapeau actif', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/communes/${communeRougeBleu}/alert-history`)
      .query({ at: '2022-02-05T12:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as Array<AlertRow & { activeAt: boolean }>;
    expect(rows).toHaveLength(2);
    const rouge = rows.find((r) => r.alertLevel === 'ROUGE');
    const bleu = rows.find((r) => r.alertLevel === 'BLEU');
    expect(rouge?.activeAt).toBe(true);
    expect(bleu?.activeAt).toBe(false);
  });

  it('renvoie 404 pour une commune inconnue', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${eventId}/communes/00000000-0000-4000-8000-000000000000/alert-history`)
      .query({ at: '2022-02-05T12:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });
});
