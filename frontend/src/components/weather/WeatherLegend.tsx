import {
  NO_DATA_COLOR,
  NO_DATA_BORDER,
  WEATHER_METRIC_CONFIGS,
  type WeatherMetric,
} from "@/types/weather";

interface WeatherLegendProps {
  metric: WeatherMetric;
}

export function WeatherLegend({ metric }: WeatherLegendProps) {
  const config = WEATHER_METRIC_CONFIGS[metric];
  return (
    <div className="pointer-events-auto max-w-[13rem] rounded-xl border border-white/60 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
      <p className="mb-1.5 font-semibold text-ink">Légende · {config.label}</p>
      <ul className="space-y-1">
        {config.buckets.map((bucket) => (
          <li key={bucket.label} className="flex items-center gap-2">
            <span
              className="inline-block size-3 shrink-0 rounded-sm border border-black/10"
              style={{ background: bucket.color }}
            />
            <span className="text-muted">{bucket.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span
            className="inline-block size-3 shrink-0 rounded-sm border border-dashed"
            style={{ background: NO_DATA_COLOR, borderColor: NO_DATA_BORDER }}
          />
          <span className="text-muted">Sans donnée</span>
        </li>
      </ul>
    </div>
  );
}
