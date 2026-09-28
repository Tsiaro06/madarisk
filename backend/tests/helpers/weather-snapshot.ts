/**
 * Les tests d'intégration tournent sur la base de développement (celle de
 * `npm run dev`), et non sur une base jetable. Un simple
 * `DELETE FROM weather_observations WHERE commune_id = ANY(...)`
 * détruisait donc les vraies observations des communes ciblées : après
 * `npm test`, ces communes restaient sans météo sur la carte jusqu'au
 * prochain run, ce qui donne l'image d'un bug de synchronisation alors que
 * le fournisseur et le refresh manuel fonctionnaient.
 *
 * Ces helpers remplacent les suppressions aveugles par un cycle
 * sauvegarde -> test -> restauration, qui restitue l'exact état initial.
 */
import { db } from '../../src/config/database';

export interface WeatherSnapshot {
  communes: string[];
  observations: Record<string, unknown>[];
  forecasts: Record<string, unknown>[];
}

/**
 * `jsonb_to_recordset` avec les types réels : les valeurs numériques
 * renvoyées par pg sont des chaînes, le cast est donc indispensable.
 */
const OBSERVATION_FIELDS: [string, string][] = [
  ['id', 'uuid'],
  ['weather_source_id', 'uuid'],
  ['commune_id', 'uuid'],
  ['event_id', 'uuid'],
  ['observed_at', 'timestamptz'],
  ['latitude', 'numeric'],
  ['longitude', 'numeric'],
  ['precipitation_mm', 'numeric'],
  ['rainfall_24h_mm', 'numeric'],
  ['temperature_c', 'numeric'],
  ['humidity_percent', 'numeric'],
  ['wind_speed_kmh', 'numeric'],
  ['wind_direction_deg', 'numeric'],
  ['pressure_hpa', 'numeric'],
  ['weather_code', 'text'],
  ['wind_gusts_kmh', 'numeric'],
  ['raw_data', 'jsonb'],
  ['data_kind', 'text'],
  ['geom', 'geometry'],
];

const FORECAST_FIELDS: [string, string][] = [
  ['id', 'uuid'],
  ['weather_source_id', 'uuid'],
  ['commune_id', 'uuid'],
  ['forecast_day', 'date'],
  ['generated_at', 'timestamptz'],
  ['latitude', 'numeric'],
  ['longitude', 'numeric'],
  ['temperature_min_c', 'numeric'],
  ['temperature_max_c', 'numeric'],
  ['relative_humidity_avg', 'numeric'],
  ['precipitation_sum_mm', 'numeric'],
  ['wind_speed_max_kmh', 'numeric'],
  ['wind_gusts_max_kmh', 'numeric'],
  ['wind_direction_deg', 'numeric'],
  ['pressure_avg_hpa', 'numeric'],
  ['weather_code', 'text'],
  ['raw_data', 'jsonb'],
  ['data_kind', 'text'],
];

function recordsetSelect(fields: [string, string][]): string {
  return fields.map(([name, type]) => `${name} ${type}`).join(', ');
}

const POINT_GEOM =
  'ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)';

/**
 * `geom` n'est alimenté par aucun trigger : c'est l'application qui le
 * renseigne. Pour les tables qui le possèdent (weather_observations), on le
 * reconstruit via ST_MakePoint à partir du couple latitude/longitude
 * restauré, sinon la contrainte NOT NULL échoue. Les colonnes cibles et les
 * expressions doivent rester strictement alignées.
 */
function insertSql(table: string, fields: [string, string][]): string {
  const restored = fields.filter(([name]) => name !== 'geom');
  const hasGeom = fields.some(([name]) => name === 'geom');
  const cols = [...restored.map(([name]) => name), ...(hasGeom ? ['geom'] : [])].join(', ');
  const selected = [
    ...restored.map(([name]) => name),
    ...(hasGeom ? [`${POINT_GEOM} AS geom`] : []),
  ].join(', ');
  return `INSERT INTO ${table} (${cols})
          SELECT ${selected} FROM jsonb_to_recordset($1::jsonb) AS x(${recordsetSelect(fields)})`;
}

/** Capture l'état météo réel des communes avant qu'un test ne l'altère. */
export async function snapshotWeather(communes: string[]): Promise<WeatherSnapshot> {
  const ids = [...new Set(communes)];
  if (ids.length === 0) return { communes: ids, observations: [], forecasts: [] };

  const [observations, forecasts] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT ${OBSERVATION_FIELDS.map(([n]) => n).join(', ')} FROM weather_observations
       WHERE commune_id = ANY($1::uuid[])`,
      [ids],
    ),
    db.query<Record<string, unknown>>(
      `SELECT ${FORECAST_FIELDS.map(([n]) => n).join(', ')} FROM weather_forecasts
       WHERE commune_id = ANY($1::uuid[])`,
      [ids],
    ),
  ]);

  return { communes: ids, observations: observations.rows, forecasts: forecasts.rows };
}

/** Supprime ce que le test a écrit puis réinjecte l'état capturé. */
export async function restoreWeather(snapshot: WeatherSnapshot): Promise<void> {
  const { communes, observations, forecasts } = snapshot;
  if (communes.length === 0) return;

  await db.query('DELETE FROM weather_observations WHERE commune_id = ANY($1::uuid[])', [communes]);
  await db.query('DELETE FROM weather_forecasts WHERE commune_id = ANY($1::uuid[])', [communes]);

  if (observations.length > 0) {
    await db.query(insertSql('weather_observations', OBSERVATION_FIELDS), [
      JSON.stringify(observations),
    ]);
  }
  if (forecasts.length > 0) {
    await db.query(insertSql('weather_forecasts', FORECAST_FIELDS), [JSON.stringify(forecasts)]);
  }
}

/** Raccourci pour les tests qui n'ont pas d'état partagé à exposer. */
export async function withRestoredWeather<T>(
  communes: string[],
  run: () => Promise<T>,
): Promise<T> {
  const snapshot = await snapshotWeather(communes);
  try {
    return await run();
  } finally {
    await restoreWeather(snapshot);
  }
}
