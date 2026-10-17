import { describe, it, expect } from 'vitest';
import {
  attemptedRecently,
  lastScheduledSlot,
  missedScheduledScopes,
} from '../../src/jobs/weather-refresh.job';

/**
 * Instant en heure locale, comme `node-cron` planifie : les cas restent vrais
 * quel que soit le fuseau de la machine (dev en UTC+3, CI en UTC).
 */
const local = (year: number, month: number, day: number, hours: number, minutes: number): Date =>
  new Date(year, month - 1, day, hours, minutes, 0, 0);

/**
 * Rattrapage des créneaux manqués.
 *
 * Régression constatée le 17/10 : le cron d'observations de 06:00 ne se
 * déclenche que si le process tourne à 06:00, et le rattrapage au démarrage ne
 * regardait que l'âge des données (seuil 25 h). Démarrage à 08:20 sur une
 * dernière synchro de la veille à 08:45 — 23 h 40, sous le seuil : aucune
 * synchro de la journée, branche `stale.length === 0`.
 */
describe('weather-refresh : dernier créneau planifié', () => {
  it('retient le créneau du jour quand il est déjà passé', () => {
    const slot = lastScheduledSlot('0 6 * * *', local(2026, 10, 17, 8, 20));
    expect(slot?.getTime()).toBe(local(2026, 10, 17, 6, 0).getTime());
  });

  it('retient celui de la veille avant l’heure du cron', () => {
    const slot = lastScheduledSlot('0 6 * * *', local(2026, 10, 17, 5, 59));
    expect(slot?.getTime()).toBe(local(2026, 10, 16, 6, 0).getTime());
  });

  it('accepte l’instant exact du créneau', () => {
    const slot = lastScheduledSlot('0 6 * * *', local(2026, 10, 17, 6, 0));
    expect(slot?.getTime()).toBe(local(2026, 10, 17, 6, 0).getTime());
  });

  it('respecte les minutes du cron de prévisions', () => {
    const slot = lastScheduledSlot('20 12 * * *', local(2026, 10, 17, 9, 18));
    expect(slot?.getTime()).toBe(local(2026, 10, 16, 12, 20).getTime());
  });

  it('accepte le champ secondes de node-cron', () => {
    const slot = lastScheduledSlot('0 0 6 * * *', local(2026, 10, 17, 8, 20));
    expect(slot?.getTime()).toBe(local(2026, 10, 17, 6, 0).getTime());
  });

  it('ne décide rien pour une expression non quotidienne', () => {
    const expressions = [
      '15 */3 * * *', // job cyclone
      '0 */6 * * *', // ancien cron météo toutes les 6 h
      '10 * * * *', // job risque
      '0 6 * * 1', // hebdomadaire
      '0 6 1 * *', // mensuel
      '*/5 * * * *', // toutes les 5 min
      '0 6 * *', // incomplète
    ];
    for (const expression of expressions) {
      expect(lastScheduledSlot(expression, local(2026, 10, 17, 8, 20))).toBeNull();
    }
  });
});

describe('weather-refresh : créneaux manqués', () => {
  const NOW = local(2026, 10, 17, 8, 20);

  const scopes = (
    observationSuccess: Date | null,
    forecastSuccess: Date | null,
    observationCron = '0 6 * * *',
    forecastCron = '20 12 * * *',
  ) =>
    missedScheduledScopes({
      now: NOW,
      observationCron,
      forecastCron,
      lastObservationSuccessAt: observationSuccess?.toISOString() ?? null,
      lastForecastSuccessAt: forecastSuccess?.toISOString() ?? null,
    });

  it('rattrape la synchro du matin quand le process était éteint', () => {
    // Cas réel : dernière réussite la veille à 08:45, process allumé à 08:20.
    expect(scopes(local(2026, 10, 16, 8, 45), local(2026, 10, 16, 12, 30))).toEqual([
      'OBSERVATIONS',
    ]);
  });

  it('retente un créneau dont le run n’a pas abouti', () => {
    // Le run de 06:00 a échoué (429) : aucun succès depuis la veille, le
    // créneau reste manqué et doit être retenté.
    expect(scopes(local(2026, 10, 16, 6, 0), local(2026, 10, 17, 12, 25))).toEqual([
      'OBSERVATIONS',
    ]);
  });

  it('ne relance rien quand le créneau a été couvert', () => {
    // Run parti à 05:59, fini à 06:04 : le créneau de 06:00 est servi.
    expect(scopes(local(2026, 10, 17, 6, 4), local(2026, 10, 16, 12, 30))).toEqual([]);
  });

  it('couvre les prévisions quand leur run du midi a été manqué', () => {
    expect(scopes(local(2026, 10, 17, 6, 4), local(2026, 10, 15, 12, 30))).toEqual(['FORECASTS']);
  });

  it('traite une base sans run comme deux créneaux manqués', () => {
    expect(scopes(null, null)).toEqual(['OBSERVATIONS', 'FORECASTS']);
  });

  it('laisse la main à l’âge des données si le cron n’est pas quotidien', () => {
    // Cron horaire : aucune décision ici, `staleWeatherScopes` décide.
    expect(scopes(local(2026, 10, 16, 8, 45), null, '15 */3 * * *', '0 */6 * * *')).toEqual([]);
  });
});

describe('weather-refresh : garde anti-rafale', () => {
  const NOW = local(2026, 10, 17, 8, 20);

  it('bloque une tentative récente', () => {
    const startedAt = new Date(NOW.getTime() - 10 * 60_000).toISOString();
    expect(attemptedRecently(startedAt, NOW, 30)).toBe(true);
  });

  it('laisse passer une tentative plus ancienne', () => {
    const startedAt = new Date(NOW.getTime() - 31 * 60_000).toISOString();
    expect(attemptedRecently(startedAt, NOW, 30)).toBe(false);
  });

  it('ne bloque rien sans tentative connue', () => {
    expect(attemptedRecently(null, NOW, 30)).toBe(false);
    expect(attemptedRecently('pas une date', NOW, 30)).toBe(false);
  });
});
