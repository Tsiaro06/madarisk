import type {
  DashboardSummary,
  EventsTimelineEntry,
  RiskDistribution,
} from '@/types';
import type { WeatherMonitoring } from '@/types/weather';
import { RISK_RAMP } from '@/lib/dashboardTheme';

export interface TrendDelta {
  /** Variation en pourcentage sur la période précédente. `null` masque le badge. */
  value: number | null;
  /** Période de comparaison, affichée en infobulle. */
  label: string;
}

export interface KpiDatum {
  id: string;
  label: string;
  value: number | null;
  unit?: string;
  hint: string;
  trend: TrendDelta;
  icon: 'siren' | 'alert' | 'users' | 'map';
}

/**
 * Écarts d'évolution : l'API `/dashboard/summary` n'expose pas encore d'historique,
 * ces valeurs sont donc des repères de maquette.
 * Remplacez-les par vos propres chiffres (ou renvoyez-les depuis l'API) et
 * mettez `value: null` pour masquer le badge.
 */
export const SUMMARY_TRENDS: Record<string, TrendDelta> = {
  activeEvents: { value: 12, label: 'vs 7 jours précédents' },
  activeAlerts: { value: -15, label: 'vs 7 jours précédents' },
  exposedPopulation: { value: 8, label: 'vs 7 jours précédents' },
  totalDistricts: { value: null, label: 'vs 7 jours précédents' },
  weatherCoverage: { value: 4, label: 'vs 7 jours précédents' },
};

const NO_TREND: TrendDelta = { value: null, label: 'vs 7 jours précédents' };

export interface RiskBucket {
  level: string;
  label: string;
  count: number;
  share: number;
  color: string;
}

export interface HeroView {
  subtitle: string;
  coverage: {
    percent: number;
    covered: number;
    total: number;
  };
  miniStats: Array<{ label: string; value: number; color: string }>;
  total: {
    value: number;
    label: string;
  };
}

export interface TimelinePoint {
  date: string;
  label: string;
  total: number;
}

export interface WeatherView {
  percent: number;
  communesData: number;
  totalCommunes: number;
  observationsStatus: string;
  observationsAt: string | null;
  forecastsStatus: string;
  forecastsAt: string | null;
  sourceName: string;
  trend: TrendDelta;
}

export interface DashboardView {
  hero: HeroView;
  kpis: KpiDatum[];
  timeline: TimelinePoint[];
  timelineTotal: number;
  risks: RiskBucket[];
  weather: WeatherView;
  lastUpdatedAt: string | null;
}

const RISK_ORDER = ['EXTREME', 'ELEVE', 'MODERE', 'FAIBLE', 'SANS_RISQUE'] as const;

const RISK_LABELS: Record<string, string> = {
  EXTREME: 'Risque extrême',
  ELEVE: 'Risque élevé',
  MODERE: 'Risque modéré',
  FAIBLE: 'Risque faible',
  SANS_RISQUE: 'Sans risque',
};

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sumRisks(dist: Partial<RiskDistribution> | undefined): number {
  if (!dist) return 0;
  return RISK_ORDER.reduce((acc, level) => acc + (dist[level] ?? 0), 0);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function statusLabel(status?: string): string {
  if (status === 'FRESH') return 'Fraîches';
  if (status === 'STALE') return 'Périmées';
  if (status === 'NEVER') return 'Jamais synchronisées';
  return 'Indisponibles';
}

export function buildDashboardView(input: {
  summary?: DashboardSummary;
  timeline?: EventsTimelineEntry[];
  distribution?: Partial<RiskDistribution>;
  monitoring?: WeatherMonitoring;
}): DashboardView {
  const { summary, timeline, distribution, monitoring } = input;

  const totalCommunes = summary?.totalCommunes ?? 0;
  const assessed = sumRisks(distribution);
  const coveragePercent =
    totalCommunes > 0 ? Math.min(100, Math.round((assessed / totalCommunes) * 100)) : 0;

  const extreme = distribution?.EXTREME ?? 0;
  const high = distribution?.ELEVE ?? 0;
  const moderate = distribution?.MODERE ?? 0;

  const timelinePoints: TimelinePoint[] = (timeline ?? []).map((entry) => ({
    date: entry.date.slice(0, 10),
    label: shortDate(entry.date),
    total: entry.total,
  }));

  const obs = monitoring?.sync.observations;
  const fc = monitoring?.sync.forecasts;
  const source =
    monitoring?.sources.find((s: WeatherMonitoring['sources'][number]) => s.isActive) ??
    monitoring?.sources[0];

  const weatherPercent =
    totalCommunes > 0 && obs
      ? Math.min(100, Math.round((obs.communesData / totalCommunes) * 100))
      : 0;

  return {
    hero: {
      subtitle: 'Vue opérationnelle nationale · Madagascar',
      coverage: {
        percent: coveragePercent,
        covered: assessed,
        total: totalCommunes,
      },
      miniStats: [
        { label: 'Risque extrême', value: extreme, color: RISK_RAMP.EXTREME },
        { label: 'Risque élevé', value: high, color: RISK_RAMP.ELEVE },
        { label: 'Risque modéré', value: moderate, color: RISK_RAMP.MODERE },
      ],
      total: {
        value: totalCommunes,
        label: 'Communes couvertes',
      },
    },

    kpis: [
      {
        id: 'activeEvents',
        label: 'Événements actifs',
        value: safeNumber(summary?.activeEvents),
        hint: 'En cours ou suivis',
        trend: SUMMARY_TRENDS.activeEvents ?? NO_TREND,
        icon: 'siren',
      },
      {
        id: 'activeAlerts',
        label: 'Alertes publiées',
        value: safeNumber(summary?.activeAlerts),
        hint: 'Alertes en cours',
        trend: SUMMARY_TRENDS.activeAlerts ?? NO_TREND,
        icon: 'alert',
      },
      {
        id: 'exposedPopulation',
        label: 'Population exposée',
        value: safeNumber(summary?.exposedPopulation),
        unit: 'hab.',
        hint: 'Personnes en zone affectée',
        trend: SUMMARY_TRENDS.exposedPopulation ?? NO_TREND,
        icon: 'users',
      },
      {
        id: 'totalDistricts',
        label: 'Districts couverts',
        value: safeNumber(summary?.totalDistricts),
        hint: 'Territoire supervisé',
        trend: SUMMARY_TRENDS.totalDistricts ?? NO_TREND,
        icon: 'map',
      },
    ],

    timeline: timelinePoints,
    timelineTotal: timelinePoints.reduce((acc, p) => acc + p.total, 0),

    risks: RISK_ORDER.map((level) => {
      const count = distribution?.[level] ?? 0;
      return {
        level,
        label: RISK_LABELS[level],
        count,
        share: assessed > 0 ? Math.round((count / assessed) * 100) : 0,
        color: RISK_RAMP[level],
      };
    }),

    weather: {
      percent: weatherPercent,
      communesData: obs?.communesData ?? 0,
      totalCommunes,
      observationsStatus: statusLabel(obs?.status),
      observationsAt: obs?.lastDataAt ?? null,
      forecastsStatus: statusLabel(fc?.status),
      forecastsAt: fc?.lastDataAt ?? null,
      sourceName: source?.name ?? 'Source météo',
      trend: SUMMARY_TRENDS.weatherCoverage ?? NO_TREND,
    },

    lastUpdatedAt: summary?.lastUpdatedAt ?? null,
  };
}