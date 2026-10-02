import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface TopbarProps {
  /** Horodatage du dernier calcul, renvoyé par `/dashboard/summary`. */
  lastUpdatedAt: string | null;
  /** Vrai tant qu'au moins un appel du tableau de bord est en vol. */
  isFetching: boolean;
  /** Message d'erreur si un appel a échoué. */
  error: string | null;
  onRetry: () => void;
}

/**
 * Barre de titre du tableau de bord.
 *
 * Elle ne contient plus que de quoi juger la fraîcheur des chiffres affichés.
 * Les onglets « Analytique » et « Rapports » pointaient vers `/rapports`, une
 * route inexistante : ils menaient à une page « introuvable ». Les ports de
 * recherche et de menu n'étaient que des messages affichés au clic, sans
 * requête ni effet. Le.profile est déjà accessible depuis la barre latérale et
 * du panneau bleu : le doublon est supprimé.
 */
export function Topbar({ lastUpdatedAt, isFetching, error, onRetry }: TopbarProps) {
  return (
    <header className="dash-rise dash-rise-1 flex flex-col gap-4 rounded-3xl border border-line bg-surface px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:gap-6">
      {/* Marque */}
      <div className="flex min-w-0 items-center gap-3 lg:w-64">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-dash-light to-dash font-bold text-white shadow-[0_8px_18px_-8px_rgba(47,91,234,0.9)]"
        >
          M
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-dash-title">
            MadaRisk Map
          </p>
          <p className="truncate text-xs text-muted">Veille des risques · Madagascar</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
        {error ? (
          <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-red-700">
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
            >
              <RefreshCw aria-hidden className="size-3.5" />
              Réessayer
            </button>
          </p>
        ) : (
          <p className="text-sm text-dash-body" aria-live="polite">
            {isFetching && !lastUpdatedAt
              ? 'Chargement des données…'
              : lastUpdatedAt
                ? `Dernier calcul : ${new Date(lastUpdatedAt).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}`
                : 'Aucune donnée calculée pour le moment'}
            {isFetching && lastUpdatedAt ? (
              <RefreshCw
                aria-hidden
                className="ml-2 inline size-3.5 animate-spin align-[-2px] text-dash-body/70"
              />
            ) : null}
          </p>
        )}
      </div>

      <Link
        to="/evenements"
        className="shrink-0 self-start rounded-full bg-dash-pale px-4 py-2 text-sm font-medium text-dash transition-colors hover:bg-dash-pale/70 lg:self-auto"
      >
        Voir les événements
      </Link>
    </header>
  );
}
