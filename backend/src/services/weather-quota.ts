import { env } from '../config/env';
import { logger } from '../config/logger';
import { weatherRepository } from '../repositories/weather.repository';
import { AppError } from '../utils/app-error';

/**
 * Budget quotidien Open-Meteo.
 *
 * L'offre gratuite est un plafond DUR : 10 000 appels par jour UTC, 5 000 par
 * heure, 600 par minute. Une clé API ne l'augmente pas — les clés ne servent
 * qu'à l'endpoint payant. Dépasser ce plafond n'est donc pas une petite
 * dégradation : tout le reste de la journée répond 429, et l'application perd
 * ses observations ET ses prévisions jusqu'au reset.
 *
 * Ce module tient deux rôles :
 *
 *   1. PRÉVENIR. Chaque lot commande son coût AVANT d'appeler le fournisseur. Si
 *      la commande fait déborder le budget, le run est refusé ici, avec l'heure
 *      de reset, au lieu d'être facturé pour rien.
 *   2. RÉAGIR. Les trois plafonds d'Open-Meteo ne se relancent pas de la même
 *      façon, et les confondre est coûteux : une hausse JOURNALIÈRE relancée
 *      comme une rafale enchaîne jusqu'à 5 passes de lots, soit ~7 900
 *      coordonnées refacturées pour rien, avant d'échouer quand même.
 *
 * Le coût d'un appel est une ESTIMATION, pas une mesure : Open-Meteo ne
 * renvoie pas de compteur restant. On retient donc le coût minimal observable
 * (une commune = un appel), et c'est `OPEN_METEO_DAILY_BUDGET`, placé SOUS les
 * 10 000 de l'offre gratuite, qui sert de marge de sécurité.
 */

/** Nature du plafond atteint, d'après le `reason` renvoyé par Open-Meteo. */
export type RateLimitKind = 'minutely' | 'hourly' | 'daily';

/** Identifiant du fournisseur dans `weather_provider_quota`. */
export const OPEN_METEO_PROVIDER = 'OPEN_METEO';

/**
 * Coût d'un lot, en appels.
 *
 * Un lot de N communes coûte N appels : c'est la granularité observée en
 * production, un run national de 1579 communes épuisant le quota gratuit en
 * quelques runs, et non en un nombre d'appels HTTP (qui serait 4, par lots de
 * 400).
 *
 * Open-Meteo pondère officiellement ce coût par le nombre de LIEUX, la longueur
 * temporelle et le nombre de variables, mais son compteur n'est pas exposé et sa
 * formule exacte n'est pas publique. On ne l'invente donc pas : on compte au
 * minimum un appel par commune, et c'est `OPEN_METEO_DAILY_BUDGET`, choisi SOUS
 * le plafond de 10 000, qui apporte la vraie protection. Compter plus que le
 * minimum ne servirait qu'à nouscaler l'arrêt nous-mêmes, sur une estimation.
 */
export function quotaCostOfBatch(locations: number): number {
  return Math.max(0, locations);
}

/**
 * Classement du `reason` d'un 429 Open-Meteo.
 *
 * `null` si le motif ne correspond à aucun plafond connu : on laisse alors la
 * politique de retry existante s'appliquer.
 */
export function classifyRateLimit(reason: string): RateLimitKind | null {
  const text = reason.toLowerCase();
  if (text.includes('daily')) return 'daily';
  if (text.includes('hour')) return 'hourly';
  if (text.includes('minut') || text.includes('burst')) return 'minutely';
  return null;
}

/**
 * Instant du prochain reset journalier : Open-Meteo rebat son compteur à 00:00
 * UTC (03:00 heure Madagascar). Une minute de marge, le reset n'étant pas
 * garanti à la seconde près et un appel juste au seuil se ferait refuser.
 */
export function nextDailyReset(from: Date = new Date()): Date {
  const next = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1);
  return new Date(next + 60_000);
}

/** Secondes avant le prochain reset, au format d'un en-tête `Retry-After`. */
export function dailyResetRetryAfter(now: Date = new Date()): number {
  return Math.max(60, Math.ceil((nextDailyReset(now).getTime() - now.getTime()) / 1000));
}

/** Message unique pour les deux limites « il va falloir attendre ». */
export function rateLimitMessage(kind: RateLimitKind, resetAt: Date): string {
  if (kind === 'daily') {
    return `Quota journalier Open-Meteo épuisé. Le compteur repart à 00:00 UTC (03:00 heure Madagascar), vers ${resetAt.toISOString()}.`;
  }
  return 'Limite de requêtes Open-Meteo atteinte. Réessayez dans environ une heure.';
}

export interface QuotaSnapshot {
  /** Jour UTC au format `YYYY-MM-DD`. */
  day: string;
  /** Appels déjà reserved depuis 00:00 UTC. */
  consumedCalls: number;
  /** Plafond auto-imposé, sous les 10 000 de l'offre gratuite. */
  budgetCalls: number;
  /** Ce qu'il reste avant de se refuser un run. */
  remainingCalls: number;
  /** Reset du quota du fournisseur. */
  resetsAt: string;
}

/** État du budget du jour, pour le monitoring. */
export async function getQuotaSnapshot(): Promise<QuotaSnapshot> {
  const row = await weatherRepository.getProviderQuota(OPEN_METEO_PROVIDER);
  const budgetCalls = env.OPEN_METEO_DAILY_BUDGET;
  return {
    day: row.day,
    consumedCalls: Math.round(row.consumed * 100) / 100,
    budgetCalls,
    remainingCalls: Math.max(0, Math.round((budgetCalls - row.consumed) * 100) / 100),
    resetsAt: nextDailyReset().toISOString(),
  };
}

/**
 * Commande le coût d'un lot avant de l'envoyer.
 *
 * On réserve AVANT l'appel et jamais après : à l'arrivée d'un 429 journalier,
 * le compteur du fournisseur est déjà au plafond, et décompter le coût réel
 * d'un appel refusé n'apprend rien. Ce qui compte est de ne jamais dépasser.
 *
 * @throws AppError 429 avec `Retry-After` si le lot ferait déborder le budget.
 */
export async function reserveQuota(locations: number): Promise<number> {
  const cost = quotaCostOfBatch(locations);
  if (cost <= 0) return 0;

  const current = await weatherRepository.getProviderQuota(OPEN_METEO_PROVIDER);
  const budget = env.OPEN_METEO_DAILY_BUDGET;

  if (current.consumed + cost > budget) {
    const resetAt = nextDailyReset();
    logger.warn(
      {
        provider: OPEN_METEO_PROVIDER,
        consumed: current.consumed,
        requested: cost,
        budget,
      },
      'Open-Meteo : budget quotidien epuise, lot refuse avant envoi',
    );
    throw AppError.tooManyRequests(
      `Budget quotidien Open-Meteo atteint (${Math.round(current.consumed)}/${budget} appels). ` +
        `Ce lot de ${locations} communes est refusé pour ne pas dépasser le plafond gratuit : ` +
        `les données météo resteront celles du dernier run. Nouvelle tentative après le reset de 00:00 UTC (${resetAt.toISOString()}).`,
      dailyResetRetryAfter(),
    );
  }

  const updated = await weatherRepository.addProviderQuota(OPEN_METEO_PROVIDER, cost);
  logger.debug(
    { consumed: updated.consumed, cost, budget },
    'Open-Meteo : cout commande sur le budget quotidien',
  );
  return cost;
}
