import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import extractZip from 'extract-zip';
import tar from 'tar';
import { AppError } from '../../utils/app-error';
import { env } from '../../config/env';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function isSafePath(base: string, target: string) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
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

    if (ext === '.zip') {
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
    throw AppError.badRequest(
      err instanceof Error ? `Impossible d'extraire l'archive : ${err.message}` : "Impossible d'extraire l'archive",
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
