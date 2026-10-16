import { describe, expect, it } from 'vitest';
import { formatRetryDelay } from './utils';

/**
 * Délai d'attente affiché après un 429.
 *
 * Deux limites différentes se cachent derrière ce statut : la limite de débit de
 * l'API (secondes) et le quota du fournisseur IA (heures — le forfait journalier
 * se réarme à minuit, heure du Pacifique). Afficher « 62084s » revenait à ne rien
 * dire du tout.
 */
describe('formatRetryDelay', () => {
  it('exprime les délais courts en secondes', () => {
    expect(formatRetryDelay(1)).toBe('1 s');
    expect(formatRetryDelay(39)).toBe('39 s');
    expect(formatRetryDelay(59)).toBe('59 s');
  });

  it('passe aux minutes puis aux heures', () => {
    expect(formatRetryDelay(60)).toBe('1 min');
    expect(formatRetryDelay(900)).toBe('15 min');
    expect(formatRetryDelay(3599)).toBe('1 h');
    expect(formatRetryDelay(3600)).toBe('1 h');
    expect(formatRetryDelay(3900)).toBe('1 h 05');
    expect(formatRetryDelay(62084)).toBe('17 h 15');
  });

  it('arrondit vers le haut pour ne pas annoncer un réessai trop tôt', () => {
    expect(formatRetryDelay(0.4)).toBe('1 s');
    expect(formatRetryDelay(60.1)).toBe('2 min');
  });

  it('reste sobre sans délai exploitable', () => {
    expect(formatRetryDelay(0)).toBe('—');
    expect(formatRetryDelay(-5)).toBe('—');
    expect(formatRetryDelay(null)).toBe('—');
    expect(formatRetryDelay(undefined)).toBe('—');
    expect(formatRetryDelay(Number.NaN)).toBe('—');
    expect(formatRetryDelay(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
