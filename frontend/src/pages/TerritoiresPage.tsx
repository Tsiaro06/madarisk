import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { territoriesApi } from '@/api';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { GeoJsonMap } from '@/components/maps/GeoJsonMap';
import { formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Tab = 'districts' | 'communes';

export function TerritoiresPage() {
  const [tab, setTab] = useState<Tab>('communes');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const districtsQ = useQuery({
    queryKey: ['territories', 'districts', page, q],
    queryFn: () => territoriesApi.districts({ page, limit: 15, search: q || undefined }),
    enabled: tab === 'districts',
  });

  const communesQ = useQuery({
    queryKey: ['territories', 'communes', page, q],
    queryFn: () => territoriesApi.communes({ page, limit: 15, search: q || undefined }),
    enabled: tab === 'communes',
  });

  const mapQ = useQuery({
    queryKey: ['territories', 'map-communes', q],
    queryFn: () => territoriesApi.mapCommunes({ search: q || undefined }),
    enabled: tab === 'communes',
  });

  const meta = tab === 'districts' ? districtsQ.data?.meta : communesQ.data?.meta;
  const loading = tab === 'districts' ? districtsQ.isLoading : communesQ.isLoading;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Territoires</h1>
        <p className="text-sm text-muted">Districts et communes de Madagascar</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-xl bg-brand-soft p-1">
          {([
            ['communes', 'Communes'],
            ['districts', 'Districts'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium',
                tab === key ? 'bg-white text-ink shadow' : 'text-muted',
              )}
              onClick={() => {
                setTab(key);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-w-[220px] flex-1">
          <Input
            label="Recherche"
            placeholder="Nom ou code…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title={tab === 'communes' ? 'Liste des communes' : 'Liste des districts'}>
          {loading ? (
            <Spinner />
          ) : tab === 'districts' ? (
            (districtsQ.data?.data?.length ?? 0) === 0 ? (
              <EmptyState title="Aucun district" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-brand/10 text-muted">
                      <tr>
                        <th className="px-2 py-2">Code</th>
                        <th className="px-2 py-2">Nom</th>
                        <th className="px-2 py-2">Communes</th>
                        <th className="px-2 py-2">Population</th>
                      </tr>
                    </thead>
                    <tbody>
                      {districtsQ.data?.data.map((d) => (
                        <tr key={d.id} className="border-b border-brand/5 hover:bg-brand-soft/40">
                          <td className="px-2 py-2 font-mono text-xs">{d.adminCode}</td>
                          <td className="px-2 py-2">
                            <Link
                              className="font-medium text-brand hover:underline"
                              to={`/territoires/districts/${d.id}`}
                            >
                              {d.name}
                            </Link>
                          </td>
                          <td className="px-2 py-2">{d.totalCommunes}</td>
                          <td className="px-2 py-2">{formatNumber(d.population)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={meta?.page ?? page}
                  totalPages={meta?.totalPages ?? 1}
                  onChange={setPage}
                />
              </>
            )
          ) : (communesQ.data?.data?.length ?? 0) === 0 ? (
            <EmptyState title="Aucune commune" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-brand/10 text-muted">
                    <tr>
                      <th className="px-2 py-2">Code</th>
                      <th className="px-2 py-2">Commune</th>
                      <th className="px-2 py-2">District</th>
                      <th className="px-2 py-2">Population</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communesQ.data?.data.map((c) => (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-brand/5 cursor-pointer hover:bg-brand-soft/50',
                          selectedId === c.id && 'bg-brand-soft',
                        )}
                        onClick={() => setSelectedId(c.id)}
                      >
                        <td className="px-2 py-2 font-mono text-xs">{c.adminCode}</td>
                        <td className="px-2 py-2">
                          <Link className="font-medium text-brand hover:underline" to={`/territoires/communes/${c.id}`}>
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-2 py-2">{c.districtName}</td>
                        <td className="px-2 py-2">{formatNumber(c.population)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={meta?.page ?? page}
                totalPages={meta?.totalPages ?? 1}
                onChange={setPage}
              />
            </>
          )}
        </Card>

        {tab === 'communes' ? (
          <Card title="Carte des communes">
            {mapQ.isLoading ? (
              <Spinner />
            ) : (
              <GeoJsonMap
                data={mapQ.data}
                height={520}
                selectedId={selectedId}
                onFeatureClick={(f) => {
                  const id = String(
                    (f.properties as Record<string, unknown> | null)?.id ??
                      (f.properties as Record<string, unknown> | null)?.communeId ??
                      '',
                  );
                  if (id) setSelectedId(id);
                }}
              />
            )}
          </Card>
        ) : (
          <Card title="Astuce">
            <p className="text-sm text-muted">
              Basculez sur l&apos;onglet Communes pour visualiser la géométrie et accéder au détail.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
