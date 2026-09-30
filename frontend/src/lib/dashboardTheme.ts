/**
 * Palette du tableau de bord : trois teintes seulement — noir, blanc et
 * bleu marine. Toute la variation est obtenue par opacite du bleu marine,
 * ce qui produit une rampe ordinale lisible pour les niveaux de risque
 * (plus le niveau est eleve, plus la teinte est dense).
 */
export const DASH = {
  navy: '#03224C',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export const DASH_NAVY = {
  a04: 'rgba(3, 34, 76, 0.04)',
  a08: 'rgba(3, 34, 76, 0.08)',
  a14: 'rgba(3, 34, 76, 0.14)',
  a24: 'rgba(3, 34, 76, 0.24)',
  a38: 'rgba(3, 34, 76, 0.38)',
  a56: 'rgba(3, 34, 76, 0.56)',
  a72: 'rgba(3, 34, 76, 0.72)',
  a78: 'rgba(3, 34, 76, 0.78)',
} as const;

/** Rampe ordinale des niveaux de risque, du plus severe au plus faible. */
export const RISK_RAMP: Record<string, string> = {
  EXTREME: DASH.navy,
  ELEVE: DASH_NAVY.a78,
  MODERE: DASH_NAVY.a56,
  FAIBLE: DASH_NAVY.a38,
  SANS_RISQUE: DASH_NAVY.a14,
};

export const BAR_GRADIENT_ID = 'dash-bar-gradient';

export const CHART_AXIS = {
  tick: { fill: DASH_NAVY.a56, fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;