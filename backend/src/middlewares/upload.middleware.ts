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

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

function ensureUploadDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function buildStorage(): multer.StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadDir(env.IMPORTS_DIR);
      cb(null, env.IMPORTS_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
      cb(null, safeName);
    },
  });
}

const upload = multer({
  storage: buildStorage(),
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
