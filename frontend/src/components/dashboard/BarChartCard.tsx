import { useId } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { LabelProps as RechartsLabelProps } from 'recharts';
import { cn, formatNumber } from '@/lib/utils';

export interface TimelineDatum {
  label: string;
  value: number;
  /** Barre mise en avant (plus sombre + infobulle au-dessus). */
  highlight: boolean;
}

interface BarChartCardProps {
  title: string;
  description: string;
  data: TimelineDatum[];
  total: number;
  totalUnit: string;
  /**
   * Variation en % sur la période précédente. `null` masque le badge : sans
   * historique côté API, afficher un pourcentage serait l'inventer.
   */
  totalDelta: number | null;
}

interface TooltipEntry {
  value?: number | string;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl bg-dash-title px-3.5 py-2.5 text-xs text-white shadow-xl">
      <p className="font-medium text-white/70">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums">
        {formatNumber(Number(payload[0].value))} {unit}
      </p>
    </div>
  );
}

export function BarChartCard({
  title,
  description,
  data,
  total,
  totalUnit,
  totalDelta,
}: BarChartCardProps) {
  const rawId = useId().replace(/:/g, '');
  const gradId = `bar-grad-${rawId}`;

  // Infobulle de la barre mise en avant : bulle blanche suspendue au-dessus.
  const renderBarLabel = (props: RechartsLabelProps) => {
    const { x, y, width, index } = props as unknown as {
      x: number;
      y: number;
      width: number;
      index: number;
    };
    if (index < 0 || index >= data.length || !data[index].highlight) return null;
    const bubbleW = 52;
    const bubbleH = 24;
    const cx = x + width / 2;
    const top = y - bubbleH - 10;
    return (
      <g>
        <rect
          x={cx - bubbleW / 2}
          y={top}
          width={bubbleW}
          height={bubbleH}
          rx={bubbleH / 2}
          fill="#ffffff"
          stroke="#e8edf7"
        />
        <text
          x={cx}
          y={top + bubbleH / 2}
          dominantBaseline="central"
          textAnchor="middle"
          fill="#0f172a"
          fontSize={12}
          fontWeight={700}
        >
          {formatNumber(data[index].value)}
        </text>
      </g>
    );
  };

  return (
    <section className="dash-card dash-rise dash-rise-4 p-5 sm:p-6">
      <header>
        <h2 className="text-base font-semibold tracking-tight text-dash-title">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 44, right: 4, left: 4, bottom: 0 }} barCategoryGap="32%">
              <defs>
                {/* Dégradé bleu clair → bleu vif, du haut vers le bas. */}
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9db8fb" />
                  <stop offset="100%" stopColor="#2f5bea" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                dy={12}
                tick={{ fontSize: 12, fill: '#64748b' }}
              />
              <Tooltip
                content={<ChartTooltip unit={totalUnit} />}
                cursor={{ fill: 'rgba(47, 91, 234, 0.06)', radius: 12 }}
              />
              <Bar dataKey="value" radius={[10, 10, 0, 0]} maxBarSize={44} label={renderBarLabel}>
                {data.map((entry) => (
                  <Cell key={entry.label} fill={entry.highlight ? '#1b39c4' : `url(#${gradId})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Total de la période, à droite du graphique. Blanc comme le reste des
            cartes du tableau de bord : sans la bordure, il disparaîtrait dans
            la carte blanche qui le contient. */}
        <div className="flex min-w-[180px] flex-col justify-between rounded-3xl border border-line bg-white p-5">
          <div>
            <p className="text-xs font-medium text-muted">Total {totalUnit}</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums text-dash-title">
              {formatNumber(total)}
            </p>
          </div>
          <div className="mt-4">
            {totalDelta == null ? (
              <p className="text-xs text-muted">
                Période affichée, sans comparaison disponible
              </p>
            ) : (
              <>
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
                    totalDelta > 0 ? 'bg-dash-pale text-dash-down' : 'bg-dash-pale text-dash-up',
                  )}
                >
                  {totalDelta > 0 ? '+' : ''}
                  {totalDelta} %
                </span>
                <p className="mt-2 text-xs text-muted">vs période précédente</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
