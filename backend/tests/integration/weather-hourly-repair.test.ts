import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../src/config/database';
import { weatherRepository } from '../../src/repositories/weather.repository';
import type { WeatherHourlyInsertData } from '../../src/repositories/weather.repository';

/**
 * Sélection des trous de `weather_hourly`.
 *
 * Cette sélection est le seul moyen, depuis un run, de re-cibler une commune
 * dont la courbe horaire est incomplète alors que son observation est fraîche.
 * Sans elle, un créneau perdu (lot tronqué, 429) reste vide définitivement — c'est
 * ce qui produisait une courbe sautant de 02h à 17h en pleine journée.
 *
 * Deux fenêtres de travail, placées dans le passé et restaurées à l'identique :
 * elles ne peuvent pas être confondues avec la fenêtre glissante du
 * fournisseur, donc le test reste déterministe même si un run planifié
 * s'exécute pendant ce temps.
 */

const HOUR_MS = 3_600_000;

function windowHoursAgo(hoursAgoEnd: number, length: number): { start: string; end: string } {
  const end = Math.floor((Date.now() - hoursAgoEnd * HOUR_MS) / HOUR_MS) * HOUR_MS;
  const start = end - length * HOUR_MS;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

const NEAR = windowHoursAgo(30, 3);
const FAR = windowHoursAgo(50, 3);

const WORKING_WINDOWS = [NEAR, FAR];

interface Target {
  id: string;
  latitude: number;
  longitude: number;
}

let sourceId: string;
let targets: Target[] = [];
let backup: Record<string, unknown>[] = [];

function clearWindow(ids: string[], win: { start: string; end: string }): Promise<unknown> {
  return db.query(
    `DELETE FROM weather_hourly
     WHERE weather_source_id = $1 AND commune_id = ANY($2::uuid[])
       AND hour_at >= $3 AND hour_at < $4`,
    [sourceId, ids, win.start, win.end],
  );
}

function rowsFor(target: Target, win: { start: string; end: string }): WeatherHourlyInsertData[] {
  const startMs = Date.parse(win.start);
  const count = Math.round((Date.parse(win.end) - startMs) / HOUR_MS);
  return Array.from({ length: count }, (_, i) => ({
    communeId: target.id,
    hourAt: new Date(startMs + i * HOUR_MS).toISOString(),
    latitude: target.latitude,
    longitude: target.longitude,
    temperatureC: 20,
    humidityPercent: 50,
    precipitationMm: 0,
    rainMm: 0,
    windSpeedKmh: 10,
    windGustsKmh: 20,
    windDirectionDeg: 180,
    pressureHpa: 1010,
    weatherCode: '1',
    isForecast: false,
  }));
}

describe('weather_hourly : sélection des communes à réparer', () => {
  beforeAll(async () => {
    sourceId = await weatherRepository.getSourceId();
    const communes = await db.query<Target>(
      `SELECT c.id,
              ST_Y(c.centroid)::float8 AS latitude,
              ST_X(c.centroid)::float8 AS longitude
       FROM communes c
       ORDER BY c.name
       LIMIT 3`,
    );
    targets = communes.rows;

    const ids = targets.map((t) => t.id);
    for (const win of WORKING_WINDOWS) {
      const existing = await db.query<Record<string, unknown>>(
        `SELECT * FROM weather_hourly
         WHERE weather_source_id = $1 AND commune_id = ANY($2::uuid[])
           AND hour_at >= $3 AND hour_at < $4`,
        [sourceId, ids, win.start, win.end],
      );
      backup.push(...existing.rows);
      await clearWindow(ids, win);
    }
  });

  afterAll(async () => {
    const ids = targets.map((t) => t.id);
    for (const win of WORKING_WINDOWS) await clearWindow(ids, win);

    for (const row of backup) {
      await db.query(
        `INSERT INTO weather_hourly
           (id, weather_source_id, commune_id, hour_at, latitude, longitude,
            temperature_c, humidity_percent, precipitation_mm, rain_mm,
            wind_speed_kmh, wind_gusts_kmh, wind_direction_deg, pressure_hpa,
            weather_code, is_forecast, raw_data, geom, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                 ST_SetSRID(ST_MakePoint($6::numeric, $5::numeric), 4326), $18)`,
        [
          row.id,
          row.weather_source_id,
          row.commune_id,
          row.hour_at,
          row.latitude,
          row.longitude,
          row.temperature_c,
          row.humidity_percent,
          row.precipitation_mm,
          row.rain_mm,
          row.wind_speed_kmh,
          row.wind_gusts_kmh,
          row.wind_direction_deg,
          row.pressure_hpa,
          row.weather_code,
          row.is_forecast,
          row.raw_data ?? null,
          row.created_at,
        ],
      );
    }
  });

  it('retient une commune dont un seul créneau manque', async () => {
    // Une seule heure manquante sur trois : c'est la forme du trou observé.
    const [first, ...rest] = targets;
    await weatherRepository.insertHourly(rowsFor(first, NEAR).slice(0, 2), sourceId);

    const missing = await weatherRepository.communesMissingHourlySlots(
      sourceId,
      NEAR.start,
      NEAR.end,
      50,
    );
    const ids = missing.map((c) => c.id);

    expect(ids).toContain(first.id);
    for (const target of rest) expect(ids).toContain(target.id);
  });

  it('exclut la commune dès que sa fenêtre est complète', async () => {
    for (const target of targets) {
      await weatherRepository.insertHourly(rowsFor(target, NEAR), sourceId);
    }

    const missing = await weatherRepository.communesMissingHourlySlots(
      sourceId,
      NEAR.start,
      NEAR.end,
      50,
    );

    expect(missing.map((c) => c.id)).not.toContain(targets[0].id);
  });

  it('respecte la borne de communes par run', async () => {
    // Fenêtre FAR entièrement vide : les 3 communes sont candidates.
    const all = await weatherRepository.communesMissingHourlySlots(
      sourceId,
      FAR.start,
      FAR.end,
      50,
    );
    expect(all.length).toBeGreaterThanOrEqual(3);

    const limited = await weatherRepository.communesMissingHourlySlots(
      sourceId,
      FAR.start,
      FAR.end,
      2,
    );

    // La borne existe pour qu'un run auto-réparateur ne reparte jamais sur les
    // 1579 communes d'un coup.
    expect(limited).toHaveLength(2);
  });

  it('renvoie une liste vide quand rien ne manque', async () => {
    const missing = await weatherRepository.communesMissingHourlySlots(
      sourceId,
      NEAR.start,
      NEAR.end,
      50,
    );
    expect(missing).toHaveLength(0);
  });

  it('ne touche à rien quand la limite vaut zéro', async () => {
    const missing = await weatherRepository.communesMissingHourlySlots(
      sourceId,
      FAR.start,
      FAR.end,
      0,
    );
    expect(missing).toHaveLength(0);
  });
});
