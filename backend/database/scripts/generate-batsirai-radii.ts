import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import readline from 'readline';
import { pipeline } from 'stream/promises';
import { BATSIRAI_TRACK } from '../seeds/batsirai-2022';

/**
 * Génère le fichier des rayons de vent documentés du cyclone Batsirai (2022).
 *
 * Source : NOAA/NCEI, IBTrACS v04r01, tempête 2022024S09090.
 * Agence retenue : RSMC La Réunion (Météo-France), autorité WMO de ce bassin
 * (même agence que l'intensité retenue pour la trajectoire officielle).
 * Valeur retenue : rayon MAXIMAL des 4 quadrants (NE/SE/SW/NW) du vent >= 34,
 * 50 et 64 kt, converti en kilomètres (1 nmi = 1,852 km). IBTrACS publie quatre
 * rayons par seuil (un par quadrant) ; la carte n'affiche qu'un cercle, donc on
 * retient l'enveloppe maximale réellement documentée — jamais une valeur estimée.
 * Les seuils non publiés par la RSMC La Réunion restent à `null`.
 *
 * Exécution (depuis backend/) :
 *   npm run db:generate:batsirai-radii
 *   npm run db:generate:batsirai-radii -- <chemin-csv-ibtracs-local>
 */

const SID = '2022024S09090';
const IBTRACS_URL =
  'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/' +
  'v04r01/access/csv/ibtracs.SI.list.v04r01.csv';
const NM_TO_KM = 1.852;
const QUADRANTS = ['NE', 'SE', 'SW', 'NW'] as const;
const AGENCY = 'REUNION';
const THRESHOLDS = [34, 50, 64] as const;
const OUTPUT_PATH = path.resolve(__dirname, '..', 'seeds', 'batsirai-2022-radii.ts');

type Threshold = (typeof THRESHOLDS)[number];
type Radii = Record<Threshold, number | null>;

/** Parse une ligne CSV en respectant les guillemets et les virgules échappées. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Rayon maximal des 4 quadrants (nm) converti en km, ou null si non publié. */
function maxQuadrantKm(row: string[], indexOf: (name: string) => number, threshold: Threshold): number | null {
  const values = QUADRANTS.map((quadrant) =>
    toNumber(row[indexOf(`${AGENCY}_R${threshold}_${quadrant}`)]),
  ).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round(Math.max(...values) * NM_TO_KM * 10) / 10;
}

async function downloadCsv(destination: string): Promise<void> {
  process.stdout.write(`Téléchargement IBTrACS : ${IBTRACS_URL}\n`);
  await new Promise<void>((resolve, reject) => {
    https
      .get(IBTRACS_URL, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} sur ${IBTRACS_URL}`));
          return;
        }
        const file = fs.createWriteStream(destination);
        pipeline(res, file).then(resolve).catch(reject);
      })
      .on('error', reject);
  });
}

/** Lit le CSV IBTrACS et n'en garde que les points horaires de la tempête. */
async function loadStormRadii(csvPath: string): Promise<Map<string, Radii>> {
  const reader = readline.createInterface({
    input: fs.createReadStream(csvPath, 'utf8'),
    crlfDelay: Infinity,
  });
  let header: string[] | null = null;
  let indexOf: (name: string) => number = () => -1;
  const byTime = new Map<string, Radii>();

  for await (const line of reader) {
    if (header === null) {
      header = splitCsvLine(line);
      const columns = header;
      indexOf = (name: string) => columns.indexOf(name);
      continue;
    }
    if (!line.startsWith(`${SID},`)) continue;
    const row = splitCsvLine(line);
    const isoTime = (row[indexOf('ISO_TIME')] ?? '').trim();
    if (isoTime === '') continue;
    const time = `${isoTime.replace(' ', 'T')}Z`;
    byTime.set(time, {
      34: maxQuadrantKm(row, indexOf, 34),
      50: maxQuadrantKm(row, indexOf, 50),
      64: maxQuadrantKm(row, indexOf, 64),
    });
  }
  return byTime;
}

function renderDataFile(byTime: Map<string, Radii>): { content: string; documented: number } {
  let documented = 0;
  const lines = BATSIRAI_TRACK.map((point) => {
    const radii = byTime.get(point.time);
    if (!radii || (radii[34] === null && radii[50] === null && radii[64] === null)) {
      return `  { time: '${point.time}', radius34ktKm: null, radius50ktKm: null, radius64ktKm: null },`;
    }
    documented += 1;
    return (
      `  { time: '${point.time}',` +
      ` radius34ktKm: ${radii[34] ?? 'null'},` +
      ` radius50ktKm: ${radii[50] ?? 'null'},` +
      ` radius64ktKm: ${radii[64] ?? 'null'} },`
    );
  });

  const content = `// Rayons de vent documentés du cyclone Batsirai (janvier-février 2022).
//
// Source : NOAA/NCEI, IBTrACS v04r01, tempête 2022024S09090.
// Agence retenue : RSMC La Réunion (Météo-France), autorité WMO du bassin —
// même agence que l'intensité retenue pour la trajectoire officielle.
// Valeur retenue : rayon MAXIMAL des 4 quadrants (NE/SE/SW/NW) du vent ≥ 34, 50
// et 64 kt, converti en kilomètres (1 nmi = 1,852 km). IBTrACS publie quatre
// rayons par seuil ; la carte n'affiche qu'un cercle, on retient donc l'enveloppe
// maximale réellement documentée — jamais une valeur estimée.
// Un seuil non publié par la RSMC La Réunion reste à null (aucune valeur inventée).
//
// Fichier regénéré automatiquement : ne pas éditer à la main.
// Commande : npm run db:generate:batsirai-radii

export interface BatsiraiRadiiPoint {
  /** Horodatage UTC ISO-8601, identique au point de trajectoire correspondant. */
  time: string;
  /** Rayon maximal des 4 quadrants du vent ≥ 34 kt (km), ou null si non publié. */
  radius34ktKm: number | null;
  /** Rayon maximal des 4 quadrants du vent ≥ 50 kt (km), ou null si non publié. */
  radius50ktKm: number | null;
  /** Rayon maximal des 4 quadrants du vent ≥ 64 kt (km), ou null si non publié. */
  radius64ktKm: number | null;
}

export const BATSIRAI_RADII: BatsiraiRadiiPoint[] = [
${lines.join('\n')}
];
`;

  return { content, documented };
}

async function main(): Promise<void> {
  const provided = process.argv[2] ?? process.env.IBTRACS_CSV;
  let csvPath = provided ?? '';
  let temporary = false;
  if (csvPath === '') {
    csvPath = path.join(os.tmpdir(), 'ibtracs.SI.list.v04r01.csv');
    temporary = !fs.existsSync(csvPath);
    if (temporary) {
      await downloadCsv(csvPath);
    }
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Fichier IBTrACS introuvable : ${csvPath}`);
  }

  const byTime = await loadStormRadii(csvPath);
  const { content, documented } = renderDataFile(byTime);
  fs.writeFileSync(OUTPUT_PATH, content, 'utf8');

  process.stdout.write(
    `✓ ${documented}/${BATSIRAI_TRACK.length} points avec rayon RSMC La Réunion → ${OUTPUT_PATH}\n`,
  );
  if (documented < BATSIRAI_TRACK.length) {
    process.stdout.write(
      `ℹ ${BATSIRAI_TRACK.length - documented} point(s) sans rayon publié (null, jamais estimé).\n`,
    );
  }
  if (temporary) {
    fs.rmSync(csvPath, { force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
