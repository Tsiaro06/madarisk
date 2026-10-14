import type { CycloneTrackProvider, CycloneWatchProvider } from '../../types/cyclone.types';
import { gdacsProvider } from './gdacs.provider';
import { ibtracsProvider } from './ibtracs.provider';

/**
 * Providers actifs, remplaçables — même mécanisme que `weather-provider.ts`.
 *
 * Les tests injectent des providers déterministes (fixtures) au lieu d'appeler
 * le réseau, sans avoir à modifier le service de synchronisation.
 */
let trackProvider: CycloneTrackProvider = ibtracsProvider;
let watchProvider: CycloneWatchProvider = gdacsProvider;

export function getCycloneTrackProvider(): CycloneTrackProvider {
  return trackProvider;
}

export function setCycloneTrackProvider(provider: CycloneTrackProvider): void {
  trackProvider = provider;
}

export function getCycloneWatchProvider(): CycloneWatchProvider {
  return watchProvider;
}

export function setCycloneWatchProvider(provider: CycloneWatchProvider): void {
  watchProvider = provider;
}

export function resetCycloneProviders(): void {
  trackProvider = ibtracsProvider;
  watchProvider = gdacsProvider;
}
