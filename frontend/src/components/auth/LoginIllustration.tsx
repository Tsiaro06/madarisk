import { useId } from 'react';

const GRID_STEP = 72;
const VIEW_W = 720;
const VIEW_H = 900;

const LONGITUDES = Array.from({ length: Math.floor(VIEW_W / GRID_STEP) + 1 }, (_, i) => i * GRID_STEP);
const LATITUDES = Array.from({ length: Math.floor(VIEW_H / GRID_STEP) + 1 }, (_, i) => i * GRID_STEP);

/** Courbes de niveau : offset différent par courbe pour éviter l'alignement. */
const CONTOURS = [
  'M-30 556 C 120 508, 250 610, 410 570 S 700 512, 750 552',
  'M-30 634 C 140 592, 262 700, 424 656 S 704 596, 750 634',
  'M-30 712 C 152 668, 272 780, 434 738 S 706 686, 750 716',
  'M-30 790 C 162 746, 282 860, 444 818 S 708 764, 750 790',
  'M-30 868 C 172 824, 292 936, 454 896 S 720 844, 750 864',
];

const ISLAND =
  'M462 236c36 22 62 78 66 142 4 66-16 136-44 188-24 44-52 72-80 68-32-4-52-36-58-84-8-64 4-140 24-196 22-62 60-136 92-118Z';

const ISLAND_RIDGE = [
  'M438 330c-14 34-20 78-16 116 3 32 13 56 26 70',
  'M470 300c-6 44-4 96 8 138 6 22 16 40 27 52',
  'M420 430c22-10 52-12 82-6',
  'M406 486c26-12 62-14 96-6',
];

/** Points de surveillance : cyclone / inondation / glissement de terrain. */
const BEACONS = [
  { x: 300, y: 452, delay: '0s' },
  { x: 528, y: 606, delay: '0.9s' },
  { x: 244, y: 676, delay: '1.7s' },
];

/**
 * Illustration vectorielle du panneau de connexion : grille géographique,
 * courbes de niveau, silhouette insulaire et balayage « radar ».
 *
 * Purement décorative (`aria-hidden`) et sans dépendance externe — le projet
 * n'embarque aucune photo libre de droits, le SVG évite toute question de
 * licence tout en restant net sur tous les écrans.
 */
export function LoginIllustration({ className }: { className?: string }) {
  const uid = useId();
  const sweepGradient = `madarisk-sweep-${uid}`;
  const islandFill = `madarisk-island-${uid}`;
  const radarGlow = `madarisk-radar-${uid}`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={sweepGradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3ec9d6" stopOpacity="0.45" />
          <stop offset="1" stopColor="#3ec9d6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={islandFill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3ec9d6" stopOpacity="0.16" />
          <stop offset="1" stopColor="#2f5f78" stopOpacity="0.06" />
        </linearGradient>
        <radialGradient id={radarGlow}>
          <stop offset="0" stopColor="#3ec9d6" stopOpacity="0.3" />
          <stop offset="1" stopColor="#3ec9d6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Halo du poste de veille */}
      <circle cx="300" cy="452" r="300" fill={`url(#${radarGlow})`} />

      {/* Grille géographique */}
      <g stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1">
        {LONGITUDES.map((x) => (
          <line key={`x-${x}`} x1={x} y1={0} x2={x} y2={VIEW_H} />
        ))}
        {LATITUDES.map((y) => (
          <line key={`y-${y}`} x1={0} y1={y} x2={VIEW_W} y2={y} />
        ))}
      </g>

      {/* Balayage radar */}
      <g className="login-sweep">
        <path d="M300 452 L300 152 A300 300 0 0 1 559 265 Z" fill={`url(#${sweepGradient})`} />
        <line x1="300" y1="452" x2="559" y2="265" stroke="#3ec9d6" strokeOpacity="0.5" strokeWidth="1.2" />
      </g>
      <circle cx="300" cy="452" r="300" fill="none" stroke="#3ec9d6" strokeOpacity="0.14" />
      <circle cx="300" cy="452" r="196" fill="none" stroke="#3ec9d6" strokeOpacity="0.12" />

      {/* Courbes de niveau */}
      <g fill="none" stroke="#3ec9d6" strokeOpacity="0.2" strokeWidth="1.1">
        {CONTOURS.map((d) => (
          <path key={d.slice(0, 18)} d={d} />
        ))}
      </g>

      {/* Silhouette du territoire + relief */}
      <path d={ISLAND} fill={`url(#${islandFill})`} stroke="#3ec9d6" strokeOpacity="0.4" strokeWidth="1.4" />
      <g fill="none" stroke="#3ec9d6" strokeOpacity="0.3" strokeWidth="1">
        {ISLAND_RIDGE.map((d) => (
          <path key={d.slice(0, 16)} d={d} />
        ))}
      </g>

      {/* Balises de surveillance */}
      {BEACONS.map((b) => (
        <g key={`${b.x}-${b.y}`}>
          <circle className="login-beacon" cx={b.x} cy={b.y} r="16" fill="#3ec9d6" style={{ animationDelay: b.delay }} />
          <circle cx={b.x} cy={b.y} r="4.5" fill="#e8fbfd" />
          <circle cx={b.x} cy={b.y} r="9" fill="none" stroke="#e8fbfd" strokeOpacity="0.6" strokeWidth="1.2" />
        </g>
      ))}

      {/* Coordonnées de référence — signalement « données géospatiales » */}
      <text
        x="34"
        y={VIEW_H - 34}
        fill="#ffffff"
        fillOpacity="0.32"
        fontSize="13"
        letterSpacing="2.4"
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
      >
        18.9°S · 47.0°E
      </text>
    </svg>
  );
}
