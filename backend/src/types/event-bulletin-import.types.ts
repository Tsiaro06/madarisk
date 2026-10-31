export interface CanonicalTrackPoint {
  observedAt: string;
  forecastFor?: string | null;
  trackType: 'OBSERVEE' | 'PREVUE';
  lat: number;
  lon: number;
  windSpeedKmh?: number | null;
  gustSpeedKmh?: number | null;
  pressureHpa?: number | null;
  movementDirection?: string | null;
  movementSpeedKmh?: number | null;
  radius34ktKm?: number | null;
  radius50ktKm?: number | null;
  radius64ktKm?: number | null;
  sourceRef?: string | null;
}

export interface DetectedBulletin {
  parser: 'IBTRACS' | 'DGM' | 'GENERIC_CSV' | 'GENERIC_JSON' | 'SHAPEFILE' | 'UNKNOWN';
  confidence: number;
  filePath: string;
  eventHint?: {
    code?: string;
    name?: string;
    type?:
      | 'CYCLONE'
      | 'INONDATION'
      | 'SECHERESSE'
      | 'FORTE_PLUIE'
      | 'VENT_VIOLENT'
      | 'GLISSEMENT_TERRAIN'
      | 'FEU_VEGETATION'
      | 'VAGUE_DE_CHALEUR'
      | 'AUTRE';
    startedAt?: string;
  };
  points: CanonicalTrackPoint[];
  bulletins?: Array<{
    ref: string;
    title: string;
    publishedAt?: string | null;
    observedAt?: string | null;
    content?: string | null;
    raw?: unknown;
  }>;
}

export interface EventBulletinPreviewResult {
  parser: string;
  confidence: number;
  filesScanned: number;
  extractedFiles: string[];
  eventHint?: DetectedBulletin['eventHint'];
  points: CanonicalTrackPoint[];
  bulletins: DetectedBulletin['bulletins'];
  warnings: string[];
}
