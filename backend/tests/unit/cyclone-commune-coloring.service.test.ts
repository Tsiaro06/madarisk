import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Coloration communale temps réel : le service lit la trajectoire observée d'un
 * événement cyclone, calcule les niveaux depuis les SEULS rayons publiés, puis
 * remplace atomiquement les lignes de `event_commune_alert_history`.
 *
 * La base est simulée : on vérifie le contrat (rien sans rayon, bornes ouvertes
 * pour un événement en cours, borné pour un événement clos, remplacement
 * idempotent, traçabilité de la source) sans toucher PostgreSQL.
 */

interface Call {
  text: string;
  params?: unknown[];
}

let dbCalls: Call[] = [];
let clientCalls: Call[] = [];
let eventRows: Array<{ status: string; ended_at: string | null }> = [];
let sidRows: Array<{ source_system_id: string }> = [];
let trackRows: Array<Record<string, string | null>> = [];
let communeRows: Array<{ id: string; lon: number; lat: number }> = [];

vi.mock('../../src/config/database', () => ({
  db: {
    query: async (text: string, params?: unknown[]) => {
      dbCalls.push({ text, params });
      if (text.includes('FROM hazard_events')) return { rows: eventRows, rowCount: eventRows.length };
      if (text.includes('FROM cyclone_systems')) return { rows: sidRows, rowCount: sidRows.length };
      if (text.includes('FROM event_tracks')) return { rows: trackRows, rowCount: trackRows.length };
      if (text.includes('FROM communes')) return { rows: communeRows, rowCount: communeRows.length };
      return { rows: [], rowCount: 0 };
    },
    getClient: async () => ({
      query: async (text: string, params?: unknown[]) => {
        clientCalls.push({ text, params });
        return { rows: [], rowCount: text.trimStart().startsWith('INSERT') ? 2 : 0 };
      },
      release: () => {},
    }),
  },
}));

type ColoringService = typeof import('../../src/services/cyclone-commune-coloring.service').cycloneCommuneColoringService;
let service: ColoringService;

const SID = '2022024S09090';
const T0 = Date.parse('2026-01-01T00:00:00Z');
const H = 3_600_000;

function trackRow(
  t: number,
  lon: number,
  lat: number,
  radii: { r34?: number | null; r50?: number | null; r64?: number | null } = {},
): Record<string, string | null> {
  return {
    observed_at: new Date(t).toISOString(),
    longitude: String(lon),
    latitude: String(lat),
    radius_34kt_km: radii.r34 === undefined || radii.r34 === null ? null : String(radii.r34),
    radius_50kt_km: radii.r50 === undefined || radii.r50 === null ? null : String(radii.r50),
    radius_64kt_km: radii.r64 === undefined || radii.r64 === null ? null : String(radii.r64),
  };
}

/** Centre fixe, puis qui file vers l'est, puis stationne : c1 entre puis sort, c2 entre à la fin. */
function defaultTrack(): Array<Record<string, string | null>> {
  return [
    trackRow(T0, 49, -20, { r34: 100 }),
    trackRow(T0 + H, 49, -20, { r34: 100 }),
    trackRow(T0 + 2 * H, 60, -20, { r34: 100 }),
    trackRow(T0 + 3 * H, 60, -20, { r34: 100 }),
  ];
}

function findCall(calls: Call[], needle: string): Call | undefined {
  return calls.find((c) => c.text.includes(needle));
}

beforeEach(async () => {
  ({ cycloneCommuneColoringService: service } = await import(
    '../../src/services/cyclone-commune-coloring.service'
  ));
  dbCalls = [];
  clientCalls = [];
  eventRows = [{ status: 'ACTIF', ended_at: null }];
  sidRows = [{ source_system_id: SID }];
  trackRows = defaultTrack();
  communeRows = [
    { id: 'c1', lon: 49, lat: -20 },
    { id: 'c2', lon: 60, lat: -20 },
    { id: 'c3', lon: 20, lat: -30 },
  ];
});

describe('cyclone-commune-coloring — rien à colorer', () => {
  it('signale un événement introuvable sans rien écrire', async () => {
    eventRows = [];
    const result = await service.applyToEvent('missing');
    expect(result).toMatchObject({ colored: false, reason: 'EVENEMENT_INTROUVABLE' });
    expect(clientCalls).toHaveLength(0);
  });

  it('ne colore aucune commune sans rayon publié (jamais d’invention)', async () => {
    trackRows = defaultTrack().map((r) => ({ ...r, radius_34kt_km: null }));
    const result = await service.applyToEvent('e1');
    expect(result).toMatchObject({ colored: false, reason: 'AUCUN_RAYON' });
    expect(clientCalls).toHaveLength(0);
  });
});

describe('cyclone-commune-coloring — événement en cours', () => {
  it('remplace les lignes de façon atomique et ouvre les bornes', async () => {
    const result = await service.applyToEvent('e1');

    expect(result.colored).toBe(true);
    expect(result.reason).toBe('OK');
    expect(result.byLevel.JAUNE).toBeGreaterThan(0);
    expect(result.byLevel.BLEU).toBeGreaterThan(0);
    // Aucun R50/R64 publié : jamais de ROUGE inventé.
    expect(result.byLevel.ROUGE).toBe(0);
    // Au dernier point (60, -20), seule c2 est encore dans le champ.
    expect(result.affectedCommuneIds).toEqual(['c2']);

    // Transaction : suppression puis réinsertion, dans cet ordre.
    expect(clientCalls[0].text).toContain('BEGIN');
    const del = clientCalls.findIndex((c) => c.text.includes('DELETE FROM event_commune_alert_history'));
    const firstInsert = clientCalls.findIndex((c) => c.text.includes('INSERT INTO event_commune_alert_history'));
    expect(del).toBeGreaterThanOrEqual(0);
    expect(del).toBeLessThan(firstInsert);
    expect(clientCalls[clientCalls.length - 1].text).toContain('COMMIT');

    // VERT de base : bornes ouvertes (valid_to NULL) pour un événement en cours.
    const base = findCall(clientCalls, "'VERT'");
    expect(base).toBeDefined();
    const [, startIso, endIso, sourceName, sourceUrl] = base!.params as [
      string,
      string,
      string | null,
      string,
      string,
    ];
    expect(startIso).toBe(new Date(T0).toISOString());
    expect(endIso).toBeNull();
    expect(sourceName).toContain(SID);
    expect(sourceUrl).toContain(SID);
  });
});

describe('cyclone-commune-coloring — événement clos', () => {
  it('borne la fenêtre à la fin officielle de l’événement', async () => {
    const endedAt = new Date(T0 + 8 * H).toISOString();
    eventRows = [{ status: 'CLOTURE', ended_at: endedAt }];

    await service.applyToEvent('e1');

    const base = findCall(clientCalls, "'VERT'");
    const [, , endIso] = base!.params as [string, string, string | null];
    expect(endIso).toBe(endedAt);

    // Le BLEU est borné à la fin de l'événement (jamais ouvert).
    const bleu = clientCalls.find((c) => c.params?.[1] === 'BLEU');
    expect(bleu).toBeDefined();
    const rowParams = bleu!.params!.slice(5);
    // (communeId, from, to) — un to non nul pour chaque intervalle BLEU.
    for (let i = 2; i < rowParams.length; i += 3) {
      expect(rowParams[i]).toBe(endedAt);
    }
  });
});
