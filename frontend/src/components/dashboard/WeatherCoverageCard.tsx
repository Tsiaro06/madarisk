import { CloudSun } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { WeatherView } from '@/data/dashboardView';
import { DashCard } from './DashCard';
import { RingGauge } from './RingGauge';
import { TrendBadge } from './TrendBadge';

interface WeatherCoverageCardProps {
  weather: WeatherView;
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'Fraîches') return 'success';
  if (status === 'Périmées') return 'warning';
  if (status === 'Jamais synchronisées') return 'danger';
  return 'neutral';
}

const TONE_DOT: Record<string, string> = {
  success: 'var(--dash-positive)',
  warning: '#F79009',
  danger: 'var(--dash-negative)',
  neutral: 'var(--dash-muted)',
};

export function WeatherCoverageCard({ weather }: WeatherCoverageCardProps) {
  const observationsTone = statusTone(weather.observationsStatus);
  const forecastsTone = statusTone(weather.forecastsStatus);

  return (
    <DashCard
      title="Couverture des données météo"
      description={weather.sourceName}
      actions={<TrendBadge value={weather.trend.value} label={weather.trend.label} />}
    >
      <div className="flex justify-center py-2">
        <RingGauge
          value={weather.percent}
          size={180}
          thickness={11}
          ariaLabel={`${weather.percent} % des communes disposent de données météo`}
        />
      </div>

      <p className="mt-4 text-center text-sm font-medium text-[var(--dash-ink-soft)]">
        <CloudSun className="mr-1.5 inline size-4 text-[var(--dash-accent)]" aria-hidden="true" />
        {weather.percent > 0
          ? `${weather.percent} % des communes suivies disposent d'une observation`
          : 'Aucune observation météo disponible'}
      </p>

      <dl className="mt-6 space-y-3 border-t border-[var(--dash-line)] pt-5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-[var(--dash-ink-soft)]">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: TONE_DOT[observationsTone] }}
            />
            Observations
          </dt>
          <dd className="truncate font-medium tabular-nums text-[var(--dash-ink)]">
            {weather.observationsStatus}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-[var(--dash-ink-soft)]">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: TONE_DOT[forecastsTone] }}
            />
            Prévisions
          </dt>
          <dd className="truncate font-medium tabular-nums text-[var(--dash-ink)]">
            {weather.forecastsStatus}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--dash-ink-soft)]">Communes couvertes</dt>
          <dd className="font-medium tabular-nums text-[var(--dash-ink)]">
            {weather.totalCommunes > 0
              ? `${weather.communesData.toLocaleString('fr-FR')} / ${weather.totalCommunes.toLocaleString('fr-FR')}`
              : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--dash-ink-soft)]">Dernière donnée</dt>
          <dd className="truncate font-medium text-[var(--dash-ink)]">
            {weather.observationsAt ? formatDate(weather.observationsAt) : '—'}
          </dd>
        </div>
      </dl>
    </DashCard>
  );
}