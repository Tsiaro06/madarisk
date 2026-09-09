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
import { dashboardApi, risksApi } from '@/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { GeoJsonMap } from '@/components/maps/GeoJsonMap';
import { formatDate, formatNumber } from '@/lib/utils';
import { RISK_LABELS, type RiskLevel } from '@/types';

function riskTone(level: RiskLevel) {
  if (level === 'EXTREME') return 'danger' as const;
  if (level === 'ELEVE') return 'warning' as const;
  if (level === 'MODERE') return 'info' as const;
  return 'success' as const;
}

export function DashboardPage() {
  const summaryQ = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => dashboardApi.summary() });
  const distQ = useQuery({
    queryKey: ['dashboard', 'risk-distribution'],
    queryFn: () => dashboardApi.riskDistribution(),
  });
  const timelineQ = useQuery({
    queryKey: ['dashboard', 'timeline'],
    queryFn: () => dashboardApi.eventsTimeline(),
  });
  const priorityQ = useQuery({
    queryKey: ['dashboard', 'priority'],
    queryFn: () => dashboardApi.priorityCommunes(10),
  });
  const mapQ = useQuery({
    queryKey: ['risks', 'map-layer'],
    queryFn: () => risksApi.mapLayer(),
  });

  if (summaryQ.isLoading) return <Spinner />;

  const s = summaryQ.data;
  const kpis = [
    { label: 'Événements actifs', value: s?.activeEvents },
    { label: 'Prévisions', value: s?.forecastEvents },
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
          Vue d&apos;ensemble · mise à jour {formatDate(s?.lastUpdatedAt)}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label} className="!p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{k.label}</p>
            <p className="mt-1 font-display text-3xl text-brand">{formatNumber(k.value)}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Distribution des risques" description="Répartition des communes">
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

        <Card title="Chronologie des événements" description="Volume quotidien">
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
