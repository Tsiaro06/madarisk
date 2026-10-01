import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { db } from '../../src/config/database';
import { weatherRepository } from '../../src/repositories/weather.repository';
import { openMeteoProvider } from '../../src/services/openmeteo.provider';
import { weatherService } from '../../src/services/weather.service';

/**
 * Source de la couche cartographique en mode « journée ».
 *
 * Open-Meteo compte les COORDONNÉES, pas les requêtes : une couche
 * cartographique nationale vaut 1 579 coordonnées, soit le quota gratuit
 * journalier (10 000) après quelques clics. La journée future étant déjà
 * synthétisée dans `weather_hourly` par le run horaire, elle doit être servie
 * depuis la base — c'est le test qui verrouille ce choix.
 *
 * Ces tests plantent aussi volontairement dans le fournisseur, pour vérifier
 * que les données de fixture ne fuient pas dans lesRuns quota.
 */

/** Date future probablement couverte par le run horaire (J+2). */
const DATE_COVERED = '2027-01-15';
/** Date future volontairement lacunaire : 3 heures seulement. */
const DATE_THIN = '2027-02-20';

let communeId: string;
let sourceId: string;

/**
 * Insère `hours` lignes horaires synthétiques pour le début de `date`
 * (heure locale Madagascar). Les valeurs sont construites pour que l'agrégat
 * soit vérifiable : température 20+h, humidité 60+h, pluie h%3, vent 10+h,
 * rafales 20+h, direction 200+h, pression 200+h.
 */
async function insertHours(date: string, hours: number): Promise<void> {
  const start = new Date(`${date}T00:00:00+03:00`).getTime();
  const values: string[] = [];
  for (let h = 0; h < hours; h += 1) {
    const at = new Date(start + h * 3_600_000).toISOString();
    values.push(
      `($1, $2, '${at}'::timestamptz, 0, 0, ${20 + h}, ${60 + h}, ${h % 3}, ${10 + h}, ` +
        `${20 + h}, ${200 + h}, ${200 + h}, '61', true, ST_SetSRID(ST_MakePoint(0, 0), 4326))`,
    );
  }
  await db.query(
    `INSERT INTO weather_hourly
       (commune_id, weather_source_id, hour_at, latitude, longitude,
        temperature_c, humidity_percent, precipitation_mm, wind_speed_kmh,
        wind_gusts_kmh, wind_direction_deg, pressure_hpa, weather_code,
        is_forecast, geom)
     VALUES ${values.join(', ')}
     ON CONFLICT (commune_id, weather_source_id, hour_at) DO NOTHING`,
    [communeId, sourceId],
  );
}

describe('couche cartographique : source des données', () => {
  let getForecastBatch: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const communes = await db.query<{ id: string }>(
      'SELECT id FROM communes ORDER BY admin_code LIMIT 1',
    );
    communeId = communes.rows[0].id;
    sourceId = await weatherRepository.getSourceId();

    await insertHours(DATE_COVERED, 24);
    await insertHours(DATE_THIN, 3);
  });

  afterAll(async () => {
    await db.query(`DELETE FROM weather_hourly WHERE hour_at >= '2027-01-01'::timestamptz`);
    await db.pool.end();
  });

  beforeEach(() => {
    // Le fournisseur est neutralisé : ces tests doivent échouer, et non
    // consommer le quota réel, si le repli provider se met à répondre.
    getForecastBatch = vi
      .spyOn(openMeteoProvider, 'getForecastBatch')
      .mockResolvedValue([]);
  });

  it('sert une journée future complète depuis weather_hourly', async () => {
    const layer = await weatherService.mapLayer({ date: DATE_COVERED });
    const point = layer.features.find((f) => f.id === communeId);

    expect(point).toBeDefined();
    // Zéro appel fournisseur : c'est tout l'intérêt du changement.
    expect(getForecastBatch).not.toHaveBeenCalled();

    const props = point?.properties as Record<string, number | string | null>;
    expect(props.observedAt).toBe(`${DATE_COVERED}T12:00`);
    expect(props.temperatureC).toBe(43); // max de 20..43
    expect(props.humidityPercent).toBe(71.5); // moyenne de 60..83
    expect(props.precipitationMm).toBe(24); // somme de (h % 3) sur 24 h
    expect(props.windSpeedKmh).toBe(33); // max de 10..33
    expect(props.windGustsKmh).toBe(43); // max de 20..43
    expect(props.windDirectionDeg).toBe(223); // direction au vent le plus fort
    expect(props.pressureHpa).toBe(211.5); // moyenne de 200..223
    expect(props.weatherCode).toBe('61');
  });

  it('replie sur le fournisseur quand la base ne couvre pas la journée', async () => {
    // 3 heures sur 24 : l'agrégat sous-estimerait le risque, on préfère payer
    // un appel plutôt que d'afficher une journée à moitié vide comme si elle
    // était complète.
    await weatherService.mapLayer({ date: DATE_THIN });

    expect(getForecastBatch).toHaveBeenCalledTimes(1);
  });

  it('respecte le filtre par district sur la couche servie en base', async () => {
    const communes = await db.query<{ district_id: string }>(
      'SELECT district_id FROM communes ORDER BY admin_code LIMIT 1',
    );
    const layer = await weatherService.mapLayer({
      date: DATE_COVERED,
      districtId: communes.rows[0].district_id,
    });

    expect(layer.features.length).toBeGreaterThan(0);
    for (const feature of layer.features) {
      const props = feature.properties as Record<string, string>;
      expect(props.districtId).toBe(communes.rows[0].district_id);
    }
  });
});