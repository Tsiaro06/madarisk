import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { weatherApi } from '@/api';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { formatDate } from '@/lib/utils';

interface EventBulletinsTabProps {
  eventId: string;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Couleur du niveau de vigilance d'un bulletin (VERT/VERTE, JAUNE, ROUGE, BLEU). */
function levelTone(level: string | null): Tone {
  const normalized = (level ?? '').toUpperCase();
  if (normalized.includes('ROUGE')) return 'danger';
  if (normalized.includes('JAUNE')) return 'warning';
  if (normalized.includes('BLEU')) return 'info';
  if (normalized.includes('VERTE') || normalized.includes('VERT')) return 'success';
  return 'neutral';
}

function metric(label: string, value: string | null): ReactNode {
  if (value === null) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

/**
 * Onglet « Bulletins historiques » : bulletins météorologiques archivés d'un
 * événement (ex. bulletins cycloniques Batsirai 2022). Données passées, datées
 * et sourcées — jamais une situation temps réel, jamais une alerte active.
 */
export function EventBulletinsTab({ eventId }: EventBulletinsTabProps) {
  const query = useQuery({
    queryKey: ['weather', 'bulletins', eventId],
    queryFn: () => weatherApi.bulletins({ eventId }),
  });

  if (query.isLoading) {
    return <Spinner />;
  }

  if (query.isError) {
    return (
      <AlertBanner tone="danger" title="Échec du chargement">
        Impossible de charger les bulletins historiques de cet événement.
      </AlertBanner>
    );
  }

  const bulletins = query.data ?? [];

  if (bulletins.length === 0) {
    return <EmptyState title="Aucun bulletin historique enregistré pour cet événement" />;
  }

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm text-muted">
          Bulletins météorologiques archivés pour cet événement. Données passées, datées et
          sourcées : elles ne représentent jamais une situation temps réel et ne déclenchent
          aucune notification.
        </p>
      </Card>

      {bulletins.map((bulletin) => (
        <Card key={bulletin.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-medium text-ink">{bulletin.title}</h3>
              <p className="mt-1 text-xs text-muted">
                {bulletin.sourceName} · diffusé le {formatDate(bulletin.publishedAt)}
                {bulletin.bulletinRef ? ` · ${bulletin.bulletinRef}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Historique</Badge>
              {bulletin.alertLevel ? (
                <Badge tone={levelTone(bulletin.alertLevel)}>{bulletin.alertLevel}</Badge>
              ) : null}
            </div>
          </div>

          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            {metric(
              'Vent soutenu moyen',
              bulletin.windKmh !== null ? `${bulletin.windKmh} km/h` : null,
            )}
            {metric(
              'Rafales',
              bulletin.gustKmh !== null ? `${bulletin.gustKmh} km/h` : null,
            )}
            {metric(
              'Pression',
              bulletin.pressureHpa !== null ? `${bulletin.pressureHpa} hPa` : null,
            )}
          </dl>

          {bulletin.positionDescription ? (
            <p className="mt-3 text-sm text-muted">{bulletin.positionDescription}</p>
          ) : null}

          {bulletin.content ? (
            <p className="mt-2 whitespace-pre-line text-sm text-ink">{bulletin.content}</p>
          ) : null}

          {bulletin.sourceUrl ? (
            <a
              className="mt-3 inline-flex items-center gap-1 text-xs text-brand hover:underline"
              href={bulletin.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-3.5" /> Source : {bulletin.sourceName}
            </a>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
