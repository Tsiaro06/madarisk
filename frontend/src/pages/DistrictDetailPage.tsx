import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { territoriesApi } from '@/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { GeoJsonMap } from '@/components/maps/GeoJsonMap';
import { formatNumber } from '@/lib/utils';

interface DistrictDetail {
  id: string;
  adminCode: string;
  name: string;
  population?: number | null;
  vulnerabilityScore?: number | null;
  totalCommunes?: number;
  communesAtRisk?: number;
  [key: string]: unknown;
}

export function DistrictDetailPage() {
  const { id = '' } = useParams();

  const detailQ = useQuery({
    queryKey: ['district', id],
    queryFn: () => territoriesApi.district(id) as Promise<DistrictDetail>,
    enabled: Boolean(id),
  });

  const communesQ = useQuery({
    queryKey: ['district', id, 'communes'],
    queryFn: () => territoriesApi.communes({ districtId: id, page: 1, limit: 50 }),
    enabled: Boolean(id),
  });

  const mapQ = useQuery({
    queryKey: ['district', id, 'map'],
    queryFn: () => territoriesApi.mapCommunes({ districtId: id }),
    enabled: Boolean(id),
  });

  if (detailQ.isLoading) return <Spinner />;
  if (detailQ.isError || !detailQ.data) {
    return <AlertBanner tone="danger">District introuvable.</AlertBanner>;
  }

  const d = detailQ.data;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/territoires" className="text-sm text-brand hover:underline">
          ← Territoires
        </Link>
        <h1 className="mt-1 font-display text-3xl text-ink">{d.name}</h1>
        <p className="text-sm text-muted">Code {d.adminCode}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="!p-4">
          <p className="text-xs uppercase text-muted">Population</p>
          <p className="font-display text-2xl text-brand">{formatNumber(d.population)}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs uppercase text-muted">Communes</p>
          <p className="font-display text-2xl text-brand">
            {formatNumber(d.totalCommunes ?? communesQ.data?.meta?.total)}
          </p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs uppercase text-muted">À risque</p>
          <p className="font-display text-2xl text-accent">
            {formatNumber((d.communesAtRisk as number | undefined) ?? null)}
          </p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Communes du district">
          {communesQ.isLoading ? (
            <Spinner />
          ) : (
            <ul className="divide-y divide-brand/10 text-sm">
              {(communesQ.data?.data ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <Link className="font-medium text-brand hover:underline" to={`/territoires/communes/${c.id}`}>
                    {c.name}
                  </Link>
                  <span className="text-muted">{formatNumber(c.population)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Carte">
          {mapQ.isLoading ? <Spinner /> : <GeoJsonMap data={mapQ.data} height={420} />}
        </Card>
      </div>
    </div>
  );
}
