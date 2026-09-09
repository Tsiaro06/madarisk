import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { territoriesApi, weatherApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatNumber } from '@/lib/utils';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';

interface WeatherLatest {
  temperature?: number | null;
  humidity?: number | null;
  windSpeed?: number | null;
  precipitation?: number | null;
  observedAt?: string;
}

interface ForecastPoint {
  date?: string;
  forecastAt?: string;
  temperature?: number | null;
  tempMax?: number | null;
  precipitation?: number | null;
}

export function MeteoPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const [communeId, setCommuneId] = useState('');

  const communesQ = useQuery({
    queryKey: ['territories', 'communes-select'],
    queryFn: () => territoriesApi.communes({ page: 1, limit: 100 }),
  });

  const latestQ = useQuery({
    queryKey: ['weather', 'latest', communeId],
    queryFn: () => weatherApi.latest(communeId) as Promise<WeatherLatest>,
    enabled: Boolean(communeId),
  });

  const forecastQ = useQuery({
    queryKey: ['weather', 'forecast', communeId],
    queryFn: () =>
      weatherApi.forecast(communeId) as Promise<ForecastPoint[] | { items?: ForecastPoint[] }>,
    enabled: Boolean(communeId),
  });

  const refreshM = useMutation({
    mutationFn: () => weatherApi.refresh({ communeIds: communeId ? [communeId] : [] }),
    onSuccess: () => {
      toast('Rafraîchissement météo lancé', 'success');
      void qc.invalidateQueries({ queryKey: ['weather'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur refresh';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const raw = forecastQ.data;
  const forecast = Array.isArray(raw) ? raw : (raw?.items ?? []);
  const chartData = forecast.map((p) => ({
    date: String(p.date ?? p.forecastAt ?? '').slice(0, 10),
    temp: Number(p.temperature ?? p.tempMax ?? 0),
    rain: Number(p.precipitation ?? 0),
  }));

  const options =
    communesQ.data?.data.map((c) => ({
      value: c.id,
      label: `${c.name} (${c.districtName})`,
    })) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Météo</h1>
          <p className="text-sm text-muted">Observations et prévisions par commune</p>
        </div>
        {canManageOps(role) ? (
          <Button
            variant="outline"
            disabled={!communeId}
            loading={refreshM.isPending}
            onClick={() => refreshM.mutate()}
          >
            Rafraîchir
          </Button>
        ) : null}
      </div>

      <div className="max-w-md">
        <Select
          label="Commune"
          placeholder="Sélectionner…"
          value={communeId}
          onChange={(e) => setCommuneId(e.target.value)}
          options={options}
        />
      </div>

      {!communeId ? (
        <EmptyState title="Choisissez une commune" description="Les données météo s’afficheront ici." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {latestQ.isLoading ? (
              <Spinner className="sm:col-span-2 lg:col-span-4" />
            ) : (
              <>
                <Card className="!p-4">
                  <p className="text-xs text-muted">Température</p>
                  <p className="font-display text-2xl">
                    {latestQ.data?.temperature != null ? `${latestQ.data.temperature}°C` : '—'}
                  </p>
                </Card>
                <Card className="!p-4">
                  <p className="text-xs text-muted">Humidité</p>
                  <p className="font-display text-2xl">
                    {latestQ.data?.humidity != null ? `${latestQ.data.humidity}%` : '—'}
                  </p>
                </Card>
                <Card className="!p-4">
                  <p className="text-xs text-muted">Vent</p>
                  <p className="font-display text-2xl">
                    {latestQ.data?.windSpeed != null ? `${formatNumber(latestQ.data.windSpeed)} km/h` : '—'}
                  </p>
                </Card>
                <Card className="!p-4">
                  <p className="text-xs text-muted">Observé</p>
                  <p className="font-display text-lg">{formatDate(latestQ.data?.observedAt)}</p>
                </Card>
              </>
            )}
          </div>

          <Card title="Prévisions">
            {forecastQ.isLoading ? (
              <Spinner />
            ) : chartData.length === 0 ? (
              <EmptyState title="Pas de prévisions" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d5e4e5" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="temp" name="Temp (°C)" stroke="#0a6b6e" />
                    <Line type="monotone" dataKey="rain" name="Pluie (mm)" stroke="#c45c26" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
