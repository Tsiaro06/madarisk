import { describe, expect, it } from 'vitest';
import { getObservationFreshness } from './weather.service';

/**
 * Fraîcheur de la carte météo « aujourd'hui ».
 *
 * La page ouvre sur aujourd'hui et sert la dernière observation disponible :
 * sans synchronisation le jour même, la carte contient en réalité la veille —
 * mais reste colorée, donc rien ne signale l'anomalie. Comparer le jour effectif
 * de la donnée (`dataDay`, calculé par le backend en heure de Madagascar) à la
 * date consultée est ce qui permet de l'annoncer.
 */
describe('getObservationFreshness', () => {
  const TODAY = '2026-10-21';

  it('signale une carte en retard quand « aujourd’hui » sert la veille', () => {
    const result = getObservationFreshness({
      consultedDate: TODAY,
      dataDay: '2026-10-20',
      mode: 'OBSERVATION',
      today: TODAY,
    });

    expect(result.isBehind).toBe(true);
    expect(result.isCurrentDay).toBe(false);
    expect(result.dataDay).toBe('2026-10-20');
  });

  it('ne signale rien quand la donnée du jour est bien présente', () => {
    const result = getObservationFreshness({
      consultedDate: TODAY,
      dataDay: TODAY,
      mode: 'OBSERVATION',
      today: TODAY,
    });

    expect(result.isBehind).toBe(false);
    expect(result.isCurrentDay).toBe(true);
  });

  it('ne signale pas de retard sur une date passée volontairement consultée', () => {
    // En historique, une journée antérieure est le but de la consultation, pas
    // un retard — l'annoncer serait un faux positif.
    const result = getObservationFreshness({
      consultedDate: '2026-10-16',
      dataDay: '2026-10-16',
      mode: 'HISTORIQUE',
      today: TODAY,
    });

    expect(result.isBehind).toBe(false);
    expect(result.isCurrentDay).toBe(false);
  });

  it('ne signale rien en prévision : un jour d’observation n’a pas de sens', () => {
    const result = getObservationFreshness({
      consultedDate: '2026-10-24',
      dataDay: null,
      mode: 'PREVISION',
      today: TODAY,
    });

    expect(result.isBehind).toBe(false);
    expect(result.dataDay).toBeNull();
  });

  it('reste sobre quand le backend ne fournit pas de jour', () => {
    const result = getObservationFreshness({
      consultedDate: TODAY,
      dataDay: null,
      mode: 'OBSERVATION',
      today: TODAY,
    });

    expect(result.isBehind).toBe(false);
    expect(result.isCurrentDay).toBe(false);
  });

  it('ne signale pas de retard sur une date passée dont la donnée est plus ancienne', () => {
    // Le 18 consulté sert le 16 : la couche est en retard, mais l'utilisateur a
    // déjà choisi une date passée. Le bandeau « aujourd'hui » n'a pas à parler.
    const result = getObservationFreshness({
      consultedDate: '2026-10-18',
      dataDay: '2026-10-16',
      mode: 'OBSERVATION',
      today: TODAY,
    });

    expect(result.isBehind).toBe(false);
    expect(result.isCurrentDay).toBe(false);
    expect(result.dataDay).toBe('2026-10-16');
  });
});
