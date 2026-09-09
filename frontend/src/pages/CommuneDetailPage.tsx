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
import type { CommuneDetail, WeatherForecastData, WeatherObservation } from '@/types';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { formatDate, formatNumber } from '@/lib/utils';

interface ChartPoint {
  date: string;
  temp: number;
  rain: number;
}

function buildChartData(forecast: WeatherForecastData): ChartPoint[] {
  const hourly = forecast.hourly;
  const days = new Map<string, { tempMax: number; rain: number }>();
  hourly.time.forEach((t, i) => {
    const day = t.slice(0, 10);
    const cur = days.get(day) ?? { tempMax: -Infinity, rain: 0 };
    const tc = hourly.temperatureC[i];
    if (tc != null) cur.tempMax = Math.max(cur.tempMax, tc);
    const pr = hourly.precipitationMm[i];
    if (pr != null) cur.rain += pr;
    days.set(day, cur);
  });
  return [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date: date.slice(5),
      temp: Number.isFinite(v.tempMax) ? Number(v.tempMax.toFixed(1)) : 0,
      rain: Number(v.rain.toFixed(1)),
    }));
}

export function CommuneDetailPage() {
  const { id = '' } = useParams();

  const communeQ = useQuery<CommuneDetail>({
    queryKey: ['commune', id],
    queryFn: () => territoriesApi.commune(id),
    enabled: Boolean(id),
  });

  const latestQ = useQuery<WeatherObservation | null>({
    queryKey: ['weather', 'latest', id],
    queryFn: () => weatherApi.latest(id),
    enabled: Boolean(id),
  });

  const forecastQ = useQuery<WeatherForecastData | null>({
    queryKey: ['weather', 'forecast', id],
    queryFn: () => weatherApi.forecast(id),
    enabled: Boolean(id),
  });

  if (communeQ.isLoading) return <Spinner />;
  if (communeQ.isError || !communeQ.data) {
    return <AlertBanner tone="danger">Impossible de charger la commune.</AlertBanner>;
  }

  const c = communeQ.data.commune;
  const latest = latestQ.data;
  const chartData = forecastQ.data ? buildChartData(forecastQ.data) : [];

  return (
    <div className="space-y-5">
      <div>
        <Link to="/territoires" className="text-sm text-brand hover:underline">
          ← Territoires
        </Link>
        <h1 className="mt-1 font-display text-3xl text-ink">{c.name}</h1>
        <p className="text-sm text-muted">
          {c.adminCode} · {communeQ.data.district?.name ?? 'District'} · pop.{' '}
          {formatNumber(c.population)}
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
            {latest?.temperatureC != null ? `${latest.temperatureC}°C` : '—'}
          </p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-muted">Précipitations</p>
          <p className="font-display text-2xl">
            {latest?.precipitationMm != null ? `${latest.precipitationMm} mm` : '—'}
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