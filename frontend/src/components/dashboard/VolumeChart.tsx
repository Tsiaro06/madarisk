import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { Download, MoreHorizontal, Share2 } from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { TimelinePoint } from '@/data/dashboardView';
import { CHART_AXIS, DASH, BAR_GRADIENT_ID, hexToRgba } from '@/lib/dashboardTheme';
import { DashCard, IconAction } from './DashCard';

interface VolumeChartProps {
  points: TimelinePoint[];
  total: number;
  title: string;
  description: string;
}

export function VolumeChart({ points, total, title, description }: VolumeChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const peak = useMemo(() => {
    if (points.length === 0) return null;
    let best = 0;
    points.forEach((p, i) => {
      if (p.total > points[best].total) best = i;
    });
    return best;
  }, [points]);

  const highlighted = activeIndex ?? peak;

  return (
    <DashCard
      title={title}
      description={description}
      actions={
        <>
          <IconAction label="Télécharger le relevé" icon={<Download className="size-4" />} />
          <IconAction label="Partager" icon={<Share2 className="size-4" />} />
          <IconAction label="Plus d'options" icon={<MoreHorizontal className="size-4" />} />
        </>
      }
    >
      {points.length === 0 ? (
        <div className="grid h-64 place-items-center rounded-2xl bg-[var(--dash-accent-soft)]/50 text-sm text-[var(--dash-muted)]">
          Aucun événement enregistré sur la période.
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="dash-label">Total de la période</p>
              <p className="dash-figure mt-1 text-[var(--dash-ink)]">{formatNumber(total)}</p>
            </div>
            {highlighted != null && points[highlighted] ? (
              <div className="text-right">
                <p className="dash-label">Pic</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--dash-accent)]">
                  {formatNumber(points[highlighted].total)}
                  <span className="ml-1.5 text-xs font-medium text-[var(--dash-muted)]">
                    {points[highlighted].label}
                  </span>
                </p>
              </div>
            ) : null}
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={points}
                margin={{ top: 16, right: 4, left: 4, bottom: 0 }}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <defs>
                  <linearGradient id={BAR_GRADIENT_ID} x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor={hexToRgba(DASH.accentLight, 0.45)} />
                    <stop offset="100%" stopColor={DASH.accentLight} />
                  </linearGradient>
                </defs>

                <XAxis
                  dataKey="label"
                  {...CHART_AXIS}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />

                <Tooltip
                  cursor={{ fill: hexToRgba(DASH.accent, 0.06) }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0].payload as TimelinePoint;
                    return (
                      <div className="rounded-2xl border border-[var(--dash-line)] bg-white px-3.5 py-2.5 shadow-[0_18px_40px_-18px_rgba(16,24,40,0.45)]">
                        <p className="dash-label">{point.label}</p>
                        <p className="mt-0.5 text-base font-bold tabular-nums text-[var(--dash-ink)]">
                          {formatNumber(point.total)} <span className="text-xs font-medium">événements</span>
                        </p>
                      </div>
                    );
                  }}
                />

                <Bar
                  dataKey="total"
                  name="Événements"
                  radius={[10, 10, 10, 10]}
                  maxBarSize={30}
                  isAnimationActive
                  animationDuration={800}
                  onMouseEnter={(_: unknown, index: number) => setActiveIndex(index)}
                >
                  {points.map((point, index) => (
                    <Cell
                      key={point.date}
                      fill={
                        index === highlighted
                          ? `url(#${BAR_GRADIENT_ID})`
                          : hexToRgba(DASH.accentLight, 0.55)
                      }
                      className={cn('transition-opacity')}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </DashCard>
  );
}