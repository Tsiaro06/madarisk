import { describe, it, expect } from 'vitest';
import {
  normalizeLongitude,
  parseIbtracsCsv,
  splitCsvLine,
} from '../../src/services/cyclone/ibtracs.provider';
import { parseGdacsTcList } from '../../src/services/cyclone/gdacs.provider';

const HEADER = [
  'SID',
  'SEASON',
  'NUMBER',
  'BASIN',
  'SUBBASIN',
  'NAME',
  'ISO_TIME',
  'NATURE',
  'LAT',
  'LON',
  'WMO_WIND',
  'WMO_PRES',
  'WMO_AGENCY',
  'TRACK_TYPE',
  'USA_ATCF_ID',
  'USA_WIND',
  'USA_PRES',
  'REUNION_LAT',
  'REUNION_LON',
  'REUNION_WIND',
  'REUNION_PRES',
  'REUNION_R34_NE',
  'REUNION_R34_SE',
  'REUNION_R34_SW',
  'REUNION_R34_NW',
  'REUNION_R50_NE',
  'REUNION_R50_SE',
  'REUNION_R50_SW',
  'REUNION_R50_NW',
  'REUNION_R64_NE',
  'REUNION_R64_SE',
  'REUNION_R64_SW',
  'REUNION_R64_NW',
  'STORM_SPEED',
  'STORM_DIR',
];

function csvLine(values: Record<string, string | number>): string {
  return HEADER.map((col) => (values[col] === undefined ? '' : String(values[col]))).join(',');
}

const UNITS_ROW = HEADER.map((col) => (col === 'ISO_TIME' ? 'ISO_TIME' : '')).join(',');

const CSV = [
  HEADER.join(','),
  UNITS_ROW,
  csvLine({
    SID: '2022024S09090',
    SEASON: 2022,
    NUMBER: 4,
    BASIN: 'SI',
    SUBBASIN: 'MM',
    NAME: 'BATSIRAI',
    ISO_TIME: '2022-02-06 00:00:00',
    NATURE: 'TS',
    LAT: -20.0,
    LON: 49.0,
    WMO_WIND: 100,
    WMO_PRES: 950,
    WMO_AGENCY: 'REUNION',
    TRACK_TYPE: 'main',
    USA_ATCF_ID: 'SH092022',
    REUNION_WIND: 100,
    REUNION_PRES: 950,
    REUNION_R34_NE: 100,
    REUNION_R34_SE: 90,
    REUNION_R34_SW: 80,
    REUNION_R34_NW: 70,
    REUNION_R50_NE: 50,
    REUNION_R50_SE: 40,
    REUNION_R50_SW: 30,
    REUNION_R50_NW: 20,
    STORM_SPEED: 8,
    STORM_DIR: 250,
  }),
  csvLine({
    SID: '2022024S09090',
    SEASON: 2022,
    NAME: 'BATSIRAI',
    ISO_TIME: '2022-02-06 06:00:00',
    NATURE: 'TS',
    LAT: -21.0,
    LON: 50.0,
    WMO_WIND: 110,
    // Le fichier IBTrACS ACTIVE publie « PROVISIONAL » : ces points doivent être
    // conservés (régression : un filtre sur « main » les éliminait tous).
    TRACK_TYPE: 'PROVISIONAL',
    REUNION_R34_NE: 120,
    REUNION_R34_SE: 110,
    REUNION_R34_SW: 100,
    REUNION_R34_NW: 90,
  }),
  // Point « spur » au même horaire : doit être ignoré (piste principale seulement).
  csvLine({
    SID: '2022024S09090',
    SEASON: 2022,
    NAME: 'BATSIRAI',
    ISO_TIME: '2022-02-06 06:00:00',
    NATURE: 'TS',
    LAT: -99.0,
    LON: 50.0,
    TRACK_TYPE: 'spur',
  }),
  csvLine({
    SID: '2026001S10050',
    SEASON: 2026,
    NAME: 'TESTA',
    ISO_TIME: '2026-01-02 12:00:00',
    NATURE: 'TS',
    LAT: -15.0,
    LON: 311.0,
    WMO_WIND: 60,
    TRACK_TYPE: 'main',
  }),
].join('\n');

describe('parseIbtracsCsv', () => {
  const systems = parseIbtracsCsv(CSV);
  const batsirai = systems.find((s) => s.sourceSystemId === '2022024S09090');
  const testa = systems.find((s) => s.sourceSystemId === '2026001S10050');

  it('ignore la ligne d’unités et groupe par SID', () => {
    expect(systems).toHaveLength(2);
    expect(batsirai).toBeDefined();
    expect(testa).toBeDefined();
  });

  it('retient les métadonnées du système', () => {
    expect(batsirai?.name).toBe('BATSIRAI');
    expect(batsirai?.season).toBe(2022);
    expect(batsirai?.basin).toBe('SI');
    expect(batsirai?.points).toHaveLength(2);
  });

  it('conserve les pistes PROVISIONAL (produit ACTIVE) et écarte les spur', () => {
    expect(batsirai?.points.map((p) => p.observedAt)).toEqual([
      '2022-02-06T00:00:00Z',
      '2022-02-06T06:00:00Z',
    ]);
  });

  it('calcule le rayon maximal des 4 quadrants (nmi -> km) et laisse null le non publié', () => {
    const first = batsirai?.points[0];
    expect(first?.radius34ktKm).toBe(185.2); // 100 nmi
    expect(first?.radius50ktKm).toBe(92.6); // 50 nmi
    expect(first?.radius64ktKm).toBeNull(); // non publié -> jamais estimé
    expect(first?.radiusSource).toContain('RSMC La Réunion');
    expect(first?.radiusMeasureType).toBe('Rayon maximal des 4 quadrants');
  });

  it('convertit les nœuds en km/h et le sens de déplacement en degrés', () => {
    const first = batsirai?.points[0];
    expect(first?.windSpeedKmh).toBe(185.2); // 100 kt
    expect(first?.pressureHpa).toBe(950);
    expect(first?.movementDirection).toBe('250°');
    expect(first?.movementSpeedKmh).toBe(14.8); // 8 kt
  });

  it('n’invente aucun rayon quand l’agence ne publie rien', () => {
    expect(testa?.points[0].radius34ktKm).toBeNull();
    expect(testa?.points[0].radius50ktKm).toBeNull();
    expect(testa?.points[0].radiusSource).toBeNull();
  });

  it('normalise les longitudes 0-360 en -180..180', () => {
    expect(testa?.points[0].longitude).toBe(-49);
    expect(batsirai?.points[0].longitude).toBe(49);
  });

  it('rejette un en-tête inattendu', () => {
    expect(() => parseIbtracsCsv('a,b,c\n1,2,3')).toThrow(/En-tête IBTrACS/);
  });
});

describe('normalizeLongitude', () => {
  it('ramène les longitudes 0-360 du bassin', () => {
    expect(normalizeLongitude(251.5)).toBeCloseTo(-108.5, 5);
    expect(normalizeLongitude(49)).toBe(49);
    expect(normalizeLongitude(-180)).toBe(-180);
  });
});

describe('splitCsvLine', () => {
  it('respecte guillemets et virgules échappées', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    expect(splitCsvLine('a,"b""c"')).toEqual(['a', 'b"c']);
  });
});

const GDACS_SAMPLE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-108.1, 19.7] },
      properties: {
        eventtype: 'TC',
        eventid: 1001335,
        episodeid: 29,
        eventname: 'SIMON-26',
        alertlevel: 'Orange',
        iscurrent: 'true',
        country: 'Mexico',
        fromdate: '2026-10-07T15:00:00',
        todate: '2026-10-14T15:00:00',
        datemodified: '2026-10-14T15:03:08',
        url: {
          report: 'https://www.gdacs.org/report.aspx?eventid=1001335&episodeid=29&eventtype=TC',
        },
        affectedcountries: [{ iso2: 'MX', iso3: 'MEX', countryname: 'Mexico' }],
        severitydata: { severity: 249.9984, severitytext: 'Hurricane', severityunit: 'km/h' },
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [49.0, -20.0] },
      properties: {
        eventtype: 'TC',
        eventid: 1002000,
        episodeid: 3,
        eventname: 'BATSIRAI-22',
        alertlevel: 'Red',
        iscurrent: 'true',
        datemodified: '2022-02-06T12:00:00',
        affectedcountries: [{ countryname: 'Madagascar' }],
        severitydata: { severity: 220 },
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [10, 10] },
      properties: {
        eventtype: 'TC',
        eventid: 1,
        episodeid: 1,
        eventname: 'OLD-25',
        iscurrent: 'false',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { eventtype: 'EQ', eventid: 2, episodeid: 1, eventname: 'QUAKE' },
    },
  ],
};

describe('parseGdacsTcList', () => {
  const watches = parseGdacsTcList(GDACS_SAMPLE);
  const simon = watches.find((w) => w.sourceSystemId === '1001335:29');

  it('ne garde que les cyclones courants', () => {
    expect(watches).toHaveLength(2);
    expect(watches.map((w) => w.name)).toEqual(['SIMON', 'BATSIRAI']);
  });

  it('extrait identité, alerte, pays et position', () => {
    expect(simon?.season).toBe(2026);
    expect(simon?.alertLevel).toBe('Orange');
    expect(simon?.severityWindKmh).toBeCloseTo(249.9984, 3);
    expect(simon?.countries).toEqual(['Mexico']);
    expect(simon?.latitude).toBe(19.7);
    expect(simon?.longitude).toBe(-108.1);
    expect(simon?.reportUrl).toContain('gdacs.org');
  });

  it('horodate en UTC (ISO-8601 « Z »)', () => {
    expect(simon?.observedAt).toBe('2026-10-14T15:03:08Z');
    expect(simon?.fromDate).toBe('2026-10-07T15:00:00Z');
  });

  it('rejette une réponse sans FeatureCollection', () => {
    expect(() => parseGdacsTcList({ foo: 'bar' })).toThrow(/GDACS/);
  });
});
