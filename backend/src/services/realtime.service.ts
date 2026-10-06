import type { Response } from 'express';
import { logger } from '../config/logger';

/**
 * Bus d'événements temps réel en mémoire (Server-Sent Events).
 *
 * Les points d'articulation (détection, alertes) publient ici ; le endpoint
 * GET /api/v1/stream diffuse vers les clients connectés. Le frontend lit ce
 * flux et invalide ses queries TanStack — pas de persistance, un client
 * manqué rattrape l'état via un refetch classique.
 */

export type RealtimeEventType =
  'alert.created' | 'alert.updated' | 'alert.archived' | 'detection.run';

export interface RealtimeEvent {
  type: RealtimeEventType;
  data: Record<string, unknown>;
}

const HEARTBEAT_MS = 25_000;

const clients = new Set<Response>();
let sequence = 0;
let heartbeat: NodeJS.Timeout | null = null;

function startHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': ping\n\n');
      } catch {
        clients.delete(res);
      }
    }
    if (clients.size === 0 && heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }, HEARTBEAT_MS);
}

export const realtimeService = {
  get clientCount(): number {
    return clients.size;
  },

  subscribe(res: Response): void {
    clients.add(res);
    startHeartbeat();
    logger.debug({ clients: clients.size }, 'SSE : client connecté');
  },

  unsubscribe(res: Response): void {
    clients.delete(res);
  },

  publish(type: RealtimeEventType, data: Record<string, unknown>): void {
    if (clients.size === 0) return;
    sequence += 1;
    const frame = `id: ${sequence}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch (err) {
        logger.debug({ err }, 'SSE : écriture échouée, client retiré');
        clients.delete(res);
      }
    }
  },
};
