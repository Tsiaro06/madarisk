import type pg from 'pg';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { ibtracsSystemUrl, radiusSourceForSid } from './cyclone/cyclone.logic';
import {
  affectedCommuneIdsAt,
  buildWindSamples,
  windIntervalsForCommune,
  type CommuneAlertInterval,
  type CommuneDynamicLevel,
  type WindAnchor,
} from './cyclone/cyclone-coloring.logic';
import type { EventStatus } from '../types/event.types';

/**
 * Coloration communale TEMPS RÉEL d'un cyclone ingéré : à partir des rayons de
 * vent publiés (R34/R50/R64) de sa trajectoire observée, on remplit
 * `event_commune_alert_history` — exactement la table qu'exploite la carte de la
 * salle de crise, avec la MÊME logique que le cyclone historique Batsirai 2022.
 *
 * Principe de non-invention : aucune commune n'est colorée sans rayon publié.
 * Un événement vu uniquement par GDACS (position sans rayons) n'est donc jamais
 * coloré tant qu'IBTrACS n'a pas publié sa trajectoire de vent.
 *
 * Idempotence : chaque application SUPPRIME puis RÉINSÈRE les lignes de
 * l'événement (dans une transaction). Rejouer un cycle ne duplique jamais rien
 * et suit l'allongement de la trajectoire au fil des publications.
 */

export type CycloneColoringReason = 'OK' | 'EVENEMENT_INTROUVABLE' | 'AUCUN_RAYON';

export interface CycloneColoringResult {
  eventId: string;
  /** Vrai si des lignes ont été écrites pour l'événement. */
  colored: boolean;
  reason: CycloneColoringReason;
  /** Nombre de lignes VERT de base (toutes les communes). */
  baseRows: number;
  /** Nombre d'intervalles dynamiques insérés, par niveau. */
  byLevel: Record<CommuneDynamicLevel, number>;
  /**
   * Communes dans le champ de vent au dernier point observé (JAUNE ou ROUGE) :
   * ce sont elles qui déclenchent les alertes automatiques.
   */
  affectedCommuneIds: string[];
}

const LEVEL_COMMENTS: Record<CommuneDynamicLevel, string> = {
  ROUGE:
    "Cyclone (passage) : commune à l'intérieur du cœur du cyclone — rayon de vent ≥ 50 kt " +
    '(R50/R64) documenté par la RSMC La Réunion le long de la trajectoire observée ' +
    '(IBTrACS v04r01). Après la dernière publication du R50, la dernière valeur publiée ' +
    'est prolongée (persistance), sans valeur inventée.',
  JAUNE:
    "Commune affectée : à l'intérieur du rayon de vent ≥ 34 kt (R34) mais hors du cœur " +
    '(hors R50/R64), documenté par la RSMC La Réunion / IBTrACS v04r01.',
  BLEU:
    "Fin d'alerte progressive : le cercle du cyclone ne touche plus la commune " +
    '(sortie du rayon de vent ≥ 34 kt). Des dangers résiduels persistent (pluies ' +
    'torrentielles, crues, vents résiduels).',
};

const BASE_VERT_COMMENT =
  'Hors du champ de vent documenté (rayons R34/R50/R64 de la RSMC La Réunion) à cet ' +
  'instant : pas de menace publiée (niveau vert). Niveau de base estimé ; toute commune ' +
  'entrant dans le champ de vent est recolorée en jaune (R34) ou rouge (R50/R64), puis ' +
  'en bleu à sa sortie.';

interface EventRow {
  status: EventStatus;
  ended_at: string | null;
}

interface TrackRow {
  observed_at: string;
  longitude: string;
  latitude: string;
  radius_34kt_km: string | null;
  radius_50kt_km: string | null;
  radius_64kt_km: string | null;
}

interface CommuneRow {
  id: string;
  lon: number;
  lat: number;
}

function numOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyResult(eventId: string, reason: CycloneColoringReason): CycloneColoringResult {
  return {
    eventId,
    colored: false,
    reason,
    baseRows: 0,
    byLevel: { ROUGE: 0, JAUNE: 0, BLEU: 0 },
    affectedCommuneIds: [],
  };
}

/** Niveau de base VERT : toute commune hors du champ de vent documenté. */
async function insertBaseVert(
  client: pg.PoolClient,
  eventId: string,
  eventStartIso: string,
  eventEndIso: string | null,
  sourceName: string,
  sourceUrl: string,
): Promise<number> {
  const res = await client.query(
    `INSERT INTO event_commune_alert_history
       (event_id, commune_id, alert_level, valid_from, valid_to,
        info_type, territory_scope, source_name, source_url, comment)
     SELECT $1, c.id, 'VERT', $2::timestamptz, $3::timestamptz,
            'ESTIMATION', 'COMMUNE', $4, $5, $6
       FROM communes c`,
    [eventId, eventStartIso, eventEndIso, sourceName, sourceUrl, BASE_VERT_COMMENT],
  );
  return res.rowCount ?? 0;
}

/** Insère par lots les intervalles d'un même niveau (source/commentaire idem). */
async function insertIntervals(
  client: pg.PoolClient,
  eventId: string,
  level: CommuneDynamicLevel,
  intervals: CommuneAlertInterval[],
  sourceName: string,
  sourceUrl: string,
): Promise<number> {
  if (intervals.length === 0) return 0;

  const comment = LEVEL_COMMENTS[level];
  const chunkSize = 2000;
  let inserted = 0;

  for (let i = 0; i < intervals.length; i += chunkSize) {
    const chunk = intervals.slice(i, i + chunkSize);
    const params: unknown[] = [eventId, level, sourceName, sourceUrl, comment];
    const tuples = chunk.map((interval, index) => {
      const offset = 6 + index * 3;
      params.push(
        interval.communeId,
        new Date(interval.from).toISOString(),
        interval.to === null ? null : new Date(interval.to).toISOString(),
      );
      return `($1, $${offset}, $2, $${offset + 1}::timestamptz, $${offset + 2}::timestamptz, 'ESTIMATION', 'COMMUNE', $3, $4, $5)`;
    });

    const res = await client.query(
      `INSERT INTO event_commune_alert_history
         (event_id, commune_id, alert_level, valid_from, valid_to,
          info_type, territory_scope, source_name, source_url, comment)
       VALUES ${tuples.join(', ')}`,
      params,
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

export const cycloneCommuneColoringService = {
  /**
   * (Re)calcule les niveaux d'alerte communaux d'un événement cyclone à partir
   * de ses points de trajectoire observés et de leurs rayons documentés.
   *
   * Ne lève jamais pour « rien à colorer » : renvoie `colored: false` avec une
   * raison. Les erreurs de base remontent à l'appelant (le cycle d'ingestion les
   * rend tolérantes).
   */
  async applyToEvent(eventId: string): Promise<CycloneColoringResult> {
    const eventRes = await db.query<EventRow>(
      `SELECT status, ended_at FROM hazard_events WHERE id = $1`,
      [eventId],
    );
    const event = eventRes.rows[0];
    if (!event) return emptyResult(eventId, 'EVENEMENT_INTROUVABLE');

    // SID IBTrACS : identité stable qui porte la source/URL des rayons.
    const sidRes = await db.query<{ source_system_id: string }>(
      `SELECT source_system_id FROM cyclone_systems
        WHERE event_id = $1 AND source = 'IBTRACS'
        LIMIT 1`,
      [eventId],
    );
    const sid = sidRes.rows[0]?.source_system_id ?? null;
    const sourceName = sid
      ? radiusSourceForSid(sid)
      : 'RSMC La Réunion (Météo-France) — IBTrACS v04r01';
    const sourceUrl = sid ? ibtracsSystemUrl(sid) : 'https://ncics.org/ibtracs/';

    const trackRes = await db.query<TrackRow>(
      `SELECT observed_at, longitude, latitude,
              radius_34kt_km, radius_50kt_km, radius_64kt_km
         FROM event_tracks
        WHERE event_id = $1 AND track_type = 'OBSERVEE'
        ORDER BY observed_at ASC`,
      [eventId],
    );

    const anchors: WindAnchor[] = trackRes.rows.map((row) => ({
      t: new Date(row.observed_at).getTime(),
      lon: Number(row.longitude),
      lat: Number(row.latitude),
      r34: numOrNull(row.radius_34kt_km),
      r50: numOrNull(row.radius_50kt_km),
      r64: numOrNull(row.radius_64kt_km),
    }));

    const hasRadii = anchors.some((a) => a.r34 !== null || a.r50 !== null || a.r64 !== null);
    if (anchors.length === 0 || !hasRadii) {
      // Sans rayon publié, aucune commune ne peut être colorée sans inventer.
      return emptyResult(eventId, 'AUCUN_RAYON');
    }

    const samples = buildWindSamples(anchors);
    const eventStartMs = samples[0].t;
    const lastSampleMs = samples[samples.length - 1].t;
    // Événement clos : la fenêtre est bornée par sa fin officielle. En cours :
    // bornes ouvertes (valid_to NULL), recalculées à chaque cycle.
    const eventEndMs =
      event.status === 'CLOTURE' && event.ended_at ? Date.parse(event.ended_at) : null;

    const communesRes = await db.query<CommuneRow>(
      `SELECT id, ST_X(centroid)::float8 AS lon, ST_Y(centroid)::float8 AS lat
         FROM communes
        WHERE centroid IS NOT NULL`,
    );

    const intervals: CommuneAlertInterval[] = [];
    for (const commune of communesRes.rows) {
      intervals.push(
        ...windIntervalsForCommune(commune.id, commune.lon, commune.lat, samples, eventEndMs),
      );
    }

    const byLevel: Record<CommuneDynamicLevel, number> = { ROUGE: 0, JAUNE: 0, BLEU: 0 };
    for (const interval of intervals) {
      byLevel[interval.level] += 1;
    }
    // Communes encore dans le champ de vent au dernier point observé : ce sont
    // elles qui reçoivent une alerte automatique.
    const affectedCommuneIds = affectedCommuneIdsAt(intervals, lastSampleMs);

    const client = await db.getClient();
    let baseRows = 0;
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM event_commune_alert_history WHERE event_id = $1', [eventId]);
      baseRows = await insertBaseVert(
        client,
        eventId,
        new Date(eventStartMs).toISOString(),
        eventEndMs === null ? null : new Date(eventEndMs).toISOString(),
        sourceName,
        sourceUrl,
      );
      for (const level of ['ROUGE', 'JAUNE', 'BLEU'] as const) {
        await insertIntervals(
          client,
          eventId,
          level,
          intervals.filter((interval) => interval.level === level),
          sourceName,
          sourceUrl,
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    logger.info(
      { eventId, baseRows, byLevel, affectedCommunes: affectedCommuneIds.length },
      'Cyclone : coloration communale appliquée',
    );

    return {
      eventId,
      colored: true,
      reason: 'OK',
      baseRows,
      byLevel,
      affectedCommuneIds,
    };
  },
};
