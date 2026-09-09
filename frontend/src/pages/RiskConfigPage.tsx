import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { risksApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { riskConfigSchema } from '@/schemas/forms';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';

interface RiskConfig {
  id: string;
  name?: string;
  isActive?: boolean;
  createdAt?: string;
  rainWeight?: number;
  windWeight?: number;
  proximityWeight?: number;
  vulnerabilityWeight?: number;
  exposureWeight?: number;
  lowThreshold?: number;
  moderateThreshold?: number;
  highThreshold?: number;
  extremeThreshold?: number;
  [key: string]: unknown;
}

type RiskConfigForm = z.infer<typeof riskConfigSchema>;

export function RiskConfigPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const form = useForm<RiskConfigForm>({
    resolver: zodResolver(riskConfigSchema),
    defaultValues: {
      name: '',
      rainWeight: 0.3,
      windWeight: 0.25,
      proximityWeight: 0.2,
      vulnerabilityWeight: 0.15,
      exposureWeight: 0.1,
      lowThreshold: 20,
      moderateThreshold: 40,
      highThreshold: 60,
      extremeThreshold: 80,
      isActive: true,
    },
  });

  const listQ = useQuery({
    queryKey: ['risk-configurations'],
    queryFn: () => risksApi.configurations() as Promise<RiskConfig[]>,
  });

  const createM = useMutation({
    mutationFn: (body: RiskConfigForm) => risksApi.createConfiguration(body),
    onSuccess: () => {
      toast('Configuration créée', 'success');
      setOpen(false);
      form.reset();
      void qc.invalidateQueries({ queryKey: ['risk-configurations'] });
    },
    onError: (err) => {
      toast(err instanceof ApiClientError ? err.message : 'Erreur', 'error');
    },
  });

  const configs = Array.isArray(listQ.data) ? listQ.data : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Configurations risque</h1>
          <p className="text-sm text-muted">Pondérations 0.30/0.25/0.20/0.15/0.10 · seuils 20/40/60/80</p>
        </div>
        <Button onClick={() => setOpen(true)}>Nouvelle configuration</Button>
      </div>

      <Card>
        {listQ.isLoading ? (
          <Spinner />
        ) : configs.length === 0 ? (
          <EmptyState title="Aucune configuration" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-brand/10 text-muted">
                <tr>
                  <th className="px-2 py-2">Nom</th>
                  <th className="px-2 py-2">Poids</th>
                  <th className="px-2 py-2">Seuils</th>
                  <th className="px-2 py-2">Statut</th>
                  <th className="px-2 py-2">Créée</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.id} className="border-b border-brand/5">
                    <td className="px-2 py-2 font-medium">{String(c.name ?? c.id)}</td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {[c.rainWeight, c.windWeight, c.proximityWeight, c.vulnerabilityWeight, c.exposureWeight]
                        .filter((v) => v != null)
                        .join(' / ') || '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {[c.lowThreshold, c.moderateThreshold, c.highThreshold, c.extremeThreshold]
                        .filter((v) => v != null)
                        .join(' / ') || '—'}
                    </td>
                    <td className="px-2 py-2">
                      <Badge tone={c.isActive ? 'success' : 'neutral'}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-2 py-2">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={form.handleSubmit((v) => createM.mutate(v))}
            className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 className="font-display text-xl">Nouvelle configuration</h2>
            <Input label="Nom" {...form.register('name')} error={form.formState.errors.name?.message} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="rainWeight" type="number" step="0.01" {...form.register('rainWeight')} />
              <Input label="windWeight" type="number" step="0.01" {...form.register('windWeight')} />
              <Input label="proximityWeight" type="number" step="0.01" {...form.register('proximityWeight')} />
              <Input label="vulnerabilityWeight" type="number" step="0.01" {...form.register('vulnerabilityWeight')} />
              <Input label="exposureWeight" type="number" step="0.01" {...form.register('exposureWeight')} />
            </div>
            {form.formState.errors.rainWeight?.message ? (
              <p className="text-xs text-risk-extreme">{form.formState.errors.rainWeight.message}</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Input label="Seuil faible" type="number" {...form.register('lowThreshold')} />
              <Input label="Seuil modéré" type="number" {...form.register('moderateThreshold')} />
              <Input label="Seuil élevé" type="number" {...form.register('highThreshold')} />
              <Input label="Seuil extrême" type="number" {...form.register('extremeThreshold')} />
            </div>
            {form.formState.errors.extremeThreshold?.message ? (
              <p className="text-xs text-risk-extreme">{form.formState.errors.extremeThreshold.message}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={createM.isPending}>
                Créer
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
