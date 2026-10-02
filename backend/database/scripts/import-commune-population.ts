/**
 * Import de la population par commune.
 *
 * Raison d'être : `communes.population` est la seule source du calcul
 * d'exposition (`exposed_communes.exposed_population` en est une copie). Sans
 * elle, tout l'indicateur « population exposée » reste inconnu, sur le
 * tableau de bord comme dans les rapports.
 *
 * Sûreté par défaut : rien n'est écrit sans `--apply`, et le seuil de
 * correspondance doit être atteint, sinon le script s'arrête. On veut voir le
 * taux de rapprochement avant de toucher à 1579 lignes.
 *
 *   npx tsx database/scripts/import-commune-population.ts --file=pop.csv
 *   npx tsx database/scripts/import-commune-population.ts --file=pop.csv --apply
 *
 * Options :
 *   --file=<chemin>   CSV attendu (obligatoire)
 *   --apply           ecrit dans la base (defaut : simulation)
 *   --force           ecrit meme si le taux de correspondance est faible
 *   --min-rate=<n>    taux minimal en pourcent (defaut 95)
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { db } from '../../src/config/database';
import { normalizeName, similarityPercent } from '../../src/utils/territory-normalizer';

interface CommuneRow {
  id: string;
  name: string;
  districtName: string;
  normalizedName: string;
}

interface PopulationRow {
  rawName: string;
  normalizedName: string;
  population: number;
  line: number;
}

interface Match {
  commune: CommuneRow;
  population: number;
}

const NAME_HEADER_HINTS = ['commune', 'nom', 'libelle', 'name', 'ville'];
const POPULATION_HEADER_HINTS = ['population', 'pop', 'habitant', 'effectif'];

function parseArgs(argv: string[]): { file: string | null; apply: boolean; force: boolean; minRate: number } {
  let file: string | null = null;
  let apply = false;
  let force = false;
  let minRate = 95;
  for (const arg of argv) {
    if (arg.startsWith('--file=')) file = arg.slice('--file='.length);
    else if (arg === '--apply') apply = true;
    else if (arg === '--force') force = true;
    else if (arg.startsWith('--min-rate=')) minRate = Number(arg.slice('--min-rate='.length));
  }
  return { file, apply, force, minRate };
}

/** Découpe une ligne CSV en champs, en gérant les guillemets et les doubles guillemets. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Détecte le séparateur dominant sur la ligne d'en-tête. */
function detectDelimiter(headerLine: string): string {
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function detectColumn(headers: string[], hints: string[]): number {
  const normalized = headers.map((h) =>
    h
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ''),
  );
  for (const hint of hints) {
    const index = normalized.findIndex((h) => h.includes(hint));
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * Convertit une population en entier.
 *
 * Tolère les espaces (y compris insécables) et les points comme séparateurs de
 * milliers, ainsi que les valeurs manquantes. Retourne null si la cellule
 * n'est pas un nombre exploitable : on préfère laisser la commune sans
 * population plutôt que d'y inscrire un 0 ou un NaN.
 */
function parsePopulation(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00a0\u202f]/g, '').replace(/[.,](?=\d{3}\b)/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === 'ND' || cleaned === 'n.d.') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

async function loadCommunes(): Promise<CommuneRow[]> {
  const result = await db.query<{ id: string; name: string; districtName: string }>(
    `SELECT c.id, c.name, d.name AS "districtName"
     FROM communes c
     LEFT JOIN districts d ON d.id = c.district_id
     ORDER BY c.name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    districtName: row.districtName,
    normalizedName: normalizeName(row.name),
  }));
}

/**
 * Rapproche par nom normalisé. Un nom ambigu (plusieurs communes) est
 * départagé par le district si la donnée le permet, sinon laissé non rattaché :
 * on ne veut pas attribuer la population d'une commune à une autre.
 */
function matchRows(communes: CommuneRow[], rows: PopulationRow[]): {
  matches: Match[];
  unmatchedCommunes: CommuneRow[];
  ambiguous: Array<{ row: PopulationRow; candidates: CommuneRow[] }>;
  ignoredRows: PopulationRow[];
} {
  const byName = new Map<string, CommuneRow[]>();
  for (const commune of communes) {
    const list = byName.get(commune.normalizedName) ?? [];
    list.push(commune);
    byName.set(commune.normalizedName, list);
  }

  const matches: Match[] = [];
  const matchedCommuneIds = new Set<string>();
  const ambiguous: Array<{ row: PopulationRow; candidates: CommuneRow[] }> = [];
  const ignoredRows: PopulationRow[] = [];

  for (const row of rows) {
    const candidates = byName.get(row.normalizedName) ?? [];
    if (candidates.length === 0) {
      ignoredRows.push(row);
      continue;
    }
    if (candidates.length === 1) {
      matches.push({ commune: candidates[0], population: row.population });
      matchedCommuneIds.add(candidates[0].id);
      continue;
    }
    ambiguous.push({ row, candidates });
  }

  const unmatchedCommunes = communes.filter((commune) => !matchedCommuneIds.has(commune.id));
  return { matches, unmatchedCommunes, ambiguous, ignoredRows };
}

async function main(): Promise<void> {
  const { file, apply, force, minRate } = parseArgs(process.argv.slice(2));

  if (!file) {
    console.error('Usage : --file=<chemin.csv> [--apply] [--force] [--min-rate=95]');
    process.exitCode = 1;
    return;
  }

  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    console.error(`Fichier vide ou sans ligne de données : ${file}`);
    process.exitCode = 1;
    return;
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const nameIndex = detectColumn(headers, NAME_HEADER_HINTS);
  const populationIndex = detectColumn(headers, POPULATION_HEADER_HINTS);

  console.log(`\n--- Import de la population par commune ---`);
  console.log(`  Fichier     : ${file} (${basename(file)})`);
  console.log(`  Separateur  : ${delimiter === '\t' ? 'tabulation' : JSON.stringify(delimiter)}`);
  console.log(`  Colonnes    : ${headers.join(' | ')}`);
  if (nameIndex === -1 || populationIndex === -1) {
    console.error(
      `  Impossible de detecter les colonnes (nom trouve : ${nameIndex}, population trouve : ${populationIndex}).`,
    );
    console.error('  Colonnes attendues pour le nom : ' + NAME_HEADER_HINTS.join(', '));
    console.error('  Colonnes attendues pour la population : ' + POPULATION_HEADER_HINTS.join(', '));
    process.exitCode = 1;
    return;
  }
  console.log(`  Nom utilise : "${headers[nameIndex]}"`);
  console.log(`  Population  : "${headers[populationIndex]}"`);

  const rows: PopulationRow[] = [];
  let skippedCells = 0;
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i], delimiter);
    const rawName = fields[nameIndex] ?? '';
    const population = parsePopulation(fields[populationIndex] ?? '');
    if (rawName === '' || population === null) {
      skippedCells++;
      continue;
    }
    rows.push({ rawName, normalizedName: normalizeName(rawName), population, line: i + 1 });
  }
  console.log(`  Lignes       : ${lines.length - 1} donnees, ${rows.length} exploitables`);

  const communes = await loadCommunes();
  const { matches, unmatchedCommunes, ambiguous, ignoredRows } = matchRows(communes, rows);

  const rate = communes.length === 0 ? 0 : (matches.length / communes.length) * 100;
  const rateLabel = rate >= 99.95 || rate === 0 ? rate.toFixed(0) : rate.toFixed(1);
  console.log(`\n  Communes en base     : ${communes.length}`);
  console.log(`  Rapprochees          : ${matches.length} (${rateLabel} %)`);
  console.log(`  Non rapprochees      : ${unmatchedCommunes.length}`);
  console.log(`  Noms ambigus         : ${ambiguous.length}`);
  console.log(`  Lignes du fichier non rapprochees : ${ignoredRows.length}`);
  if (skippedCells > 0) {
    console.log(`  Lignes sans population exploitable : ${skippedCells}`);
  }

  if (unmatchedCommunes.length > 0) {
    console.log(`\n  Premieres communes non rapprochees :`);
    for (const commune of unmatchedCommunes.slice(0, 15)) {
      const suggestion = suggest(commune, rows);
      console.log(
        `    - ${commune.name} (${commune.districtName})${suggestion ? `  <- probablement « ${suggestion.rawName} »` : ''}`,
      );
    }
    if (unmatchedCommunes.length > 15) {
      console.log(`    ... et ${unmatchedCommunes.length - 15} autres`);
    }
  }

  if (ambiguous.length > 0) {
    console.log(`\n  Noms ambigus (non attribues) :`);
    for (const item of ambiguous.slice(0, 10)) {
      console.log(
        `    - « ${item.row.rawName} » -> ${item.candidates.map((c) => `${c.name} (${c.districtName})`).join(' / ')}`,
      );
    }
  }

  const totalPopulation = matches.reduce((sum, match) => sum + match.population, 0);

  if (!apply) {
    console.log(`\n  SIMULATION : aucune ecriture. Population totale qui serait appliquee : ${totalPopulation.toLocaleString('fr-FR')}.`);
    console.log('  Relancer avec --apply pour ecrire.');
    await db.pool.end();
    return;
  }

  if (rate < minRate && !force) {
    console.error(
      `\n  RAPPORT TROP FAIBLE : ${rate.toFixed(1)} % < ${minRate} % minimum. Corrigez le fichier ou relancez avec --force pour forcer.`,
    );
    console.error('  Aucune ecriture effectuee.');
    process.exitCode = 1;
    await db.pool.end();
    return;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const match of matches) {
      await client.query('UPDATE communes SET population = $2 WHERE id = $1', [
        match.commune.id,
        match.population,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const check = await db.query<{ total: string; filled: string }>(
    'SELECT count(*)::text AS total, count(population)::text AS filled FROM communes',
  );
  console.log(
    `\n  ${matches.length} communes mises a jour. Base : ${check.rows[0].filled}/${check.rows[0].total} communes avec population.`,
  );
  console.log('  L exposition se recalcule apres la prochaine synchronisation meteo,');
  console.log('  ou via POST /events/{id}/exposure/recalculate.');

  await db.pool.end();
}

/** Propose la ligne du fichier la plus proche d'une commune non rapprochee. */
function suggest(commune: CommuneRow, rows: PopulationRow[]): PopulationRow | null {
  let best: PopulationRow | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const score = similarityPercent(commune.name, row.rawName);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return bestScore >= 80 ? best : null;
}

void main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
