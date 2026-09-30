import { CloudSun } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { WeatherView } from '@/data/dashboardView';
import { DashCard } from './DashCard';
import { RingGauge } from './RingGauge';
import { TrendBadge } from './TrendBadge';

interface WeatherCoverageCardProps {
  weather: WeatherView;
}

/**
 * Densité du point d'état. La sémantique « fraîche / périmée » est portée par
 * le libellé et l'aria-label, la hiérarchie visuelle par l'opacité du bleu.
 */
function statusDensity(status: string): number {
  if (status === 'Fraîches') return 1;
  if (status === 'Périmées') return 0.56;
  if (status === 'Jamais synchronisées') return 0.24;
  return 0.14;
}

export function WeatherCoverageCard({ weather }: WeatherCoverageCardProps) {
  const observationsDensity = statusDensity(weather.observationsStatus);
  const forecastsDensity = statusDensity(weather.forecastsStatus);

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

      <p className="mt-4 text-center text-sm font-medium text-(--dash-text-soft)">
        <CloudSun className="mr-1.5 inline size-4 text-(--dash-navy)" aria-hidden="true" />
        {weather.percent > 0
          ? `${weather.percent} % des communes suivies disposent d'une observation`
          : 'Aucune observation météo disponible'}
      </p>

      <dl className="mt-6 space-y-3 border-t border-(--dash-line) pt-5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-(--dash-text-soft)">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: `rgba(3, 34, 76, ${observationsDensity})` }}
            />
            Observations
          </dt>
          <dd className="truncate font-medium tabular-nums text-(--dash-text)">
            {weather.observationsStatus}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-(--dash-text-soft)">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: `rgba(3, 34, 76, ${forecastsDensity})` }}
            />
            Prévisions
          </dt>
          <dd className="truncate font-medium tabular-nums text-(--dash-text)">
            {weather.forecastsStatus}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-(--dash-text-soft)">Communes couvertes</dt>
          <dd className="font-medium tabular-nums text-(--dash-text)">
            {weather.totalCommunes > 0
              ? `${weather.communesData.toLocaleString('fr-FR')} / ${weather.totalCommunes.toLocaleString('fr-FR')}`
              : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-(--dash-text-soft)">Dernière donnée</dt>
          <dd className="truncate font-medium text-(--dash-text)">
            {weather.observationsAt ? formatDate(weather.observationsAt) : '—'}
          </dd>
        </div>
      </dl>
    </DashCard>
  );
}