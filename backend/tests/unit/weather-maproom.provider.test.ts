import { describe, it, expect } from 'vitest';
import {
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

  it('tolère un fichier vide ou illisible', () => {
    expect(parseIridlCsv('').points).toHaveLength(0);
    expect(parseIridlCsv('a,b,c\nx,y,z').points).toHaveLength(0);
  });
});

describe('parseDekadEndDate', () => {
  it('convertit une décade en fin de période UTC', () => {
    const date = parseDekadEndDate('16-25 Fév 2026');
    expect(date?.toISOString()).toBe('2026-02-25T23:59:59.000Z');
  });

  it('accepte les mois anglais', () => {
    const date = parseDekadEndDate('1-10 Mar 2026');
    expect(date?.toISOString()).toBe('2026-03-10T23:59:59.000Z');
  });

  it('gère les libellés à jour unique', () => {
    const date = parseDekadEndDate('26 Apr 2026');
    expect(date?.toISOString()).toBe('2026-04-26T23:59:59.000Z');
  });

  it('retourne null si le libellé est invalide', () => {
    expect(parseDekadEndDate(null)).toBeNull();
    expect(parseDekadEndDate('inconnu')).toBeNull();
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
