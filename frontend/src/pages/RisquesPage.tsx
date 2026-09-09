import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { risksApi, eventsApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { RISK_LABELS, type RiskLevel, type RiskPhase } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { GeoJsonMap } from '@/components/maps/GeoJsonMap';
import { useToast } from '@/components/ui/Toast';
import { formatNumber } from '@/lib/utils';
import { canManageOps } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';

const PHASES: RiskPhase[] = ['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT'];

function tone(level: RiskLevel) {
  if (level === 'EXTREME') return 'danger' as const;
  if (level === 'ELEVE') return 'warning' as const;
  if (level === 'MODERE') return 'info' as const;
  return 'success' as const;
}

export function RisquesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const [eventId, setEventId] = useState('');
  const [phase, setPhase] = useState<RiskPhase>('PENDANT');

  const eventsQ = useQuery({
    queryKey: ['events', 'options'],
    queryFn: () => eventsApi.list({ limit: 100 }),
    staleTime: 60_000,
  });

  const priorityQ = useQuery({
    queryKey: ['risks', 'priority', eventId || 'global'],
    queryFn: () => risksApi.priority({ limit: 20, ...(eventId ? { eventId } : {}) }),
  });

  const mapQ = useQuery({
    queryKey: ['risks', 'map-layer', eventId || 'global'],
    queryFn: () => risksApi.mapLayer(eventId ? { eventId } : {}),
  });

  const recalcM = useMutation({
    mutationFn: () =>
      risksApi.recalculate({
        eventId: eventId || undefined,
        phase,
      }),
    onSuccess: () => {
      toast('Recalcul des risques lancé', 'success');
      void qc.invalidateQueries({ queryKey: ['risks'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur recalcul';
      toast(msg, 'error');
      alert(msg);
    },
  });

  const onRecalc = (e: FormEvent) => {
    e.preventDefault();
    recalcM.mutate();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl text-ink">Risques</h1>
        <p className="text-sm text-muted">Priorisation et couche cartographique</p>
      </div>

      {canManageOps(role) ? (
        <Card title="Recalculer les risques" description="ADMIN / SUPER_ADMIN">
          <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto]" onSubmit={onRecalc}>
            <Select
              label="Événement"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              options={[
                { value: '', label: 'Tous (global)' },
                ...(eventsQ.data?.data ?? []).map((ev) => ({
                  value: ev.id,
                  label: `${ev.eventCode} · ${ev.name}`,
                })),
              ]}
            />
            <Select
              label="Phase"
              value={phase}
              onChange={(e) => setPhase(e.target.value as RiskPhase)}
              options={PHASES.map((p) => ({ value: p, label: p }))}
            />
            <div className="flex items-end">
              <Button type="submit" loading={recalcM.isPending}>
                Recalculer
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Communes prioritaires">
          {priorityQ.isLoading ? (
            <Spinner />
          ) : (priorityQ.data?.length ?? 0) === 0 ? (
            <EmptyState title="Aucune priorité" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-brand/10 text-muted">
                  <tr>
                    <th className="px-2 py-2">Commune</th>
                    <th className="px-2 py-2">Score</th>
                    <th className="px-2 py-2">Niveau</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityQ.data?.map((c) => (
                    <tr key={c.communeId} className="border-b border-brand/5">
                      <td className="px-2 py-2">
                        <Link
                          className="text-brand hover:underline"
                          to={`/territoires/communes/${c.communeId}`}
                        >
                          {c.communeName}
                        </Link>
                        <div className="text-xs text-muted">{c.districtName}</div>
                      </td>
                      <td className="px-2 py-2">{formatNumber(c.riskScore)}</td>
                      <td className="px-2 py-2">
                        <Badge tone={tone(c.riskLevel)}>{RISK_LABELS[c.riskLevel]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Carte des risques">
          {mapQ.isLoading ? <Spinner /> : <GeoJsonMap data={mapQ.data} height={480} />}
        </Card>
      </div>
    </div>
  );
}
