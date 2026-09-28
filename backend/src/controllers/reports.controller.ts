import { Request, Response } from 'express';
import { reportsService } from '../services/reports.service';
import { successResponse, paginate } from '../utils/api-response';
import { AppError } from '../utils/app-error';
import {
  CsvExportInput,
  GeoJsonExportInput,
  PdfExportInput,
  ReportListQuery,
} from '../validators/reports.validator';

export const reportsController = {
  dashboardReport: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const query = req.validatedQuery as { dateFrom?: Date; dateTo?: Date };
    const result = await reportsService.dashboardReport(query, req.user);
    res.status(200).json(successResponse(result, 'Rapport du tableau de bord'));
  },

  eventReport: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const eventId = req.params.eventId as string;
    const result = await reportsService.eventReport(eventId, req.user);
    res.status(200).json(successResponse(result, "Rapport détaillé de l'événement"));
  },

  exportCsv: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as CsvExportInput;
    const { filename, content, reportId } = await reportsService.exportCsv(body, req.user);
    res.setHeader('X-Report-Id', reportId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(content);
  },

  exportGeoJson: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as GeoJsonExportInput;
    const { filename, content, reportId } = await reportsService.exportGeoJson(body, req.user);
    res.setHeader('X-Report-Id', reportId);
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(content);
  },

  exportPdf: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const body = req.validatedBody as PdfExportInput;
    const { filename, content, reportId } = await reportsService.exportPdf(body, req.user);
    res.setHeader('X-Report-Id', reportId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(content);
  },

  list: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const query = req.validatedQuery as ReportListQuery;
    const result = await reportsService.list(query, req.user);
    const meta = paginate(result.page, result.limit, result.total);
    res.status(200).json(successResponse(result.items, 'Liste des rapports', meta));
  },

  download: async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw AppError.unauthorized();
    const id = req.params.id as string;
    const { filename, filePath } = await reportsService.downloadMeta(id, req.user);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.download(filePath, filename);
  },
};
