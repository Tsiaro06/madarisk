import { RingGauge } from './RingGauge';

export interface PerformanceCardProps {
  title: string;
  description: string;
  percent: number;
  legend: { label: string; value: string; color: string }[];
}

/**
 * Synchronisation des données météo.
 *
 * Le pourcentage est la part des communes disposant d'une observation récente,
 * lue dans `/weather/monitoring`. La jauge et sa légende doivent additionner le
 * même total, sans quoi deux chiffres se contredisent à l'écran.
 */
export function PerformanceCard({ title, description, percent, legend }: PerformanceCardProps) {
  return (
    <section className="dash-card dash-rise dash-rise-6 flex flex-col p-5 sm:p-6">
      <header>
        <h2 className="text-base font-semibold tracking-tight text-dash-title">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </header>

      <div className="mt-4 flex flex-1 items-center justify-center">
        <RingGauge
          value={percent}
          size={160}
          strokeWidth={14}
          color="var(--color-dash)"
          trackColor="#e8edf7"
          label={`${title} : ${percent} %`}
          bubbleClassName="h-[54%] w-[54%] bg-dash-pale text-2xl font-extrabold text-dash"
        >
          {percent} %
        </RingGauge>
      </div>

      <div className="mt-6 grid gap-2.5">
        {legend.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="flex-1 text-sm text-muted">{item.label}</span>
            <span className="text-sm font-semibold tabular-nums text-dash-title">{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
