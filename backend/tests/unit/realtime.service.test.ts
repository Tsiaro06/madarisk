import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { realtimeService } from '../../src/services/realtime.service';

/**
 * Bus SSE : vérifie l'encadrement des frames (nom d'événement + données) et le
 * respect de l'abonnement, sans réseau ni horloge réelle (le battement de cœur
 * est neutralisé par les faux minuteurs).
 */
function recorder(): { frames: string[]; res: Response } {
  const frames: string[] = [];
  const res = {
    write: (chunk: string) => {
      frames.push(chunk);
      return true;
    },
  } as unknown as Response;
  return { frames, res };
}

describe('realtimeService', () => {
  it('écrit une frame « cyclone.sync » pour chaque client abonné', () => {
    vi.useFakeTimers();
    const a = recorder();
    const b = recorder();
    realtimeService.subscribe(a.res);
    realtimeService.subscribe(b.res);

    try {
      expect(realtimeService.clientCount).toBe(2);

      realtimeService.publish('cyclone.sync', { runId: 'run-1', liveEventIds: ['e1'] });
      const frame = a.frames.join('');
      expect(frame).toContain('event: cyclone.sync');
      expect(frame).toContain('"runId":"run-1"');
      expect(frame).toContain('"liveEventIds":["e1"]');
      expect(b.frames.join('')).toContain('event: cyclone.sync');
    } finally {
      realtimeService.unsubscribe(a.res);
      realtimeService.unsubscribe(b.res);
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('cesse de diffuser après désabonnement', () => {
    vi.useFakeTimers();
    const a = recorder();
    const b = recorder();
    realtimeService.subscribe(a.res);
    realtimeService.subscribe(b.res);

    try {
      realtimeService.unsubscribe(b.res);
      expect(realtimeService.clientCount).toBe(1);

      realtimeService.publish('cyclone.sync', { runId: 'run-2' });
      expect(a.frames.join('')).toContain('run-2');
      expect(b.frames).toEqual([]);
    } finally {
      realtimeService.unsubscribe(a.res);
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
