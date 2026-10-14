import { describe, expect, it } from 'vitest';
import type { EventCommuneAlertRow } from '@/types';
import { alertStyle, alertTooltipElement } from './communeAlertStyle';

function makeRow(overrides: Partial<EventCommuneAlertRow> = {}): EventCommuneAlertRow {
  return {
    communeId: 'cm-1',
    communeName: 'Mananjary',
    communeCode: 'MG-123',
    districtId: 'd-1',
    districtName: 'Mananjary',
    alertLevel: 'ROUGE',
    validFrom: '2022-02-04T00:00:00.000Z',
    validTo: '2022-02-08T00:00:00.000Z',
    infoType: 'OFFICIELLE',
    territoryScope: 'COMMUNE',
    sourceName: 'Bulletin Météo Madagascar du 4 février 2022',
    sourceUrl: null,
    comment: null,
    confidence: null,
    ...overrides,
  };
}

describe('alertStyle (couche des niveaux d’alerte)', () => {
  it('colore chaque niveau avec sa couleur officielle et une bordure plus foncée', () => {
    expect(alertStyle(makeRow({ alertLevel: 'VERT' }), false).fillColor).toBe('#16A34A');
    expect(alertStyle(makeRow({ alertLevel: 'VERT' }), false).color).toBe('#15803D');
    expect(alertStyle(makeRow({ alertLevel: 'JAUNE' }), false).fillColor).toBe('#EAB308');
    expect(alertStyle(makeRow({ alertLevel: 'JAUNE' }), false).color).toBe('#A16207');
    expect(alertStyle(makeRow({ alertLevel: 'ROUGE' }), false).fillColor).toBe('#DC2626');
    expect(alertStyle(makeRow({ alertLevel: 'ROUGE' }), false).color).toBe('#991B1B');
    expect(alertStyle(makeRow({ alertLevel: 'BLEU' }), false).fillColor).toBe('#2563EB');
    expect(alertStyle(makeRow({ alertLevel: 'BLEU' }), false).color).toBe('#1D4ED8');
  });

  it('laisse GRIS sans alerte active, très translucide', () => {
    const style = alertStyle(undefined, false);
    expect(style.fillColor).toBe('#D1D5DB');
    expect(Number(style.fillOpacity)).toBeLessThan(0.2);
  });

  it('signale par des pointillés les niveaux issus d’une estimation spatiale', () => {
    // Niveau hérité d’une région : signalé comme estimation.
    expect(
      alertStyle(makeRow({ infoType: 'ESTIMATION', territoryScope: 'REGION' }), false)
        .dashArray,
    ).toBe('4 3');
    // Estimation déclarée même à l’échelle communale.
    expect(
      alertStyle(makeRow({ infoType: 'ESTIMATION', territoryScope: 'COMMUNE' }), false)
        .dashArray,
    ).toBe('4 3');
    // Alerte officielle publiée à l’échelle communale : trait plein.
    expect(
      alertStyle(makeRow({ infoType: 'OFFICIELLE', territoryScope: 'COMMUNE' }), false)
        .dashArray,
    ).toBeUndefined();
  });

  it('met en surbrillance la commune sélectionnée', () => {
    const style = alertStyle(makeRow({ alertLevel: 'ROUGE' }), true);
    expect(style.color).toBe('#03224c');
    expect(Number(style.weight)).toBeGreaterThan(2);
    expect(Number(style.fillOpacity)).toBeGreaterThan(0.6);
  });
});

describe('alertTooltipElement (traçabilité)', () => {
  it('affiche le nom, le niveau, la validité, la nature et la source', () => {
    const el = alertTooltipElement(
      'Mananjary',
      makeRow({
        comment: 'Communes citées nommément dans le bulletin du 4 février 2022.',
      }),
    );
    const text = el.textContent ?? '';
    expect(text).toContain('Mananjary');
    expect(text).toContain('Niveau : Rouge');
    expect(text).toContain('Validité :');
    expect(text).toContain('Nature : Alerte officielle (Commune)');
    expect(text).toContain('Source : Bulletin Météo Madagascar du 4 février 2022');
    expect(text).toContain('Communes citées nommément');
  });

  it('signale explicitement une estimation spatiale héritée', () => {
    const el = alertTooltipElement(
      'Commune héritée',
      makeRow({ infoType: 'ESTIMATION', territoryScope: 'DISTRICT' }),
    );
    expect(el.textContent ?? '').toContain('Estimation spatiale');
    expect(el.textContent ?? '').toContain('(District)');
  });

  it('indique « hors alerte » quand aucune donnée n’existe', () => {
    const el = alertTooltipElement('Commune sans alerte', undefined);
    expect(el.textContent ?? '').toContain('Hors alerte');
  });

  it('affiche les dates en heure de Madagascar (UTC+3)', () => {
    const el = alertTooltipElement('Mananjary', makeRow());
    // 2022-02-04T00:00:00Z → 04 févr. 2022 03:00 (heure de Madagascar).
    expect(el.textContent ?? '').toContain('03:00');
  });
});
