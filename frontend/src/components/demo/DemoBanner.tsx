import { AlertTriangle } from 'lucide-react';
import { DEMO_MODE } from '@/config/demo';

/**
 * Bannière globale affichée sur toutes les pages (y compris la connexion)
 * uniquement lorsque VITE_DEMO_MODE=true.
 */
export function DemoBanner() {
  if (!DEMO_MODE) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-[900] border-b-2 border-amber-400 bg-amber-100 px-4 py-2 text-amber-950"
    >
      <p className="flex flex-wrap items-center justify-center gap-2 text-center text-xs font-semibold sm:text-sm">
        <AlertTriangle className="size-4 shrink-0 text-amber-700" />
        <span>MODE DÉMONSTRATION — Données simulées pour la soutenance.</span>
        <span className="font-normal">
          Aucune alerte opérationnelle ne doit être utilisée pour une décision réelle.
        </span>
      </p>
    </div>
  );
}
