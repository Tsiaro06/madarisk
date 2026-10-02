import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi, weatherApi } from '@/api';
import { Topbar } from '@/components/dashboard/Topbar';
import { BluePanel } from '@/components/dashboard/BluePanel';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { BarChartCard, type TimelineDatum } from '@/components/dashboard/BarChartCard';
import { StatGrid } from '@/components/dashboard/StatGrid';
import { PerformanceCard } from '@/components/dashboard/PerformanceCard';
import { Spinner } from '@/components/ui/Spinner';
import { buildDashboardView } from '@/data/dashboardView';
import { formatNumber } from '@/lib/utils';

/**
 * Tableau de bord national.
 *
 * Toutes les valeurs affichées proviennent de l'API : `/dashboard/summary`,
 * `/dashboard/risk-distribution`, `/dashboard/events-timeline` et
 * `/weather/monitoring`. Aucun chiffre n'est Codé en dur, et rien ne n'est
 * estimé : un indicateur que l'API ne fournit pas s'affiche « — » plutôt
 * qu'un nombre plausible.
 */
export function DashboardPage() {
  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardApi.summary(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const distributionQ = useQuery({
    queryKey: ['dashboard', 'risk-distribution'],
    queryFn: () => dashboardApi.riskDistribution(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const timelineQ = useQuery({
    queryKey: ['dashboard', 'events-timeline'],
    queryFn: () => dashboardApi.eventsTimeline(),
    staleTime: 300_000,
  });

  const monitoringQ = useQuery({
    queryKey: ['weather', 'monitoring'],
    queryFn: () => weatherApi.monitoring(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const view = useMemo(
    () =>
      buildDashboardView({
        summary: summaryQ.data,
        distribution: distributionQ.data,
        timeline: timelineQ.data,
        monitoring: monitoringQ.data,
      }),
    [summaryQ.data, distributionQ.data, timelineQ.data, monitoringQ.data],
  );

  const queries = [summaryQ, distributionQ, timelineQ, monitoringQ];
  const isFetching = queries.some((q) => q.isFetching);
  const failed = queries.find((q) => q.isError);
  const isFirstLoad = queries.every((q) => q.isPending);

  const retry = () => queries.forEach((q) => void q.refetch());

  const chartData: TimelineDatum[] = view.timeline.map((point) => ({
    label: point.label,
    value: point.total,
    highlight: false,
  }));

  const assessed = view.risks.reduce((acc, bucket) => acc + bucket.count, 0);
  const lateCommunes = Math.max(0, view.hero.total.value - view.weather.communesData);

  const coverage = {
    percent: view.weather.percent,
    current: view.weather.communesData,
    total: view.hero.total.value,
    detailLabel: 'communes avec observation',
  };

  const miniStats = view.hero.miniStats.map((stat) => ({
    id: stat.label,
    label: stat.label,
    value: formatNumber(stat.value),
    color: stat.color,
  }));

  const activeAlerts = view.kpis.find((kpi) => kpi.id === 'activeAlerts')?.value ?? 0;

  // `.dash-scope` verrouille la palette claire du dashboard, y compris
  // lorsque l'application est en thème sombre.
  return (
    <div className="dash-scope -m-4 min-h-full px-4 py-6 sm:-m-6 sm:px-6 sm:py-8">
      <div className="grid gap-5">
        <Topbar
          lastUpdatedAt={view.lastUpdatedAt}
          isFetching={isFetching}
          error={failed ? 'Données du tableau de bord indisponibles.' : null}
          onRetry={retry}
        />

        {isFirstLoad ? (
          <div className="flex items-center justify-center py-24">
            <Spinner label="Chargement du tableau de bord…" />
          </div>
        ) : (
          <>
            {/* Le panneau bleu passe au-dessus sur tablette et mobile : il est le
                premier enfant de la grille, la colonne de droite suit. */}
            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
              <BluePanel
                coverage={coverage}
                miniStats={miniStats}
                bigTotal={{
                  value: activeAlerts,
                  label: 'Alertes publiées',
                  ctaLabel: 'Voir les alertes',
                  linkTo: '/alertes',
                }}
              />

              <div className="grid gap-5">
                <div className="dash-rise dash-rise-3 flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="text-sm text-dash-body">Synthèse opérationnelle nationale</p>
                  <p className="text-sm text-muted">
                    {assessed > 0
                      ? `${formatNumber(assessed)} communes évaluées`
                      : 'Aucune commune évaluée'}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {view.kpis.map((kpi) => (
                    <KpiCard
                      key={kpi.id}
                      label={kpi.label}
                      value={kpi.value == null ? '' : formatNumber(kpi.value)}
                      unit={kpi.unit}
                      delta={kpi.trend.value}
                      positiveIsGood={kpi.positiveIsGood}
                      highlight={kpi.id === 'activeAlerts'}
                      animationClassName="dash-rise-3"
                    />
                  ))}
                </div>

                <BarChartCard
                  title="Événements détectés"
                  description={
                    chartData.length > 0
                      ? `${chartData.length} jour(s) avec au moins un événement`
                      : 'Aucun événement enregistré'
                  }
                  data={chartData}
                  total={view.timelineTotal}
                  totalUnit="événements"
                  totalDelta={null}
                />

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
                  <StatGrid
                    title="Répartition du risque par commune"
                    description={`Sur ${formatNumber(assessed)} communes évaluées`}
                    items={view.risks}
                  />
                  <PerformanceCard
                    title="Synchronisation météo"
                    description="Communes disposant d'une observation récente"
                    percent={view.weather.percent}
                    legend={[
                      {
                        label: 'À jour',
                        value: formatNumber(view.weather.communesData),
                        color: 'var(--color-dash)',
                      },
                      {
                        label: 'En retard',
                        value: formatNumber(lateCommunes),
                        color: '#cbd5e1',
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
