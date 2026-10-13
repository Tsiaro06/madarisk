import { describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import type { TrackStatePoint } from '@/types';
import {
  buildCone,
  conePointsFromTrack,
  forecastErrorRadiusKm,
  geometryBBox,
  intersectingFeatureIds,
  normalizeLongitude,
} from './forecastCone';

/** Test d'appartenance d'un point à un polygone (ray casting, sans dépendance). */
function insidePolygon(lng: number, lat: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
  }
  return inside;
}

/** Toutes les longitudes d'un polygone / multipolygone de la zone. */
function longitudesOf(cone: { geometry: { type: string; coordinates: unknown } }): number[] {
  const out: number[] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    const [first, second] = node as [unknown, unknown];
    if (typeof first === 'number' && typeof second === 'number') {
      out.push(first);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(cone.geometry.coordinates);
  return out;
}

/** Point de trajectoire complet, avec échéance datable. */
function trackPoint(
  id: string,
  trackType: 'OBSERVEE' | 'PREVUE',
  observedAt: string,
  forecastFor: string | null,
  latitude: number,
  longitude: number,
): TrackStatePoint {
  return {
    id,
    eventId: 'evt-1',
    observedAt,
    forecastFor,
    trackType,
    latitude,
    longitude,
    windSpeedKmh: null,
    gustSpeedKmh: null,
    pressureHpa: null,
    precipitationMm: null,
    movementDirection: null,
    movementSpeedKmh: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    radius34ktKm: null,
    radius50ktKm: null,
    radius64ktKm: null,
    radiusMaxKm: null,
    radiusSource: null,
    radiusMeasureType: null,
    radiusQuality: null,
    dataQuality: null,
    confidence: null,
  };
}

describe('forecastErrorRadiusKm', () => {
  it('retourne le rayon publié à chaque échéance de la table', () => {
    for (const anchor of [
      { hours: 0, radiusKm: 20 },
      { hours: 12, radiusKm: 60 },
      { hours: 24, radiusKm: 90 },
      { hours: 36, radiusKm: 120 },
      { hours: 48, radiusKm: 150 },
      { hours: 72, radiusKm: 220 },
      { hours: 96, radiusKm: 300 },
      { hours: 120, radiusKm: 400 },
    ]) {
      expect(forecastErrorRadiusKm(anchor.hours)).toBe(anchor.radiusKm);
    }
  });

  it('interpole linéairement entre deux échéances', () => {
    expect(forecastErrorRadiusKm(6)).toBe(40);
    expect(forecastErrorRadiusKm(18)).toBe(75);
    expect(forecastErrorRadiusKm(60)).toBe(185);
    expect(forecastErrorRadiusKm(108)).toBe(350);
  });

  it("n'extrapole jamais au-delà de la dernière échéance", () => {
    expect(forecastErrorRadiusKm(120.5)).toBeNull();
    expect(forecastErrorRadiusKm(240)).toBeNull();
  });

  it("n'invente aucun rayon sans échéance exploitable", () => {
    expect(forecastErrorRadiusKm(null)).toBeNull();
    expect(forecastErrorRadiusKm(undefined)).toBeNull();
    expect(forecastErrorRadiusKm(Number.NaN)).toBeNull();
    expect(forecastErrorRadiusKm(-6)).toBeNull();
  });
});

describe('normalizeLongitude', () => {
  it('ramène toute longitude dans [-180, 180[', () => {
    expect(normalizeLongitude(48.5)).toBe(48.5);
    expect(normalizeLongitude(190)).toBe(-170);
    expect(normalizeLongitude(-190)).toBe(170);
    expect(normalizeLongitude(540)).toBe(-180);
  });
});

describe('buildCone', () => {
  it('ne dessine rien pour une liste vide', () => {
    expect(buildCone([])).toBeNull();
  });

  it("ne dessine rien quand aucune échéance n'est exploitable", () => {
    // 240 h : au-delà de la table, aucun rayon n'est extrapolé.
    expect(buildCone([{ latitude: -20, longitude: 49, hours: 240 }])).toBeNull();
    expect(buildCone([{ latitude: -20, longitude: 49, hours: -1 }])).toBeNull();
  });

  it('garde les points datables et écarte les autres', () => {
    const cone = buildCone([
      { latitude: -20, longitude: 49, hours: 240 },
      { latitude: -20.5, longitude: 49.5, hours: 24 },
    ]);
    expect(cone?.properties.pointCount).toBe(1);
  });

  it('dessine le seul cercle quand la prévision ne porte qu\u2019un point', () => {
    const cone = buildCone([{ latitude: 0, longitude: 0, hours: 0 }]);
    expect(cone).not.toBeNull();
    expect(cone?.geometry.type).toBe('Polygon');
    const polygon = cone?.geometry as { type: 'Polygon'; coordinates: number[][][] };
    // Le centre est dans la zone, un point à ~50 km en dehors.
    expect(insidePolygon(0, 0, polygon.coordinates)).toBe(true);
    expect(insidePolygon(0.5, 0, polygon.coordinates)).toBe(false);
    expect(cone?.properties).toMatchObject({
      pointCount: 1,
      firstHours: 0,
      lastHours: 0,
      maxRadiusKm: 20,
    });
  });

  it('relie deux échéances en une seule forme continue', () => {
    // 2° de longitude à l'équateur ≈ 222 km, pour des rayons de 20 km et 60 km.
    const cone = buildCone([
      { latitude: 0, longitude: 0, hours: 0 },
      { latitude: 0, longitude: 2, hours: 12 },
    ]);
    expect(cone?.geometry.type).toBe('Polygon');
    const polygon = cone?.geometry as { type: 'Polygon'; coordinates: number[][][] };
    // Zone d'un seul tenant : le corridor entre les deux centres est couvert.
    expect(insidePolygon(0.5, 0, polygon.coordinates)).toBe(true);
    expect(insidePolygon(1, 0, polygon.coordinates)).toBe(true);
    expect(insidePolygon(1.5, 0, polygon.coordinates)).toBe(true);
    // Aucun rayon intermédiaire inventé : rien à 100 km au nord du corridor.
    expect(insidePolygon(1, 0.9, polygon.coordinates)).toBe(false);

    // La zone s'élargit : elle couvre le rayon de 60 km de la dernière échéance.
    const extent = cone ? longitudesOf(cone) : [];
    expect(Math.min(...extent)).toBeLessThan(-0.15);
    expect(Math.max(...extent)).toBeGreaterThan(2.5);
    expect(cone?.properties).toMatchObject({ pointCount: 2, firstHours: 0, lastHours: 12 });
  });

  it('fusionne tous les tronçons d\u2019une prévision de plusieurs points', () => {
    const cone = buildCone([
      { latitude: -19, longitude: 55, hours: 0 },
      { latitude: -19.6, longitude: 54.2, hours: 12 },
      { latitude: -20.3, longitude: 53.1, hours: 24 },
      { latitude: -21.2, longitude: 52.0, hours: 36 },
    ]);
    expect(cone).not.toBeNull();
    expect(['Polygon', 'MultiPolygon']).toContain(cone?.geometry.type);
    expect(cone?.properties.pointCount).toBe(4);
    expect(cone?.properties.maxRadiusKm).toBe(120);
  });

  it('reste d\u2019un seul tenant au passage de la ligne de changement de date', () => {
    const cone = buildCone([
      { latitude: 0, longitude: 179, hours: 0 },
      { latitude: 0, longitude: -179, hours: 12 },
    ]);
    expect(cone?.properties.pointCount).toBe(2);
    const extent = cone ? longitudesOf(cone) : [];
    // Les longitudes sont dépliées (179 … 181) : la zone ne fait pas le tour
    // du monde pour rejoindre deux points distants de 2°.
    expect(Math.min(...extent)).toBeGreaterThan(170);
    expect(Math.max(...extent)).toBeLessThan(190);
  });

  it('ignore les coordonnées non finies', () => {
    expect(buildCone([{ latitude: Number.NaN, longitude: 49, hours: 24 }])).toBeNull();
    expect(buildCone([{ latitude: -20, longitude: Number.POSITIVE_INFINITY, hours: 24 }])).toBeNull();
  });
});

describe('geometryBBox', () => {
  it('calcule la boîte englobante et la refuse sans coordonnée', () => {
    expect(
      geometryBBox({
        type: 'Polygon',
        coordinates: [
          [
            [1, 2],
            [3, 2],
            [3, 5],
            [1, 5],
            [1, 2],
          ],
        ],
      }),
    ).toEqual([1, 2, 3, 5]);
    expect(geometryBBox(null)).toBeNull();
  });
});

describe('conePointsFromTrack', () => {
  it('ne retient que les points de prévision datables', () => {
    const points = [
      trackPoint('p1', 'OBSERVEE', '2026-04-01T00:00:00.000Z', null, -20, 49),
      trackPoint('p2', 'PREVUE', '2026-04-01T00:00:00.000Z', '2026-04-01T12:00:00.000Z', -20.5, 48.5),
      // Prévision sans échéance : aucun rayon ne peut être décidé pour elle.
      trackPoint('p3', 'PREVUE', '2026-04-01T00:00:00.000Z', null, -21, 48),
      trackPoint('p4', 'PREVUE', '2026-04-01T00:00:00.000Z', '2026-04-02T00:00:00.000Z', -21.5, 47.5),
    ];
    expect(conePointsFromTrack(points)).toEqual([
      { latitude: -20.5, longitude: 48.5, hours: 12 },
      { latitude: -21.5, longitude: 47.5, hours: 24 },
    ]);
  });
});

describe('intersectingFeatureIds', () => {
  const square = (id: string | null, lng: number, lat: number) => ({
    type: 'Feature' as const,
    properties: id ? { communeId: id } : {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [lng - 0.05, lat - 0.05],
          [lng + 0.05, lat - 0.05],
          [lng + 0.05, lat + 0.05],
          [lng - 0.05, lat + 0.05],
          [lng - 0.05, lat - 0.05],
        ],
      ],
    },
  });

  const cone = buildCone([
    { latitude: 0, longitude: 0, hours: 0 },
    { latitude: 0, longitude: 0.4, hours: 12 },
  ]);

  it('retourne les polygones traversés par la zone, et eux seuls', () => {
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        square('dedans', 0.2, 0), // sur le corridor
        square('loin', 47, -19), // Madagascar, très loin de la zone
        square(null, 0.1, 0), // sans identifiant : ignoré
      ],
    };
    const ids = intersectingFeatureIds(cone!, collection);
    expect([...ids]).toEqual(['dedans']);
  });

  it('ne retient rien sans zone ou sans couche', () => {
    expect(intersectingFeatureIds(cone!, null).size).toBe(0);
    expect(
      intersectingFeatureIds(cone!, { type: 'FeatureCollection', features: [] }).size,
    ).toBe(0);
  });

  it('accepte un identifiant de district', () => {
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { districtId: 'd-1' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0.1, -0.02],
                [0.3, -0.02],
                [0.3, 0.02],
                [0.1, 0.02],
                [0.1, -0.02],
              ],
            ],
          },
        },
      ],
    };
    const ids = intersectingFeatureIds(
      cone!,
      collection,
      (properties) => String(properties.districtId ?? ''),
    );
    expect([...ids]).toEqual(['d-1']);
  });
});
