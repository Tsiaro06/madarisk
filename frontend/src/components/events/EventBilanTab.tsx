import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileText, MapPin } from 'lucide-react';
import { reportsApi } from '@/api';
import type { RiskLevel } from '@/types';
import { RISK_LABELS } from '@/types';
import { ApiClientError } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatNumber } from '@/lib/utils';

const RISK_LEVELS: RiskLevel[] = ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME'];

function riskTone(level: RiskLevel): 'success' | 'warning' | 'danger' | 'info' {
  if (level === 'EXTREME') return 'danger';
  if (level === 'ELEVE') return 'warning';
  if (level === 'MODERE') return 'info';
  return 'success';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Erreur lors de l’export';
}

interface ExportProps {
  eventId: string;
  eventCode: string;
}

function EventExports({ eventId, eventCode }: ExportProps) {
  const { toast } = useToast();

  const pdfM = useMutation({
    mutationFn: () => reportsApi.exportPdf({ eventId, title: `Rapport ${eventCode}` }),
    onSuccess: (blob) => {
      downloadBlob(blob, `${eventCode}-rapport.pdf`);
      toast('Rapport PDF généré', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const csvM = useMutation({
    mutationFn: () =>
      reportsApi.exportCsv({ resourceType: 'exposed-communes', eventId }),
    onSuccess: (blob) => {
      downloadBlob(blob, `${eventCode}-communes-exposees.csv`);
      toast('Export CSV généré', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const geojsonM = useMutation({
    mutationFn: () =>
      reportsApi.exportGeoJson({ resourceType: 'event-areas', eventId }),
    onSuccess: (blob) => {
      downloadBlob(blob, `${eventCode}-zones.geojson`);
      toast('Export GeoJSON généré', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" loading={pdfM.isPending} onClick={() => pdfM.mutate()}>
        <FileText className="size-3.5" /> Rapport PDF
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={csvM.isPending}
        onClick={() => csvM.mutate()}
      >
        <Download className="size-3.5" /> Communes exposées (CSV)
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={geojsonM.isPending}
        onClick={() => geojsonM.mutate()}
      >
        <Download className="size-3.5" /> Zones (GeoJSON)
      </Button>
    </div>
  );
}

export function EventBilanTab({ eventId }: { eventId: string }) {
  const bilanQ = useQuery({
    queryKey: ['event', eventId, 'bilan'],
    queryFn: () => reportsApi.event(eventId),
    enabled: Boolean(eventId),
  });

  if (bilanQ.isLoading) return <Spinner />;
  if (bilanQ.isError || !bilanQ.data) {
    return <AlertBanner tone="danger">Impossible de charger le bilan de l’événement.</AlertBanner>;
  }

  const bilan = bilanQ.data;
  const ev = bilan.event;
  const eventsList = bilan.exposedCommunes;
  const hasExposure = eventsList.length > 0;
  const hasRisks = bilan.riskCount > 0;
  const hasAlerts = bilan.alerts.length > 0;
  const hasWeather = bilan.weather.available;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base text-ink">Bilan de l’événement</h2>
          <p className="text-xs text-muted">
            Indicateurs calculés à partir des données réellement disponibles — aucune donnée
            d’impact (dommages, victimes) n’est inventée.
          </p>
        </div>
        {ev ? <EventExports eventId={eventId} eventCode={ev.eventCode} /> : null}
      </div>

      {ev ? (
        <Card title="Situation" description="Caractéristiques actuelles de l’événement">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Statut</dt>
              <dd className="mt-1">
                <Badge>{ev.status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Sévérité</dt>
              <dd className="mt-1">
                <Badge tone="warning">{ev.severity}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Début</dt>
              <dd className="mt-1 text-ink">{formatDate(ev.startedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Fin</dt>
              <dd className="mt-1 text-ink">{formatDate(ev.endedAt)}</dd>
            </div>
          </dl>
          {ev.description ? <p className="mt-3 text-sm text-ink">{ev.description}</p> : null}
          {ev.sourceName ? (
            <p className="mt-2 text-xs text-muted">Source : {ev.sourceName}</p>
          ) : null}
        </Card>
      ) : null}

      {!hasRisks ? (
        <AlertBanner tone="warning" title="Évaluation des risques indisponible">
          Aucune commune évaluée à ce stade. Lancez le calcul d’exposition puis le recalcul des
          risques dans l’onglet « Opérations ».
        </AlertBanner>
      ) : null}

      {!hasExposure ? (
        <AlertBanner tone="warning" title="Exposition non calculée">
          Aucune commune exposée n’est enregistrée — les indicateurs de population ci-dessous
          reflètent donc uniquement les données réelles disponibles.
        </AlertBanner>
      ) : null}

      {!hasWeather ? (
        <AlertBanner tone="info" title="Données météo">
          Aucune observation météo rattachée aux communes exposées pour cet événement.
        </AlertBanner>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Exposition"
          description="Communes exposées et population concernée (données réelles renseignées)"
        >
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="text-2xl font-semibold text-ink">
                {formatNumber(bilan.exposedPopulation)}
              </p>
              <p className="text-xs text-muted">Population exposée</p>
            </div>
            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <p className="text-2xl font-semibold text-ink">{eventsList.length}</p>
              <p className="text-xs text-muted">Communes exposées</p>
            </div>
          </div>

          {!hasExposure ? (
            <div className="mt-4">
              <EmptyState
                title="Aucune commune exposée"
                description="Aucune commune enregistrée comme exposée pour le moment."
              />
            </div>
          ) : (
            <>
              <ul className="mt-4 max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {eventsList.map((c) => (
                  <li
                    key={c.communeId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-brand/10 bg-brand-soft/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        <MapPin className="mr-1 inline size-3.5 text-brand" />
                        {c.communeName}
                      </p>
                      <p className="text-xs text-muted">{c.districtName ?? '—'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-sm">
                      {c.exposedPopulation !== null ? (
                        <span className="text-xs text-muted">
                          {formatNumber(Number(c.exposedPopulation))} hab.
                        </span>
                      ) : null}
                      {c.riskLevel ? (
                        <Badge tone={riskTone(c.riskLevel)}>{RISK_LABELS[c.riskLevel]}</Badge>
                      ) : (
                        <Badge>Non évalué</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Répartition du risque" description="Nombre d’évaluations par niveau">
            {!hasRisks ? (
              <EmptyState
                title="Aucune évaluation"
                description="Recalculez les risques pour obtenir la répartition par niveau."
              />
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {RISK_LEVELS.map((level) => {
                  const count = bilan.riskDistribution[level] ?? 0;
                  return (
                    <div
                      key={level}
                      className="rounded-xl border border-line px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone={riskTone(level)}>{RISK_LABELS[level]}</Badge>
                        <span className="text-lg font-semibold text-ink">{count}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="col-span-2 rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-muted">
                  Total : <span className="font-semibold text-ink">{bilan.riskCount}</span>{' '}
                  évaluation(s)
                </div>
              </div>
            )}
          </Card>

          <Card title="Alertes liées" description="Alertes rattachées à l’événement">
            {!hasAlerts ? (
              <EmptyState
                title="Aucune alerte"
                description="Les alertes liées à cet événement apparaîtront ici."
              />
            ) : (
              <ul className="space-y-1.5">
                {bilan.alerts.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                      <p className="text-xs text-muted">
                        {a.publishedAt ? `Publiée ${formatDate(a.publishedAt)}` : a.status}
                      </p>
                    </div>
                    <Badge>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <AlertBanner tone="info">
        Ce bilan présente uniquement des indicateurs calculés à partir des données météo,
        d’exposition et de risque réellement enregistrées. Les pertes humaines ou matérielles
        ne sont pas suivies par la plateforme et ne sont donc jamais affichées ici.
      </AlertBanner>
    </div>
  );
}