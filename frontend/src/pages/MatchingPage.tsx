import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { matchingApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatNumber } from '@/lib/utils';

interface MatchRow {
  id: string;
  status?: string;
  sourceName?: string;
  targetName?: string;
  score?: number | null;
  createdAt?: string;
  [key: string]: unknown;
}

export function MatchingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const listQ = useQuery({
    queryKey: ['matching', page],
    queryFn: () => matchingApi.list({ page, limit: 15, status: 'PENDING' }),
  });

  const statsQ = useQuery({
    queryKey: ['matching', 'stats'],
    queryFn: () => matchingApi.statistics() as Promise<Record<string, number>>,
  });

  const approveM = useMutation({
    mutationFn: (id: string) => matchingApi.approve(id),
    onSuccess: () => {
      toast('Appariement approuvé', 'success');
      void qc.invalidateQueries({ queryKey: ['matching'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const rejectM = useMutation({
    mutationFn: (id: string) => matchingApi.reject(id, 'Rejeté depuis l’interface'),
    onSuccess: () => {
      toast('Appariement rejeté', 'success');
      void qc.invalidateQueries({ queryKey: ['matching'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const rows = (listQ.data?.data ?? []) as MatchRow[];
  const stats = statsQ.data ?? {};

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Matching</h1>
        <p className="text-sm text-muted">Validation des appariements territoriaux</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(stats).slice(0, 6).map(([k, v]) => (
          <Card key={k} className="!p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{k}</p>
            <p className="font-display text-2xl text-brand">{formatNumber(v)}</p>
          </Card>
        ))}
      </div>

      <Card title="En attente de validation">
        {listQ.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="Aucun matching en attente" />
        ) : (
          <>
            <ul className="space-y-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/10 p-4"
                >
                  <div>
                    <p className="font-medium text-ink">
                      {String(row.sourceName ?? 'Source')} → {String(row.targetName ?? 'Cible')}
                    </p>
                    <p className="text-xs text-muted">
                      Score {formatNumber(row.score)} · {formatDate(row.createdAt)}
                    </p>
                    <Badge className="mt-2" tone="warning">
                      {String(row.status ?? 'PENDING')}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" loading={approveM.isPending} onClick={() => approveM.mutate(row.id)}>
                      Approuver
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={rejectM.isPending}
                      onClick={() => rejectM.mutate(row.id)}
                    >
                      Rejeter
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
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
