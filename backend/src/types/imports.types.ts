export type ImportsTerritoryType = 'DISTRICT' | 'COMMUNE';
export type ImportFileType = 'GEOJSON' | 'JSON' | 'CSV';
export type ImportStatus = 'BROUILLON' | 'EN_COURS' | 'TERMINE' | 'ECHEC';
export type MatchingStatus = 'EN_ATTENTE' | 'VALIDE' | 'REJETE' | 'AMBIGU';
export type MatchingMethod =
  | 'CODE_ADMINISTRATIF'
  | 'NOM_NORMALISE'
  | 'ALIAS'
  | 'FUZZY_MATCHING'
  | 'MANUEL';

export interface ImportErrorEntry {
  row: number;
  reason: string;
}

export interface ImportDetail {
  id: string;
  importedBy: string | null;
  fileName: string;
  filePath: string | null;
  fileType: ImportFileType;
  territoryType: ImportsTerritoryType | null;
  coordinateSystem: string | null;
  status: ImportStatus;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  errorLog: ImportErrorEntry[];
  createdAt: string;
  completedAt: string | null;
}

export interface SourceRecord {
  id: string;
  importId: string;
  externalReference: string | null;
  sourceName: string | null;
  normalizedName: string | null;
  sourceCode: string | null;
  sourceDistrict: string | null;
  sourceRegion: string | null;
  rawData: Record<string, unknown> | null;
  createdAt: string;
}

export interface TerritoryImportInput {
  sourceName?: string | null;
  sourceCode?: string | null;
  sourceDistrict?: string | null;
  sourceRegion?: string | null;
  externalReference?: string | null;
  rawData: Record<string, unknown>;
}

export interface ImportProcessResult {
  importId: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  errors: ImportErrorEntry[];
}

export interface MatchingCandidate {
  territoryId: string;
  targetType: ImportsTerritoryType;
  code?: string | null;
  name?: string | null;
  normalizedName?: string | null;
}

export interface MatchingDecision {
  targetType: ImportsTerritoryType | null;
  territoryId: string | null;
  method: MatchingMethod | null;
  confidence: number | null;
  status: MatchingStatus;
  notes?: string | null;
}

export interface MatchingRunResult {
  total: number;
  proposed: number;
  ambiguous: number;
  unmatched: number;
}
