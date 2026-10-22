import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { AdministrativeInterventionPanel } from '@/components/admin/AdministrativeInterventionPanel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';

interface ReportRow {
  id: string;
  title?: string;
  reportType?: string;
  format?: string;
  source?: string | null;
  isHistorique?: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
  generatedAt?: string;
  eventName?: string | null;
  [key: string]: unknown;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RapportsPage() {
  const { toast } = useToast();
  const role = useAuthStore((s) => s.user?.role);
  const canExport = canManageOps(role);
  const [page, setPage] = useState(1);

  const listQ = useQuery({
    queryKey: ['reports', page],
    queryFn: () => reportsApi.list({ page, limit: 15 }),
  });

  const exportM = useMutation({
    mutationFn: async (fmt: 'csv' | 'geojson' | 'pdf') => {
      const body = { scope: 'dashboard' };
      if (fmt === 'csv') return { blob: await reportsApi.exportCsv(body), name: 'madarisk-export.csv' };
      if (fmt === 'geojson')
        return { blob: await reportsApi.exportGeoJson(body), name: 'madarisk-export.geojson' };
      return { blob: await reportsApi.exportPdf(body), name: 'madarisk-export.pdf' };
    },
    onSuccess: ({ blob, name }) => {
      downloadBlob(blob, name);
      toast(`Export ${name} téléchargé`, 'success');
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur export';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const rows = (listQ.data?.data ?? []) as ReportRow[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Rapports</h1>
        <p className="text-sm text-muted">Exports opérationnels et historiques</p>
      </div>

      {canExport ? (
        <AdministrativeInterventionPanel>
          <p className="text-sm font-semibold text-ink">Exports manuels (intervention)</p>
          <div className="flex flex-wrap gap-2">
            <Button loading={exportM.isPending} onClick={() => exportM.mutate('csv')}>
              Export CSV
            </Button>
            <Button variant="secondary" loading={exportM.isPending} onClick={() => exportM.mutate('geojson')}>
              Export GeoJSON
            </Button>
            <Button variant="outline" loading={exportM.isPending} onClick={() => exportM.mutate('pdf')}>
              Export PDF
            </Button>
          </div>
          <p className="text-xs text-muted">
            Les rapports automatiques sont disponibles dans l&apos;historique. Utilisez ces
            exports pour une extraction ponctuelle ou une analyse administrative.
          </p>
        </AdministrativeInterventionPanel>
      ) : null}

      <Card title="Rapports générés">
        {listQ.isError ? (
          <AlertBanner tone="danger" title="Échec du chargement">
            Impossible de charger la liste des rapports. Réessayez ou rechargez la page.
          </AlertBanner>
        ) : listQ.isLoading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun rapport enregistré" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line bg-gray-50 text-muted">
                  <tr>
                    <th className="px-3 py-2.5">Nom</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Source</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-brand/5">
                      <td className="px-3 py-2.5 font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{String(r.title ?? r.id)}</span>
                          {r.isHistorique ? <Badge tone="neutral">Historique</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {String(r.reportType ?? '—')}
                        {r.format ? (
                          <span className="text-xs text-muted"> · {String(r.format)}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">{r.source ? String(r.source) : '—'}</td>
                      <td className="px-3 py-2.5">
                        {formatDate(r.periodEnd ?? r.generatedAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              const blob = await reportsApi.download(r.id);
                              downloadBlob(blob, `${String(r.title ?? r.id)}.bin`);
                            } catch (err) {
                              const msg = err instanceof ApiClientError ? err.message : 'Erreur téléchargement';
                              toast(msg, 'error');
                              alert(msg);
                            }
                          }}
                        >
                          Télécharger
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={listQ.data?.meta?.page ?? page}
              totalPages={listQ.data?.meta?.totalPages ?? 1}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
