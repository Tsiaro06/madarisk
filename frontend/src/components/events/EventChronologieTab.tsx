import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, Bot, User } from 'lucide-react';
import { eventsApi } from '@/api';
import type { EventStatus, SeverityLevel } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { cn, formatDate, formatNumber } from '@/lib/utils';

function statusTone(status: EventStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'CLOTURE') return 'success';
  if (status === 'ACTIF') return 'danger';
  if (status === 'SUIVI') return 'warning';
  return 'info';
}

function severityTone(level: SeverityLevel): 'success' | 'warning' | 'danger' | 'info' {
  if (level === 'EXTREME') return 'danger';
  if (level === 'ELEVEE') return 'warning';
  if (level === 'MODEREE') return 'info';
  return 'success';
}

function actorLabel(actorType: string): string {
  if (actorType === 'USER') return 'Opérateur';
  if (actorType === 'SYSTEM') return 'Moteur de détection';
  return actorType;
}

function actorIcon(actorType: string) {
  return actorType === 'USER' ? User : Bot;
}

const METRIC_LABELS: Record<string, string> = {
  precipitation_mm: 'Précipitation (mm)',
  rainfall_24h_mm: 'Pluie 24h (mm)',
  temperature_c: 'Température (°C)',
  humidity_percent: 'Humidité (%)',
  wind_speed_kmh: 'Vent (km/h)',
  wind_gusts_kmh: 'Rafales (km/h)',
  pressure_hpa: 'Pression (hPa)',
  precipitation_sum_mm: 'Précip. cumul (mm)',
  temperature_min_c: 'T° min (°C)',
  temperature_max_c: 'T° max (°C)',
  relative_humidity_avg: 'Humidité moy. (%)',
  wind_speed_max_kmh: 'Vent max (km/h)',
  wind_gusts_max_kmh: 'Rafales max (km/h)',
  pressure_avg_hpa: 'Pression moy. (hPa)',
};

function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key.replace(/_/g, ' ');
}

function formatMetricValue(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string' && !Number.isNaN(Number(value))) return formatNumber(Number(value));
  return String(value);
}

function MetricChips({ values }: { values: Record<string, unknown> | null }) {
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="rounded-md border border-brand/15 bg-brand-soft/20 px-2 py-0.5 text-xs font-medium text-ink"
        >
          {metricLabel(key)} : {formatMetricValue(value)}
        </span>
      ))}
    </div>
  );
}

export function EventChronologieTab({ eventId }: { eventId: string }) {
  const historyQ = useQuery({
    queryKey: ['event', eventId, 'history'],
    queryFn: () => eventsApi.history(eventId),
    enabled: Boolean(eventId),
  });

  if (historyQ.isLoading) return <Spinner />;
  if (historyQ.isError || !historyQ.data) {
    return (
      <AlertBanner tone="danger">
        Impossible de charger la chronologie de l&apos;événement.
      </AlertBanner>
    );
  }

  const timeline = [...historyQ.data.timeline].reverse();

  return (
    <Card
      title="Chronologie de l'événement"
      description="Détection, changements de statut et évaluations — source MANUAL_UI (opérateur) ou moteur de détection automatique"
    >
      {timeline.length === 0 ? (
        <EmptyState
          title="Aucun événement de chronologie"
          description="Les changements de statut et les évaluations du moteur apparaîtront ici."
        />
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {timeline.map((entry, i) => {
            const isStatus = entry.kind === 'STATUS_CHANGE';
            const ActorIcon = actorIcon(entry.actorType);
            return (
              <li key={`${entry.recordedAt}-${i}`} className="relative">
                <span
                  className={cn(
                    'absolute -left-[29px] flex size-5 items-center justify-center rounded-full border-2 border-surface text-ink',
                    isStatus ? 'bg-brand text-white' : 'bg-amber-400 text-white',
                  )}
                >
                  {isStatus ? (
                    <ArrowRight className="size-3" />
                  ) : (
                    <Activity className="size-3" />
                  )}
                </span>
                <div className="rounded-xl border border-line bg-white p-3.5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isStatus ? (
                        <>
                          {entry.fromStatus ? (
                            <Badge tone={statusTone(entry.fromStatus as EventStatus)}>
                              {entry.fromStatus}
                            </Badge>
                          ) : (
                            <Badge>Tout début</Badge>
                          )}
                          <ArrowRight className="size-3 text-muted" />
                        </>
                      ) : null}
                      {entry.toStatus ? (
                        <Badge tone={statusTone(entry.toStatus as EventStatus)}>
                          {entry.toStatus}
                        </Badge>
                      ) : null}
                      <span className="flex items-center gap-1 text-xs font-medium text-muted">
                        <ActorIcon className="size-3.5" />
                        {actorLabel(entry.actorType)}
                      </span>
                      <span className="text-xs text-muted">{formatDate(entry.recordedAt)}</span>
                    </div>
                    <span className="flex items-center gap-2">
                      {entry.severity ? (
                        <Badge tone={severityTone(entry.severity as SeverityLevel)}>
                          {entry.severity}
                        </Badge>
                      ) : null}
                      <Badge className="normal-case">
                        {isStatus ? 'Statut' : 'Évaluation'}
                      </Badge>
                    </span>
                  </div>

                  {entry.reason ? <p className="mt-2 text-sm text-ink">{entry.reason}</p> : null}
                  {entry.exposedCommuneCount !== null && !isStatus ? (
                    <p className="mt-1.5 text-xs text-muted">
                      {entry.exposedCommuneCount} commune(s) exposée(s)
                    </p>
                  ) : null}
                  {!isStatus ? <MetricChips values={entry.metricValues} /> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}