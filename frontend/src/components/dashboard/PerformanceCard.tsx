import { dashboardData } from '@/data/dashboardData';
import { RingGauge } from './RingGauge';

export function PerformanceCard() {
  const { performance } = dashboardData;

  return (
    <section className="dash-card dash-rise dash-rise-6 flex flex-col p-5 sm:p-6">
      <header>
        <h2 className="text-base font-semibold tracking-tight text-dash-title">{performance.title}</h2>
        <p className="mt-1 text-sm text-muted">{performance.description}</p>
      </header>

      <div className="mt-4 flex flex-1 items-center justify-center">
        <RingGauge
          value={performance.percent}
          size={160}
          strokeWidth={14}
          color="var(--color-dash)"
          trackColor="#e8edf7"
          label={`${performance.title} : ${performance.percent} %`}
          bubbleClassName="h-[54%] w-[54%] bg-dash-pale text-2xl font-extrabold text-dash"
        >
          {performance.percent} %
        </RingGauge>
      </div>

      <div className="mt-6 grid gap-2.5">
        {performance.legend.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5">
            <span className={`size-2.5 shrink-0 rounded-full ${item.dotClass}`} />
            <span className="flex-1 text-sm text-muted">{item.label}</span>
            <span className="text-sm font-semibold tabular-nums text-dash-title">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <span className="text-sm text-muted">{performance.comparisonLabel}</span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-dash-up">
          {performance.comparisonDelta}
        </span>
      </div>
    </section>
  );
}
