export const DASH = {
  accent: '#2F5BEA',
  accentLight: '#5B82F5',
  accentSoft: '#EAF0FE',
  canvas: '#F3F6FC',
  card: '#FFFFFF',
  ink: '#101828',
  inkSoft: '#475467',
  muted: '#98A2B3',
  line: '#E7ECF5',
  positive: '#17B26A',
  negative: '#F04438',
  lime: '#A8E63A',
  heroFrom: '#4A72F3',
  heroTo: '#2447C4',
} as const;

export const RISK_HEX: Record<string, string> = {
  EXTREME: '#F04438',
  ELEVE: '#F79009',
  MODERE: '#FDB022',
  FAIBLE: '#17B26A',
  SANS_RISQUE: '#98A2B3',
};

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const int = Number.parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const BAR_GRADIENT_ID = 'dash-bar-gradient';
export const RING_GRADIENT_ID = 'dash-ring-gradient';

export const CHART_AXIS = {
  tick: { fill: DASH.muted, fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;