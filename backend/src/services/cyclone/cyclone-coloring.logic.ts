/**
 * Coloration communale d'un cyclone à partir de ses rayons de vent documentés.
 *
 * Logique PURE (sans base ni réseau), partagée par deux usages qui doivent rester
 * strictement identiques :
 *  • le seed du cyclone historique Batsirai 2022 (`seed-batsirai-alerts.ts`) ;
 *  • l'ingestion automatique temps réel d'un cyclone détecté
 *    (`cyclone-commune-coloring.service.ts`).
 *
 * Principe de non-invention : seuls les rayons RÉELLEMENT publiés (RSMC La
 * Réunion / IBTrACS v04r01) sont utilisés. Un seuil non publié reste `null` ;
 * seule la dernière valeur publiée du cœur (R50) est prolongée le long de la
 * trajectoire (« passage ») — méthode de persistance, jamais une valeur inventée.
 *
 * Code couleur cyclonique malgache (identique à Batsirai) :
 *  - ROUGE : commune dans le cœur du cyclone (R50/R64 documenté, R50 prolongé) ;
 *  - JAUNE : commune dans le rayon ≥ 34 kt (R34) mais hors du cœur — « affectée » ;
 *  - VERT  : commune hors du champ de vent documenté — « safe » ;
 *  - BLEU  : commune sortie du R34 (danger résiduel), bascule progressive commune
 *            par commune.
 */

/** Niveaux d'alerte cyclonique (la couleur « GRIS » = absence de ligne active). */
export type CommuneAlertLevel = 'VERT' | 'JAUNE' | 'ROUGE' | 'BLEU';

/** Niveaux dynamiques réellement stockés comme intervalles (hors VERT de base). */
export type CommuneDynamicLevel = 'JAUNE' | 'ROUGE' | 'BLEU';

/** Pas d'échantillonnage de la trajectoire (minutes) pour dater entrées/sorties. */
export const SAMPLE_STEP_MINUTES = 15;

/**
 * Point d'ancrage : position du centre et rayons publiés à un horodatage donné.
 * `null` signifie « rayon non publié par l'agence » — jamais remplacé par une
 * estimation.
 */
export interface WindAnchor {
  /** Horodatage epoch (ms, UTC). */
  t: number;
  /** Longitude du centre. */
  lon: number;
  /** Latitude du centre. */
  lat: number;
  /** Rayon du vent ≥ 34 kt (km) publié, ou null si absent. */
  r34: number | null;
  /** Rayon du vent ≥ 50 kt (km) publié, ou null si absent. */
  r50: number | null;
  /** Rayon du vent ≥ 64 kt (km) publié, ou null si absent. */
  r64: number | null;
}

/**
 * Point d'échantillonnage du centre et de ses rayons de vent documentés, enrichi
 * du rayon du cœur (R50 publié, prolongé quand il cesse d'être documenté).
 */
export interface WindSample extends WindAnchor {
  /**
   * Rayon du cœur (« passage du cyclone ») utilisé pour le ROUGE, en km.
   * Correspond au rayon ≥ 50 kt publié ; lorsqu'il n'est plus publié, la
   * **dernière valeur publiée est prolongée** (persistance, jamais d'invention).
   * Reste `null` tant qu'aucun R50 n'a encore été documenté.
   */
  coreKm: number | null;
}

/**
 * Intervalle d'alerte daté d'une commune (bornes en epoch ms). `to === null`
 * signifie « encore en vigueur » (événement en cours, sans fin connue).
 */
export interface CommuneAlertInterval {
  communeId: string;
  level: CommuneDynamicLevel;
  from: number;
  to: number | null;
}

/** Distance en kilomètres entre deux points géographiques (formule de haversine). */
export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const earthRadiusKm = 6371.0088;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Échantillonne la trajectoire et ses rayons de vent. La position du centre est
 * interpolée linéairement entre deux ancrages ; un rayon n'est interpolé que si
 * les DEUX ancrages le publient — sinon il reste `null` (aucune valeur inventée).
 * Le rayon du cœur (`coreKm`) est le R50 publié, par prolongation de la dernière
 * valeur publiée lorsqu'il n'est plus documenté.
 */
export function buildWindSamples(
  anchors: WindAnchor[],
  stepMinutes: number = SAMPLE_STEP_MINUTES,
): WindSample[] {
  const sorted = [...anchors].sort((a, b) => a.t - b.t);
  const stepMs = stepMinutes * 60_000;
  const samples: WindSample[] = [];
  const lerp = (a: number | null, b: number | null, f: number) =>
    a !== null && b !== null ? a + (b - a) * f : null;

  for (let i = 0; i < sorted.length; i += 1) {
    const point = sorted[i];
    const next = sorted[i + 1];

    // Ancrage exact : on reprend les valeurs publiées telles quelles.
    samples.push({
      t: point.t,
      lon: point.lon,
      lat: point.lat,
      r34: point.r34,
      r50: point.r50,
      r64: point.r64,
      coreKm: null,
    });

    if (!next) {
      continue;
    }

    for (let t = point.t + stepMs; t < next.t; t += stepMs) {
      const f = next.t > point.t ? (t - point.t) / (next.t - point.t) : 0;
      samples.push({
        t,
        lon: point.lon + (next.lon - point.lon) * f,
        lat: point.lat + (next.lat - point.lat) * f,
        r34: lerp(point.r34, next.r34, f),
        r50: lerp(point.r50, next.r50, f),
        r64: lerp(point.r64, next.r64, f),
        coreKm: null,
      });
    }
  }

  samples.sort((a, b) => a.t - b.t);

  // Prolongation du dernier R50 publié (cœur du cyclone) quand il n'est plus documenté.
  let lastPublishedCore: number | null = null;
  for (const sample of samples) {
    if (sample.r50 !== null) {
      lastPublishedCore = sample.r50;
    }
    sample.coreKm = lastPublishedCore;
  }

  return samples;
}

/**
 * Niveau d'une commune à un instant donné, d'après les rayons documentés.
 *  - ROUGE : dans le R64 ou dans le cœur (R50 publié / prolongé) — « passage ».
 *  - JAUNE : dans le R34 mais hors du cœur — « affectée ».
 *  - VERT  : hors du champ de vent.
 * Le cœur est plafonné par le R34 pour ne jamais dépasser la zone affectée.
 * Quand aucun seuil n'est documenté à cet instant, le niveau précédent est
 * conservé (on ne bascule pas une commune sur une donnée absente).
 */
export function classifyWind(
  lon: number,
  lat: number,
  sample: WindSample,
  previous: CommuneAlertLevel,
): CommuneAlertLevel {
  if (sample.r34 === null && sample.r50 === null && sample.r64 === null && sample.coreKm === null) {
    return previous;
  }
  const distance = haversineKm(lon, lat, sample.lon, sample.lat);
  // Le cœur est plafonné par le R34 pour ne jamais dépasser la zone affectée.
  const core =
    sample.coreKm === null
      ? null
      : sample.r34 === null
        ? sample.coreKm
        : Math.min(sample.coreKm, sample.r34);
  if ((sample.r64 !== null && distance <= sample.r64) || (core !== null && distance <= core)) {
    return 'ROUGE';
  }
  if (sample.r34 !== null && distance <= sample.r34) {
    return 'JAUNE';
  }
  return 'VERT';
}

/**
 * Intervalles temporels d'alerte d'une commune le long de la trajectoire :
 * JAUNE dans R34, ROUGE dans le cœur (R50/R64, R50 prolongé), puis BLEU (danger
 * résiduel) à partir de sa sortie du champ de vent jusqu'à la fin de l'événement.
 * Les intervalles ne se chevauchent jamais : à chaque instant, un seul niveau
 * dynamique est actif.
 *
 * `eventEndMs === null` (événement en cours, sans fin connue) laisse l'intervalle
 * BLEU ouvert (`to: null`) : il sera recalculé au cycle suivant.
 */
export function windIntervalsForCommune(
  communeId: string,
  lon: number,
  lat: number,
  samples: WindSample[],
  eventEndMs: number | null,
): CommuneAlertInterval[] {
  const intervals: CommuneAlertInterval[] = [];
  if (samples.length === 0) {
    return intervals;
  }

  let previous: CommuneAlertLevel = 'VERT';
  let current: CommuneAlertLevel | null = null;
  let runStart = samples[0].t;
  let lastExit: number | null = null;

  for (const sample of samples) {
    const level = classifyWind(lon, lat, sample, previous);
    previous = level;
    if (level !== current) {
      if ((current === 'ROUGE' || current === 'JAUNE') && sample.t > runStart) {
        intervals.push({ communeId, level: current, from: runStart, to: sample.t });
        lastExit = sample.t;
      }
      current = level;
      runStart = sample.t;
    }
  }

  const lastSampleTime = samples[samples.length - 1].t;
  if ((current === 'ROUGE' || current === 'JAUNE') && lastSampleTime > runStart) {
    intervals.push({ communeId, level: current, from: runStart, to: lastSampleTime });
    lastExit = lastSampleTime;
  }
  if (lastExit !== null && (eventEndMs === null || lastExit < eventEndMs)) {
    intervals.push({ communeId, level: 'BLEU', from: lastExit, to: eventEndMs });
  }

  return intervals;
}

/**
 * Communes dont le niveau dynamique actif à l'instant donné est JAUNE ou ROUGE —
 * celles qui déclenchent une alerte automatique. Le BLEU (danger résiduel) ne
 * déclenche pas de nouvelle alerte : la commune est sortie du champ de vent.
 */
export function affectedCommuneIdsAt(intervals: CommuneAlertInterval[], atMs: number): string[] {
  const ids = new Set<string>();
  for (const interval of intervals) {
    if (interval.level !== 'JAUNE' && interval.level !== 'ROUGE') continue;
    if (interval.from <= atMs && (interval.to === null || interval.to >= atMs)) {
      ids.add(interval.communeId);
    }
  }
  return Array.from(ids);
}
