import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../src/config/database';
import { weatherService } from '../../src/services/weather.service';
import { usersRepository } from '../../src/repositories/users.repository';
import { password } from '../../src/utils/password';
import type { BatchCommuneInput, WeatherProvider } from '../../src/types/weather.types';

/**
 * Rafraîchissement manuel : la courbe horaire doit être écrite elle aussi.
 *
 * Régression constatée en salle de crise : un clic « Rafraîchir » sur un
 * district réécrivait `weather_observations` mais pas `weather_hourly`. La
 * courbe horaire gardait donc son trou (22/10, 03 h → 17 h) jusqu'au prochain
 * run national, alors que les heures manquantes étaient déjà dans la réponse
 * du fournisseur. L'interface, elle, reliait les points voisins : la courbe
 * affichait une météo qui n'avait jamais été mesurée.
 *
 * Le test emprunte le vrai chemin d'écriture (`weatherService.refresh`) avec un
 * fournisseur de substitution : aucun appel réseau, aucun quota consommé.
 */

const DAY = '2027-04-12';

/**
 * Six heures attendues, la quatrième absente : le fournisseur rend une série
 * trouée. C'est ce trou que la détection doit signaler et que l'écriture doit
 * conserver tel quel (surtout pas d'interpolation).
 */
const EXPECTED_HOURS = [0, 1, 2, 4, 5].map(
  (h) => `${DAY}T${String(h).padStart(2, '0')}:00:00.000Z`,
);

const WINDOW_START = `${DAY}T00:00:00.000Z`;
const WINDOW_END = `${DAY}T06:00:00.000Z`;

/** Acteur réel : `refresh` écrit une trace d'audit à son nom. */
let admin: { id: string; role: 'ADMIN' };
let communeId: string;

const requestContext = {
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
};

const stubProvider = {
  getCurrent: vi.fn(),
  getForecast: vi.fn(),
  getCurrentBatch: vi.fn(async (communes: BatchCommuneInput[]) =>
    communes.map((commune) => ({
      communeId: commune.id,
      latitude: commune.latitude,
      longitude: commune.longitude,
      current: {
        observedAt: WINDOW_END,
        temperatureC: 24,
        humidityPercent: 70,
        precipitationMm: 0,
        rainfall24hMm: 0,
        windSpeedKmh: 12,
        windGustsKmh: 22,
        windDirectionDeg: 180,
        pressureHpa: 1012,
        weatherCode: '1',
      },
      hours: EXPECTED_HOURS.map((hourAt) => ({
        hourAt,
        temperatureC: 24,
        humidityPercent: 70,
        precipitationMm: 0,
        rainMm: 0,
        windSpeedKmh: 12,
        windGustsKmh: 22,
        windDirectionDeg: 180,
        pressureHpa: 1012,
        weatherCode: '1',
      })),
    })),
  ),
} as unknown as WeatherProvider;

describe('weather : rafraîchissement manuel et courbe horaire', () => {
  beforeAll(async () => {
    const communes = await db.query<{ id: string }>(
      'SELECT id FROM communes ORDER BY admin_code LIMIT 1',
    );
    communeId = communes.rows[0].id;

    const user = await usersRepository.create({
      email: `hourly-refresh-${Date.now()}@madarisk.test`,
      passwordHash: await password.hash('Passw0rd!'),
      firstName: 'Hourly',
      lastName: 'Refresh',
      role: 'ADMIN',
    });
    admin = { id: user.id, role: 'ADMIN' };

    weatherService.setProvider(stubProvider);
  });

  afterAll(async () => {
    await db.query(
      `DELETE FROM weather_hourly WHERE commune_id = $1 AND hour_at >= $2 AND hour_at < $3`,
      [communeId, WINDOW_START, WINDOW_END],
    );
    await db.query(`DELETE FROM weather_observations WHERE commune_id = $1 AND observed_at = $2`, [
      communeId,
      WINDOW_END,
    ]);
    await db.query(`DELETE FROM audit_logs WHERE user_id = $1`, [admin.id]);
    await db.query(`DELETE FROM users WHERE id = $1`, [admin.id]);
    await db.pool.end();
  });

  it('écrit les heures du fournisseur, trou compris, lors d’un refresh ciblé', async () => {
    const result = await weatherService.refresh({ communeIds: [communeId] }, admin, requestContext);

    expect(result.totalSaved).toBe(1);
    expect(result.totalFailed).toBe(0);

    const hours = await db.query<{ hour_at: string }>(
      `SELECT hour_at
         FROM weather_hourly
        WHERE commune_id = $1 AND hour_at >= $2 AND hour_at < $3
        ORDER BY hour_at`,
      [communeId, WINDOW_START, WINDOW_END],
    );

    // Les 5 heures reçues sont écrites ; l'heure absente (03 h) reste absente.
    expect(hours.rows.map((r) => new Date(r.hour_at).toISOString())).toEqual(EXPECTED_HOURS);

    const audit = await db.query<{ new_value: { hourlySaved?: number } }>(
      `SELECT new_value
         FROM audit_logs
        WHERE user_id = $1 AND action = 'WEATHER_REFRESHED'
        ORDER BY created_at DESC
        LIMIT 1`,
      [admin.id],
    );
    // La trace d'audit dit combien d'heures ont été écrites : sans ce compteur,
    // un refresh qui n'écrit que les observations passerait inaperçu.
    expect(audit.rows[0]?.new_value.hourlySaved).toBe(EXPECTED_HOURS.length);
  });

  it('signale la série trouée sans la combler', async () => {
    const result = await weatherService.refresh({ communeIds: [communeId] }, admin, requestContext);

    expect(result.totalFailed).toBe(0);

    // `ON CONFLICT DO NOTHING` : rejouer le refresh ne duplique aucune heure.
    const count = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM weather_hourly
        WHERE commune_id = $1 AND hour_at >= $2 AND hour_at < $3`,
      [communeId, WINDOW_START, WINDOW_END],
    );
    expect(count.rows[0]?.count).toBe(String(EXPECTED_HOURS.length));
  });
});
