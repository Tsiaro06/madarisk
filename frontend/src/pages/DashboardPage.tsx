import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { CloudSun, GitCompare, Radio, Siren } from 'lucide-react';
import { dashboardApi, weatherApi } from '@/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { SEVERITY_LABELS, SEVERITY_TONE } from '@/lib/eventMeta';
import { canManageImports } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatNumber } from '@/lib/utils';
import type { SeverityLevel } from '@/types';

function syncStatusLabel(status?: string): string {
  if (status === 'FRESH') return 'Fraîches';
  if (status === 'STALE') return 'Périmées';
  if (status === 'NEVER') return 'Jamais synchronisées';
  return 'Indisponibles';
}

function syncTone(status?: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'FRESH') return 'success';
  if (status === 'STALE') return 'warning';
  if (status === 'NEVER') return 'danger';
  return 'neutral';
}

export function DashboardPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canSeeMatchings = canManageImports(role);

  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => dashboardApi.summary(),
  });
  const timelineQ = useQuery({
    queryKey: ['dashboard', 'timeline'],
    queryFn: () => dashboardApi.eventsTimeline(),
  });
  const monitoringQ = useQuery({
    queryKey: ['weather', 'monitoring', 'dashboard'],
    queryFn: () => weatherApi.monitoring(),
    staleTime: 60_000,
  });

  if (summaryQ.isLoading) return <Spinner />;

  const s = summaryQ.data;
  const queriesWithError = [summaryQ, timelineQ, monitoringQ].filter((q) => q.isError);
  const lastUpdatedAt = s?.lastUpdatedAt;
  const staleMinutes =
    typeof lastUpdatedAt === 'string'
      ? Math.max(0, Math.round((Date.now() - new Date(lastUpdatedAt).getTime()) / 60_000))
      : null;

  const kpis: {
    label: string;
    value: string | number | null | undefined;
    hint?: string;
  }[] = [
    {
      label: 'Événements actifs',
      value: s?.activeEvents,
      hint: 'Actifs ou suivis',
    },
    { label: 'Prévisions', value: s?.forecastEvents, hint: 'À surveiller' },
    { label: 'Alertes actives', value: s?.activeAlerts },
    { label: 'Districts couverts', value: s?.totalDistricts },
    { label: 'Communes suivies', value: s?.totalCommunes },
    { label: 'Population exposée', value: s?.exposedPopulation },
  ];

  const latestAlerts = s?.latestAlerts ?? [];
  const obs = monitoringQ.data?.sync.observations;
  const obsSource =
    monitoringQ.data?.sources.find((src) => src.isActive) ?? monitoringQ.data?.sources[0];

  const timeline = (timelineQ.data ?? []).map((e) => ({
    date: e.date.slice(0, 10),
    total: e.total,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted">
          Vue opérationnelle nationale · mise à jour {formatDate(s?.lastUpdatedAt)}
        </p>
      </div>

      {queriesWithError.length > 0 ? (
        <AlertBanner tone="danger" title="Chargement partiel">
          Certaines données du tableau de bord n&apos;ont pas pu être chargées (
          {queriesWithError.length} section(s) en erreur). Rechargez la page ou réessayez plus tard.
        </AlertBanner>
      ) : null}

      {staleMinutes !== null && staleMinutes > 30 ? (
        <AlertBanner tone="warning" title="Données potentiellement périmées">
          Dernière mise à jour des données opérationnelles il y a {staleMinutes} min — lancez un
          rafraîchissement si nécessaire.
        </AlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label} className="!p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{k.label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-brand">
              {typeof k.value === 'number' ? formatNumber(k.value) : (k.value ?? '—')}
            </p>
            {k.hint ? <p className="mt-1 text-xs text-muted">{k.hint}</p> : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          title="Dernières alertes publiées"
          description="Alertes en cours sur l’ensemble du territoire"
          className="lg:col-span-2"
          actions={
            <Link to="/alertes" className="text-sm font-medium text-brand hover:underline">
              Voir toutes les alertes →
            </Link>
          }
        >
          {latestAlerts.length === 0 ? (
            <EmptyState
              title="Aucune alerte publiée"
              description="Les alertes opérationnelles publiées apparaîtront ici."
              icon={<Siren className="size-6" />}
              className="py-8"
            />
          ) : (
            <ul className="space-y-2">
              {latestAlerts.map((a) => {
                const severity = a.severity as SeverityLevel;
                const label = SEVERITY_LABELS[severity] ?? a.severity;
                const tone = SEVERITY_TONE[severity] ?? 'neutral';
                return (
                  <li
                    key={a.id}
                    className="flex items-start gap-3 rounded-xl border border-line bg-white p-3"
                  >
                    <Badge tone={tone}>{label}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {a.type}
                        {a.publishedAt ? ` · ${formatDate(a.publishedAt)}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card
            title="État de la météo"
            description={obsSource?.name ?? 'Source météo'}
            actions={
              <Link to="/meteo" className="text-sm font-medium text-brand hover:underline">
                Carte météo →
              </Link>
            }
          >
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted">
                  <CloudSun className="size-4" /> Observations
                </dt>
                <dd>
                  <Badge tone={syncTone(obs?.status)}>{syncStatusLabel(obs?.status)}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Communes avec données</dt>
                <dd className="font-medium text-ink">
                  {obs?.communesData != null
                    ? `${formatNumber(obs.communesData)}${s?.totalCommunes != null ? ` / ${formatNumber(s.totalCommunes)}` : ''}`
                    : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Dernière donnée</dt>
                <dd className="font-medium text-ink">
                  {obs?.lastDataAt ? formatDate(obs.lastDataAt) : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          {canSeeMatchings ? (
            <Card
              title="Correspondances en attente"
              description="Rapprochements de territoires à valider"
              actions={
                <Link to="/matching" className="text-sm font-medium text-brand hover:underline">
                  Traiter →
                </Link>
              }
            >
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand-deep">
                  <GitCompare className="size-5" />
                </span>
                <div>
                  <p className="text-3xl font-bold tracking-tight text-brand">
                    {formatNumber(s?.pendingMatchings ?? 0)}
                  </p>
                  <p className="text-xs text-muted">en attente de validation</p>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Card
        title="Chronologie des événements"
        description="Volume quotidien sur les 30 derniers jours"
      >
        {timeline.length === 0 ? (
          <EmptyState
            title="Aucun événement enregistré"
            description="La chronologie des événements apparaîtra ici."
            icon={<Radio className="size-6" />}
            className="py-8"
          />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Événements"
                  stroke="#3d7a9a"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
