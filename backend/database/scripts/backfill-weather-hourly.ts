/**
 * Remplissage des trous de la courbe horaire (`weather_hourly`).
 *
 * Raison d'être : une fenêtre horaire peut rester définitivement vide alors que
 * tout le reste fonctionne. Cela arrive quand l'écriture horaire d'un run est
 * interrompue (limite de débit Open-Meteo, lot tronqué) — la sélection cible les
 * communes sur la fraîcheur des observations, donc ces communes ne sont plus
 * re-éligibles et le trou ne se résorbe pas tout seul. Le résultat visible est
 * une courbe qui saute d'une heure à l'autre au milieu de la journée.
 *
 * Sûreté par défaut : rien n'est écrit sans `--apply`, et `--limit` borne le
 * nombre de communes par passage pour ne pas dépenser le quota d'un coup. Les
 * écritures sont des upserts : relancer le script est sans risque, il ne fait
 * que compléter les créneaux restants.
 *
 *   npx tsx database/scripts/backfill-weather-hourly.ts
 *   npx tsx database/scripts/backfill-weather-hourly.ts --limit=50 --apply
 *   npx tsx database/scripts/backfill-weather-hourly.ts --limit=50 --offset=50 --apply
 *
 * Options :
 *   --apply           ecrit dans la base (defaut : simulation)
 *   --limit=<n>       communes traitees au plus par passage (defaut 400)
 *   --offset=<n>      communes sautees, pour reparcourir les 1579 par lots
 *   --from=<iso>      debut de la fenetre a reparer (defaut : ce que le
 *                     fournisseur peut encore resservir)
 *   --to=<iso>        fin de la fenetre, exclusive
 */

import { db } from '../../src/config/database';
import { weatherRepository } from '../../src/repositories/weather.repository';
import { getWeatherProvider } from '../../src/services/weather-provider';
import { hourlyRowsFromItems } from '../../src/services/weather-sync.service';
import { env } from '../../src/config/env';

const HOUR_MS = 3_600_000;

interface Args {
  apply: boolean;
  limit: number;
  offset: number;
  from: string | null;
  to: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, limit: 400, offset: 0, from: null, to: null };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--offset=')) args.offset = Number(arg.slice('--offset='.length));
    else if (arg.startsWith('--from=')) args.from = arg.slice('--from='.length);
    else if (arg.startsWith('--to=')) args.to = arg.slice('--to='.length);
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) throw new Error('--limit doit etre positif');
  if (!Number.isFinite(args.offset) || args.offset < 0) throw new Error('--offset doit etre >= 0');
  return args;
}

/**
 * Fenetre par defaut : exactement ce que le fournisseur peut encore resservir
 * (reanalyse `past_days`), heures pleines, heure courante exclue. repairer une
 * plage plus ancienne convergerait jamais et consommerait du quota a chaque
 * passage.
 */
function defaultWindow(): { sinceIso: string; untilIso: string } {
  const untilMs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const pastDays = Math.max(1, env.OPEN_METEO_PAST_DAYS);
  return {
    sinceIso: new Date(untilMs - pastDays * 24 * HOUR_MS).toISOString(),
    untilIso: new Date(untilMs).toISOString(),
  };
}

async function missingSlotsByCommune(
  sourceId: string,
  communeIds: string[],
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, number[]>> {
  const result = await db.query<{ hour_at: string; commune_id: string }>(
    `WITH slots AS (
       SELECT generate_series($2::timestamptz, $3::timestamptz - interval '1 hour', interval '1 hour') AS slot
     )
     SELECT s.slot::text AS hour_at, c.id AS commune_id
     FROM slots s
     CROSS JOIN communes c
     WHERE c.id = ANY($1::uuid[])
       AND NOT EXISTS (
         SELECT 1 FROM weather_hourly h
         WHERE h.commune_id = c.id
           AND h.weather_source_id = $4
           AND h.hour_at = s.slot
       )
     ORDER BY s.slot`,
    [communeIds, sinceIso, untilIso, sourceId],
  );
  const grouped = new Map<string, number[]>();
  for (const row of result.rows) {
    const slot = new Date(row.hour_at).getTime();
    const list = grouped.get(row.commune_id);
    if (list) list.push(slot);
    else grouped.set(row.commune_id, [slot]);
  }
  return grouped;
}

function localHourLabel(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Indian/Antananarivo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sourceId = await weatherRepository.getSourceId();
  const fallback = defaultWindow();
  const sinceIso = args.from ?? fallback.sinceIso;
  const untilIso = args.to ?? fallback.untilIso;

  console.log(`Fenetre de reparation : ${localHourLabel(sinceIso)} -> ${localHourLabel(untilIso)}`);

  // On selectionne un peu plus large que `limit` pour absorber l'offset, puis on
  // decale : sans cela `--offset` ne servirait a rien, la selection retournant
  // toujours les memes communes les plus trouees.
  const selected = await weatherRepository.communesMissingHourlySlots(
    sourceId,
    sinceIso,
    untilIso,
    args.limit + args.offset,
  );
  const targets = selected.slice(args.offset, args.offset + args.limit);

  if (targets.length === 0) {
    const remaining = await weatherRepository.communesMissingHourlySlots(
      sourceId,
      sinceIso,
      untilIso,
      1,
    );
    console.log(
      remaining.length === 0
        ? 'Aucun trou : la courbe horaire est complete sur la fenetre.'
        : 'Aucune commune dans ce lot (offset trop grand).',
    );
    await db.pool.end();
    return;
  }

  const gaps = await missingSlotsByCommune(
    sourceId,
    targets.map((t) => t.id),
    sinceIso,
    untilIso,
  );
  const totalMissingSlots = [...gaps.values()].reduce((n, slots) => n + slots.length, 0);
  const distinctHours = new Map<number, number>();
  for (const slots of gaps.values()) {
    for (const slot of slots) distinctHours.set(slot, (distinctHours.get(slot) ?? 0) + 1);
  }
  const hoursSummary = [...distinctHours.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, count]) => `${localHourLabel(new Date(slot).toISOString())} (${count})`)
    .join(', ');

  console.log(`Communes a reparer : ${targets.length}`);
  console.log(`Creneaux manquants : ${totalMissingSlots}`);
  console.log(`Heures concernees : ${hoursSummary}`);

  if (!args.apply) {
    console.log('\nSimulation : relancer avec --apply pour ecrire.');
    console.log(`  npx tsx database/scripts/backfill-weather-hourly.ts --limit=${args.limit} --apply`);
    await db.pool.end();
    return;
  }

  const provider = getWeatherProvider();
  const items = await provider.getCurrentBatch(targets);
  const written = await weatherRepository.insertHourly(hourlyRowsFromItems(items), sourceId);

  console.log(`\nCommunes interrogees : ${items.length}/${targets.length}`);
  console.log(`Lignes ecrites : ${written}`);

  const stillMissing = await weatherRepository.communesMissingHourlySlots(
    sourceId,
    sinceIso,
    untilIso,
    1,
  );
  console.log(
    stillMissing.length === 0
      ? 'Fenetre complete : plus aucun trou horaire sur la fenetre reparee.'
      : `Restent des communes avec des trous : ${stillMissing.length} au moins (relancer avec --offset).`,
  );

  await db.pool.end();
}

void main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
