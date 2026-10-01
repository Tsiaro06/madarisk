import { Topbar } from '@/components/dashboard/Topbar';
import { BluePanel } from '@/components/dashboard/BluePanel';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { BarChartCard } from '@/components/dashboard/BarChartCard';
import { StatGrid } from '@/components/dashboard/StatGrid';
import { PerformanceCard } from '@/components/dashboard/PerformanceCard';
import { dashboardData } from '@/data/dashboardData';

export function DashboardPage() {
  const { brand, tabs, lastUpdateLabel, kpis, timeline, riskDistribution } = dashboardData;

  return (
    // `.dash-scope` verrouille la palette claire du dashboard, y compris
    // lorsque l'application est en thème sombre.
    <div className="dash-scope -m-4 min-h-full px-4 py-6 sm:-m-6 sm:px-6 sm:py-8">
      <div className="grid gap-5">
        <Topbar brandName={brand.name} slogan={brand.slogan} tabs={tabs} />

        {/* Le panneau bleu passe au-dessus sur tablette et mobile : il est le
            premier enfant de la grille, la colonne de droite suit. */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <BluePanel />

          <div className="grid gap-5">
            <div className="dash-rise dash-rise-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-sm text-dash-body">Synthèse opérationnelle en temps réel</p>
              <p className="text-sm text-muted">{lastUpdateLabel}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <KpiCard
                  key={kpi.id}
                  label={kpi.label}
                  value={kpi.value}
                  unit={kpi.unit}
                  delta={kpi.delta}
                  positiveIsGood={kpi.positiveIsGood}
                  highlight={kpi.highlight}
                  animationClassName="dash-rise-3"
                />
              ))}
            </div>

            <BarChartCard
              title={timeline.title}
              description={timeline.description}
              data={timeline.items}
              total={timeline.total}
              totalUnit={timeline.totalUnit}
              totalDelta={timeline.totalDelta}
              positiveIsGood={timeline.positiveIsGood}
            />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
              <StatGrid
                title={riskDistribution.title}
                description={riskDistribution.description}
                items={riskDistribution.items}
              />
              <PerformanceCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
