import { Request, Response } from 'express';
import fs from 'fs';
import { importsService } from '../services/imports.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import { isUploadAllowed } from '../middlewares/upload.middleware';
import {
  CreateImportInput,
  ListImportsQuery,
  ListImportErrorsQuery,
} from '../validators/imports.validator';

export const importsController = {
  create: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    if (!req.file) throw AppError.badRequest('Aucun fichier fourni (champ "file" attendu)');

    const check = isUploadAllowed(req.file);
    if (!check.allowed) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // on ignore
      }
      throw new AppError(check.reason ?? 'Type de fichier non autorisé', 400);
    }

    const body = req.validatedBody as CreateImportInput;
    const result = await importsService.createImport(req.file, body, req.user, req);
    res.status(201).json(successResponse(result, 'Import créé et traité'));
  },

  list: async (req: Request, res: Response): Promise<void> => {
    const query = req.validatedQuery as ListImportsQuery;
    const result = await importsService.list(query);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.imports, 'Liste des imports', meta));
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const detail = await importsService.getById(id);
    res.status(200).json(successResponse(detail, 'Détail de l\'import'));
  },

  getErrors: async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const query = req.validatedQuery as ListImportErrorsQuery;
    const result = await importsService.getErrors(id, query.page, query.limit);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Erreurs de l\'import', meta));
  },
};
