import { BellRing, Layers, RadioTower } from 'lucide-react';
import { BrandLogo } from '@/components/auth/BrandLogo';
import { LoginIllustration } from '@/components/auth/LoginIllustration';

const INDICATORS = [
  { icon: RadioTower, label: 'Veille nationale active' },
  { icon: Layers, label: 'Données géospatiales' },
  { icon: BellRing, label: 'Alertes en temps réel' },
] as const;

/**
 * Panneau gauche de la page de connexion : fond bleu nuit, illustration
 * cartographique en arrière-plan, voile sombre pour le contraste, puis le nom
 * de marque, l'argumentaire et les indicateurs de veille.
 *
 * Masqué sous `lg` : sur mobile/tablette la page affiche uniquement le
 * formulaire (voir `LoginPage`).
 */
export function LoginPanel() {
  return (
    <aside className="login-panel relative isolate hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between">
      <LoginIllustration className="pointer-events-none absolute inset-0 -z-20 size-full" />
      <div className="login-panel-veil pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

      <div className="relative px-10 pt-6 xl:px-12 xl:pt-8">
        <BrandLogo className="h-28" />
      </div>

      <div className="relative px-10 pb-12 xl:px-14">
        <p className="login-rise inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md">
          <span className="size-1.5 rounded-full bg-turquoise" aria-hidden="true" />
          Plateforme nationale de gestion des risques
        </p>

        <h1
          className="login-rise mt-6 max-w-lg font-sans text-4xl font-semibold leading-[1.1] tracking-tight text-white xl:text-[2.75rem]"
          style={{ animationDelay: '120ms' }}
        >
          Anticiper les risques.
          <span className="block text-turquoise">Protéger les territoires.</span>
        </h1>

        <p
          className="login-rise mt-5 max-w-md text-[0.95rem] leading-relaxed text-white/80"
          style={{ animationDelay: '220ms' }}
        >
          Une plateforme intelligente pour suivre les événements dangereux, les alertes et
          les zones exposées à Madagascar.
        </p>

        <ul
          className="login-rise mt-10 flex flex-wrap gap-2.5"
          style={{ animationDelay: '320ms' }}
          aria-label="Capacités de la plateforme"
        >
          {INDICATORS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm"
            >
              <Icon className="size-3.5 text-turquoise" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
