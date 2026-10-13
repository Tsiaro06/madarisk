import { describe, it, expect } from 'vitest';
import { BATSIRAI_TRACK } from '../../database/seeds/batsirai-2022';
import { BATSIRAI_RADII } from '../../database/seeds/batsirai-2022-radii';

/**
 * Les rayons de vent documentés (RSMC La Réunion, IBTrACS v04r01) sont rattachés
 * à la trajectoire officielle par horodatage lors du seed. Ce test garantit que
 * les deux fichiers restent alignés et qu'aucune valeur n'est inventée : un seuil
 * non publié reste `null`, jamais `0`.
 */
describe('Rayons de vent documentés — Batsirai', () => {
  it('couvre exactement les mêmes horodatages que la trajectoire, dans l’ordre', () => {
    expect(BATSIRAI_RADII.map((r) => r.time)).toEqual(BATSIRAI_TRACK.map((p) => p.time));
  });

  it('publie le rayon de vent ≥ 34 kt au passage sur Madagascar', () => {
    const landfall = BATSIRAI_RADII.find((r) => r.time === '2022-02-05T12:00:00Z');
    expect(landfall?.radius34ktKm).toBe(368.5);
    expect(landfall?.radius50ktKm).toBe(164.8);
  });

  it('garde à null le seuil que la RSMC ne publie pas (64 kt)', () => {
    expect(BATSIRAI_RADII.every((r) => r.radius64ktKm === null)).toBe(true);
  });

  it('décroît avec le seuil : R50 ≤ R34 quand les deux sont publiés', () => {
    for (const point of BATSIRAI_RADII) {
      if (point.radius34ktKm != null && point.radius50ktKm != null) {
        expect(point.radius50ktKm).toBeLessThanOrEqual(point.radius34ktKm);
      }
    }
  });

  it('laisse les premiers points (avant publication) à null plutôt qu’à zéro', () => {
    const beforeFirstPublication = BATSIRAI_RADII.filter(
      (r) => r.time < '2022-01-26T18:00:00Z',
    );
    expect(beforeFirstPublication.length).toBeGreaterThan(0);
    for (const point of beforeFirstPublication) {
      expect(point.radius34ktKm).toBeNull();
      expect(point.radius50ktKm).toBeNull();
    }
  });
});
