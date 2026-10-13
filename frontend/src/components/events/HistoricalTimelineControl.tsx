import { useMemo } from 'react';
import { Clock, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import {
  formatAntananarivo,
  formatAntananarivoShort,
  pointTimeMs,
  type PlaybackSpeed,
} from '@/lib/historical';
import { cn } from '@/lib/utils';
import type { TrackStatePoint } from '@/types';

export type TimelineSpeed = PlaybackSpeed;

const SPEEDS: Array<{ key: TimelineSpeed; label: string }> = [
  { key: '1x', label: '1×' },
  { key: '2x', label: '2×' },
  { key: '4x', label: '4×' },
];

interface HistoricalTimelineControlProps {
  /** Points observés triés chronologiquement (source du curseur). */
  points: TrackStatePoint[];
  /** Position du curseur, en minutes depuis le premier point. */
  minute: number;
  /** Durée totale observée, en minutes. */
  spanMinutes: number;
  playing: boolean;
  speed: TimelineSpeed;
  /** Vrai lorsque la position affichée est interpolée entre deux points. */
  interpolated: boolean;
  onMinuteChange: (minute: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: TimelineSpeed) => void;
}

/**
 * Barre temporelle : le curseur sélectionne une date/heure, sans jamais écrire
 * en base. Les boutons précédent/suivant se cadencent sur les points observés.
 */
export function HistoricalTimelineControl({
  points,
  minute,
  spanMinutes,
  playing,
  speed,
  interpolated,
  onMinuteChange,
  onTogglePlay,
  onSpeedChange,
}: HistoricalTimelineControlProps) {
  const startMs = points.length > 0 ? pointTimeMs(points[0]) : 0;
  const clamp = (value: number) => Math.min(spanMinutes, Math.max(0, value));

  const stepMinutes = useMemo(
    () => points.map((p) => (pointTimeMs(p) - startMs) / 60_000),
    [points, startMs],
  );

  const prevMinute = useMemo(() => {
    let candidate = 0;
    for (const step of stepMinutes) if (step < minute - 1e-9) candidate = step;
    return candidate;
  }, [stepMinutes, minute]);

  const nextMinute = useMemo(() => {
    for (const step of stepMinutes) if (step > minute + 1e-9) return step;
    return spanMinutes;
  }, [stepMinutes, minute, spanMinutes]);

  const currentIso =
    points.length > 0 ? new Date(startMs + minute * 60_000).toISOString() : null;

  return (
    <div className="mb-3 rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-brand/40"
          title={playing ? 'Mettre en pause' : 'Lecture automatique'}
        >
          {playing ? (
            <Pause className="size-3.5 text-brand" />
          ) : (
            <Play className="size-3.5 text-brand" />
          )}
          {playing ? 'Pause' : 'Lecture'}
        </button>

        <button
          type="button"
          disabled={minute <= 0}
          onClick={() => onMinuteChange(clamp(prevMinute))}
          title="Point observé précédent"
          className="rounded-lg border border-line bg-white px-2 py-1.5 text-ink transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SkipBack className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={minute >= spanMinutes}
          onClick={() => onMinuteChange(clamp(nextMinute))}
          title="Point observé suivant"
          className="rounded-lg border border-line bg-white px-2 py-1.5 text-ink transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SkipForward className="size-3.5" />
        </button>

        <div className="ml-auto flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSpeedChange(s.key)}
              className={cn(
                'rounded-md border px-2 py-1 text-xs font-semibold transition',
                speed === s.key
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-white text-muted hover:text-ink',
              )}
              title={`Vitesse de lecture ${s.label}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2.5">
        <input
          type="range"
          min={0}
          max={spanMinutes}
          step={1}
          value={minute}
          aria-label="Position temporelle de la trajectoire observée"
          aria-valuetext={
            currentIso
              ? `${formatAntananarivo(currentIso)} — heure de Madagascar`
              : 'aucun point observé'
          }
          onChange={(e) => onMinuteChange(clamp(Number(e.target.value)))}
          className="w-full accent-brand"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {formatAntananarivoShort(points[0]?.observedAt)}
          </span>
          <span className="text-center font-semibold text-brand-deep">
            {formatAntananarivo(currentIso)}
            <span className="block font-normal text-[10px] text-muted">
              {interpolated ? 'position interpolée' : 'point observé exact'}
            </span>
          </span>
          <span>{formatAntananarivoShort(points[points.length - 1]?.observedAt)}</span>
        </div>
      </div>
    </div>
  );
}
