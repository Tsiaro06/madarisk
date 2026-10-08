import { randomUUID } from 'node:crypto';
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
 * Le jeu travaille sur une source dédiée, créée puis supprimée ici : la
 * couverture nationale de la fenêtre NEAR y est construite d'un seul traît,
 * hors les 3 communes cibles, et la fenêtre FAR y reste vide. Rien ne dépend
 * donc des runs réels du poste — c'est exactement ce qui manquait : les
 * fenêtres du passé ne sont plus réécrites par les runs, donc les créneaux
 * perdus pendant l'épuisement de quota du 07/10 restaient troués et
 * « rien ne manque » devenait faux pour toujours.
 *
 * Deux fenêtres de travail, placées dans le passé, hors de la fenêtre
 * glissante du fournisseur : un run planifié qui s'exécute pendant le test ne
 * peut pas les toucher, puisqu'il écrit sous la source OPEN_METEO.
 */

const HOUR_MS = 3_600_000;

function windowHoursAgo(hoursAgoEnd: number, length: number): { start: string; end: string } {
  const end = Math.floor((Date.now() - hoursAgoEnd * HOUR_MS) / HOUR_MS) * HOUR_MS;
  const start = end - length * HOUR_MS;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

const NEAR = windowHoursAgo(30, 3);
const FAR = windowHoursAgo(50, 3);

interface Target {
  id: string;
  latitude: number;
  longitude: number;
}

let sourceId: string;
let targets: Target[] = [];

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
    const created = await db.query<{ id: string }>(
      `INSERT INTO weather_sources (name, provider_type)
       VALUES ($1, 'OPEN_METEO')
       RETURNING id`,
      [`hourly-repair-test-${randomUUID()}`],
    );
    sourceId = created.rows[0].id;

    const communes = await db.query<Target>(
      `SELECT c.id,
              ST_Y(c.centroid)::float8 AS latitude,
              ST_X(c.centroid)::float8 AS longitude
       FROM communes c
       ORDER BY c.name
       LIMIT 3`,
    );
    targets = communes.rows;

    // Fenêtre NEAR complète pour toutes les communes sauf les 3 cibles : la
    // sélection ne peut alors retomber que sur celles-ci, quel que soit l'état
    // réel de la base.
    await db.query(
      `INSERT INTO weather_hourly
         (weather_source_id, commune_id, hour_at, latitude, longitude, temperature_c,
          humidity_percent, precipitation_mm, rain_mm, wind_speed_kmh, wind_gusts_kmh,
          wind_direction_deg, pressure_hpa, weather_code, is_forecast, geom)
       SELECT $1, c.id, h, ST_Y(c.centroid), ST_X(c.centroid), 20, 50, 0, 0, 10, 20, 180,
              1010, '1', false,
              ST_SetSRID(ST_MakePoint(ST_X(c.centroid), ST_Y(c.centroid)), 4326)
       FROM communes c
       CROSS JOIN generate_series(
         $2::timestamptz, $3::timestamptz - interval '1 hour', interval '1 hour'
       ) AS h
       WHERE NOT (c.id = ANY($4::uuid[]))`,
      [sourceId, NEAR.start, NEAR.end, targets.map((t) => t.id)],
    );
  });

  afterAll(async () => {
    // La source ne sert qu'à ce jeu : la cascade repart avec ses lignes, sans
    // toucher à la source OPEN_METEO ni aux données réelles.
    await db.query('DELETE FROM weather_sources WHERE id = $1', [sourceId]);
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
