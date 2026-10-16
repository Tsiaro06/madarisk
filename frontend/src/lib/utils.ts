import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('fr-FR');
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

/**
 * Délai d'attente lisible. Le quota d'un fournisseur IA se compte en heures (le
 * forfait Gemini se réarme à minuit, heure du Pacifique) : « 62084 s » n'est pas
 * exploitable en salle de crise, alors que « 17 h 15 » se comprend d'un coup.
 * Le délai est arrondi à la seconde près puis vers le haut, pour ne jamais
 * annoncer un réessai avant qu'il ne soit possible.
 */
export function formatRetryDelay(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.ceil(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.ceil(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

/**
 * Libellé d'un run de synchronisation météo. Un run `PARTIAL` (quota épuisé au
 * milieu d'un lot) n'est pas un succès : l'afficher à côté de la date évite de
 * laisser croire que la synchronisation n'a pas tournu aujourd'hui.
 */
export function syncRunStatusLabel(status?: string | null): string | null {
  switch (status) {
    case 'SUCCESS':
      return 'réussie';
    case 'PARTIAL':
      return 'partielle';
    case 'FAILED':
      return 'échouée';
    case 'RUNNING':
      return 'en cours';
    default:
      return null;
  }
}
