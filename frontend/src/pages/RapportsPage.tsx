import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

interface ReportRow {
  id: string;
  name?: string;
  type?: string;
  createdAt?: string;
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

      <Card title="Exporter" description="Générer un fichier à partir du tableau de bord">
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
      </Card>

      <Card title="Rapports générés">
        {listQ.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun rapport enregistré" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-brand/10 text-muted">
                  <tr>
                    <th className="px-2 py-2">Nom</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-brand/5">
                      <td className="px-2 py-2 font-medium">{String(r.name ?? r.id)}</td>
                      <td className="px-2 py-2">{String(r.type ?? '—')}</td>
                      <td className="px-2 py-2">{formatDate(r.createdAt)}</td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              const blob = await reportsApi.download(r.id);
                              downloadBlob(blob, `${String(r.name ?? r.id)}.bin`);
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
