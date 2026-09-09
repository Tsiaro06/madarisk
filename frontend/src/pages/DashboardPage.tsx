import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from 'recharts';
import { Link } from 'react-router-dom';
import { dashboardApi, eventsApi, risksApi } from '@/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { GeoJsonMap } from '@/components/maps/GeoJsonMap';
import { formatDate, formatNumber } from '@/lib/utils';
import { useCrisisStore } from '@/stores/crisisStore';
import { RISK_LABELS, type EventListItem, type RiskLevel } from '@/types';

function riskTone(level: RiskLevel) {
  if (level === 'EXTREME') return 'danger' as const;
  if (level === 'ELEVE') return 'warning' as const;
  if (level === 'MODERE') return 'info' as const;
  return 'success' as const;
}

export function DashboardPage() {
  const activeEventId = useCrisisStore((s) => s.activeEventId);
  const setActiveEventId = useCrisisStore((s) => s.setActiveEventId);
  const scope = activeEventId || 'global';
  const scoped = Boolean(activeEventId);

  const eventsQ = useQuery({
    queryKey: ['events', 'options'],
    queryFn: () => eventsApi.list({ limit: 100 }),
    staleTime: 60_000,
  });

  const activeEventQ = useQuery({
    queryKey: ['events', 'detail', activeEventId],
    queryFn: () => (activeEventId ? (eventsApi.get(activeEventId) as Promise<EventListItem>) : null),
    enabled: Boolean(activeEventId),
  });

  const summaryParams = scoped ? { eventId: activeEventId as string } : undefined;
  const summaryQ = useQuery({
    queryKey: ['dashboard', 'summary', scope],
    queryFn: () => dashboardApi.summary(summaryParams),
  });
  const distQ = useQuery({
    queryKey: ['dashboard', 'risk-distribution', scope],
    queryFn: () => dashboardApi.riskDistribution(summaryParams),
  });
  const timelineQ = useQuery({
    queryKey: ['dashboard', 'timeline', scope],
    queryFn: () => dashboardApi.eventsTimeline(summaryParams),
  });
  const priorityQ = useQuery({
    queryKey: ['dashboard', 'priority', scope],
    queryFn: () => dashboardApi.priorityCommunes(10, activeEventId ?? undefined),
  });
  const mapQ = useQuery({
    queryKey: ['risks', 'map-layer', scope],
    queryFn: () => risksApi.mapLayer(scoped ? { eventId: activeEventId as string } : {}),
  });

  if (summaryQ.isLoading) return <Spinner />;

  const s = summaryQ.data;
  const activeEvent = scoped ? (activeEventQ.data ?? null) : null;
  const kpis: { label: string; value: string | number | null | undefined }[] = [
    scoped
      ? { label: 'Événement', value: activeEvent?.name ?? '—' }
      : { label: 'Événements actifs', value: s?.activeEvents },
    scoped
      ? { label: 'Statut', value: activeEvent?.status ?? '—' }
      : { label: 'Prévisions', value: s?.forecastEvents },
    { label: 'Alertes actives', value: s?.activeAlerts },
    { label: 'Communes extrêmes', value: s?.extremeRiskCommunes },
    { label: 'Risque élevé', value: s?.highRiskCommunes },
    { label: 'Population exposée', value: s?.exposedPopulation },
  ];

  const distData = distQ.data
    ? (Object.entries(distQ.data) as [string, number][]).map(([k, v]) => ({
        niveau: k === 'SANS_RISQUE' ? 'Sans risque' : RISK_LABELS[k as RiskLevel] ?? k,
        count: v,
      }))
    : [];

  const timeline = (timelineQ.data ?? []).map((e) => ({
    date: e.date.slice(0, 10),
    total: e.total,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Tableau de bord</h1>
        <p className="text-sm text-muted">
          Vue d&apos;ensemble{scoped ? ` · événement ${activeEvent?.name ?? ''}` : ''} · mise à jour{' '}
          {formatDate(s?.lastUpdatedAt)}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xs">
          <Select
            label="Événement affiché"
            value={activeEventId ?? ''}
            onChange={(e) => setActiveEventId(e.target.value || null)}
            options={[
              { value: '', label: 'Tous (global)' },
              ...(eventsQ.data?.data ?? []).map((ev) => ({
                value: ev.id,
                label: `${ev.eventCode} · ${ev.name}`,
              })),
            ]}
          />
        </div>
        {scoped ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Badge tone={activeEvent?.status === 'ACTIF' ? 'danger' : 'info'}>
              {activeEvent?.status ?? ''}
            </Badge>
            Ce tableau ne montre que les données de cet événement.
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label} className="!p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{k.label}</p>
            <p className="mt-1 font-display text-3xl text-brand">
              {typeof k.value === 'number' ? formatNumber(k.value) : (k.value ?? '—')}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card
          title={scoped ? 'Répartition des risques' : 'Distribution des risques'}
          description={scoped ? 'Communes de l’événement par niveau' : 'Répartition des communes'}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e5" />
                <XAxis dataKey="niveau" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Communes" fill="#0a6b6e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title={scoped ? 'Évolution du risque' : 'Chronologie des événements'}
          description={scoped ? 'Évaluations de risque par jour' : 'Volume quotidien'}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e5" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#c45c26" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Communes prioritaires">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-brand/10 text-muted">
              <tr>
                <th className="px-2 py-2 font-medium">Commune</th>
                <th className="px-2 py-2 font-medium">District</th>
                <th className="px-2 py-2 font-medium">Score</th>
                <th className="px-2 py-2 font-medium">Niveau</th>
                <th className="px-2 py-2 font-medium">Population</th>
              </tr>
            </thead>
            <tbody>
              {(priorityQ.data ?? s?.priorityCommunes ?? []).map((c) => (
                <tr key={c.communeId} className="border-b border-brand/5 hover:bg-brand-soft/40">
                  <td className="px-2 py-2">
                    <Link className="font-medium text-brand hover:underline" to={`/territoires/communes/${c.communeId}`}>
                      {c.communeName}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{c.districtName}</td>
                  <td className="px-2 py-2">{formatNumber(c.riskScore)}</td>
                  <td className="px-2 py-2">
                    <Badge tone={riskTone(c.riskLevel)}>{RISK_LABELS[c.riskLevel]}</Badge>
                  </td>
                  <td className="px-2 py-2">{formatNumber(c.population)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Carte des risques" description="Couche risques communales">
        {mapQ.isLoading ? <Spinner /> : <GeoJsonMap data={mapQ.data} height={460} />}
      </Card>
    </div>
  );
}
