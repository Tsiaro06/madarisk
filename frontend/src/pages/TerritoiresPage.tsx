import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { territoriesApi } from '@/api';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
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
  const [blinkId, setBlinkId] = useState<string | null>(null);
  const [autoRevealId, setAutoRevealId] = useState<string | null>(null);
  const mapCardRef = useRef<HTMLDivElement>(null);

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

  // La carte ne dépend pas de la recherche : `/territories/map/*` n'accepte
  // aucun filtre de nom côté backend, elle affiche toujours toutes les limites
  // de l'échelle active.
  const mapCommunesQ = useQuery({
    queryKey: ['territories', 'map-communes'],
    queryFn: () => territoriesApi.mapCommunes(),
    enabled: tab === 'communes',
  });

  const mapDistrictsQ = useQuery({
    queryKey: ['territories', 'map-districts'],
    queryFn: () => territoriesApi.mapDistricts(),
    enabled: tab === 'districts',
  });

  const mapData = tab === 'communes' ? mapCommunesQ.data : mapDistrictsQ.data;
  const mapLoading = tab === 'communes' ? mapCommunesQ.isLoading : mapDistrictsQ.isLoading;

  const meta = tab === 'districts' ? districtsQ.data?.meta : communesQ.data?.meta;
  const loading = tab === 'districts' ? districtsQ.isLoading : communesQ.isLoading;
  const tabError =
    tab === 'districts'
      ? districtsQ.isError || mapDistrictsQ.isError
      : communesQ.isError || mapCommunesQ.isError;

  const firstResult =
    (tab === 'districts' ? districtsQ.data?.data : communesQ.data?.data)?.[0] ?? null;

  // Révélation automatique, dérivée pendant le rendu (pattern React
  // « adjusting state when props change ») : dès que la recherche courante
  // a un résultat, le premier devient la sélection et clignote sur la carte ;
  // un terme sans résultat efface le clignotement. Le défilement vers la
  // carte reste réservé à la frappe d'Entrée (événement utilisateur).
  // Hors page 1 (pagination), pas d'auto-révélation : elle ne concerne que
  // les résultats de recherche.
  const wantedId =
    q.trim() && page === 1 && firstResult ? firstResult.id : null;
  if (wantedId !== autoRevealId) {
    setAutoRevealId(wantedId);
    setBlinkId(wantedId);
    if (wantedId != null) setSelectedId(wantedId);
  }

  // Entrée : recentrage explicite sur le premier résultat + défilement.
  const revealOnMap = (id: string) => {
    setSelectedId(id);
    setBlinkId(id);
    mapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const selectEntity = (id: string) => {
    setSelectedId(id);
    setBlinkId(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Territoires</h1>
        <p className="text-sm text-muted">Districts et communes de Madagascar</p>
      </div>

      {tabError ? (
        <AlertBanner tone="danger" title="Échec du chargement">
          Impossible de charger les données du territoire. Réessayez ou rechargez la page.
        </AlertBanner>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
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
                setSelectedId(null);
                setBlinkId(null);
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
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (wantedId) revealOnMap(wantedId);
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
                    <thead className="border-b border-line bg-gray-50 text-muted">
                      <tr>
                        <th className="px-3 py-2.5">Code</th>
                        <th className="px-3 py-2.5">Nom</th>
                        <th className="px-3 py-2.5">Communes</th>
                        <th className="px-3 py-2.5">Population</th>
                      </tr>
                    </thead>
                    <tbody>
                      {districtsQ.data?.data.map((d) => (
                        <tr
                          key={d.id}
                          className={cn(
                            'border-b border-line cursor-pointer transition hover:bg-gray-50',
                            selectedId === d.id && 'bg-brand-soft',
                          )}
                          onClick={() => selectEntity(d.id)}
                        >
                          <td className="px-3 py-2.5 font-mono text-xs">{d.adminCode}</td>
                          <td className="px-3 py-2.5">
                            <Link
                              className="font-medium text-brand hover:underline"
                              to={`/territoires/districts/${d.id}`}
                            >
                              {d.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">{d.totalCommunes}</td>
                          <td className="px-3 py-2.5">{formatNumber(d.population)}</td>
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
                  <thead className="border-b border-line bg-gray-50 text-muted">
                    <tr>
                      <th className="px-3 py-2.5">Code</th>
                      <th className="px-3 py-2.5">Commune</th>
                      <th className="px-3 py-2.5">District</th>
                      <th className="px-3 py-2.5">Population</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communesQ.data?.data.map((c) => (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-line cursor-pointer transition hover:bg-gray-50',
                          selectedId === c.id && 'bg-brand-soft',
                        )}
                        onClick={() => selectEntity(c.id)}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs">{c.adminCode}</td>
                        <td className="px-3 py-2.5">
                          <Link className="font-medium text-brand hover:underline" to={`/territoires/communes/${c.id}`}>
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">{c.districtName}</td>
                        <td className="px-3 py-2.5">{formatNumber(c.population)}</td>
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

        <div ref={mapCardRef}>
          <Card title={tab === 'communes' ? 'Limites des communes' : 'Limites des districts'}>
            {mapLoading ? (
              <Spinner />
            ) : (mapData?.features?.length ?? 0) === 0 ? (
              <EmptyState title={tab === 'communes' ? 'Aucune commune' : 'Aucun district'} />
            ) : (
              <GeoJsonMap
                data={mapData}
                height={520}
                boundariesOnly
                selectedId={selectedId}
                blinkId={blinkId}
                onFeatureClick={(f) => {
                  const props = (f.properties ?? {}) as Record<string, unknown>;
                  const id = props.id ?? props.communeId ?? props.districtId ?? f.id;
                  if (id) selectEntity(String(id));
                }}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
