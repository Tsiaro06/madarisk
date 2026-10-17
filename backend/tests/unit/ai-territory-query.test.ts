import { describe, it, expect } from 'vitest';
import { extractTerritoryQuery } from '../../src/services/ai.service';

/**
 * Extraction du territoire cité dans une question.
 *
 * Défaut corrigé ici : seule l'apostrophe droite (`'`, U+0027) était reconnue
 * dans les jonctions « d' ». Or un clavier mobile ou un traitement de texte
 * produit une apostrophe typographique (`’`, U+2019). « commune d’Antananarivo »
 * ne correspondait donc pas, la capture récupérait un simple « d » — rejeté
 * comme trop court — et le tour partait sans le moindre outil exécuté :
 * l'assistant répondait « aucune donnée disponible » sur une commune pourtant
 * présente en base.
 */
describe('IA - extraction du territoire', () => {
  it('accepte l apostrophe droite', () => {
    expect(extractTerritoryQuery("Quels risques pour la commune d'Antananarivo ?")).toBe(
      'Antananarivo',
    );
  });

  it('accepte l apostrophe typographique', () => {
    expect(extractTerritoryQuery('Quels risques pour la commune d\u2019Antananarivo ?')).toBe(
      'Antananarivo',
    );
  });

  it('accepte le modificateur de lettre apostrophe', () => {
    expect(extractTerritoryQuery('Quels risques pour la commune d\u02bcAnkaramena ?')).toBe(
      'Ankaramena',
    );
  });

  it('extrait le nom après « ville de »', () => {
    expect(extractTerritoryQuery('Quelle est la météo pour la ville de Toamasina ?')).toBe(
      'Toamasina',
    );
  });

  it('conserve les noms composés et les traits d union', () => {
    expect(extractTerritoryQuery('Le district de Port Bergé est-il exposé ?')).toBe('Port Bergé');
    expect(extractTerritoryQuery('La commune de Sainte-Marie est-elle suivie ?')).toBe(
      'Sainte-Marie',
    );
  });

  it('retire la particule restée en tête, sans rogner un nom qui commence par elle', () => {
    // « l’ » est une jonction, et non le début du nom.
    expect(extractTerritoryQuery('Le district de l\u2019Analamanga est-il exposé ?')).toBe(
      'Analamanga',
    );
    // « La… » est en revanche le début d'un vrai nom : six communes malgaches
    // commencent ainsi (Lakato, Lalazana, Lanivo, Lanjarivo, Lazarivo, Leanja).
    expect(extractTerritoryQuery('Quels risques pour la commune de Lakato ?')).toBe('Lakato');
  });

  it('accepte une jonction dont l apostrophe est devenue une espace', () => {
    // Clavier (mobile, correcteur) qui remplace l’apostrophe par une espace :
    // « commune d Ambanizana ». La capture ramassait « d Ambanizana » — particule
    // comprise — et la recherche ne correspondait alors à aucune commune.
    expect(extractTerritoryQuery('Quels risques pour la commune d Ambanizana ?')).toBe(
      'Ambanizana',
    );
    // Même défaut après « de l » : « de l Analamanga ».
    expect(extractTerritoryQuery('Le district de l Analamanga est-il exposé ?')).toBe(
      'Analamanga',
    );
  });

  it('ne retient rien sans nom exploitable', () => {
    expect(extractTerritoryQuery('Quelle est la météo aujourd\u2019hui ?')).toBeNull();
    expect(extractTerritoryQuery('Quels risques pour la commune de A ?')).toBeNull();
    expect(extractTerritoryQuery('Quels risques pour la commune d\u2019 ?')).toBeNull();
  });
});
