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
