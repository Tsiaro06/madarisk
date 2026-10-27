import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../utils/app-error';
import { env } from '../config/env';

export const ALLOWED_EXTENSIONS = ['.geojson', '.json', '.csv'];
export const ALLOWED_MIME_TYPES = [
  'application/json',
  'application/geo+json',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/octet-stream',
];

export const ALLOWED_EVENT_BULLETIN_EXTENSIONS = [
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.rar',
  '.7z',
  '.geojson',
  '.json',
  '.csv',
  '.txt',
  '.pdf',
];
export const ALLOWED_EVENT_BULLETIN_MIME_TYPES = [
  'application/json',
  'application/geo+json',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'application/gzip',
  'application/x-gzip',
  'application/x-tar',
  'application/x-compressed-tar',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/pdf',
];

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

function ensureUploadDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function buildStorage(destinationDir: string = env.IMPORTS_DIR): multer.StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadDir(destinationDir);
      cb(null, destinationDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      cb(null, safeName);
    },
  });
}

const upload = multer({
  storage: buildStorage(env.IMPORTS_DIR),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const uploadEventBulletin = multer({
  storage: buildStorage(env.IMPORTS_DIR),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

export function isUploadAllowed(file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>): {
  allowed: boolean;
  reason?: string;
} {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { allowed: false, reason: 'Extension de fichier non autorisée' };
  }
  if (file.mimetype && !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return { allowed: false, reason: 'Type MIME non autorisé' };
  }
  return { allowed: true };
}

export function isEventBulletinUploadAllowed(
  file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>,
): {
  allowed: boolean;
  reason?: string;
} {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EVENT_BULLETIN_EXTENSIONS.includes(ext)) {
    return { allowed: false, reason: 'Extension de fichier non autorisée' };
  }
  if (file.mimetype && !ALLOWED_EVENT_BULLETIN_MIME_TYPES.includes(file.mimetype)) {
    // Certains navigateurs ne renvoient pas toujours le bon mime pour .zip/.rar
    // On autorise quand l'extension est dans la liste blanche
    return { allowed: true };
  }
  return { allowed: true };
}

export function uploadSingleFile(req: Request, res: Response, next: NextFunction): void {
  const single = upload.single('file');
  single(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('Fichier trop volumineux (maximum 50 Mo)', 400));
        return;
      }
      next(new AppError(`Erreur d'upload : ${err.message}`, 400));
      return;
    }
    next(err);
  });
}

export function uploadEventBulletinFile(req: Request, res: Response, next: NextFunction): void {
  const single = uploadEventBulletin.single('file');
  single(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('Fichier trop volumineux (maximum 50 Mo)', 400));
        return;
      }
      next(new AppError(`Erreur d'upload : ${err.message}`, 400));
      return;
    }
    next(err);
  });
}
