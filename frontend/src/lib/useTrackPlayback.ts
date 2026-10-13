import { useEffect, useMemo, useState } from 'react';
import type { TrackStatePoint } from '@/types';
import {
  clockBounds,
  frameAt,
  framePosition,
  PLAYBACK_SEGMENT_MS,
  segmentMinutesAt,
  type PlaybackSpeed,
} from './historical';

/**
 * Horloge de lecture visuelle d'une trajectoire observée.
 *
 * Chaque segment de trajectoire (point observé → point observé suivant) est
 * parcouru en 3 s (`PLAYBACK_SEGMENT_MS`) : le rythme ne dépend pas de l'écart
 * d'horodatage réel entre les deux points. Arrivée au dernier point, la lecture
 * reprend au premier — « ainsi de suite ». La boucle `requestAnimationFrame`
 * est annulée à la pause comme au démontage, et aucune écriture n'est
 * déclenchée : la position peut être interpolée, les valeurs restent celles du
 * point observé de référence (`frame.from`).
 */
export function useTrackPlayback(
  steps: TrackStatePoint[],
  playing: boolean,
  speed: PlaybackSpeed = '1x',
) {
  const [minute, setMinute] = useState(0);
  const bounds = useMemo(() => clockBounds(steps), [steps]);
  const spanMinutes = bounds?.spanMinutes ?? 0;
  const startMs = bounds?.startMs ?? 0;

  useEffect(() => {
    if (!playing || spanMinutes <= 0) return;
    let raf = 0;
    let last = performance.now();
    const segmentMs = PLAYBACK_SEGMENT_MS[speed];
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - last);
      last = now;
      setMinute((prev) => {
        const segment = segmentMinutesAt(steps, startMs + prev * 60_000);
        if (segment <= 0) return 0; // fin de trajectoire → recommence
        return Math.min(spanMinutes, prev + (elapsed / segmentMs) * segment);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, spanMinutes, steps, startMs]);

  const frame = useMemo(
    () => frameAt(steps, startMs + minute * 60_000),
    [steps, startMs, minute],
  );

  return {
    /** Position du curseur, en minutes depuis le premier point observé. */
    minute,
    /** Positionnement manuel (met la carte où on veut, sans écrire en base). */
    setMinute,
    spanMinutes,
    startMs,
    frame,
    /** Position [lat, lng] à afficher, éventuellement interpolée. */
    position: frame ? framePosition(frame) : null,
    /** Point observé de référence : toutes les valeurs affichées viennent de lui. */
    point: frame?.from ?? null,
    /** Point observé suivant, `null` en fin de trajectoire. */
    nextPoint: frame?.to ?? null,
    interpolated: frame != null && !frame.exact,
  };
}
