import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { db } from '../../src/config/database';
import { weatherRepository } from '../../src/repositories/weather.repository';
import { openMeteoProvider } from '../../src/services/openmeteo.provider';
import { weatherService } from '../../src/services/weather.service';
import type { RequestContext } from '../../src/types/http.types';
import type {
  BatchCommuneInput,
  WeatherProvider,
  WeatherRefreshResult,
} from '../../src/types/weather.types';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';

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
/** Acteur réel : `refresh` écrit une trace d'audit à son nom. */
let admin: { id: string; role: 'ADMIN' };
/** Contexte de requête minimal : seuls `ip` et l'écriture d'audit sont lus. */
const requestContext = {
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
} as unknown as RequestContext;

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

    const user = await usersRepository.create({
      email: `refresh-runner-${Date.now()}@madarisk.test`,
      passwordHash: await password.hash('Passw0rd!'),
      firstName: 'Refresh',
      lastName: 'Runner',
      role: 'ADMIN',
    });
    admin = { id: user.id, role: 'ADMIN' };

    weatherService.setProvider(stubProvider);
  });

  afterAll(async () => {
    await db.query(`DELETE FROM audit_logs WHERE user_id = $1`, [admin.id]);
    await db.query(`DELETE FROM users WHERE id = $1`, [admin.id]);
    await db.query(`DELETE FROM weather_hourly WHERE hour_at >= '2027-01-01'::timestamptz`);
    // Le refresh de district passe par le vrai chemin d'écriture : on efface les
    // observations du stub plutôt que de laisser des valeurs synthétiques
    // (température 21 partout) passer pour des relevés réels.
    await db.query(
      `DELETE FROM weather_observations
        WHERE weather_code = '03' AND temperature_c = 21 AND humidity_percent = 70
          AND wind_speed_kmh = 12 AND wind_direction_deg = 180 AND pressure_hpa = 1010`,
    );
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

  /**
   * Fournisseur de substitution.
   *
   * `refresh` interroge le fournisseur pour les 1 579 communes. Sans stub, le
   * test dépendrait du réseau — et d'un quota Open-Meteo réel, ce qui rendrait
   * la suite non déterministe et coûteuse. Le stub rend le run instantané tout
   * en empruntant le vrai chemin de code (batch, agrégat, écriture).
   */
  const stubProvider = {
    getCurrent: vi.fn(),
    getForecast: vi.fn(),
    getCurrentBatch: vi.fn(async (communes: BatchCommuneInput[]) =>
      communes.map((c) => ({
        communeId: c.id,
        current: {
          observedAt: '2026-10-01T06:00:00Z',
          temperatureC: 21,
          humidityPercent: 70,
          precipitationMm: 0,
          rainfall24hMm: 0,
          windSpeedKmh: 12,
          windDirectionDeg: 180,
          pressureHpa: 1010,
          weatherCode: '03',
        },
      })),
    ),
  } as unknown as WeatherProvider;

  it('sert un refresh national en tâche de fond et refuse un doublon', async () => {
    // Un run national réel interroge le fournisseur pour 1 579 communes et écrit
    // 1 579 observations : le laisser atteindre la base rendrait la suite lente
    // et écraserait les observations réelles du poste de dev. On vérifie donc le
    // contrat de pilotage — main rendue tout de suite, refus du doublon,
    // transition d'état — avec un `refresh` neutralisé que l'onpilote.
    let release!: (result: WeatherRefreshResult) => void;
    const pending = new Promise<WeatherRefreshResult>((resolve) => {
      release = resolve;
    });
    const runRefresh = vi.spyOn(weatherService, 'refresh').mockReturnValue(pending);

    try {
      const started = await weatherService.startRefresh(
        { confirmAll: true },
        admin,
        requestContext,
      );

      // La main est rendue immédiatement, sans attendre le run.
      expect(started.background).toBe(true);
      expect(started.state.status).toBe('RUNNING');
      expect(await weatherService.refreshStatus(started.refreshId)).toEqual(started.state);
      expect(runRefresh).toHaveBeenCalledTimes(1);

      // Un second clic ne relance pas un run concurrent, ce qui doublerait la
      // consommation de quota Open-Meteo pour le même résultat.
      await expect(
        weatherService.startRefresh({ confirmAll: true }, admin, requestContext),
      ).rejects.toThrow(/déjà en cours/i);

      const result: WeatherRefreshResult = {
        totalTargeted: 1579,
        totalSaved: 1579,
        totalFailed: 0,
        failures: [],
      };
      release(result);

      const deadline = Date.now() + 5000;
      let state = await weatherService.refreshStatus(started.refreshId);
      while (state.status === 'RUNNING') {
        if (Date.now() > deadline) throw new Error('le run national ne s\'est pas terminé');
        await new Promise((resolve) => setTimeout(resolve, 50));
        state = await weatherService.refreshStatus(started.refreshId);
      }
      expect(state.status).toBe('SUCCESS');
      expect(state.result).toEqual(result);
    } finally {
      runRefresh.mockRestore();
    }
  });

  it('garde un refresh de district synchrone', async () => {
    // Un district tient dans le délai du client : le passer en tâche de fond
    // changerait l'UX d'un clic qui répond déjà en quelques secondes.
    const communes = await db.query<{ id: string; district_id: string }>(
      'SELECT id, district_id FROM communes ORDER BY admin_code LIMIT 1',
    );
    const started = await weatherService.startRefresh(
      { districtId: communes.rows[0].district_id },
      admin,
      requestContext,
    );

    expect(started.background).toBe(false);
    expect(started.state.status).toBe('SUCCESS');
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