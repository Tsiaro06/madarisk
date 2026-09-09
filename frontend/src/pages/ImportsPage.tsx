import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { importsApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

interface ImportRow {
  id: string;
  fileName?: string;
  status?: string;
  sourceType?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export function ImportsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState('GEOJSON');

  const listQ = useQuery({
    queryKey: ['imports', page],
    queryFn: () => importsApi.list({ page, limit: 15 }),
  });

  const uploadM = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Fichier requis');
      const form = new FormData();
      form.append('file', file);
      form.append('sourceType', sourceType);
      return importsApi.upload(form);
    },
    onSuccess: () => {
      toast('Import envoyé', 'success');
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur upload';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const onUpload = (e: FormEvent) => {
    e.preventDefault();
    uploadM.mutate();
  };

  const rows = (listQ.data?.data ?? []) as ImportRow[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Imports</h1>
        <p className="text-sm text-muted">Chargement de fichiers SIG / référentiels</p>
      </div>

      <Card title="Nouvel import">
        <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto]" onSubmit={onUpload}>
          <Input
            label="Fichier"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
          <Select
            label="Type source"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            options={[
              { value: 'GEOJSON', label: 'GeoJSON' },
              { value: 'CSV', label: 'CSV' },
              { value: 'SHP', label: 'Shapefile' },
              { value: 'AUTRE', label: 'Autre' },
            ]}
          />
          <div className="flex items-end">
            <Button type="submit" loading={uploadM.isPending} disabled={!file}>
              Envoyer
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Historique">
        {listQ.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun import" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-brand/10 text-muted">
                  <tr>
                    <th className="px-2 py-2">Fichier</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Statut</th>
                    <th className="px-2 py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-brand/5">
                      <td className="px-2 py-2 font-medium">{String(row.fileName ?? row.id)}</td>
                      <td className="px-2 py-2">{String(row.sourceType ?? '—')}</td>
                      <td className="px-2 py-2">
                        <Badge tone="brand">{String(row.status ?? '—')}</Badge>
                      </td>
                      <td className="px-2 py-2">{formatDate(row.createdAt)}</td>
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
