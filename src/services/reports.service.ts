import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { Parser } from 'json2csv';
import { env } from '../config/env';
import { UserRole } from '../types/auth.types';
import { AppError } from '../utils/app-error';
import { usersRepository } from '../repositories/users.repository';
import { reportsRepository, ReportFilters, ReportFormat } from '../repositories/reports.repository';

export type CsvResourceType =
  'communes' | 'districts' | 'events' | 'alerts' | 'risks' | 'exposed-communes';

export type GeoJsonResourceType = 'communes' | 'districts' | 'event-areas' | 'risks';

interface ExportContext {
  resourceType: string;
  eventId?: string | null;
  districtId?: string | null;
  communeId?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

const ADMIN_ROLES: UserRole[] = ['ADMIN', 'SUPER_ADMIN'];
const isAdminRole = (role: UserRole): boolean => ADMIN_ROLES.includes(role);
const isRestrictedClient = (role: UserRole): boolean => role === 'CLIENT';

const CSV_HEADERS: Record<CsvResourceType, { label: string; value: string }[]> = {
  communes: [
    { label: 'Code commune', value: 'communeCode' },
    { label: 'Commune', value: 'communeName' },
    { label: 'Nom normalise', value: 'normalizedName' },
    { label: 'Code postal', value: 'postalCode' },
    { label: 'Population', value: 'population' },
    { label: 'Indice de vulnerabilite', value: 'vulnerabilityScore' },
    { label: 'District', value: 'districtName' },
  ],
  districts: [
    { label: 'Code district', value: 'adminCode' },
    { label: 'District', value: 'districtName' },
    { label: 'Nom normalise', value: 'normalizedName' },
    { label: 'Population', value: 'population' },
    { label: 'Indice de vulnerabilite', value: 'vulnerabilityScore' },
    { label: 'Region', value: 'regionName' },
  ],
  events: [
    { label: 'Code evenement', value: 'eventCode' },
    { label: 'Evenement', value: 'eventName' },
    { label: 'Type', value: 'type' },
    { label: 'Statut', value: 'status' },
    { label: 'Severite', value: 'severity' },
    { label: 'Description', value: 'description' },
    { label: 'Debut', value: 'startedAt' },
    { label: 'Fin prevue', value: 'expectedEndAt' },
    { label: 'Fin reelle', value: 'endedAt' },
    { label: 'Source', value: 'sourceName' },
  ],
  alerts: [
    { label: 'ID', value: 'id' },
    { label: 'Titre', value: 'title' },
    { label: 'Type', value: 'type' },
    { label: 'Severite', value: 'severity' },
    { label: 'Statut', value: 'status' },
    { label: 'Message', value: 'message' },
    { label: 'Evenement ID', value: 'eventId' },
    { label: 'District ID', value: 'districtId' },
    { label: 'Commune ID', value: 'communeId' },
    { label: 'Date de publication', value: 'publishedAt' },
    { label: 'Expiration', value: 'expiresAt' },
  ],
  risks: [
    { label: 'Commune ID', value: 'communeId' },
    { label: 'Commune', value: 'communeName' },
    { label: 'District', value: 'districtName' },
    { label: 'Evenement ID', value: 'eventId' },
    { label: 'Score de risque', value: 'riskScore' },
    { label: 'Niveau de risque', value: 'riskLevel' },
    { label: 'Phase', value: 'phase' },
    { label: 'Population', value: 'population' },
    { label: "Date d'evaluation", value: 'assessedAt' },
  ],
  'exposed-communes': [
    { label: 'Evenement ID', value: 'eventId' },
    { label: 'Evenement', value: 'eventName' },
    { label: 'Commune ID', value: 'communeId' },
    { label: 'Commune', value: 'communeName' },
    { label: 'District ID', value: 'districtId' },
    { label: 'District', value: 'districtName' },
    { label: 'Distance a la trajectoire (km)', value: 'distanceToTrackKm' },
    { label: "Dans la zone d'influence", value: 'isInsideInfluenceArea' },
    { label: 'Population exposee', value: 'exposedPopulation' },
    { label: 'Score de risque', value: 'riskScore' },
    { label: 'Niveau de risque', value: 'riskLevel' },
  ],
};

const CSV_LABELS: Record<CsvResourceType, string> = {
  communes: 'communautes',
  districts: 'districts',
  events: 'evenements',
  alerts: 'alertes',
  risks: 'risques',
  'exposed-communes': 'communes exposees',
};

const GEOJSON_LABELS: Record<GeoJsonResourceType, string> = {
  communes: 'communes',
  districts: 'districts',
  'event-areas': 'zones devenement',
  risks: 'risques par commune',
};

const numberFormat = new Intl.NumberFormat('fr-FR');

function filtersFrom(context: ExportContext): ReportFilters {
  return {
    eventId: context.eventId ?? null,
    districtId: context.districtId ?? null,
    communeId: context.communeId ?? null,
    dateFrom: context.dateFrom ?? null,
    dateTo: context.dateTo ?? null,
  };
}

function parametersFrom(context: ExportContext): Record<string, unknown> {
  return {
    resourceType: context.resourceType,
    eventId: context.eventId ?? null,
    districtId: context.districtId ?? null,
    communeId: context.communeId ?? null,
    dateFrom: context.dateFrom ? context.dateFrom.toISOString() : null,
    dateTo: context.dateTo ? context.dateTo.toISOString() : null,
  };
}

async function writeReportFile(extension: string, content: Buffer | string): Promise<string> {
  const dir = path.resolve(process.cwd(), env.REPORTS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const filename = `rapport-${Date.now()}-${crypto.randomUUID()}${extension}`;
  await fs.writeFile(path.join(dir, filename), content, 'utf8');
  return path.join(env.REPORTS_DIR, filename);
}

async function persist(input: {
  generatedBy: string | null;
  eventId?: string | null;
  districtId?: string | null;
  communeId?: string | null;
  title: string;
  reportType: string;
  format: ReportFormat;
  context: ExportContext;
  filePath: string;
}): Promise<string> {
  const report = await reportsRepository.save({
    generatedBy: input.generatedBy,
    eventId: input.eventId ?? null,
    districtId: input.districtId ?? null,
    communeId: input.communeId ?? null,
    title: input.title,
    reportType: input.reportType,
    format: input.format,
    periodStart: input.context.dateFrom ?? null,
    periodEnd: input.context.dateTo ?? null,
    filePath: input.filePath,
    parameters: parametersFrom(input.context),
  });

  await usersRepository.writeAudit({
    userId: input.generatedBy ?? undefined,
    action: 'REPORT_GENERATED',
    entityType: 'report',
    entityId: report.id,
    newValue: {
      title: report.title,
      reportType: report.reportType,
      format: report.format,
      filePath: report.filePath,
    },
  });

  return report.id;
}

function crlfToLf(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function buildFeatureCollection(
  rows: { props: Record<string, unknown>; geometry: unknown }[],
): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      geometry: row.geometry ?? null,
      properties: row.props,
    })),
  };
}

function collectBuffer(document: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
}

function drawTable(
  document: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  widths: number[],
): void {
  const margin = 50;
  const usable = document.page.width - margin * 2;
  const rowHeight = 18;
  let y = document.y;
  const borderColor = '#d1d5db';

  const drawRow = (cells: string[], fontSize: number, bold: boolean): void => {
    if (y + rowHeight > document.page.height - margin) {
      document.addPage();
      y = margin;
      drawRow(headers, 9, true);
    }
    let x = margin;
    cells.forEach((cell, i) => {
      const width = widths[i] * usable;
      document.rect(x, y, width, rowHeight).fill(borderColor).fillOpacity(1);
      document
        .fillColor('#ffffff')
        .rect(x + 0.5, y + 0.5, width - 1, rowHeight - 1)
        .fill();
      document
        .fillColor('#111827')
        .fontSize(fontSize)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica');
      document.text(cell, x + 4, y + 5, {
        width: width - 8,
        height: rowHeight - 2,
        ellipsis: true,
      });
      x += width;
    });
    y += rowHeight;
  };

  drawRow(headers, 9, true);
  for (const row of rows) {
    drawRow(row, 8.5, false);
  }
  document.fillColor('#111827').font('Helvetica');
}

interface PdfData {
  title: string;
  generatedAt: Date;
  dateFrom: Date | null;
  dateTo: Date | null;
  event: Record<string, unknown> | null;
  exposedCommunes: Record<string, unknown>[];
  exposedPopulation: number;
  riskDistribution: Record<string, number>;
  priorityCommunes: Record<string, unknown>[];
  activeAlerts: number;
  latestAlerts: Record<string, unknown>[];
}

async function buildPdf(data: PdfData): Promise<Buffer> {
  const document = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const result = collectBuffer(document);
  const margin = 50;
  const usable = document.page.width - margin * 2;

  const title = document.fillColor('#1f2937').font('Helvetica-Bold').fontSize(18);
  title.text(data.title, margin, margin, { width: usable });

  document.moveDown(0.4);
  document
    .fillColor('#4b5563')
    .font('Helvetica')
    .fontSize(9)
    .text(`Rapport généré le ${data.generatedAt.toLocaleString('fr-FR')}`, { width: usable });
  if (data.dateFrom || data.dateTo) {
    document
      .fontSize(9)
      .text(
        `Période analysée : du ${data.dateFrom ? data.dateFrom.toLocaleDateString('fr-FR') : 'début des données'} au ${data.dateTo ? data.dateTo.toLocaleDateString('fr-FR') : 'aujourd’hui'}`,
        { width: usable },
      );
  }

  if (data.event) {
    document.moveDown(0.6);
    document
      .fillColor('#1f2937')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(`Événement : ${String(data.event.name ?? 'Inconnu')}`);
    document
      .fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(10)
      .text(
        `Type : ${String(data.event.type ?? '—')}    Statut : ${String(data.event.status ?? '—')}    Sévérité : ${String(data.event.severity ?? '—')}`,
      );
    if (data.event.startedAt) {
      const started = new Date(String(data.event.startedAt)).toLocaleString('fr-FR');
      document.fontSize(10).text(`Début : ${started}`);
    }
  } else {
    document.moveDown(0.6);
    document.fillColor('#1f2937').font('Helvetica-Bold').fontSize(13).text('Synthèse générale');
  }

  document.moveDown(0.8);
  document.fillColor('#1f2937').font('Helvetica-Bold').fontSize(12).text('Chiffres clés');
  const keyNames: Array<{ label: string; value: string }> = [
    { label: 'Total communes exposées', value: numberFormat.format(data.exposedCommunes.length) },
    { label: 'Population exposée', value: numberFormat.format(data.exposedPopulation) },
    { label: 'Alertes publiques actives', value: numberFormat.format(data.activeAlerts) },
  ];
  for (const key of keyNames) {
    document
      .fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(10)
      .text(`${key.label} : `, { continued: true });
    document.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(key.value);
  }

  document.moveDown(0.8);
  const distributionKeys = Object.keys(data.riskDistribution);
  if (distributionKeys.length > 0) {
    document
      .fillColor('#1f2937')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Répartition des risques');
    const distributions = distributionKeys.map((level) => [
      String(level),
      numberFormat.format(data.riskDistribution[level] ?? 0),
    ]);
    drawTable(document, ['Niveau de risque', 'Nombre de communes'], distributions, [0.5, 0.5]);
  }

  if (data.priorityCommunes.length > 0) {
    document.moveDown(0.6);
    document.fillColor('#1f2937').font('Helvetica-Bold').fontSize(12).text('Communes prioritaires');
    const priorityRows = data.priorityCommunes.map((commune) => [
      String(commune.communeName ?? '—'),
      String(commune.districtName ?? '—'),
      String(commune.riskLevel ?? '—'),
      String(commune.riskScore ?? '—'),
    ]);
    drawTable(
      document,
      ['Commune', 'District', 'Niveau de risque', 'Score'],
      priorityRows,
      [0.3, 0.3, 0.2, 0.2],
    );
  }

  if (data.latestAlerts.length > 0) {
    document.moveDown(0.6);
    document.fillColor('#1f2937').font('Helvetica-Bold').fontSize(12).text('Alertes récentes');
    document.fillColor('#111827').font('Helvetica').fontSize(9.5);
    for (const alert of data.latestAlerts) {
      const published = alert.publishedAt
        ? new Date(String(alert.publishedAt)).toLocaleString('fr-FR')
        : 'non datée';
      document.text(
        `• [${String(alert.severity ?? '?')}] ${String(alert.title ?? 'Sans titre')} (${published})`,
        { width: usable },
      );
    }
  }

  document.moveDown(0.8);
  document
    .fillColor('#6b7280')
    .font('Helvetica-Oblique')
    .fontSize(8.5)
    .text(
      'Limites des données : ce rapport repose sur les données disponibles dans MadaRisk au moment de sa génération. Les zones exposées sont estimées à partir des trajectoires d’événements et des seuils de risque configurés ; elles peuvent évoluer avec de nouvelles observations.',
      { width: usable },
    );

  document.end();
  return result;
}

export const reportsService = {
  async dashboardReport(
    range: { dateFrom?: Date; dateTo?: Date },
    actor: { id: string; role: UserRole },
  ): Promise<
    ReturnType<typeof reportsRepository.dashboardReport> extends Promise<infer T> ? T : never
  > {
    if (!isAdminRole(actor.role)) {
      throw AppError.forbidden(
        'Seuls ADMIN et SUPER_ADMIN peuvent consulter le rapport de tableau de bord',
      );
    }
    const result = await reportsRepository.dashboardReport({
      dateFrom: range.dateFrom ?? new Date(0),
      dateTo: range.dateTo ?? new Date(),
    });
    await usersRepository.writeAudit({
      userId: actor.id,
      action: 'REPORT_VIEWED',
      entityType: 'report',
      newValue: { resourceType: 'dashboard' },
    });
    return result;
  },

  async eventReport(
    eventId: string,
    actor: { id: string; role: UserRole },
  ): Promise<
    ReturnType<typeof reportsRepository.eventReport> extends Promise<infer T> ? T : never
  > {
    const clientOnly = isRestrictedClient(actor.role);
    return reportsRepository.eventReport(eventId, clientOnly);
  },

  async exportCsv(
    input: CsvExportInput,
    actor: { id: string; role: UserRole },
  ): Promise<{ filename: string; content: string; reportId: string }> {
    const context: ExportContext = { ...input };
    const filters = filtersFrom(context);
    const clientOnly = isRestrictedClient(actor.role);

    const rows = await (async (): Promise<Record<string, unknown>[]> => {
      switch (input.resourceType) {
        case 'communes':
          return reportsRepository.csvCommunes(filters);
        case 'districts':
          return reportsRepository.csvDistricts(filters);
        case 'events':
          return reportsRepository.csvEvents(filters);
        case 'alerts':
          return reportsRepository.csvAlerts(filters, clientOnly);
        case 'risks':
          return reportsRepository.csvRisks(filters);
        case 'exposed-communes':
          return reportsRepository.csvExposedCommunes(filters);
      }
    })();

    const parser = new Parser({ fields: CSV_HEADERS[input.resourceType] });
    const content = `\uFEFF${crlfToLf(parser.parse(rows))}`;
    const filename = `export-${input.resourceType}.csv`;

    const filePath = await writeReportFile('.csv', content);
    const reportId = await persist({
      generatedBy: actor.id,
      eventId: input.eventId ?? null,
      districtId: input.districtId ?? null,
      communeId: input.communeId ?? null,
      title: `Export CSV - ${CSV_LABELS[input.resourceType]}`,
      reportType: `CSV_${input.resourceType.toUpperCase().replace('-', '_')}`,
      format: 'CSV',
      context,
      filePath,
    });

    return { filename, content, reportId };
  },

  async exportGeoJson(
    input: GeoJsonExportInput,
    actor: { id: string; role: UserRole },
  ): Promise<{ filename: string; content: string; reportId: string }> {
    const context: ExportContext = { ...input };
    const filters = filtersFrom(context);

    const rows = await (async (): Promise<
      { props: Record<string, unknown>; geometry: unknown }[]
    > => {
      switch (input.resourceType) {
        case 'communes':
          return reportsRepository.geojsonCommunes(input.communeId ?? null);
        case 'districts':
          return reportsRepository.geojsonDistricts();
        case 'event-areas':
          return reportsRepository.geojsonEventAreas(input.eventId!);
        case 'risks':
          return reportsRepository.geojsonRisks(filters);
      }
    })();

    const content = JSON.stringify(buildFeatureCollection(rows), null, 2);
    const filename = `export-${input.resourceType}.geojson`;

    const filePath = await writeReportFile('.geojson', content);
    const reportId = await persist({
      generatedBy: actor.id,
      eventId: input.eventId ?? null,
      districtId: input.districtId ?? null,
      communeId: input.communeId ?? null,
      title: `Export GeoJSON - ${GEOJSON_LABELS[input.resourceType]}`,
      reportType: `GEOJSON_${input.resourceType.toUpperCase().replace('-', '_')}`,
      format: 'GEOJSON',
      context,
      filePath,
    });

    return { filename, content, reportId };
  },

  async exportPdf(
    input: PdfExportInput,
    actor: { id: string; role: UserRole },
  ): Promise<{ filename: string; content: Buffer; reportId: string }> {
    if (!isAdminRole(actor.role)) {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent générer un rapport PDF');
    }

    let eventReport: Awaited<ReturnType<typeof reportsRepository.eventReport>> | null = null;
    if (input.eventId) {
      eventReport = await reportsRepository.eventReport(input.eventId, false);
    }

    const dashboard = await reportsRepository.dashboardReport({
      dateFrom: input.dateFrom ?? new Date(0),
      dateTo: input.dateTo ?? new Date(),
    });

    const generatedAt = new Date();
    const title = input.title ?? `Rapport synthétique - ${generatedAt.toLocaleDateString('fr-FR')}`;

    const content = await buildPdf({
      title,
      generatedAt,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      event: eventReport?.event ?? null,
      exposedCommunes:
        eventReport?.exposedCommunes ??
        dashboard.priorityCommunes.map((commune) => ({
          communeName: commune.communeName,
          districtName: commune.districtName,
          riskLevel: commune.riskLevel,
          riskScore: commune.riskScore,
        })),
      exposedPopulation: eventReport?.exposedPopulation ?? dashboard.exposure.population,
      riskDistribution:
        eventReport?.riskDistribution && Object.keys(eventReport.riskDistribution).length > 0
          ? eventReport.riskDistribution
          : dashboard.riskDistribution,
      priorityCommunes: dashboard.priorityCommunes,
      activeAlerts: dashboard.alerts.active,
      latestAlerts: dashboard.latestAlerts,
    });

    const filename = 'rapport-synthetique.pdf';
    const filePath = await writeReportFile('.pdf', content);

    const reportId = await persist({
      generatedBy: actor.id,
      eventId: input.eventId ?? null,
      districtId: input.districtId ?? null,
      communeId: input.communeId ?? null,
      title,
      reportType: 'PDF',
      format: 'PDF',
      context: { resourceType: 'pdf', ...input },
      filePath,
    });

    return { filename, content, reportId };
  },

  async list(
    query: {
      page: number;
      limit: number;
      format?: ReportFormat;
      reportType?: string;
      eventId?: string;
    },
    actor: { id: string; role: UserRole },
  ): Promise<ReturnType<typeof reportsRepository.list>> {
    if (!isAdminRole(actor.role)) {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent lister les rapports');
    }
    return reportsRepository.list(query);
  },

  async downloadMeta(
    id: string,
    actor: { id: string; role: UserRole },
  ): Promise<{ filename: string; filePath: string }> {
    if (!isAdminRole(actor.role)) {
      throw AppError.forbidden('Seuls ADMIN et SUPER_ADMIN peuvent télécharger un rapport');
    }
    const report = await reportsRepository.findById(id);
    if (!report || !report.filePath) {
      throw AppError.notFound('Rapport introuvable');
    }
    const absPath = path.resolve(process.cwd(), report.filePath);
    try {
      await fs.access(absPath);
    } catch {
      throw AppError.notFound('Le fichier du rapport est introuvable sur le serveur');
    }
    return { filename: path.basename(report.filePath) ?? `${report.title}.bin`, filePath: absPath };
  },
};

export type CsvExportInput = {
  resourceType: CsvResourceType;
  eventId?: string;
  districtId?: string;
  communeId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type GeoJsonExportInput = {
  resourceType: GeoJsonResourceType;
  eventId?: string;
  districtId?: string;
  communeId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type PdfExportInput = {
  title?: string;
  eventId?: string;
  districtId?: string;
  communeId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};
