import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/config/database';
import { cycloneSyncService } from '../../src/services/cyclone-sync.service';
import {
  resetCycloneProviders,
  setCycloneTrackProvider,
  setCycloneWatchProvider,
} from '../../src/services/cyclone/cyclone-provider';
import type { CycloneSystem, CycloneTrackPoint, CycloneWatch } from '../../src/types/cyclone.types';

/**
 * Synchronisation cyclone de bout en bout, sur un système synthétique et deux
 * providers injectés (aucun appel réseau). Vérifie la création d'événement, la
 * persistance des points et des rayons, l'idempotence (rejouer ne duplique pas
 * la trajectoire) et l'appariement veille GDACS <-> trajectoire IBTrACS.
 */

const SID = '2999999S99999';
const EVENT_CODE = `CYCLONE-${SID}`;

/** Horodatage glissant : le dernier point doit rester « frais » pour ACTIF. */
const baseMs = Date.now() - 6 * 3_600_000;
const T0 = new Date(baseMs).toISOString();
const T1 = new Date(baseMs + 3 * 3_600_000).toISOString();

function point(overrides: Partial<CycloneTrackPoint> & { observedAt: string }): CycloneTrackPoint {
  return {
    latitude: -20,
    longitude: 49,
    windSpeedKmh: 120,
    pressureHpa: 960,
    movementDirection: '250°',
    movementSpeedKmh: 20,
    radius34ktKm: null,
    radius50ktKm: null,
    radius64ktKm: null,
    radiusSource: null,
    radiusMeasureType: null,
    nature: 'TS',
    ...overrides,
  };
}

function system(points: CycloneTrackPoint[]): CycloneSystem {
  return {
    source: 'IBTRACS',
    sourceSystemId: SID,
    name: 'TESTCYCLONE',
    basin: 'SI',
    season: 2026,
    sourceUrl: 'https://example.test/ibtracs/active.csv',
    points,
    rawMetadata: { test: true },
  };
}

function watch(overrides: Partial<CycloneWatch> = {}): CycloneWatch {
  return {
    source: 'GDACS',
    sourceSystemId: '9000001:7',
    name: 'TESTCYCLONE',
    season: 2026,
    alertLevel: 'Red',
    severityWindKmh: 210,
    countries: ['Madagascar'],
    reportUrl: 'https://www.gdacs.org/report.aspx?eventid=9000001',
    latitude: -20,
    longitude: 49,
    observedAt: T1,
    fromDate: T0,
    toDate: T1,
    rawMetadata: { eventid: 9000001 },
    ...overrides,
  };
}

const POINTS_V1: CycloneTrackPoint[] = [
  point({ observedAt: T0, windSpeedKmh: 120, radius34ktKm: 120.5, radiusSource: 'TEST' }),
  point({ observedAt: T1, windSpeedKmh: 185.2, radius34ktKm: 180.2, radiusSource: 'TEST' }),
];

const runIds: string[] = [];

async function countTracks(eventId: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM event_tracks WHERE event_id = $1`,
    [eventId],
  );
  return Number(result.rows[0].count);
}

async function eventIdFor(eventCode: string): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM hazard_events WHERE event_code = $1`,
    [eventCode],
  );
  return result.rows[0]?.id ?? null;
}

async function purge(): Promise<void> {
  // Les alertes automatiques du cycle (une par commune dans le champ de vent)
  // sont rattachées à l'événement ; `alerts.event_id` est `ON DELETE SET NULL`,
  // il faut donc les supprimer AVANT l'événement pour ne pas laisser d'orphelines.
  await db.query(
    `DELETE FROM alerts
      WHERE event_id IN (
        SELECT id FROM hazard_events WHERE event_code = $1 OR event_code = $2
      )`,
    [EVENT_CODE, 'CYCLONE-GDACS-9000002-1'],
  );
  await db.query(`DELETE FROM hazard_events WHERE event_code = $1 OR event_code = $2`, [
    EVENT_CODE,
    'CYCLONE-GDACS-9000002-1',
  ]);
  await db.query(
    `DELETE FROM cyclone_systems WHERE source_system_id = $1 OR source_system_id = $2`,
    [SID, '9000001:7'],
  );
}

beforeAll(async () => {
  await purge();
});

afterAll(async () => {
  resetCycloneProviders();
  await purge();
  if (runIds.length > 0) {
    await db.query(`DELETE FROM cyclone_sync_runs WHERE id = ANY($1::uuid[])`, [runIds]);
  }
});

describe('Synchronisation cyclone', () => {
  let eventId: string;

  it('crée l’événement et persiste la trajectoire documentée', async () => {
    setCycloneTrackProvider({
      source: 'IBTRACS',
      listActiveSystems: async () => [system(POINTS_V1)],
    });
    setCycloneWatchProvider({ source: 'GDACS', listWatchedSystems: async () => [] });

    const summary = await cycloneSyncService.run('MANUAL');
    runIds.push(summary.runId);

    expect(summary.systemsTracked).toBe(1);
    expect(summary.eventsCreated).toBe(1);
    expect(summary.trackPoints).toBe(2);

    eventId = (await eventIdFor(EVENT_CODE)) as string;
    expect(eventId).toBeTruthy();

    const event = await db.query<{
      type: string;
      status: string;
      severity: string;
      source_name: string;
      started_at: string;
      name: string;
    }>(
      `SELECT type, status, severity, source_name, started_at, name
         FROM hazard_events WHERE id = $1`,
      [eventId],
    );
    const row = event.rows[0];
    expect(row.type).toBe('CYCLONE');
    expect(row.status).toBe('ACTIF');
    expect(row.severity).toBe('EXTREME'); // vent max 185,2 km/h
    expect(row.source_name).toContain('IBTrACS');
    expect(row.name).toBe('TESTCYCLONE');
    expect(new Date(row.started_at).toISOString()).toBe(T0);

    const tracks = await db.query<{
      observed_at: string;
      wind_speed_kmh: string;
      radius_34kt_km: string;
      radius_source: string | null;
      longitude: string;
    }>(
      `SELECT observed_at, wind_speed_kmh, radius_34kt_km, radius_source, longitude
         FROM event_tracks WHERE event_id = $1 ORDER BY observed_at`,
      [eventId],
    );
    expect(tracks.rows).toHaveLength(2);
    expect(Number(tracks.rows[0].radius_34kt_km)).toBe(120.5);
    expect(Number(tracks.rows[1].wind_speed_kmh)).toBeCloseTo(185.2, 1);

    const links = await db.query<{ source: string; source_system_id: string }>(
      `SELECT source, source_system_id FROM cyclone_systems WHERE event_id = $1`,
      [eventId],
    );
    expect(links.rows).toEqual([{ source: 'IBTRACS', source_system_id: SID }]);

    const history = await db.query<{ to_status: string; actor_type: string }>(
      `SELECT to_status, actor_type FROM event_status_history WHERE event_id = $1`,
      [eventId],
    );
    expect(history.rows.length).toBeGreaterThanOrEqual(1);
    expect(history.rows[0].actor_type).toBe('SYSTEM');
  });

  it('colore les communes à partir des rayons publiés (salle de crise)', async () => {
    const summary = await cycloneSyncService.run('MANUAL');
    runIds.push(summary.runId);

    // Un point à ~120 km des côtes est, avec R34 publié : des communes entrent
    // dans le champ de vent (JAUNE) puis en sortent (BLEU). Le niveau de base
    // VERT couvre toutes les communes.
    expect(summary.coloredEvents).toBe(1);
    expect(summary.coloredCommunes).toBeGreaterThan(0);

    const counts = await db.query<{ alert_level: string; n: string }>(
      `SELECT alert_level, COUNT(*)::text AS n
         FROM event_commune_alert_history
        WHERE event_id = $1
        GROUP BY alert_level`,
      [eventId],
    );
    const byLevel = Object.fromEntries(counts.rows.map((r) => [r.alert_level, Number(r.n)]));
    expect(byLevel.VERT).toBeGreaterThan(0);
    expect(byLevel.JAUNE).toBeGreaterThan(0);
    expect(byLevel.BLEU).toBeGreaterThan(0);
    // Aucun rayon R50/R64 n'est publié pour ce système : jamais de ROUGE inventé.
    expect(byLevel.ROUGE ?? 0).toBe(0);

    // Les niveaux sont tracés jusqu'à la source RSMC (jamais une valeur nue).
    const source = await db.query<{ source_name: string }>(
      `SELECT DISTINCT source_name FROM event_commune_alert_history WHERE event_id = $1`,
      [eventId],
    );
    expect(source.rows).toHaveLength(1);
    expect(source.rows[0].source_name).toContain('RSMC La Réunion');
    expect(source.rows[0].source_name).toContain(SID);
  });

  it('génère une alerte automatique par commune actuellement dans le champ de vent', async () => {
    const alerts = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM alerts WHERE event_id = $1 AND is_automatic = true`,
      [eventId],
    );
    expect(Number(alerts.rows[0].n)).toBeGreaterThan(0);

    // Rejouer un cycle ne duplique pas les alertes (déduplication par cible).
    const before = Number(alerts.rows[0].n);
    const summary = await cycloneSyncService.run('MANUAL');
    runIds.push(summary.runId);
    const after = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM alerts WHERE event_id = $1 AND is_automatic = true`,
      [eventId],
    );
    expect(Number(after.rows[0].n)).toBe(before);
  });

  it('est idempotent : rejouer ne duplique ni l’événement ni la trajectoire', async () => {
    const summary = await cycloneSyncService.run('MANUAL');
    runIds.push(summary.runId);

    expect(summary.eventsCreated).toBe(0);
    expect(summary.eventsUpdated).toBe(1);
    expect(await countTracks(eventId)).toBe(2);
  });

  it('met à jour un point révisé sans créer de ligne supplémentaire', async () => {
    const revised = [point({ observedAt: T0, windSpeedKmh: 200, radius34ktKm: 130 }), POINTS_V1[1]];
    setCycloneTrackProvider({
      source: 'IBTRACS',
      listActiveSystems: async () => [system(revised)],
    });

    const summary = await cycloneSyncService.run('MANUAL');
    runIds.push(summary.runId);

    const row = await db.query<{ wind_speed_kmh: string; radius_34kt_km: string }>(
      `SELECT wind_speed_kmh, radius_34kt_km FROM event_tracks
        WHERE event_id = $1 AND observed_at = $2`,
      [eventId, T0],
    );
    expect(Number(row.rows[0].wind_speed_kmh)).toBeCloseTo(200, 1);
    expect(Number(row.rows[0].radius_34kt_km)).toBeCloseTo(130, 1);
    expect(await countTracks(eventId)).toBe(2);
  });

  it('rattache une veille GDACS au même événement au lieu d’en créer un second', async () => {
    setCycloneWatchProvider({ source: 'GDACS', listWatchedSystems: async () => [watch()] });

    const summary = await cycloneSyncService.run('MANUAL');
    runIds.push(summary.runId);

    expect(summary.eventsCreated).toBe(0);
    expect(summary.eventsUpdated).toBe(1);

    const sameName = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM hazard_events WHERE name = 'TESTCYCLONE'`,
    );
    expect(Number(sameName.rows[0].count)).toBe(1);

    const links = await db.query<{ source: string; source_system_id: string }>(
      `SELECT source, source_system_id FROM cyclone_systems WHERE event_id = $1 ORDER BY source`,
      [eventId],
    );
    expect(links.rows).toEqual([
      { source: 'GDACS', source_system_id: '9000001:7' },
      { source: 'IBTRACS', source_system_id: SID },
    ]);

    const event = await db.query<{ source_name: string }>(
      `SELECT source_name FROM hazard_events WHERE id = $1`,
      [eventId],
    );
    expect(event.rows[0].source_name).toContain('GDACS');
  });

  it('détecte un cyclone vu uniquement par GDACS, sans rayon inventé', async () => {
    setCycloneTrackProvider({ source: 'IBTRACS', listActiveSystems: async () => [] });
    setCycloneWatchProvider({
      source: 'GDACS',
      listWatchedSystems: async () => [
        watch({
          sourceSystemId: '9000002:1',
          name: 'TESTGDACSONLY',
          season: 2026,
          reportUrl: 'https://www.gdacs.org/report.aspx?eventid=9000002',
        }),
      ],
    });

    const summary = await cycloneSyncService.run('MANUAL');
    runIds.push(summary.runId);

    expect(summary.eventsCreated).toBe(1);
    const createdId = await eventIdFor('CYCLONE-GDACS-9000002-1');
    expect(createdId).toBeTruthy();

    const tracks = await db.query<{ radius_34kt_km: string | null; radius_source: string | null }>(
      `SELECT radius_34kt_km, radius_source FROM event_tracks WHERE event_id = $1`,
      [createdId],
    );
    expect(tracks.rows).toHaveLength(1);
    expect(tracks.rows[0].radius_34kt_km).toBeNull();
    expect(tracks.rows[0].radius_source).toBeNull();
  });

  it('enregistre le cycle dans le journal d’observabilité', async () => {
    const latest = await db.query<{ status: string; trigger: string; sources: string }>(
      `SELECT status, trigger, sources FROM cyclone_sync_runs WHERE id = $1`,
      [runIds[runIds.length - 1]],
    );
    expect(latest.rows[0]).toEqual({
      status: 'SUCCESS',
      trigger: 'MANUAL',
      sources: 'IBTRACS+GDACS',
    });
  });
});
