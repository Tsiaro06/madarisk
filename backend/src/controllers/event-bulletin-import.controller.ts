import { Request, Response } from 'express';
import fs from 'fs';
import { AppError } from '../utils/app-error';
import { successResponse } from '../utils/api-response';
import { isEventBulletinUploadAllowed } from '../middlewares/upload.middleware';
import { EventBulletinImportInput, EventBulletinPreviewInput } from '../validators/event-bulletin-import.validator';
import { extractBulletinArchive, cleanupExtracted } from '../services/event-bulletin-import/extract';
import { detectAndParseFiles } from '../services/event-bulletin-import/detect';
import { persistBulletinImport } from '../services/event-bulletin-import/persist';

export const eventBulletinImportController = {
  preview: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    if (!req.file) throw AppError.badRequest('Aucun fichier fourni (champ "file" attendu)');

    const check = isEventBulletinUploadAllowed(req.file);
    if (!check.allowed) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore
      }
      throw new AppError(check.reason ?? 'Type de fichier non autorisé', 400);
    }

    void (req.validatedBody as EventBulletinPreviewInput);
    let extractDir: string | undefined;
    try {
      const extracted = await extractBulletinArchive(req.file);
      extractDir = extracted.extractDir;
      const result = await detectAndParseFiles(extracted.files);
      res.status(200).json(successResponse(result, 'Aperçu du bulletin'));
    } catch (err) {
      if (extractDir) cleanupExtracted(extractDir, req.file.path);
      else {
        try {
          if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch {
          // ignore
        }
      }
      throw err;
    }
  },

  import: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    if (!req.file) throw AppError.badRequest('Aucun fichier fourni (champ "file" attendu)');

    const check = isEventBulletinUploadAllowed(req.file);
    if (!check.allowed) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore
      }
      throw new AppError(check.reason ?? 'Type de fichier non autorisé', 400);
    }

    const body = req.validatedBody as EventBulletinImportInput;
    let extractDir: string | undefined;
    try {
      const extracted = await extractBulletinArchive(req.file);
      extractDir = extracted.extractDir;
      const detected = await detectAndParseFiles(extracted.files);
      if (detected.points.length === 0) {
        throw AppError.badRequest('Aucun point de trajectoire détecté dans ce fichier/archive');
      }
      const result = await persistBulletinImport({
        fileName: req.file.originalname,
        parser: detected.parser,
        points: detected.points,
        eventId: body.eventId,
        eventCode: body.eventCode,
        name: body.name,
        type: body.type,
        createIfMissing: body.createIfMissing ?? true,
        replaceTracks: body.replaceTracks ?? false,
        actor: req.user as { id: string; role: 'ADMIN' | 'SUPER_ADMIN' | 'ANALYSTE_SIG' },
        req,
      });
      res.status(201).json(successResponse(result, 'Bulletin importé avec succès'));
    } finally {
      if (extractDir) cleanupExtracted(extractDir, req.file.path);
      else {
        try {
          if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch {
          // ignore
        }
      }
    }
  },
};
