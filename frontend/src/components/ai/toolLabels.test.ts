import { describe, expect, it } from 'vitest';
import { toolLabel } from './toolLabels';

/**
 * Les sources d'une réponse sont nommées par leur outil technique : sans
 * traduction, l'utilisateur lit « getLatestWeather » au lieu de savoir quelles
 * données ont servi.
 */
describe('toolLabel', () => {
  it('traduit les outils du socle', () => {
    expect(toolLabel('getActiveEvents')).toBe('événements en cours');
    expect(toolLabel('getCommuneLatestRisk')).toBe('dernier niveau de risque');
    expect(toolLabel('getDashboardSummary')).toBe('synthèse du tableau de bord');
  });

  it('laisse le nom technique d’un outil inconnu plutôt que de le taire', () => {
    expect(toolLabel('getSomethingNew')).toBe('getSomethingNew');
  });
});
