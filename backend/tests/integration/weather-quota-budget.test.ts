import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db } from '../../src/config/database';
import { weatherRepository } from '../../src/repositories/weather.repository';
import {
  OPEN_METEO_PROVIDER,
  getQuotaSnapshot,
  reserveQuota,
} from '../../src/services/weather-quota';

/**
 * Budget quotidien Open-Meteo.
 *
 * Le plafond gratuit (10 000 appels/jour) est DUR : le dépasser ne dégrade pas
 * l'affichage, il coupe toute la météo jusqu'au reset de 00:00 UTC. On
 * commande donc le coût d'un lot AVANT de l'envoyer, et on refuse un lot qui
 * ferait déborder le budget — avec l'heure de reset, que le frontend sait
 * afficher.
 */

async function resetQuota(): Promise<void> {
  await db.query('DELETE FROM weather_provider_quota WHERE provider = $1', [OPEN_METEO_PROVIDER]);
}

/**
 * Consommation à restaurer en fin de suite.
 *
 * Les tests partagent la base de développement : supprimer la ligne en sortant
 * remettrait le compteur du service à zéro, et les runs suivants seraient
 * facturés sans que personne ne les compte. On remet donc la valeur d'origine,
 * exactement comme on ne laisse pas de données stub derrière soi.
 */
let savedConsumed: number | null = null;

async function saveQuota(): Promise<void> {
  const { consumed } = await weatherRepository.getProviderQuota(OPEN_METEO_PROVIDER);
  savedConsumed = consumed;
}

async function restoreQuota(): Promise<void> {
  // Inconditionnel, y compris pour 0 : la suppression puis upsert garantit un
  // compteur identique à l'entrée, sans laisser la consommation des tests.
  await resetQuota();
  if (savedConsumed !== null) {
    await db.query(
      `INSERT INTO weather_provider_quota (provider, quota_day, consumed_calls)
       VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2)
       ON CONFLICT (provider) DO UPDATE SET consumed_calls = EXCLUDED.consumed_calls`,
      [OPEN_METEO_PROVIDER, savedConsumed],
    );
  }
}

describe('budget quotidien Open-Meteo', () => {
  beforeAll(saveQuota);
  beforeEach(resetQuota);
  afterAll(async () => {
    await restoreQuota();
    await db.pool.end();
  });

  it('compte un appel par commune du lot', async () => {
    const cost = await reserveQuota(400);

    expect(cost).toBe(400);
    const snapshot = await getQuotaSnapshot();
    expect(snapshot.consumedCalls).toBe(400);
    expect(snapshot.remainingCalls).toBe(snapshot.budgetCalls - 400);
  });

  it('expose le jour en YYYY-MM-DD, sans decalage de fuseau', async () => {
    // pg renvoie une colonne DATE en Date JS au minuit LOCAL ; sans cast en
    // texte, le jour UTC ressortait decale (02/03/UTC -> 01/03 a 21:00Z).
    const snapshot = await getQuotaSnapshot();

    expect(snapshot.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snapshot.day).toBe(new Date().toISOString().slice(0, 10));
  });

  it('cumule les lots successifs', async () => {
    await reserveQuota(400);
    await reserveQuota(579);

    const snapshot = await getQuotaSnapshot();
    expect(snapshot.consumedCalls).toBe(979);
  });

  it('refuse un lot qui ferait déborder le budget', async () => {
    // On amène le compteur juste sous le plafond : le lot national des 1579
    // communes ne peut plus passer.
    const snapshot = await getQuotaSnapshot();
    await reserveQuota(snapshot.budgetCalls - 10);

    await expect(reserveQuota(1579)).rejects.toMatchObject({ statusCode: 429 });

    // Le refus ne consomme rien : c'est bien le fournisseur qui n'a rien reçu.
    const after = await getQuotaSnapshot();
    expect(after.consumedCalls).toBe(snapshot.budgetCalls - 10);
  });

  it('annonce l’heure de reset dans le message et le Retry-After', async () => {
    const snapshot = await getQuotaSnapshot();
    await reserveQuota(snapshot.budgetCalls);

    try {
      await reserveQuota(1);
      expect.unreachable('le lot aurait du etre refuse');
    } catch (err) {
      const error = err as { message: string; retryAfterSeconds?: number };
      expect(error.message).toContain('Budget quotidien Open-Meteo atteint');
      // Le compteur du fournisseur se rebat a 00:00 UTC : l'utilisateur doit
      // pouvoir replanifier sa relance, pas seulement constater un echec.
      expect(error.retryAfterSeconds).toBeGreaterThan(60);
      expect(error.message).toContain('00:00 UTC');
    }
  });

  it('laisse passer un lot qui tient exactement dans le budget', async () => {
    const snapshot = await getQuotaSnapshot();
    await reserveQuota(snapshot.budgetCalls - 1579);

    const cost = await reserveQuota(1579);

    expect(cost).toBe(1579);
    expect((await getQuotaSnapshot()).remainingCalls).toBe(0);
  });

  it('ne compte rien pour un lot vide', async () => {
    await reserveQuota(0);

    expect((await getQuotaSnapshot()).consumedCalls).toBe(0);
  });

  it('survit a une relution du compteur depuis la base', async () => {
    // Un compteur en memoire repartirait de zero au redemarrage du service et
    // autoriserait 4 runs nationaux de plus dans la journee.
    await reserveQuota(1000);

    const reread = await weatherRepository.getProviderQuota(OPEN_METEO_PROVIDER);

    expect(reread.consumed).toBe(1000);
  });

  it('repart a zero au changement de jour UTC', async () => {
    // Le compteur du fournisseur se rebat a 00:00 UTC. Le nôtre doit suivre,
    // sinon on se refuse des runs toute la journee du lendemain alors que le
    // quota gratuit, lui, est neuf.
    await reserveQuota(9000);
    await db.query(
      `UPDATE weather_provider_quota
          SET quota_day = (now() AT TIME ZONE 'UTC')::date - 1
        WHERE provider = $1`,
      [OPEN_METEO_PROVIDER],
    );

    const snapshot = await getQuotaSnapshot();

    expect(snapshot.consumedCalls).toBe(0);
    expect(snapshot.remainingCalls).toBe(snapshot.budgetCalls);
  });
});
