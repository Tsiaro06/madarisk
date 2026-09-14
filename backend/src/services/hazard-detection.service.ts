import { env } from '../config/env';
import { logger } from '../config/logger';
import { detectionRulesService } from './detection-rules.service';
import { eventsRepository } from '../repositories/events.repository';
import { hazardDetectionRepository } from '../repositories/hazard-detection.repository';
import { exposureRepository } from '../repositories/exposure.repository';
import { exposureService } from './exposure.service';
import { automaticAlertService } from './automatic-alerts.service';
import {
  applyOperator,
  detectionKeyFor,
  eventCodeFor,
  eventNameFor,
  intensityScore,
  metricToForecastColumn,
  metricToObservationColumn,
  severityForScore,
  WIND_METRICS,
  PRESSURE_METRICS,
  RAIN_METRICS,
} from './detection.logic';
import type { HazardDetectionRule } from '../types/automation.types';
import type {
  DetectionRunInfo,
  DetectionRunOptions,
  DetectionRunOutcome,
  DetectionSignal,
  EventTimelineEntry,
} from '../types/detection.types';
import type { EventStatus, SeverityLevel } from '../types/event.types';
import { AppError } from '../utils/app-error';
import type { ScopeResolution } from '../repositories/hazard-detection.repository';
import type { DetectionCommuneRow } from '../types/exposure.types';

interface RunningLock {
  runId: string;
  startedAt: number;
}

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  FAIBLE: 0,
  MODEREE: 1,
  ELEVEE: 2,
  EXTREME: 3,
};

function maxSeverity(a: SeverityLevel, b: SeverityLevel): SeverityLevel {
  return SEVERITY_ORDER[b] > SEVERITY_ORDER[a] ? b : a;
}

function snapshotTrigger(trigger: 'SCHEDULED' | 'MANUAL'): string {
  return trigger === 'MANUAL' ? 'MANUAL_DETECTION' : 'AUTO_DETECTION';
}

const HISTORY_SOURCE = 'HAZARD_DETECTION';

let activeRun: RunningLock | null = null;

export const hazardDetectionService = {
  async run(options: DetectionRunOptions = {}): Promise<DetectionRunOutcome> {
    const trigger = options.trigger ?? 'MANUAL';
    const now = options.now ?? new Date();

    const normalCyclesBeforeMonitoring =
      options.normalCyclesBeforeMonitoring ?? env.DETECTION_NORMAL_CYCLES_BEFORE_MONITORING;
    const monitoringHours = options.monitoringHours ?? env.DETECTION_MONITORING_HOURS;
    const dedupeHours = options.dedupeHours ?? env.DETECTION_DEDUPE_HOURS;

    let rules = await detectionRulesService.getActiveRules();

    if (options.scope === 'OBSERVATIONS') {
      rules = rules.filter((r) => r.forecastHorizonHours === 0);
    } else if (options.scope === 'FORECASTS') {
      rules = rules.filter((r) => r.forecastHorizonHours > 0);
    }

    if (rules.length === 0 && options.skipWhenNoRules) {
      return {
        runId: null,
        started: false,
        joinedExisting: false,
        status: 'SKIPPED',
        trigger,
        rulesEvaluated: 0,
        rulesTriggered: 0,
        detections: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
      };
    }

    if (activeRun) {
      logger.info(
        { runId: activeRun.runId },
        'Détection d aléas : exécution déjà en cours, rejoint',
      );
      return {
        runId: activeRun.runId,
        started: false,
        joinedExisting: true,
        status: 'RUNNING',
        trigger,
        rulesEvaluated: 0,
        rulesTriggered: 0,
        detections: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
      };
    }

    const runId = await hazardDetectionRepository.createRun(trigger);
    activeRun = { runId, startedAt: Date.now() };

    try {
      const outcome = await evaluateRules(rules, {
        trigger,
        now,
        normalCyclesBeforeMonitoring,
        monitoringHours,
        dedupeHours,
      });

      await hazardDetectionRepository.finishRun(runId, {
        status: outcome.status === 'PARTIAL' ? 'PARTIAL' : 'SUCCESS',
        rulesEvaluated: outcome.rulesEvaluated,
        detections: outcome.detections,
        rulesTriggered: outcome.rulesTriggered,
        eventsCreated: outcome.eventsCreated,
        eventsUpdated: outcome.eventsUpdated,
        errorMessage: null,
      });

      return { ...outcome, runId, started: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      logger.error({ err, runId }, 'Détection d aléas : échec du traitement');
      await hazardDetectionRepository.finishRun(runId, {
        status: 'FAILED',
        rulesEvaluated: 0,
        detections: 0,
        rulesTriggered: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
        errorMessage: message,
      });
      throw err;
    } finally {
      activeRun = null;
    }
  },

  async runs(limit = 20): Promise<DetectionRunInfo[]> {
    return hazardDetectionRepository.listRuns(limit);
  },

  async eventTimeline(eventId: string): Promise<EventTimelineEntry[]> {
    const event = await eventsRepository.findById(eventId);
    if (!event) {
      throw AppError.notFound('Événement introuvable — aucune chronologie disponible');
    }
    return hazardDetectionRepository.getEventTimeline(eventId);
  },
};

interface EvalContext {
  trigger: 'SCHEDULED' | 'MANUAL';
  now: Date;
  normalCyclesBeforeMonitoring: number;
  monitoringHours: number;
  dedupeHours: number;
}

async function evaluateRules(
  rules: HazardDetectionRule[],
  ctx: EvalContext,
): Promise<DetectionRunOutcome> {
  const nowIso = ctx.now.toISOString();
  const dedupeSince = new Date(ctx.now.getTime() - ctx.dedupeHours * 3600_000).toISOString();

  const groups = new Map<
    string,
    { hazardType: string; dataKind: 'OBSERVE' | 'PREVU'; signals: DetectionSignal[] }
  >();
  let rulesEvaluated = 0;
  let rulesTriggered = 0;
  let ruleErrors = 0;

  for (const rule of rules) {
    rulesEvaluated += 1;
    try {
      const scope = await hazardDetectionRepository.resolveScopeInfo(rule);
      const isPrevision = rule.forecastHorizonHours > 0;
      const signals = isPrevision
        ? await evalForecastRule(rule, scope, ctx.now)
        : await evalObservationRule(rule, scope, ctx.now);

      if (signals.length > 0) rulesTriggered += 1;

      for (const signal of signals) {
        const key = detectionKeyFor(signal.hazardType, signal.geoKey);
        const existing = groups.get(key);
        if (existing) {
          existing.signals.push(signal);
        } else {
          groups.set(key, {
            hazardType: signal.hazardType,
            dataKind: signal.dataKind,
            signals: [signal],
          });
        }
      }
    } catch (err) {
      ruleErrors += 1;
      logger.warn({ ruleId: rule.id, err }, 'Détection d aléas : règle ignorée suite à une erreur');
    }
  }

  const touchedEventIds = new Set<string>();
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let detections = 0;

  for (const group of groups.values()) {
    detections += group.signals.length;
    const decision = decisionForGroup(group.hazardType, group.signals);
    const key = detectionKeyFor(group.hazardType, group.signals[0].geoKey);

    const best = bestSignal(group.signals);
    const severity = groupSeverity(group.signals);
    const description = groupDescription(group, best);

    const existing = await hazardDetectionRepository.findOpenEventByKey(key, dedupeSince);

    if (existing) {
      const eventId = existing.id;
      let nextStatus: EventStatus | null = null;
      let reason: string | null = null;

      if (decision === 'ACTIF' && existing.status === 'PREVISION') {
        nextStatus = 'ACTIF';
        reason = 'Observation réelle : bascule PREVISION vers ACTIF';
      } else if (decision === 'ACTIF' && existing.status === 'SUIVI') {
        nextStatus = 'ACTIF';
        reason = 'Danger réapparu pendant le suivi : réactivation';
      }

      if (nextStatus && nextStatus !== existing.status) {
        await eventsRepository.updateStatus(eventId, nextStatus);
        await hazardDetectionRepository.writeStatusHistory({
          eventId,
          fromStatus: existing.status as EventStatus,
          toStatus: nextStatus,
          reason,
          source: HISTORY_SOURCE,
        });
      }

      await eventsRepository.update(eventId, {
        severity,
        description,
      });
      await hazardDetectionRepository.attachDetectionKey(eventId, key);
      await hazardDetectionRepository.insertMonitoring(eventId, key, nowIso);
      await hazardDetectionRepository.markDetected(eventId, nowIso);
      await recordSnapshot(
        eventId,
        nextStatus ?? (existing.status as EventStatus),
        severity,
        best,
        ctx.trigger,
      );
      await persistDetectionAndExposure(eventId, group.signals, ctx);
      touchedEventIds.add(eventId);
      eventsUpdated += 1;
    } else {
      const event = await hazardDetectionRepository.createEvent({
        eventCode: eventCodeFor(group.hazardType, group.signals[0].geoKey, ctx.now),
        name: eventNameFor(group.hazardType, group.signals[0].scopeLabel, decision === 'PREVISION'),
        type: group.hazardType,
        status: decision,
        severity,
        description,
        sourceName: 'DETECTION_AUTOMATIQUE',
        startupTime: nowIso,
      });
      const eventId = event.id;
      await hazardDetectionRepository.writeStatusHistory({
        eventId,
        fromStatus: null,
        toStatus: decision,
        reason: 'Détection automatique',
        source: HISTORY_SOURCE,
      });
      await hazardDetectionRepository.attachDetectionKey(eventId, key);
      await hazardDetectionRepository.insertMonitoring(eventId, key, nowIso);
      await hazardDetectionRepository.markDetected(eventId, nowIso);
      await recordSnapshot(eventId, decision, severity, best, ctx.trigger);
      await persistDetectionAndExposure(eventId, group.signals, ctx);
      touchedEventIds.add(eventId);
      eventsCreated += 1;
    }
  }

  const transitioned = await applyDecrease(ctx, touchedEventIds);

  for (const eventId of transitioned.eventIds) {
    await persistDetectionAndExposure(eventId, [], ctx);
  }

  const status: 'SUCCESS' | 'PARTIAL' | 'FAILED' =
    rules.length > 0 && ruleErrors === rules.length
      ? 'FAILED'
      : ruleErrors > 0
        ? 'PARTIAL'
        : 'SUCCESS';

  return {
    runId: null,
    started: true,
    joinedExisting: false,
    status,
    trigger: ctx.trigger,
    rulesEvaluated,
    rulesTriggered,
    detections,
    eventsCreated,
    eventsUpdated: eventsUpdated + transitioned.count,
  } as DetectionRunOutcome;
}

async function evalObservationRule(
  rule: HazardDetectionRule,
  scope: ScopeResolution,
  now: Date,
): Promise<DetectionSignal[]> {
  const column = metricToObservationColumn(rule.metric);
  if (!column) return [];

  const windowMinutes = rule.aggregationWindowMinutes > 0 ? rule.aggregationWindowMinutes : 60;
  const since = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
  const rows = await hazardDetectionRepository.observationValues(column, scope.communeIds, since);

  return rows
    .filter((r) => applyOperator(rule.operator, r.value, rule.threshold, rule.thresholdMax))
    .map((r) => {
      const score = intensityScore(r.value, rule);
      return {
        ruleId: rule.id,
        hazardType: rule.hazardType,
        metric: column,
        value: r.value,
        operator: rule.operator,
        threshold: rule.threshold,
        score,
        severity: severityForScore(rule.severityRules, score),
        dataKind: 'OBSERVE',
        communeId: r.communeId,
        communeName: r.communeName,
        scopeLabel: scope.label,
        geoKey: scope.geoKey,
        porteeType: scope.porteeType,
        timestamp: r.timestamp,
        latitude: r.latitude,
        longitude: r.longitude,
      };
    });
}

async function evalForecastRule(
  rule: HazardDetectionRule,
  scope: ScopeResolution,
  now: Date,
): Promise<DetectionSignal[]> {
  const column = metricToForecastColumn(rule.metric);
  if (!column) return [];

  const target = new Date(now.getTime() + rule.forecastHorizonHours * 3600_000)
    .toISOString()
    .slice(0, 10);
  const rows = await hazardDetectionRepository.forecastValues(column, scope.communeIds, target);

  return rows
    .filter((r) => applyOperator(rule.operator, r.value, rule.threshold, rule.thresholdMax))
    .map((r) => {
      const score = intensityScore(r.value, rule);
      return {
        ruleId: rule.id,
        hazardType: rule.hazardType,
        metric: column,
        value: r.value,
        operator: rule.operator,
        threshold: rule.threshold,
        score,
        severity: severityForScore(rule.severityRules, score),
        dataKind: 'PREVU',
        communeId: r.communeId,
        communeName: r.communeName,
        scopeLabel: scope.label,
        geoKey: scope.geoKey,
        porteeType: scope.porteeType,
        timestamp: r.timestamp,
        latitude: r.latitude,
        longitude: r.longitude,
      };
    });
}

function decisionForGroup(hazardType: string, signals: DetectionSignal[]): 'PREVISION' | 'ACTIF' {
  if (signals.every((s) => s.dataKind === 'PREVU')) return 'PREVISION';
  if (hazardType === 'CYCLONE') {
    const hasWind = signals.some((s) => WIND_METRICS.has(s.metric));
    const hasPressure = signals.some((s) => PRESSURE_METRICS.has(s.metric));
    return hasWind && hasPressure ? 'ACTIF' : 'PREVISION';
  }
  if (hazardType === 'INONDATION') {
    const rainMetrics = new Set(
      signals.filter((s) => RAIN_METRICS.has(s.metric)).map((s) => s.metric),
    );
    return rainMetrics.size >= 2 ? 'ACTIF' : 'PREVISION';
  }
  return 'ACTIF';
}

function bestSignal(signals: DetectionSignal[]): DetectionSignal {
  return signals.reduce((best, s) => (s.value > best.value ? s : best), signals[0]);
}

function groupSeverity(signals: DetectionSignal[]): SeverityLevel {
  return signals.reduce((acc, s) => maxSeverity(acc, s.severity), 'FAIBLE' as SeverityLevel);
}

function groupDescription(
  group: { hazardType: string; signals: DetectionSignal[] },
  best: DetectionSignal,
): string {
  const communeNames = Array.from(new Set(group.signals.map((s) => s.communeName))).slice(0, 10);
  const zone = communeNames.join(', ');
  return (
    `Détection automatique — ${best.metric} à ${best.value} (seuil ${best.threshold}). ` +
    `Zones concernées : ${zone}. Source : données météo synchronisées.`
  );
}

async function recordSnapshot(
  eventId: string,
  status: EventStatus,
  severity: SeverityLevel,
  best: DetectionSignal,
  trigger: 'SCHEDULED' | 'MANUAL',
): Promise<void> {
  const exposed = await hazardDetectionRepository.countExposedCommunes(eventId);
  await hazardDetectionRepository.writeSnapshot({
    eventId,
    trigger: snapshotTrigger(trigger),
    status,
    severity,
    exposedCommuneCount: exposed,
    riskLevelSummary: {},
    metricValues: { [best.metric]: best.value },
    details: { source: HISTORY_SOURCE },
  });
}

/** Communes uniques au-dessus du seuil, avec la valeur la plus intense par commune. */
function detectionCommunesFor(signals: DetectionSignal[]): DetectionCommuneRow[] {
  const byCommune = new Map<string, DetectionCommuneRow>();
  for (const s of signals) {
    const existing = byCommune.get(s.communeId);
    if (!existing || (existing.value ?? -Infinity) < s.value) {
      byCommune.set(s.communeId, {
        communeId: s.communeId,
        metric: s.metric,
        value: s.value,
        threshold: s.threshold,
      });
    }
  }
  return Array.from(byCommune.values());
}

/** Persiste les communes au-dessus du seuil puis recalcule exposition + risques. */
async function persistDetectionAndExposure(
  eventId: string,
  signals: DetectionSignal[],
  _ctx: EvalContext,
): Promise<void> {
  try {
    const rows = detectionCommunesFor(signals);
    if (rows.length > 0) {
      await exposureRepository.upsertDetectionCommunes(eventId, rows);
    }
    await exposureService.computeForEvent(eventId, { trigger: 'DETECTION' });
    if (rows.length > 0) {
      await automaticAlertService.generateForEvent({
        eventId,
        trigger: 'DETECTION',
        communeIds: rows.map((r) => r.communeId),
      });
    }
  } catch (err) {
    logger.warn({ err, eventId }, "Calcul automatique de l'exposition et des risques échoué");
  }
}

async function applyDecrease(
  ctx: EvalContext,
  touchedEventIds: Set<string>,
): Promise<{ count: number; eventIds: string[] }> {
  const nowIso = ctx.now.toISOString();
  const rows = await hazardDetectionRepository.listMonitorings();
  let transitions = 0;
  const eventIds: string[] = [];

  for (const row of rows) {
    if (touchedEventIds.has(row.eventId)) continue;

    if (row.status === 'ACTIF') {
      const cycles = await hazardDetectionRepository.incrementNormalCycle(row.eventId, nowIso);
      if (cycles >= ctx.normalCyclesBeforeMonitoring) {
        await eventsRepository.updateStatus(row.eventId, 'SUIVI');
        await hazardDetectionRepository.writeStatusHistory({
          eventId: row.eventId,
          fromStatus: 'ACTIF',
          toStatus: 'SUIVI',
          reason: `Danger en baisse : ${cycles} cycle(s) normal(aux) consécutif(s)`,
          source: HISTORY_SOURCE,
        });
        await hazardDetectionRepository.beginMonitoring(row.eventId, nowIso);
        await hazardDetectionRepository.writeSnapshot({
          eventId: row.eventId,
          trigger: snapshotTrigger(ctx.trigger),
          status: 'SUIVI',
          severity: 'FAIBLE',
          exposedCommuneCount: await hazardDetectionRepository.countExposedCommunes(row.eventId),
          riskLevelSummary: {},
          metricValues: {},
          details: { source: HISTORY_SOURCE, reason: 'Danger en baisse' },
        });
        transitions += 1;
        eventIds.push(row.eventId);
      }
    } else if (row.status === 'SUIVI') {
      const sinceMs = row.monitoringSince ? new Date(row.monitoringSince).getTime() : null;
      if (sinceMs !== null && ctx.now.getTime() - sinceMs >= ctx.monitoringHours * 3600_000) {
        await eventsRepository.updateStatus(row.eventId, 'CLOTURE');
        await hazardDetectionRepository.writeStatusHistory({
          eventId: row.eventId,
          fromStatus: 'SUIVI',
          toStatus: 'CLOTURE',
          reason: 'Danger résorbé : période de suivi terminée',
          source: HISTORY_SOURCE,
        });
        await hazardDetectionRepository.writeSnapshot({
          eventId: row.eventId,
          trigger: snapshotTrigger(ctx.trigger),
          status: 'CLOTURE',
          severity: 'FAIBLE',
          exposedCommuneCount: await hazardDetectionRepository.countExposedCommunes(row.eventId),
          riskLevelSummary: {},
          metricValues: {},
          details: { source: HISTORY_SOURCE, reason: 'Fin du suivi' },
        });
        await hazardDetectionRepository.deleteMonitoring(row.eventId);
        transitions += 1;
        eventIds.push(row.eventId);
      } else {
        await hazardDetectionRepository.incrementNormalCycle(row.eventId, nowIso);
      }
    }
  }

  return { count: transitions, eventIds };
}
