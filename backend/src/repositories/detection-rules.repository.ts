import { db } from '../config/database';
import {
  HazardDetectionRule,
  HazardDetectionRuleRow,
  SeverityRule,
} from '../types/automation.types';

const DETECTION_RULE_COLUMNS = `
  id, hazard_type, metric, operator, threshold, threshold_max,
  duration_minutes, aggregation_window_minutes, forecast_horizon_hours,
  severity_rules, is_active, region_id, district_id, commune_id,
  created_by, created_at, updated_at
`;

function mapDetectionRule(row: HazardDetectionRuleRow): HazardDetectionRule {
  return {
    id: row.id,
    hazardType: row.hazard_type,
    metric: row.metric,
    operator: row.operator as HazardDetectionRule['operator'],
    threshold: parseFloat(row.threshold),
    thresholdMax: row.threshold_max !== null ? parseFloat(row.threshold_max) : null,
    durationMinutes: row.duration_minutes,
    aggregationWindowMinutes: row.aggregation_window_minutes,
    forecastHorizonHours: row.forecast_horizon_hours,
    severityRules: Array.isArray(row.severity_rules) ? (row.severity_rules as SeverityRule[]) : [],
    isActive: row.is_active,
    regionId: row.region_id,
    districtId: row.district_id,
    communeId: row.commune_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface DetectionRulesFilters {
  isActive?: boolean;
  hazardType?: string;
  metric?: string;
}

export const detectionRulesRepository = {
  /**
   * Lecture des règles de détection. Par défaut seules les règles actives
   * sont retournées (isActive=true), comme exigé par la détection automatique.
   */
  async listRules(filters?: DetectionRulesFilters): Promise<HazardDetectionRule[]> {
    let sql = `SELECT ${DETECTION_RULE_COLUMNS} FROM hazard_detection_rules`;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.isActive !== undefined) {
      params.push(filters.isActive);
      conditions.push(`is_active = $${params.length}`);
    }

    if (filters?.hazardType) {
      params.push(filters.hazardType);
      conditions.push(`hazard_type = $${params.length}`);
    }

    if (filters?.metric) {
      params.push(filters.metric);
      conditions.push(`metric = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows } = await db.query<HazardDetectionRuleRow>(sql, params);
    return rows.map(mapDetectionRule);
  },

  async findRuleById(id: string): Promise<HazardDetectionRule | null> {
    const sql = `SELECT ${DETECTION_RULE_COLUMNS} FROM hazard_detection_rules WHERE id = $1`;
    const { rows } = await db.query<HazardDetectionRuleRow>(sql, [id]);
    return rows[0] ? mapDetectionRule(rows[0]) : null;
  },
};