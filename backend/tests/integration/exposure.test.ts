import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/repositories/users.repository';
import { exposureRepository } from '../../src/repositories/exposure.repository';
import { exposureService } from '../../src/services/exposure.service';
import { password } from '../../src/utils/password';

interface SyntheticCommune {
  id: string;
  name: string;
}

let admin: { id: string; token: string };
let client: { id: string; token: string };

let districtId = '';
const communes = {
  A: { id: '', name: '' } as SyntheticCommune,
  B: { id: '', name: '' } as SyntheticCommune,
  C: { id: '', name: '' } as SyntheticCommune,
};
const eventIds: string[] = [];
const userIds: string[] = [];

function makeEmail(role: string): string {
  return `exp_${role.toLowerCase()}_${Date.now()}@madarisk.test`;
}

async function createUserAndLogin(role: 'ADMIN' | 'CLIENT'): Promise<{
  id: string;
  token: string;
}> {
  const email = makeEmail(role);
  const hash = await password.hash('Passw0rd!');
  const user = await usersRepository.create({
    email,
    passwordHash: hash,
    firstName: role,
    lastName: 'ExposureTester',
    role,
  });
  userIds.push(user.id);
  const login = await request(app).post('/api/v1/auth/login').send({
    email,
    password: 'Passw0rd!',
  });
  return { id: user.id, token: login.body.data.accessToken };
}

/**
 * Territoire synthétique isolé en mer, loin de toute commune réelle,
 * pour rendre le scénario déterministe :
 *  - A  (51.90/-15.94)  : commune dont le seuil est dépassé,
 *  - B  (52.00/-15.94)  : commune voisine à ~6 km de A, captée par le tampon,
 *  - C  (>200 km)       : commune lointaine, jamais exposée.
 */
async function insertSyntheticTerritory(): Promise<void> {
  // Pre-clean any residue from a prior aborted run.
  const stale = await db.query<{ id: string }>(
    "SELECT id FROM districts WHERE admin_code = 'EXP-D'",
  );
  for (const d of stale.rows) {
    await db.query('DELETE FROM communes WHERE district_id = $1', [d.id]);
    await db.query('DELETE FROM districts WHERE id = $1', [d.id]);
  }

  const marker = Date.now();
  const name = `Territoire Exposition ${marker}`;
  const district = await db.query<{ id: string }>(
    `INSERT INTO districts (region_id, admin_code, name, normalized_name, population, vulnerability_score, geom, centroid)
     VALUES (
       NULL, 'EXP-D', $1::text, lower($1::text), 40000, 40,
       ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((51.5 -16.1, 52.1 -16.1, 52.1 -15.7, 51.5 -15.7, 51.5 -16.1)))'), 4326),
       ST_SetSRID(ST_MakePoint(51.8, -15.9), 4326)
     )
     RETURNING id`,
    [name],
  );
  districtId = district.rows[0].id;

  const geometry = (polygon: string): string => `MULTIPOLYGON(((${polygon})))`;

  const insert = async (
    key: keyof typeof communes,
    adminCode: string,
    polygon: string,
    population: number,
  ): Promise<void> => {
    const wkt = geometry(polygon);
    const result = await db.query<{ id: string }>(
      `WITH g AS (SELECT ST_SetSRID(ST_GeomFromText($1::text), 4326) AS geom)
       INSERT INTO communes (district_id, admin_code, name, normalized_name, population, vulnerability_score, geom, centroid)
       SELECT $2::uuid, $3::text, $4::text, lower($4::text), $5::integer, 40, g.geom, ST_Centroid(g.geom)
       FROM g
       RETURNING id`,
      [wkt, districtId, adminCode, `Commune ${key} ${marker}`, population],
    );
    communes[key].id = result.rows[0].id;
    communes[key].name = `Commune ${key} ${marker}`;
  };

  // Square A (~4.4 x 4.1 km).
  await insert(
    'A',
    'EXP-A',
    '51.90 -15.90, 51.94 -15.90, 51.94 -15.94, 51.90 -15.94, 51.90 -15.90',
    12000,
  );
  // Square B adjacent east of A (~6 km gap).
  await insert(
    'B',
    'EXP-B',
    '52.00 -15.90, 52.04 -15.90, 52.04 -15.94, 52.00 -15.94, 52.00 -15.90',
    8000,
  );
  // Commune C très éloignée (> 200 km).
  await insert(
    'C',
    'EXP-C',
    '53.40 -17.90, 53.44 -17.90, 53.44 -17.94, 53.40 -17.94, 53.40 -17.90',
    500,
  );
}

async function createEvent(token: string, severity = 'MODEREE'): Promise<string> {
  const marker = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const res = await request(app)
    .post('/api/v1/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      eventCode: `CY-EXP-${marker}`,
      name: `Cyclone exposition test ${marker}`,
      type: 'CYCLONE',
      severity,
      description: 'Événement de test exposition',
      sourceName: 'Météo France',
      startedAt: '2026-03-01T06:00:00.000Z',
      expectedEndAt: '2026-03-05T18:00:00.000Z',
    });
  expect(res.status).toBeLessThan(300);
  expect(res.body.data?.id).toBeTruthy();
  eventIds.push(res.body.data.id);
  return res.body.data.id as string;
}

async function setStatus(
  token: string,
  eventId: string,
  status: string,
  current = 'BROUILLON',
): Promise<string> {
  const chain = ['BROUILLON', 'PREVISION', 'ACTIF', 'SUIVI', 'CLOTURE'];
  const fromIdx = chain.indexOf(current);
  const toIdx = chain.indexOf(status);
  let state = current;
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const res = await request(app)
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: chain[i] });
    expect(res.status).toBeLessThan(300);
    state = chain[i];
  }
  return state;
}

async function addRealTrackPoints(eventId: string): Promise<void> {
  const points = [
    { observedAt: '2026-03-01T06:00:00.000Z', latitude: -15.8, longitude: 51.92 },
    { observedAt: '2026-03-01T12:00:00.000Z', latitude: -15.8, longitude: 52.02 },
  ];
  for (const p of points) {
    const res = await request(app)
      .post(`/api/v1/events/${eventId}/tracks`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        observedAt: p.observedAt,
        trackType: 'OBSERVEE',
        latitude: p.latitude,
        longitude: p.longitude,
        windSpeedKmh: 120,
        gustSpeedKmh: 150,
        pressureHpa: 960,
      });
    expect(res.status).toBeLessThan(300);
  }
}

async function compute(
  eventId: string,
  radiusKm = 10,
): Promise<ReturnType<typeof exposureService.computeForEvent>> {
  return exposureService.computeForEvent(eventId, {
    trigger: 'MANUAL',
    bufferRadiusKm: radiusKm,
    trajectoryRadiusKm: radiusKm,
  });
}

async function markCommuneOverThreshold(eventId: string, communeId: string): Promise<void> {
  await exposureRepository.upsertDetectionCommunes(eventId, [
    {
      communeId,
      metric: 'precipitation_mm',
      value: 150,
      threshold: 100,
    },
  ]);
}

async function assertOnlyABExposed(eventId: string): Promise<void> {
  const rows = await db.query<{
    commune_id: string;
    source_type: string;
    data_type: string;
    overlap_percent: string;
    distance_to_track_km: string | null;
  }>(
    `SELECT commune_id, source_type, data_type,
            overlap_percent::text AS overlap_percent,
            distance_to_track_km::text AS distance_to_track_km
     FROM exposed_communes
     WHERE event_id = $1
     ORDER BY commune_id`,
    [eventId],
  );
  const ids = rows.rows.map((r) => r.commune_id).sort();
  expect(ids).toEqual([communes.A.id, communes.B.id].sort());

  const byId = new Map(rows.rows.map((r) => [r.commune_id, r]));
  const a = byId.get(communes.A.id)!;
  const b = byId.get(communes.B.id)!;
  expect(a.source_type).toBe('SEUIL');
  expect(a.data_type).toBe('ESTIME');
  expect(parseFloat(a.overlap_percent)).toBeGreaterThan(0);
  expect(b.source_type).toBe('ZONE');
  expect(b.data_type).toBe('ESTIME');
  expect(parseFloat(b.overlap_percent)).toBeGreaterThan(0);
}

beforeAll(async () => {
  admin = await createUserAndLogin('ADMIN');
  client = await createUserAndLogin('CLIENT');
  await insertSyntheticTerritory();
});

afterAll(async () => {
  if (eventIds.length > 0) {
    await db.query('DELETE FROM hazard_events WHERE id = ANY($1::uuid[])', [eventIds]);
  }
  if (districtId) {
    await db.query('DELETE FROM communes WHERE district_id = $1', [districtId]);
    await db.query('DELETE FROM districts WHERE id = $1', [districtId]);
  }
  if (userIds.length > 0) {
    await db.query('DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])', [userIds]);
    await db.query('DELETE FROM audit_logs WHERE user_id = ANY($1::uuid[])', [userIds]);
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
  }
  await db.pool.end();
});

describe('Calcul automatique d exposition et de risques (Phase 4)', () => {
  it('expose uniquement les communes réellement touchées : A (seuil) et B (tampon), jamais C', async () => {
    const eventId = await createEvent(admin.token);
    await setStatus(admin.token, eventId, 'ACTIF');
    await markCommuneOverThreshold(eventId, communes.A.id);

    const result = await compute(eventId);

    expect(result.communesExposed).toBe(2);
    expect(result.areasCreated).toBe(1);
    expect(result.areasSkipped).toBe(0);

    await assertOnlyABExposed(eventId);

    const areas = await db.query(
      `SELECT source_type, is_estimate, phase::text AS phase, radius_km
       FROM event_areas WHERE event_id = $1`,
      [eventId],
    );
    expect(areas.rows).toHaveLength(1);
    expect(areas.rows[0].source_type).toBe('ESTIMATION');
    expect(areas.rows[0].is_estimate).toBe(true);
    expect(areas.rows[0].phase).toBe('PENDANT');
    expect(Number(areas.rows[0].radius_km)).toBe(10);
  });

  it('retourne une FeatureCollection GeoJSON aux coordonnées [longitude, latitude]', async () => {
    const eventId = await createEvent(admin.token);
    await setStatus(admin.token, eventId, 'ACTIF');
    await markCommuneOverThreshold(eventId, communes.A.id);
    await compute(eventId);

    const res = await request(app)
      .get(`/api/v1/events/${eventId}/exposure-geojson`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);

    const layer = res.body.data;
    expect(layer.type).toBe('FeatureCollection');
    expect(layer.features).toHaveLength(2);

    const feature = layer.features.find((f: { id: string }) => f.id === communes.A.id)!;
    expect(feature.type).toBe('Feature');
    expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
    const coords =
      feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates[0][0][0]
        : feature.geometry.coordinates[0][0];
    const [lon, lat] = coords;
    expect(lon).toBeGreaterThan(0);
    expect(lat).toBeLessThan(0);
    expect(lon).toBeGreaterThan(lat);

    expect(feature.properties.sourceType).toBe('SEUIL');
    expect(feature.properties.dataType).toBe('ESTIME');
    expect(feature.properties.overlapPercent).toBeGreaterThan(0);
    expect(typeof feature.properties.riskScore).toBe('number');
    expect(feature.properties.exposedPopulation).toBe(12000);
  });

  it('est idempotent : un second calcul ne duplique ni zone ni commune', async () => {
    const eventId = await createEvent(admin.token);
    await setStatus(admin.token, eventId, 'ACTIF');
    await markCommuneOverThreshold(eventId, communes.A.id);

    const first = await compute(eventId);
    const second = await compute(eventId);

    expect(first.areasCreated).toBe(1);
    expect(second.areasCreated).toBe(0);
    expect(second.areasSkipped).toBe(1);
    expect(second.communesExposed).toBe(2);

    const areas = await db.query(
      `SELECT COUNT(*)::text AS n FROM event_areas WHERE event_id = $1 AND source_type = 'ESTIMATION'`,
      [eventId],
    );
    expect(areas.rows[0].n).toBe('1');

    const exposed = await db.query(
      `SELECT COUNT(*)::text AS n FROM exposed_communes WHERE event_id = $1`,
      [eventId],
    );
    expect(exposed.rows[0].n).toBe('2');
  });

  it('ne crée aucune zone ni commune sans donnée réelle', async () => {
    const eventId = await createEvent(admin.token);
    await setStatus(admin.token, eventId, 'PREVISION');

    const result = await compute(eventId);

    expect(result.areasCreated).toBe(0);
    expect(result.communesUpserted).toBe(0);
    expect(result.communesExposed).toBe(0);

    const areas = await db.query(
      `SELECT COUNT(*)::text AS n FROM event_areas WHERE event_id = $1`,
      [eventId],
    );
    expect(areas.rows[0].n).toBe('0');
    const exposed = await db.query(
      `SELECT COUNT(*)::text AS n FROM exposed_communes WHERE event_id = $1`,
      [eventId],
    );
    expect(exposed.rows[0].n).toBe('0');
  });

  it('calcule la distance à la trajectoire officielle sans l inventer', async () => {
    const eventId = await createEvent(admin.token);
    await setStatus(admin.token, eventId, 'ACTIF');
    await markCommuneOverThreshold(eventId, communes.A.id);
    await addRealTrackPoints(eventId);

    const result = await compute(eventId);

    expect(result.areasCreated).toBe(2);

    const areas = await db.query(
      `SELECT source_type, is_estimate, description
       FROM event_areas WHERE event_id = $1 ORDER BY source_type`,
      [eventId],
    );
    const types = areas.rows.map((r) => r.source_type).sort();
    expect(types).toEqual(['ESTIMATION', 'TRAJECTOIRE']);
    expect(areas.rows.every((r) => r.is_estimate)).toBe(true);
    expect(areas.rows[areas.rows.length - 1].description).toContain('rayon par défaut');

    const tracks = await db.query(
      `SELECT COUNT(*)::text AS n FROM event_tracks WHERE event_id = $1`,
      [eventId],
    );
    expect(tracks.rows[0].n).toBe('2');

    const distances = await db.query<{ distance: string | null }>(
      `SELECT distance_to_track_km::text AS distance
       FROM exposed_communes WHERE event_id = $1 AND commune_id = ANY($2::uuid[])`,
      [eventId, [communes.A.id, communes.B.id]],
    );
    for (const row of distances.rows) {
      expect(row.distance).toBeTruthy();
      expect(parseFloat(row.distance!)).toBeGreaterThan(0);
    }
  });

  it('distingue clairement PREVISION (AVANT) d ACTIF (PENDANT)', async () => {
    const prevision = await createEvent(admin.token);
    const actif = await createEvent(admin.token);
    await setStatus(admin.token, prevision, 'PREVISION');
    await setStatus(admin.token, actif, 'ACTIF');
    await markCommuneOverThreshold(prevision, communes.A.id);
    await markCommuneOverThreshold(actif, communes.A.id);

    await compute(prevision);
    await compute(actif);

    const phaseFor = async (eventId: string): Promise<{ area: string; risk: string }> => {
      const areas = await db.query<{ phase: string }>(
        `SELECT phase::text AS phase FROM event_areas WHERE event_id = $1`,
        [eventId],
      );
      const risks = await db.query<{ phase: string }>(
        `SELECT phase::text AS phase FROM risk_assessments
         WHERE event_id = $1 ORDER BY assessed_at DESC LIMIT 1`,
        [eventId],
      );
      return { area: areas.rows[0].phase, risk: risks.rows[0].phase };
    };

    const previsionPhases = await phaseFor(prevision);
    const actifPhases = await phaseFor(actif);

    expect(previsionPhases.area).toBe('AVANT');
    expect(previsionPhases.risk).toBe('AVANT');
    expect(actifPhases.area).toBe('PENDANT');
    expect(actifPhases.risk).toBe('PENDANT');
  });

  it('expose une commune sans pour autant l évaluer à risque extrême', async () => {
    const eventId = await createEvent(admin.token, 'FAIBLE');
    await setStatus(admin.token, eventId, 'ACTIF');
    await markCommuneOverThreshold(eventId, communes.A.id);
    await compute(eventId);

    const risk = await db.query<{ score: string; level: string }>(
      `SELECT risk_score::text AS score, risk_level::text AS level
       FROM risk_assessments
       WHERE event_id = $1 AND commune_id = $2
       ORDER BY assessed_at DESC LIMIT 1`,
      [eventId, communes.B.id],
    );
    expect(risk.rows[0]).toBeTruthy();
    expect(parseFloat(risk.rows[0].score)).toBeLessThan(90);
    expect(risk.rows[0].level).not.toBe('EXTREME');
  });

  it('produit des couches exposition et risque aux propriétés distinctes', async () => {
    const eventId = await createEvent(admin.token, 'FAIBLE');
    await setStatus(admin.token, eventId, 'ACTIF');
    await markCommuneOverThreshold(eventId, communes.A.id);
    await compute(eventId);

    const exposure = await request(app)
      .get(`/api/v1/events/${eventId}/exposure-geojson`)
      .set('Authorization', `Bearer ${admin.token}`);
    const exposureProps = exposure.body.data.features[0].properties;

    const risks = await request(app)
      .get(`/api/v1/risks/map-layer?eventId=${eventId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(risks.status).toBe(200);
    const riskProps = risks.body.data.features[0].properties;

    for (const key of ['overlapPercent', 'sourceType', 'dataType', 'exposedPopulation']) {
      expect(exposureProps).toHaveProperty(key);
      expect(riskProps).not.toHaveProperty(key);
    }
    expect(riskProps).toHaveProperty('riskScore');
    expect(riskProps).toHaveProperty('riskLevel');
    expect(exposureProps).toHaveProperty('riskScore');
  });

  it('expose l historique des calculs via l API', async () => {
    const eventId = await createEvent(admin.token);
    await setStatus(admin.token, eventId, 'ACTIF');
    await markCommuneOverThreshold(eventId, communes.A.id);
    await compute(eventId);
    await compute(eventId);

    const res = await request(app)
      .get(`/api/v1/events/${eventId}/exposure/runs`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0].trigger).toBe('MANUAL');
  });

  it('expose le recalcule manuel (ADMIN) et refuse le CLIENT', async () => {
    const eventId = await createEvent(admin.token);
    await setStatus(admin.token, eventId, 'ACTIF');
    await markCommuneOverThreshold(eventId, communes.A.id);

    const denied = await request(app)
      .post(`/api/v1/events/${eventId}/exposure/recalculate`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ bufferRadiusKm: 10 });
    expect(denied.status).toBe(403);

    const recalc = await request(app)
      .post(`/api/v1/events/${eventId}/exposure/recalculate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ bufferRadiusKm: 10, trajectoryRadiusKm: 10 });
    expect(recalc.status).toBe(200);
    expect(recalc.body.data).toMatchObject({ trigger: 'MANUAL' });
    expect(recalc.body.data.communesExposed).toBe(2);
    expect(recalc.body.data.runId).toBeTruthy();

    const missing = await request(app)
      .post('/api/v1/events/10000000-0000-0000-0000-000000000000/exposure/recalculate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});
    expect(missing.status).toBe(404);
  });
});
