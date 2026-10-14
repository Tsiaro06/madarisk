import axios from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/app-error';
import type { CycloneWatch, CycloneWatchProvider, WatchBbox } from '../../types/cyclone.types';
import { pointInBbox, splitGdacsEventName } from './cyclone.logic';

const EVENT_LIST_PATH = '/gdacsapi/api/events/geteventlist/SEARCH';

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * GDACS renvoie ses horodatages sans suffixe de fuseau, en UTC. On les publie en
 * ISO-8601 « Z » pour que le reste de l'application n'ait pas à trancher.
 */
function toIsoZ(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const trimmed = value.trim();
  if (/Z$/i.test(trimmed)) return trimmed;
  if (/[+-]\d{2}:?\d{2}$/.test(trimmed)) return trimmed;
  return `${trimmed}Z`;
}

function countryNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          const name = record.countryname ?? record.name;
          return typeof name === 'string' ? name : null;
        }
        return null;
      })
      .filter((name): name is string => name !== null);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '');
  }
  return [];
}

/**
 * Extrait les cyclones actifs d'une réponse GDACS (`FeatureCollection`).
 *
 * GDACS ne publie qu'un point courant par système — pas de trajectoire ni de
 * rayons de vent. On ne retient donc que l'identité, le niveau d'alerte, les
 * pays affectés et la dernière position connue. Seuls les événements encore
 * courants (`iscurrent`) sont conservés.
 */
export function parseGdacsTcList(payload: unknown): CycloneWatch[] {
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    throw new AppError('Réponse GDACS inattendue : « features » absent.', 502, true);
  }

  const watches: CycloneWatch[] = [];

  for (const feature of features) {
    const typed = feature as {
      geometry?: { coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const props = typed.properties ?? {};
    if (props.eventtype !== 'TC') continue;
    if (String(props.iscurrent ?? '').toLowerCase() !== 'true') continue;

    const eventId = toNumberOrNull(props.eventid);
    if (eventId === null) continue;
    const episodeId = toNumberOrNull(props.episodeid) ?? 0;

    const rawName = String(props.eventname ?? props.name ?? `TC-${eventId}`);
    const { name, season } = splitGdacsEventName(rawName);

    const coordinates = typed.geometry?.coordinates;
    const longitude =
      Array.isArray(coordinates) && typeof coordinates[0] === 'number' ? coordinates[0] : null;
    const latitude =
      Array.isArray(coordinates) && typeof coordinates[1] === 'number' ? coordinates[1] : null;

    const url = (props.url ?? {}) as Record<string, unknown>;
    const severity = (props.severitydata ?? {}) as Record<string, unknown>;

    watches.push({
      source: 'GDACS',
      sourceSystemId: `${eventId}:${episodeId}`,
      name,
      season,
      alertLevel: typeof props.alertlevel === 'string' ? props.alertlevel : null,
      severityWindKmh: toNumberOrNull(severity.severity),
      countries: countryNames(props.affectedcountries),
      reportUrl: typeof url.report === 'string' ? url.report : null,
      latitude,
      longitude,
      observedAt: toIsoZ(props.datemodified) ?? toIsoZ(props.todate),
      fromDate: toIsoZ(props.fromdate),
      toDate: toIsoZ(props.todate),
      rawMetadata: {
        eventid: eventId,
        episodeid: episodeId,
        alertlevel: props.alertlevel ?? null,
        episodealertlevel: props.episodealertlevel ?? null,
        country: props.country ?? null,
        htmldescription: props.htmldescription ?? null,
      },
    });
  }

  return watches;
}

export class GdacsProvider implements CycloneWatchProvider {
  readonly source = 'GDACS' as const;

  private readonly client = axios.create({
    baseURL: env.CYCLONE_GDACS_BASE_URL,
    timeout: env.CYCLONE_TIMEOUT_MS,
  });

  /** Cyclones actifs de GDACS dont la position courante entre dans la veille. */
  async listWatchedSystems(watch: WatchBbox): Promise<CycloneWatch[]> {
    let payload: unknown;
    try {
      const response = await this.client.get(EVENT_LIST_PATH, {
        params: { eventlist: 'TC', pagesize: 100 },
      });
      payload = response.data;
    } catch (err) {
      logger.warn({ err }, 'Veille GDACS inaccessible — aucune détection récupérée');
      throw new AppError('Source GDACS inaccessible', 502, true);
    }

    const all = parseGdacsTcList(payload);
    const inWatch = all.filter(
      (item) =>
        item.latitude !== null &&
        item.longitude !== null &&
        pointInBbox(item.latitude, item.longitude, watch),
    );

    logger.debug({ total: all.length, inWatch: inWatch.length }, 'GDACS : cyclones actifs lus');
    return inWatch;
  }
}

export const gdacsProvider = new GdacsProvider();
