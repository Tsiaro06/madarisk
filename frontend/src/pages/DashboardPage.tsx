import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { dashboardApi, weatherApi } from '@/api';
import { Spinner } from '@/components/ui/Spinner';
import { DashCard, IconAction } from '@/components/dashboard/DashCard';
import { DashNotice } from '@/components/dashboard/DashNotice';
import { HeroPanel } from '@/components/dashboard/HeroPanel';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { StatGrid } from '@/components/dashboard/StatGrid';
import { VolumeChart } from '@/components/dashboard/VolumeChart';
import { WeatherCoverageCard } from '@/components/dashboard/WeatherCoverageCard';
import { buildDashboardView } from '@/data/dashboardView';
import { formatDate } from '@/lib/utils';
import { useNow } from '@/hooks/useNow';
import type { EventsTimelineEntry, RiskDistribution } from '@/types';

export function DashboardPage() {
  const now = useNow();

  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardApi.summary(),
  });
  const timelineQ = useQuery({
    queryKey: ['dashboard', 'timeline'],
    queryFn: () => dashboardApi.eventsTimeline(),
  });
  const distQ = useQuery({
    queryKey: ['dashboard', 'risk-distribution'],
    queryFn: () => dashboardApi.riskDistribution(),
  });
  const monitoringQ = useQuery({
    queryKey: ['weather', 'monitoring', 'dashboard'],
    queryFn: () => weatherApi.monitoring(),
    staleTime: 60_000,
  });

  const queries = [summaryQ, timelineQ, distQ, monitoringQ];
  const failedCount = queries.filter((q) => q.isError).length;
  const isRefreshing = queries.some((q) => q.isFetching);

  const refreshAll = () => {
    queries.forEach((q) => void q.refetch());
  };

  const view = buildDashboardView({
    summary: summaryQ.data,
    timeline: timelineQ.data as EventsTimelineEntry[] | undefined,
    distribution: distQ.data as Partial<RiskDistribution> | undefined,
    monitoring: monitoringQ.data,
  });

  if (summaryQ.isLoading) return <Spinner />;

  const staleMinutes = view.lastUpdatedAt
    ? Math.max(0, Math.round((now - new Date(view.lastUpdatedAt).getTime()) / 60_000))
    : null;

  const hasRiskData = view.risks.some((r) => r.count > 0);

  return (
    <div className="dash-surface min-h-full rounded-[28px] p-4 sm:p-6">
      {failedCount > 0 ? (
        <DashNotice title="Chargement partiel" className="mb-5">
          {failedCount} section(s) n&apos;ont pas pu être actualisées. Les valeurs affichées
          peuvent être obsolètes.
        </DashNotice>
      ) : null}

      {staleMinutes !== null && staleMinutes > 30 ? (
        <DashNotice title="Données potentiellement périmées" severity="warning" className="mb-5">
          Dernière actualisation il y a {staleMinutes} min — lancez un rafraîchissement si
          nécessaire.
        </DashNotice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <HeroPanel hero={view.hero} />

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-[Outfit] text-2xl font-bold tracking-tight text-(--dash-text) sm:text-3xl">
                Vue d&apos;ensemble
              </h1>
              <p className="mt-1 text-sm text-(--dash-text-muted)">
                Mise à jour {formatDate(view.lastUpdatedAt)}
              </p>
            </div>
            <IconAction
              label="Rafraîchir les données"
              icon={<RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
              onClick={refreshAll}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {view.kpis.map((datum, index) => (
              <KpiCard key={datum.id} datum={datum} index={index} />
            ))}
          </div>

          <div className="grid gap-5 2xl:grid-cols-3">
            <div className="2xl:col-span-2">
              <VolumeChart
                points={view.timeline}
                total={view.timelineTotal}
                title="Évolution des événements"
                description="Volume quotidien sur les 30 derniers jours"
              />
            </div>

            <WeatherCoverageCard weather={view.weather} />
          </div>

          <DashCard
            title="Répartition des risques"
            description="Nombre de communes par niveau de risque, sur le territoire national"
            actions={
              <Link
                to="/risques"
                className="text-sm font-semibold text-(--dash-navy) hover:underline"
              >
                Voir la carte →
              </Link>
            }
          >
            {hasRiskData ? (
              <StatGrid items={view.risks} />
            ) : (
              <p className="py-6 text-center text-sm text-(--dash-text-muted)">
                Aucune évaluation de risque disponible pour le moment.
              </p>
            )}
          </DashCard>
        </div>
      </div>
    </div>
  );
}