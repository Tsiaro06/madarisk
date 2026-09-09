import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { territoriesApi, weatherApi } from '@/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { formatDate, formatNumber } from '@/lib/utils';

interface CommuneDetail {
  id: string;
  name: string;
  adminCode: string;
  population?: number | null;
  vulnerabilityScore?: number | null;
  districtName?: string;
  districtId?: string;
  postalCode?: string | null;
}

interface WeatherLatest {
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  precipitation?: number | null;
  observedAt?: string;
  [key: string]: unknown;
}

interface ForecastPoint {
  date?: string;
  forecastAt?: string;
  temperature?: number | null;
  tempMax?: number | null;
  tempMin?: number | null;
  precipitation?: number | null;
  [key: string]: unknown;
}

export function CommuneDetailPage() {
  const { id = '' } = useParams();

  const communeQ = useQuery({
    queryKey: ['commune', id],
    queryFn: () => territoriesApi.commune(id) as Promise<CommuneDetail>,
    enabled: Boolean(id),
  });

  const latestQ = useQuery({
    queryKey: ['weather', 'latest', id],
    queryFn: () => weatherApi.latest(id) as Promise<WeatherLatest>,
    enabled: Boolean(id),
  });

  const forecastQ = useQuery({
    queryKey: ['weather', 'forecast', id],
    queryFn: () => weatherApi.forecast(id) as Promise<ForecastPoint[] | { items?: ForecastPoint[] }>,
    enabled: Boolean(id),
  });

  if (communeQ.isLoading) return <Spinner />;
  if (communeQ.isError || !communeQ.data) {
    return <AlertBanner tone="danger">Impossible de charger la commune.</AlertBanner>;
  }

  const c = communeQ.data;
  const latest = latestQ.data;
  const rawForecast = forecastQ.data;
  const forecastArr = Array.isArray(rawForecast)
    ? rawForecast
    : (rawForecast?.items ?? []);
  const chartData = forecastArr.map((p) => ({
    date: String(p.date ?? p.forecastAt ?? '').slice(0, 10),
    temp: Number(p.temperature ?? p.tempMax ?? 0),
    rain: Number(p.precipitation ?? 0),
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link to="/territoires" className="text-sm text-brand hover:underline">
          ← Territoires
        </Link>
        <h1 className="mt-1 font-display text-3xl text-ink">{c.name}</h1>
        <p className="text-sm text-muted">
          {c.adminCode} · {c.districtName ?? 'District'} · pop. {formatNumber(c.population)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="!p-4">
          <p className="text-xs text-muted">Vulnérabilité</p>
          <p className="font-display text-2xl">{formatNumber(c.vulnerabilityScore)}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-muted">Température</p>
          <p className="font-display text-2xl">
            {latest?.temperature != null ? `${latest.temperature}°C` : '—'}
          </p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-muted">Précipitations</p>
          <p className="font-display text-2xl">
            {latest?.precipitation != null ? `${latest.precipitation} mm` : '—'}
          </p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-muted">Observé le</p>
          <p className="font-display text-lg">{formatDate(latest?.observedAt)}</p>
        </Card>
      </div>

      <Card title="Prévisions météo">
        {forecastQ.isLoading ? (
          <Spinner />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted">Aucune prévision disponible.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e5" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="temp" name="Temp (°C)" stroke="#0a6b6e" />
                <Line yAxisId="right" type="monotone" dataKey="rain" name="Pluie (mm)" stroke="#c45c26" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
