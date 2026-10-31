import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import extractZip from 'extract-zip';
import tar from 'tar';
import { createExtractorFromData, UnrarError } from 'node-unrar-js';
import { AppError } from '../../utils/app-error';
import { env } from '../../config/env';

/** Taille maximale acceptée après décompression d'une archive RAR (anti « zip bomb »). */
const MAX_RAR_EXTRACTED_BYTES = 500 * 1024 * 1024;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function isSafePath(base: string, target: string) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

/**
 * Normalise le nom d'une entrée d'archive et garantit que la cible reste dans
 * `extractDir` (protection contre les chemins absolus, les lecteurs Windows et `../`).
 */
function resolveExtractedPath(extractDir: string, entryName: string): string | null {
  const normalized = entryName.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null;
  const segments = normalized.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0 || segments.includes('..')) return null;
  const target = path.resolve(extractDir, ...segments);
  return isSafePath(extractDir, target) ? target : null;
}

function rarErrorMessage(err: unknown): string | null {
  if (!(err instanceof UnrarError)) return null;
  if (err.reason === 'ERAR_MISSING_PASSWORD' || err.reason === 'ERAR_BAD_PASSWORD') {
    return 'Archive RAR protégée par mot de passe : décompressez-la puis importez le contenu en .zip';
  }
  if (
    err.reason === 'ERAR_BAD_ARCHIVE' ||
    err.reason === 'ERAR_UNKNOWN_FORMAT' ||
    err.reason === 'ERAR_BAD_DATA'
  ) {
    return 'Archive RAR invalide ou endommagée';
  }
  return null;
}

async function extractRar(archivePath: string, extractDir: string): Promise<void> {
  const file = fs.readFileSync(archivePath);
  const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const extractor = await createExtractorFromData({ data });

  // Les itérateurs exposés par le module WASM doivent être consommés en entier
  // (sinon l'objet C++ sous-jacent n'est pas libéré).
  const headers = [...extractor.getFileList().fileHeaders];
  const totalBytes = headers.reduce(
    (sum, header) => (header.flags.directory ? sum : sum + header.unpSize),
    0,
  );
  if (totalBytes > MAX_RAR_EXTRACTED_BYTES) {
    throw AppError.badRequest('Archive RAR trop volumineuse après décompression (maximum 500 Mo)');
  }

  for (const entry of extractor.extract().files) {
    const { fileHeader, extraction } = entry;
    if (fileHeader.flags.directory || !extraction) continue;
    const target = resolveExtractedPath(extractDir, fileHeader.name);
    if (!target) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(extraction));
  }
}

export async function extractBulletinArchive(file: Express.Multer.File): Promise<{
  extractDir: string;
  files: string[];
}> {
  const ext = path.extname(file.originalname).toLowerCase();
  const baseDir = path.resolve(env.IMPORTS_DIR, 'event-bulletins');
  ensureDir(baseDir);
  const extractDir = path.resolve(baseDir, `${Date.now()}-${path.basename(file.filename, ext)}`);
  ensureDir(extractDir);

  const archivePath = file.path;

  try {
    if (ext === '.shp' || ext === '.shx' || ext === '.dbf' || ext === '.prj' || ext === '.cpg') {
      const targetPath = path.resolve(extractDir, file.originalname);
      fs.copyFileSync(archivePath, targetPath);
      return { extractDir, files: [targetPath] };
    }

    if (ext === '.rar') {
      try {
        await extractRar(archivePath, extractDir);
      } catch (rarErr) {
        const message = rarErrorMessage(rarErr);
        throw message === null ? rarErr : AppError.badRequest(message);
      }
    } else if (ext === '.7z') {
      throw AppError.badRequest(
        'Les archives .7z ne sont pas prises en charge : convertissez-les en .zip',
      );
    } else if (ext === '.zip') {
      try {
        await extractZip(archivePath, { dir: extractDir });
      } catch {
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(extractDir, true);
      }
    } else if (ext === '.tar') {
      await tar.x({ file: archivePath, cwd: extractDir });
    } else if (ext === '.tgz' || ext === '.gz') {
      await tar.x({ file: archivePath, cwd: extractDir, gzip: true });
    } else {
      // For single files (.csv, .json, .txt, .geojson, .pdf), just copy/link to extract dir
      const dest = path.resolve(extractDir, file.originalname);
      fs.copyFileSync(archivePath, dest);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.badRequest(
      err instanceof Error
        ? `Impossible d'extraire l'archive : ${err.message}`
        : "Impossible d'extraire l'archive",
    );
  }

  const files: string[] = [];
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.resolve(dir, entry.name);
      if (!isSafePath(extractDir, full)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  walk(extractDir);
  return { extractDir, files };
}

export function cleanupExtracted(extractDir: string, archivePath?: string) {
  try {
    if (archivePath && fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  } catch {
    // ignore
  }
  try {
    if (extractDir && fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}
