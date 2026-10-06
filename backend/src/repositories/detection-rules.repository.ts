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

  async createRule(
    data: {
      hazardType: string;
      metric: string;
      operator: string;
      threshold: number;
      thresholdMax?: number | null;
      durationMinutes: number;
      aggregationWindowMinutes: number;
      forecastHorizonHours: number;
      severityRules: SeverityRule[];
      isActive: boolean;
      regionId?: string | null;
      districtId?: string | null;
      communeId?: string | null;
    },
    createdBy: string | null,
  ): Promise<HazardDetectionRule> {
    const { rows } = await db.query<HazardDetectionRuleRow>(
      `INSERT INTO hazard_detection_rules
         (hazard_type, metric, operator, threshold, threshold_max,
          duration_minutes, aggregation_window_minutes, forecast_horizon_hours,
          severity_rules, is_active, region_id, district_id, commune_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${DETECTION_RULE_COLUMNS}`,
      [
        data.hazardType,
        data.metric,
        data.operator,
        data.threshold,
        data.thresholdMax ?? null,
        data.durationMinutes,
        data.aggregationWindowMinutes,
        data.forecastHorizonHours,
        JSON.stringify(data.severityRules),
        data.isActive,
        data.regionId ?? null,
        data.districtId ?? null,
        data.communeId ?? null,
        createdBy,
      ],
    );
    return mapDetectionRule(rows[0]);
  },

  async updateRule(
    id: string,
    data: Partial<{
      hazardType: string;
      metric: string;
      operator: string;
      threshold: number;
      thresholdMax: number | null;
      durationMinutes: number;
      aggregationWindowMinutes: number;
      forecastHorizonHours: number;
      severityRules: SeverityRule[];
      isActive: boolean;
      regionId: string | null;
      districtId: string | null;
      communeId: string | null;
    }>,
  ): Promise<HazardDetectionRule | null> {
    const mapping: Record<string, unknown> = {
      hazard_type: data.hazardType,
      metric: data.metric,
      operator: data.operator,
      threshold: data.threshold,
      threshold_max: data.thresholdMax,
      duration_minutes: data.durationMinutes,
      aggregation_window_minutes: data.aggregationWindowMinutes,
      forecast_horizon_hours: data.forecastHorizonHours,
      severity_rules: data.severityRules,
      is_active: data.isActive,
      region_id: data.regionId,
      district_id: data.districtId,
      commune_id: data.communeId,
    };

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [column, value] of Object.entries(mapping)) {
      if (value !== undefined) {
        values.push(column === 'severity_rules' ? JSON.stringify(value) : value);
        sets.push(`${column} = $${values.length}`);
      }
    }

    if (sets.length === 0) {
      const current = await this.findRuleById(id);
      return current;
    }

    values.push(id);
    const { rows } = await db.query<HazardDetectionRuleRow>(
      `UPDATE hazard_detection_rules SET ${sets.join(', ')}
       WHERE id = $${values.length}
       RETURNING ${DETECTION_RULE_COLUMNS}`,
      values,
    );
    return rows[0] ? mapDetectionRule(rows[0]) : null;
  },

  async deleteRule(id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM hazard_detection_rules WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
