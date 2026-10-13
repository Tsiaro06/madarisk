import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

type Role = 'ADMIN' | 'SUPER_ADMIN' | 'CLIENT';

let admin: { id: string; token: string };
let eventId: string;
let bulletinId: string;
let historicalAlertId: string;
let liveAlertId: string;
let communeId: string;

function makeEmail(role: string): string {
  return `historical_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
}

async function createUserAndLogin(role: Role): Promise<{ id: string; token: string }> {
  const email = makeEmail(role);
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
  return { id: user.id, token: login.body.data.accessToken };
}

/**
 * Données historiques (ex. cyclone Batsirai 2022) : importées depuis des
 * bulletins archivés. Elles ne doivent jamais être actives, jamais notifiées,
 * et doivent rester distinctes des données opérationnelles.
 */
beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');

  const created = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      eventCode: `HIST-TEST-${Date.now()}`,
      name: 'Cyclone historique de test',
      type: 'CYCLONE',
      status: 'CLOTURE',
      severity: 'EXTREME',
      description: 'Événement historique de test',
      startedAt: '2022-01-24T00:00:00Z',
      endedAt: '2022-02-11T00:00:00Z',
    });
  eventId = created.body.data.id as string;

  // Bulletin météorologique historique (inséré directement : aucun endpoint
  // d'écriture n'existe pour ces archives, comme pour l'import réel).
  const bulletin = await db.query<{ id: string }>(
    `INSERT INTO weather_bulletins
       (event_id, source_name, source_url, bulletin_ref, title, published_at,
        observed_at, position_description, wind_kmh, gust_kmh, alert_level,
        alert_levels, content)
     VALUES ($1, 'Météo Madagascar', 'https://meteomadagascar.mg',
             'Bulletin test', 'Bulletin du 4 février 2022', '2022-02-04T16:00:00+03:00',
             '2022-02-04T13:00:00Z', 'Position descriptive de test', 185, 260, 'ROUGE',
             '{"rouge":["Atsinanana"]}'::jsonb, 'Contenu de test')
     RETURNING id`,
    [eventId],
  );
  bulletinId = bulletin.rows[0].id;

  // Alerte historique : archivée, marquée historique, jamais active.
  const historicalAlert = await db.query<{ id: string }>(
    `INSERT INTO alerts
       (event_id, type, severity, status, title, message, source, basis,
        is_automatic, is_historique, published_at)
     VALUES ($1, 'CYCLONE', 'EXTREME', 'ARCHIVEE',
             'Historique — bulletin du 4 février 2022 : alerte rouge (Atsinanana)',
             'Donnée historique non active.', 'Météo Madagascar — bulletin du 4 février 2022',
             'PREVISION', false, true, '2022-02-04T16:00:00+03:00')
     RETURNING id`,
    [eventId],
  );
  historicalAlertId = historicalAlert.rows[0].id;

  // Alerte opérationnelle classique, pour vérifier le filtrage.
  const liveAlert = await db.query<{ id: string }>(
    `INSERT INTO alerts
       (event_id, type, severity, status, title, message, is_automatic, is_historique)
     VALUES ($1, 'CYCLONE', 'ELEVEE', 'BROUILLON', 'Alerte opérationnelle de test',
             'Alerte non historique.', false, false)
     RETURNING id`,
    [eventId],
  );
  liveAlertId = liveAlert.rows[0].id;

  // Rapport de situation historique, sourcé et daté.
  await db.query(
    `INSERT INTO reports
       (generated_by, event_id, title, report_type, format, period_start, period_end,
        parameters, source, is_historique)
     VALUES ($1, $2, 'Cyclone historique — bilan de test', 'RAPPORT_SITUATION', 'PDF',
             '2022-02-05T00:00:00Z', '2022-02-14T00:00:00Z',
             '{"indicators":[{"code":"deces","value":121,"source":"ONU/OCHA","date":"2022-02-14"}]}'::jsonb,
             'ONU/OCHA', true)`,
    [admin.id, eventId],
  );

  // Trajectoire observée minimale (2 points à 6 h d'écart) + 1 point prévu,
  // pour vérifier que seuls les points observés composent l'état historique.
  await db.query(
    `INSERT INTO event_tracks
       (event_id, observed_at, track_type, latitude, longitude, wind_speed_kmh, geom)
     VALUES
       ($1, '2022-02-05T12:00:00Z', 'OBSERVEE', -20.8, 49.4, 167,
        ST_SetSRID(ST_MakePoint(49.4, -20.8), 4326)),
       ($1, '2022-02-05T18:00:00Z', 'OBSERVEE', -21.0, 48.3, 148,
        ST_SetSRID(ST_MakePoint(48.3, -21.0), 4326)),
       ($1, '2022-02-05T18:30:00Z', 'PREVUE', -21.2, 47.9, 160,
        ST_SetSRID(ST_MakePoint(47.9, -21.2), 4326))`,
    [eventId],
  );

  // Deux communes réelles pour la ligne d'impact : l'une CENTER_CROSSED
  // (affectée à partir du passage documenté), l'autre NOT_REACHED (jamais
  // renvoyée par l'API, même après le passage).
  const communes = await db.query<{ id: string }>(
    `SELECT id FROM communes ORDER BY created_at ASC LIMIT 2`,
  );
  if (communes.rows.length < 2) {
    throw new Error('Moins de deux communes en base : impossible de tester les impacts communaux');
  }
  communeId = communes.rows[0].id;
  const untouchedCommuneId = communes.rows[1].id;

  await db.query(
    `INSERT INTO event_commune_impacts
       (event_id, commune_id, first_affected_at, last_affected_at, impact_state,
        observed_risk_level, source_name, method)
     VALUES
       ($1, $2, '2022-02-05T16:00:00Z', '2022-02-05T16:00:00Z', 'CENTER_CROSSED',
        'TRES_ELEVE', 'Test WMO', 'Ligne d''impact de test'),
       ($1, $3, NULL, NULL, 'NOT_REACHED', 'INCONNU', 'Test', 'Jamais atteinte')`,
    [eventId, communeId, untouchedCommuneId],
  );
});

afterAll(async () => {
  await db.query('DELETE FROM reports WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM alerts WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM weather_bulletins WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM event_commune_impacts WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM event_tracks WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM hazard_events WHERE id = $1', [eventId]);
  await db.query('DELETE FROM user_sessions WHERE user_id = $1', [admin.id]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1', [admin.id]);
  await db.query('DELETE FROM users WHERE id = $1', [admin.id]);
  await db.pool.end();
});

describe('Bulletins météo historiques', () => {
  it('refuse un accès non authentifié (401)', async () => {
    const res = await request(app).get('/api/v1/weather/bulletins');
    expect(res.status).toBe(401);
  });

  it('renvoie le bulletin archivé, marqué historique', async () => {
    const res = await request(app)
      .get('/api/v1/weather/bulletins')
      .query({ eventId })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const bulletins = res.body.data as Array<Record<string, unknown>>;
    const bulletin = bulletins.find((b) => b.id === bulletinId);
    expect(bulletin).toBeTruthy();
    expect(bulletin?.isHistorique).toBe(true);
    expect(bulletin?.sourceName).toBe('Météo Madagascar');
    expect(bulletin?.alertLevel).toBe('ROUGE');
    expect(bulletin?.windKmh).toBe(185);
  });

  it('date le bulletin et ne le présente pas comme une donnée courante', async () => {
    const res = await request(app)
      .get('/api/v1/weather/bulletins')
      .query({ eventId })
      .set('Authorization', `Bearer ${admin.token}`);
    const bulletins = res.body.data as Array<Record<string, unknown>>;
    expect(bulletins.length).toBeGreaterThan(0);
    for (const b of bulletins) {
      expect(b.isHistorique).toBe(true);
      expect(typeof b.publishedAt).toBe('string');
    }
  });
});

describe('Alertes historiques', () => {
  it('expose le drapeau isHistorique dans la liste', async () => {
    const res = await request(app)
      .get('/api/v1/alerts')
      .query({ eventId })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const alerts = res.body.data as Array<Record<string, unknown>>;
    const historical = alerts.find((a) => a.id === historicalAlertId);
    expect(historical?.isHistorique).toBe(true);
    expect(historical?.status).toBe('ARCHIVEE');
  });

  it('filtre les alertes historiques vs opérationnelles', async () => {
    const onlyHistorical = await request(app)
      .get('/api/v1/alerts')
      .query({ eventId, historique: 'true' })
      .set('Authorization', `Bearer ${admin.token}`);
    const histIds = (onlyHistorical.body.data as Array<{ id: string }>).map((a) => a.id);
    expect(histIds).toContain(historicalAlertId);
    expect(histIds).not.toContain(liveAlertId);

    const onlyLive = await request(app)
      .get('/api/v1/alerts')
      .query({ eventId, historique: 'false' })
      .set('Authorization', `Bearer ${admin.token}`);
    const liveIds = (onlyLive.body.data as Array<{ id: string }>).map((a) => a.id);
    expect(liveIds).toContain(liveAlertId);
    expect(liveIds).not.toContain(historicalAlertId);
  });

  it('refuse la publication d une alerte historique (400)', async () => {
    const res = await request(app)
      .post(`/api/v1/alerts/${historicalAlertId}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  it('ne renvoie jamais une alerte historique dans les alertes actives', async () => {
    const res = await request(app)
      .get('/api/v1/alerts')
      .query({ activeOnly: 'true', eventId })
      .set('Authorization', `Bearer ${admin.token}`);
    const ids = (res.body.data as Array<{ id: string }>).map((a) => a.id);
    expect(ids).not.toContain(historicalAlertId);
  });
});

describe('Rapports de situation historiques', () => {
  it('expose la source et le caractère historique', async () => {
    const res = await request(app)
      .get('/api/v1/reports')
      .query({ eventId, historique: 'true' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const reports = res.body.data as Array<Record<string, unknown>>;
    expect(reports.length).toBeGreaterThan(0);
    const report = reports[0];
    expect(report.isHistorique).toBe(true);
    expect(report.source).toBe('ONU/OCHA');
  });
});

describe('État de trajectoire historique (track-state)', () => {
  const base = () => `/api/v1/events/${eventId}/track-state`;

  it('refuse un accès non authentifié (401)', async () => {
    const res = await request(app).get(base());
    expect(res.status).toBe(401);
  });

  it('rejette un paramètre at invalide (422)', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '5 février' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(422);
  });

  it('rejette une date sans heure (422)', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '2022-02-05' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(422);
  });

  it('renvoie 404 pour un événement inconnu', async () => {
    const res = await request(app)
      .get('/api/v1/events/00000000-0000-0000-0000-000000000000/track-state')
      .query({ at: '2022-02-05T16:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });

  it('ne compose l’état qu’avec des points observés (jamais prévus)', async () => {
    const res = await request(app).get(base()).set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const st = res.body.data;
    expect(st.totalPoints).toBe(2); // 2 OBSERVEE, la PREVUE est exclue
    expect(st.currentPoint.trackType).toBe('OBSERVEE');
    expect(st.currentPoint.observedAt).toBe('2022-02-05T18:00:00.000Z');
  });

  it('renvoie le dernier point observé ≤ at', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '2022-02-05T13:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const st = res.body.data;
    expect(st.upToAtCount).toBe(1);
    expect(st.currentPoint.observedAt).toBe('2022-02-05T12:00:00.000Z');
    expect(st.currentPoint.windSpeedKmh).toBe(167);
    expect(st.previousPoints).toHaveLength(1);
  });

  it('inclut le point exactement égal à at', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '2022-02-05T12:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    const st = res.body.data;
    expect(st.upToAtCount).toBe(1);
    expect(st.currentPoint.observedAt).toBe('2022-02-05T12:00:00.000Z');
  });

  it('renvoie tous les points après le dernier passage observé', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '2022-02-06T00:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    const st = res.body.data;
    expect(st.upToAtCount).toBe(2);
    expect(st.currentPoint.observedAt).toBe('2022-02-05T18:00:00.000Z');
    expect(st.hasRadiusData).toBe(false); // aucun rayon documenté n'est inventé
  });
});

describe('Impacts communaux historiques (commune-impacts)', () => {
  const base = () => `/api/v1/events/${eventId}/commune-impacts`;

  it('refuse un accès non authentifié (401)', async () => {
    const res = await request(app).get(base());
    expect(res.status).toBe(401);
  });

  it('rejette un paramètre at invalide (422)', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: 'hier' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(422);
  });

  it('ne colore aucune commune avant le passage observé', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '2022-02-05T15:59:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    const ids = (data.communes as Array<{ communeId: string }>).map((c) => c.communeId);
    expect(ids).not.toContain(communeId);
  });

  it('colore la commune à partir de son first_affected_at', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '2022-02-05T16:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    const rows = data.communes as Array<{
      communeId: string;
      impactState: string;
      firstAffectedAt: string | null;
    }>;
    const hit = rows.find((c) => c.communeId === communeId);
    expect(hit).toBeTruthy();
    expect(hit?.impactState).toBe('CENTER_CROSSED');
    // Série ISO-8601 (jamais la forme "Fri Feb 05 ..." de String(Date)).
    expect(hit?.firstAffectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('renvoie la commune après le passage également (bornes incluses)', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '2022-02-05T18:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    const rows = res.body.data.communes as Array<{ communeId: string }>;
    expect(rows.map((c) => c.communeId)).toContain(communeId);
  });

  it('n’inclut jamais une commune NOT_REACHED', async () => {
    const res = await request(app)
      .get(base())
      .query({ at: '2022-02-06T00:00:00Z' })
      .set('Authorization', `Bearer ${admin.token}`);
    const rows = res.body.data.communes as Array<{ communeId: string; impactState: string }>;
    for (const c of rows) {
      expect(c.impactState).not.toBe('NOT_REACHED');
    }
  });
});
