import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  CloudSun,
  Droplets,
  ExternalLink,
  FileDown,
  Gauge,
  MapPin,
  MousePointerClick,
  RefreshCw,
  Thermometer,
  Wind,
  X,
} from 'lucide-react';
import { risksApi, weatherApi, reportsApi } from '@/api';
import { ApiClientError } from '@/api/client';
import type {
  CommuneDetail,
  EventStatus,
  EventType,
  RiskAssessment,
  RiskPhase,
  WeatherForecastData,
  WeatherObservation,
} from '@/types';
import { RISK_COLORS, RISK_LABELS } from '@/types';
import {
  EVENT_STATUS_LABELS,
  EVENT_STATUS_TONE,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_TONE,
  PHASES,
  PHASE_LABELS,
} from '@/lib/eventMeta';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatNumber } from '@/lib/utils';

interface RightPanelProps {
  communeId: string | null;
  detail: CommuneDetail | null;
  detailLoading: boolean;
  onClose: () => void;
  onSelectEvent: (id: string) => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ForecastDay {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precip: number | null;
}

function buildForecastDays(forecast: WeatherForecastData | null | undefined): ForecastDay[] {
  if (!forecast) return [];
  const days = new Map<string, { tempMax: number; tempMin: number; precip: number }>();
  forecast.hourly.time.forEach((t, i) => {
    const day = t.slice(0, 10);
    const cur = days.get(day) ?? { tempMax: -Infinity, tempMin: Infinity, precip: 0 };
    const tc = forecast.hourly.temperatureC[i];
    const pr = forecast.hourly.precipitationMm[i];
    if (tc != null) {
      if (tc > cur.tempMax) cur.tempMax = tc;
      if (tc < cur.tempMin) cur.tempMin = tc;
    }
    if (pr != null) cur.precip += pr;
    days.set(day, cur);
  });
  return [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date: date.slice(5),
      tempMax: Number.isFinite(d.tempMax) ? Number(d.tempMax.toFixed(1)) : null,
      tempMin: Number.isFinite(d.tempMin) ? Number(d.tempMin.toFixed(1)) : null,
      precip: Number(d.precip.toFixed(1)),
    }));
}

function StatItem({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="rounded-lg border border-brand/10 bg-brand-soft/30 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">
        {value == null || value === '' ? '—' : `${value}${unit ? ` ${unit}` : ''}`}
      </p>
    </div>
  );
}

interface FactorBarProps {
  label: string;
  value: number;
  color: string;
}

function FactorBar({ label, value, color }: FactorBarProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-ink">{formatNumber(Math.round(value))}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand/10">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
      </div>
    </div>
  );
}

export function RightPanel({ communeId, detail, detailLoading, onClose, onSelectEvent }: RightPanelProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canOps = canManageOps(role);
  const [recalcPhase, setRecalcPhase] = useState<RiskPhase>('PENDANT');

  const latestQ = useQuery<WeatherObservation | null>({
    queryKey: ['weather', 'latest', communeId],
    queryFn: async () => {
      if (!communeId) return null;
      try {
        return await weatherApi.latest(communeId);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(communeId),
  });

  const forecastQ = useQuery<WeatherForecastData | null>({
    queryKey: ['weather', 'forecast', communeId],
    queryFn: async () => {
      if (!communeId) return null;
      try {
        return await weatherApi.forecast(communeId);
      } catch (err) {
        if (err instanceof ApiClientError && (err.status === 502 || err.status === 503)) return null;
        throw err;
      }
    },
    enabled: Boolean(communeId),
  });

  const riskQ = useQuery<RiskAssessment | null>({
    queryKey: ['risks-commune', communeId],
    queryFn: () => (communeId ? risksApi.commune(communeId, { latest: true }) : null),
    enabled: Boolean(communeId),
  });

  const refreshM = useMutation({
    mutationFn: () => weatherApi.refresh({ communeIds: [communeId] }),
    onSuccess: () => {
      toast('Données météo actualisées', 'success');
      void qc.invalidateQueries({ queryKey: ['weather', 'latest', communeId] });
      void qc.invalidateQueries({ queryKey: ['weather', 'forecast', communeId] });
      void qc.invalidateQueries({ queryKey: ['commune-detail', communeId] });
      void qc.invalidateQueries({ queryKey: ['weather', 'map-layer'] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur météo', 'error'),
  });

  const recalcM = useMutation({
    mutationFn: () => risksApi.recalculate({ phase: recalcPhase, communeIds: [communeId] }),
    onSuccess: () => {
      toast('Risque recalculé', 'success');
      void qc.invalidateQueries({ queryKey: ['risks-commune', communeId] });
      void qc.invalidateQueries({ queryKey: ['commune-detail', communeId] });
      void qc.invalidateQueries({ queryKey: ['risks', 'map-layer'] });
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur recalcul', 'error'),
  });

  const exportM = useMutation({
    mutationFn: () =>
      reportsApi.exportCsv({ resourceType: 'communes', communeId: communeId ?? '' }),
    onSuccess: () => {
      toast('Export CSV généré', 'success');
      downloadBlob(exportM.data ?? new Blob(), `commune-${communeId ?? ''}.csv`);
    },
    onError: (err) => toast(err instanceof ApiClientError ? err.message : 'Erreur export', 'error'),
  });

  if (!communeId) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader onClose={onClose}>
          <p className="font-display text-base text-ink">Détails commune</p>
        </PanelHeader>
        <EmptyState
          className="m-3 flex-1"
          icon={<MousePointerClick className="size-6" />}
          title="Sélectionnez une commune"
          description="Cliquez sur une commune sur la carte ou cherchez-la dans le panneau de gauche pour voir ses détails."
        />
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader onClose={onClose}>
          <p className="font-display text-base text-ink">Détails commune</p>
        </PanelHeader>
        <Spinner label="Chargement de la commune…" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader onClose={onClose}>
          <p className="font-display text-base text-ink">Détails commune</p>
        </PanelHeader>
        <EmptyState className="m-3 flex-1" title="Commune introuvable" />
      </div>
    );
  }

  const c = detail.commune;
  const latest = latestQ.data;
  const forecast = forecastQ.data;
  const forecastDays = buildForecastDays(forecast);
  const risk = riskQ.data;
  const riskLevel = risk?.riskLevel ?? detail.risk?.riskLevel;

  const weatherMetrics = latest
    ? [
        { label: 'Température', value: latest.temperatureC, unit: '°C', icon: <Thermometer className="size-4 text-accent" /> },
        { label: 'Pluie', value: latest.precipitationMm, unit: 'mm', icon: <Droplets className="size-4 text-brand" /> },
        { label: 'Pluie 24h', value: latest.rainfall24hMm, unit: 'mm', icon: <Droplets className="size-4 text-accent" /> },
        { label: 'Vent', value: latest.windSpeedKmh, unit: 'km/h', icon: <Wind className="size-4 text-brand" /> },
        { label: 'Humidité', value: latest.humidityPercent, unit: '%', icon: <Gauge className="size-4 text-brand" /> },
        { label: 'Pression', value: latest.pressureHpa, unit: 'hPa', icon: <Gauge className="size-4 text-accent" /> },
      ]
    : [];

  return (
    <div className="flex h-full flex-col">
      <PanelHeader onClose={onClose}>
        <div className="min-w-0">
          <p className="truncate font-display text-base text-ink leading-tight">{c.name}</p>
          <p className="text-xs text-muted">
            {c.adminCode}
            {detail.district ? ` · ${detail.district.name}` : ''}
          </p>
        </div>
      </PanelHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* En-tête risque */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/15 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span
              className="size-3.5 rounded-full ring-2 ring-white/60"
              style={{ background: riskLevel ? RISK_COLORS[riskLevel] : '#94a3b8' }}
            />
            <div>
              <p className="text-xs text-muted">Risque actuel</p>
              <p className="text-lg font-semibold text-ink" style={{ color: riskLevel ? RISK_COLORS[riskLevel] : undefined }}>
                {riskLevel ? RISK_LABELS[riskLevel] : 'Non évalué'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Score</p>
            <p className="font-display text-xl text-ink">{formatNumber(risk?.riskScore ?? detail.risk?.riskScore)}</p>
          </div>
        </div>

        {/* Résumé */}
        <Card className="!p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatItem label="Population" value={formatNumber(c.population)} />
            <StatItem label="Événements liés" value={detail.events.length} />
            <StatItem label="Vulnérabilité" value={formatNumber(c.vulnerabilityScore)} />
          </div>
        </Card>

        {/* Météo */}
        <Card
          title="Météo"
          actions={
            canOps ? (
              <Button size="sm" variant="secondary" onClick={() => refreshM.mutate()} loading={refreshM.isPending}>
                <RefreshCw className="size-3.5" /> Rafraîchir
              </Button>
            ) : null
          }
          className="!p-4"
        >
          {latestQ.isLoading || forecastQ.isLoading ? (
            <Spinner label="Chargement météo…" />
          ) : latest ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {weatherMetrics.map((m) => (
                  <StatItem key={m.label} label={m.label} value={m.value} unit={m.unit} />
                ))}
              </div>
              <p className="mt-2 text-right text-[11px] text-muted">
                Observé le {formatDate(latest.observedAt)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              <CloudSun className="mr-1 inline size-4" />
              Aucune observation météo enregistrée pour cette commune.
            </p>
          )}

          {forecastDays.length > 0 ? (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Prévisions (température / précipitations)
              </p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={forecastDays} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e5" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="temp" tick={{ fontSize: 10 }} domain={['auto', 'auto']} width={26} />
                    <YAxis yAxisId="precip" orientation="right" tick={{ fontSize: 10 }} width={26} />
                    <Tooltip />
                    <Bar
                      yAxisId="precip"
                      dataKey="precip"
                      name="Précip. (mm)"
                      fill="#4aa8ba"
                      radius={[3, 3, 0, 0]}
                      barSize={14}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="tempMax"
                      name="Max °C"
                      stroke="#0a6b6e"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="temp"
                      type="monotone"
                      dataKey="tempMin"
                      name="Min °C"
                      stroke="#c45c26"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {forecast && <p className="mt-1 text-right text-[11px] text-muted">Fuseau {forecast.timezone}</p>}
            </div>
          ) : forecast ? null : null}
        </Card>

        {/* Risque détaillé */}
        <Card title="Évaluation du risque" className="!p-4">
          {riskQ.isLoading ? (
            <Spinner label="Chargement du risque…" />
          ) : risk ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">Phase : {PHASE_LABELS[risk.phase] ?? risk.phase}</Badge>
                <span className="text-[11px] text-muted">
                  Évalué le {formatDate(risk.assessedAt)} · modèle {risk.modelVersion}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <FactorBar label="Pluie" value={risk.factors.rainScore} color="#2F9E44" />
                <FactorBar label="Vent" value={risk.factors.windScore} color="#4aa8ba" />
                <FactorBar label="Proximité" value={risk.factors.proximityScore} color="#F08C00" />
                <FactorBar label="Vulnérabilité" value={risk.factors.vulnerabilityScore} color="#7048e8" />
                <FactorBar label="Exposition" value={risk.factors.exposureScore} color="#E03131" />
              </div>
              {risk.explanation.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {risk.explanation.map((line, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
                      <ArrowRight className="mt-0.5 size-3 shrink-0 text-brand" />
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <AlertTriangle className="size-4" />
              Aucune évaluation de risque enregistrée.
            </p>
          )}
          {canOps ? (
            <div className="mt-3 flex items-end gap-2 border-t border-brand/10 pt-3">
              <Select
                label="Phase"
                value={recalcPhase}
                onChange={(e) => setRecalcPhase(e.target.value as RiskPhase)}
                options={PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))}
                className="flex-1 [&>select]:h-9"
              />
              <Button size="sm" variant="outline" onClick={() => recalcM.mutate()} loading={recalcM.isPending}>
                Recalculer
              </Button>
            </div>
          ) : null}
        </Card>

        {/* Événements liés */}
        <Card title="Événements liés" className="!p-4">
          {detail.events.length === 0 ? (
            <p className="text-sm text-muted">Aucun événement ne touche cette commune pour l’instant.</p>
          ) : (
            <ul className="space-y-2">
              {detail.events.map((ev) => (
                <li key={ev.id} className="rounded-lg border border-brand/10 bg-brand-soft/20 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-brand">{ev.eventCode}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onSelectEvent(ev.id)}>
                        <MapPin className="size-3.5" /> Activer
                      </Button>
                      <Link to={`/evenements/${ev.id}`}>
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="size-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-ink">{ev.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={EVENT_STATUS_TONE[ev.status as EventStatus]}>
                      {EVENT_STATUS_LABELS[ev.status as EventStatus] ?? ev.status}
                    </Badge>
                    <Badge tone={EVENT_TYPE_TONE[ev.type as EventType]}>
                      {EVENT_TYPE_LABELS[ev.type as EventType] ?? ev.type}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Actions */}
        <div className="grid grid-cols-1 gap-2 border-t border-brand/10 pt-3">
          <Link to={`/territoires/communes/${c.id}`}>
            <Button variant="secondary" className="w-full">
              <ExternalLink className="size-4" /> Fiche complète de la commune
            </Button>
          </Link>
          <Button variant="outline" onClick={() => exportM.mutate()} loading={exportM.isPending}>
            <FileDown className="size-4" /> Exporter en CSV
          </Button>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-brand/10 px-3 py-2.5">
      {children}
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1.5 text-muted hover:bg-brand-soft"
        aria-label="Fermer le panneau détails"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}