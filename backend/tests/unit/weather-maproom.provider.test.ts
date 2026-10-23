import { describe, it, expect } from 'vitest';
import {
  dekadLabelFromEnd,
  lastCompletedDekadEnd,
  parseDekadEndDate,
  parseIridlCsv,
  sampleNearest,
  GridSample,
} from '../../src/services/weather-maproom.provider';

const SAMPLE_CSV = [
  '"SOURCES .Madagascar_v4 .MON .dekadal .rainfall .rfe"',
  '"T 1-10 Mar 2026"',
  '"X 42, 42.0375, 42.075"',
  'longitude,latitude,value',
  '42.0000,-26.0000,12.5',
  '42.0375,-26.0000,0.0',
  '42.0000,-25.9625,3.2',
  '42.0375,-25.9625,8.9',
  '',
  '"Note de bas de page"',
].join('\n');

describe('parseIridlCsv', () => {
  it('extrait les points (lon, lat, valeur) du CSV de grille', () => {
    const { points, timeLabel } = parseIridlCsv(SAMPLE_CSV);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ longitude: 42, latitude: -26, valueMm: 12.5 });
    expect(timeLabel).toBe('1-10 Mar 2026');
  });

  it('ignore les lignes hors des limites de Madagascar', () => {
    const csv = ['longitude,latitude,value', '0,40,1', '42.0000,-20.0000,5', '60,-15,2'].join('\n');
    const { points } = parseIridlCsv(csv);
    expect(points).toHaveLength(1);
    expect(points[0]?.longitude).toBe(42);
  });

  it('parse la table TSV de l’IRI DL (espaces de tête et en-têtes)', () => {
    const tsv = [
      'X\tY\tMadagascar_v4 MON dekadal rainfall rfe',
      'degree_east\tdegree_north\tmm',
      '\t42.00000   \t   -25.98750    \t 4.840801',
      '\t42.03750   \t   -25.98750    \t 4.228667',
      '',
    ].join('\n');
    const { points } = parseIridlCsv(tsv);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ longitude: 42, latitude: -25.9875, valueMm: 4.840801 });
  });

  it('tolère un fichier vide ou illisible', () => {
    expect(parseIridlCsv('').points).toHaveLength(0);
    expect(parseIridlCsv('a,b,c\nx,y,z').points).toHaveLength(0);
  });
});

describe('parseDekadEndDate', () => {
  it('convertit une décade en fin de période LOCALE (Madagascar, UTC+3)', () => {
    const date = parseDekadEndDate('16-25 Fév 2026');
    // 25 février 23:59:59 à Madagascar = 20:59:59 UTC.
    expect(date?.toISOString()).toBe('2026-02-25T20:59:59.000Z');
  });

  it('accepte les mois anglais', () => {
    const date = parseDekadEndDate('1-10 Mar 2026');
    expect(date?.toISOString()).toBe('2026-03-10T20:59:59.000Z');
  });

  it('gère les libellés à jour unique', () => {
    const date = parseDekadEndDate('26 Apr 2026');
    expect(date?.toISOString()).toBe('2026-04-26T20:59:59.000Z');
  });

  it('retourne null si le libellé est invalide', () => {
    expect(parseDekadEndDate(null)).toBeNull();
    expect(parseDekadEndDate('inconnu')).toBeNull();
  });
});

describe('lastCompletedDekadEnd', () => {
  it('retombe sur la fin du mois précédent pendant la décade 1-10', () => {
    expect(lastCompletedDekadEnd(new Date('2026-02-05T00:00:00Z')).toISOString()).toBe(
      '2026-01-31T20:59:59.000Z',
    );
  });

  it('retombe sur la décade 1-10 (achevée le 10) du 11 au 20', () => {
    expect(lastCompletedDekadEnd(new Date('2026-02-11T00:00:00Z')).toISOString()).toBe(
      '2026-02-10T20:59:59.000Z',
    );
    expect(lastCompletedDekadEnd(new Date('2026-02-20T12:00:00Z')).toISOString()).toBe(
      '2026-02-10T20:59:59.000Z',
    );
  });

  it('retombe sur la décade 11-20 (achevée le 20) à partir du 21', () => {
    expect(lastCompletedDekadEnd(new Date('2026-02-21T00:00:00Z')).toISOString()).toBe(
      '2026-02-20T20:59:59.000Z',
    );
    expect(lastCompletedDekadEnd(new Date('2026-02-25T12:00:00Z')).toISOString()).toBe(
      '2026-02-20T20:59:59.000Z',
    );
  });

  it('ne date jamais dans le futur (fin de mois)', () => {
    const reference = new Date('2026-02-28T10:00:00Z');
    const end = lastCompletedDekadEnd(reference);
    expect(end.getTime()).toBeLessThan(reference.getTime());
    expect(end.toISOString()).toBe('2026-02-20T20:59:59.000Z');
  });

  it('lit les composantes de date en heure locale (bascule de mois à 21 h UTC)', () => {
    // 28/02 23:59:59 UTC = 01/03 02:59 locale : la décade 21-28 février est
    // achevée, la décade 1-10 mars ne fait que commencer.
    expect(lastCompletedDekadEnd(new Date('2026-02-28T23:59:59Z')).toISOString()).toBe(
      '2026-02-28T20:59:59.000Z',
    );
  });

  it('gère le changement d’année en janvier', () => {
    expect(lastCompletedDekadEnd(new Date('2026-01-03T00:00:00Z')).toISOString()).toBe(
      '2025-12-31T20:59:59.000Z',
    );
  });

  it('ne depend pas de l heure de la journee (dedoublonnage au redemarrage)', () => {
    const matin = lastCompletedDekadEnd(new Date('2026-03-04T01:00:00Z'));
    const soir = lastCompletedDekadEnd(new Date('2026-03-04T22:30:00Z'));
    expect(matin.toISOString()).toBe(soir.toISOString());
  });
});

describe('dekadLabelFromEnd', () => {
  it('libelle la décade à partir de sa fin locale', () => {
    expect(dekadLabelFromEnd(new Date('2026-10-20T20:59:59Z'))).toBe('11-20 Oct 2026');
    expect(dekadLabelFromEnd(new Date('2026-10-10T20:59:59Z'))).toBe('1-10 Oct 2026');
    expect(dekadLabelFromEnd(new Date('2026-10-31T20:59:59Z'))).toBe('21-31 Oct 2026');
  });
});

describe('sampleNearest', () => {
  const grid: GridSample[] = [
    { longitude: 46.95, latitude: -19.0, valueMm: 10 },
    { longitude: 46.9875, latitude: -19.0, valueMm: 20 },
    { longitude: 46.95, latitude: -19.0375, valueMm: 30 },
    { longitude: 46.9875, latitude: -19.0375, valueMm: 40 },
  ];

  it('retourne la valeur du point le plus proche', () => {
    expect(sampleNearest(grid, 46.975, -19.01, 0.06)).toBe(20);
    expect(sampleNearest(grid, 46.96, -19.02, 0.06)).toBe(30);
  });

  it('retourne null hors du rayon maximal', () => {
    expect(sampleNearest(grid, 47.5, -19.0, 0.06)).toBeNull();
  });

  it('retourne null sur une grille vide', () => {
    expect(sampleNearest([], 46.95, -19.0, 0.1)).toBeNull();
  });
});
