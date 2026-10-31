import fs from 'fs';
import path from 'path';
import {
  DetectedBulletin,
  EventBulletinPreviewResult,
} from '../../types/event-bulletin-import.types';
import { isIbtracsLike, parseIbtracsFile } from './parsers/ibtracs';
import { parseGenericCsv } from './parsers/generic-csv';
import { parseGenericJson } from './parsers/generic-json';
import { parsePdfBulletin } from './parsers/pdf-bulletin';
import { parseShapefile, parseShapefileFromZip } from './parsers/shapefile';

export async function detectAndParseFiles(files: string[]): Promise<EventBulletinPreviewResult> {
  const warnings: string[] = [];
  const extractedFiles = files.map((f) => path.relative(process.cwd(), f));
  let best: DetectedBulletin | null = null;

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const name = path.basename(filePath).toLowerCase();
    if (name.startsWith('.') || ext === '.exe' || ext === '.dll') continue;

    let contentHead: string | undefined;
    try {
      contentHead = fs.readFileSync(filePath, 'utf-8').slice(0, 4096);
    } catch {
      contentHead = undefined;
    }

    if (ext === '.csv' && isIbtracsLike(filePath, contentHead)) {
      const points = parseIbtracsFile(filePath);
      if (points.length > 0) {
        const cand: DetectedBulletin = {
          parser: 'IBTRACS',
          confidence: 95,
          filePath,
          points,
        };
        if (!best || cand.points.length > best.points.length) best = cand;
      }
    }
  }

  if (!best) {
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.csv') {
        const points = parseGenericCsv(filePath);
        if (points.length > 0) {
          const cand: DetectedBulletin = {
            parser: 'GENERIC_CSV',
            confidence: 80,
            filePath,
            points,
          };
          if (!best || cand.points.length > best.points.length) best = cand;
        }
      }
    }
  }

  if (!best) {
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.zip') {
        try {
          const points = await parseShapefileFromZip(filePath);
          if (points.length > 0) {
            const cand: DetectedBulletin = {
              parser: 'SHAPEFILE',
              confidence: 75,
              filePath,
              points,
            };
            if (!best || cand.points.length > best.points.length) best = cand;
          } else {
            warnings.push(
              'Aucun point trouvé dans ce ZIP Shapefile (vérifier .shp/.dbf/.shx et CRS)',
            );
          }
        } catch {
          warnings.push('Échec du parsing Shapefile depuis le ZIP');
        }
      }
      if (ext === '.shp') {
        try {
          const base = path.basename(filePath, '.shp');
          const dbfPath = path.join(path.dirname(filePath), `${base}.dbf`);
          if (fs.existsSync(filePath) && fs.existsSync(dbfPath)) {
            const points = await parseShapefile(filePath);
            if (points.length > 0) {
              const cand: DetectedBulletin = {
                parser: 'SHAPEFILE',
                confidence: 75,
                filePath,
                points,
              };
              if (!best || cand.points.length > best.points.length) best = cand;
            } else {
              warnings.push(
                '.shp détecté mais aucun point valide (vérifier attributs temps/coord)',
              );
            }
          } else {
            warnings.push('Fichiers .shp/.dbf manquants pour parser le shapefile');
          }
        } catch {
          warnings.push('Erreur parsing .shp');
        }
      }
    }
  }

  if (!best) {
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.json' || ext === '.geojson') {
        const points = parseGenericJson(filePath);
        if (points.length > 0) {
          const cand: DetectedBulletin = {
            parser: 'GENERIC_JSON',
            confidence: 80,
            filePath,
            points,
          };
          if (!best || cand.points.length > best.points.length) best = cand;
        }
      }
    }
  }

  if (!best) {
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.pdf') {
        try {
          const points = await parsePdfBulletin(filePath);
          if (points.length > 0) {
            const cand: DetectedBulletin = {
              parser: 'DGM',
              confidence: 70,
              filePath,
              points,
            };
            if (!best || cand.points.length > best.points.length) best = cand;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (!best) {
    warnings.push(
      'Aucun fichier de trajectoire détecté automatiquement. Vérifie le format (CSV/JSON/GeoJSON/PDF ou archive IBTRACS).',
    );
    return {
      parser: 'UNKNOWN',
      confidence: 0,
      filesScanned: files.length,
      extractedFiles,
      points: [],
      bulletins: [],
      warnings,
    };
  }

  if (best.points.length < 2) {
    warnings.push(
      "Moins de 2 points détectés. L'import fonctionnera mais certaines fonctionnalités (zones automatiques) peuvent être limitées.",
    );
  }

  return {
    parser: best.parser,
    confidence: best.confidence,
    filesScanned: files.length,
    extractedFiles,
    eventHint: best.eventHint,
    points: best.points,
    bulletins: best.bulletins ?? [],
    warnings,
  };
}
