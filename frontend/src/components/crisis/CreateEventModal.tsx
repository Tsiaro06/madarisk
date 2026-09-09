import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Polygon } from 'geojson';
import type { z } from 'zod';
import { eventsApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { createCrisisEventSchema } from '@/schemas/forms';
import { useActiveEvent } from '@/stores/activeEvent';
import type { RiskLevel, RiskPhase } from '@/types';
import { EVENT_STATUSES, EVENT_STATUS_LABELS, EVENT_TYPES, EVENT_TYPE_LABELS, SEVERITIES, SEVERITY_LABELS, PHASES, RISK_LEVELS } from '@/lib/eventMeta';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PolygonDrawMap } from '@/components/maps/PolygonDrawMap';
import { useToast } from '@/components/ui/Toast';

type CreateEventForm = z.infer<typeof createCrisisEventSchema>;

interface CreateEventModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateEventModal({ open, onClose }: CreateEventModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const setActiveEventId = useActiveEvent().setActiveEventId;
  const [trackPoints, setTrackPoints] = useState<[number, number][]>([]);
  const [trackType, setTrackType] = useState('PREVUE');
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [polyForm, setPolyForm] = useState<{ phase: RiskPhase; riskLevel: RiskLevel }>({
    phase: 'PENDANT',
    riskLevel: 'ELEVE',
  });

  const form = useForm<CreateEventForm>({
    resolver: zodResolver(createCrisisEventSchema),
    defaultValues: {
      eventCode: '',
      name: '',
      type: 'CYCLONE',
      status: 'BROUILLON',
      severity: 'ELEVEE',
      description: '',
      startedAt: '',
      expectedEndAt: '',
    },
  });

  if (!open) return null;

  const handleClose = () => {
    setTrackPoints([]);
    setPolygonPoints([]);
    onClose();
  };

  const onSubmit = async (values: CreateEventForm) => {
    const body = {
      ...values,
      startedAt: values.startedAt ? new Date(values.startedAt).toISOString() : null,
      expectedEndAt: values.expectedEndAt ? new Date(values.expectedEndAt).toISOString() : null,
    };
    try {
      const created = await eventsApi.create(body);
      for (const [lat, lng] of trackPoints) {
        await eventsApi.addTrack(created.id, {
          trackType,
          latitude: lat,
          longitude: lng,
          observedAt: new Date().toISOString(),
        });
      }
      if (polygonPoints.length >= 3) {
        const ring: Polygon['coordinates'][number] = [
          ...polygonPoints.map(([lat, lng]) => [lng, lat] as [number, number]),
          [polygonPoints[0][1], polygonPoints[0][0]],
        ];
        await eventsApi.createPolygonArea(created.id, {
          phase: polyForm.phase,
          riskLevel: polyForm.riskLevel,
          geometry: { type: 'Polygon', coordinates: [ring] },
        });
      }
      toast('Événement créé', 'success');
      form.reset();
      handleClose();
      await qc.invalidateQueries({ queryKey: ['events'] });
      setActiveEventId(created.id);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur de création';
      toast(msg, 'error');
      if (err instanceof ApiClientError && err.errors) {
        for (const e of err.errors) {
          if (e.field) form.setError(e.field as keyof CreateEventForm, { message: e.message });
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ink">Créer un événement</h2>
            <p className="text-sm text-muted">Nouvelle crise à suivre en salle de crise</p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted hover:bg-brand-soft">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Code (ex : CY-2026-0214)" {...form.register('eventCode')} error={form.formState.errors.eventCode?.message} />
          <Input label="Nom" {...form.register('name')} error={form.formState.errors.name?.message} />
          <Select
            label="Type"
            {...form.register('type')}
            options={EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABELS[t] }))}
          />
          <Select
            label="Statut initial"
            {...form.register('status')}
            options={EVENT_STATUSES.map((s) => ({ value: s, label: EVENT_STATUS_LABELS[s] }))}
          />
          <Select
            label="Sévérité"
            {...form.register('severity')}
            options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABELS[s] }))}
          />
          <div className="space-y-2">
            <Input label="Début" type="datetime-local" {...form.register('startedAt')} />
          </div>
          <Input label="Fin prévue" type="datetime-local" {...form.register('expectedEndAt')} />
          <Input label="Description" {...form.register('description')} />
        </div>

        <div className="mt-4">
          {form.watch('type') === 'CYCLONE' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Points de trajectoire (cyclone)</p>
              <PolygonDrawMap
                variant="track"
                points={trackPoints}
                onChange={setTrackPoints}
                height={240}
              />
              <div className="flex gap-2">
                <Select
                  label="Type"
                  value={trackType}
                  onChange={(e) => setTrackType(e.target.value)}
                  options={[
                    { value: 'OBSERVEE', label: 'OBSERVEE' },
                    { value: 'PREVUE', label: 'PREVUE' },
                  ]}
                />
                <div className="flex flex-1 items-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={trackPoints.length === 0}
                    onClick={() => setTrackPoints((p) => p.slice(0, -1))}
                  >
                    Annuler le point
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={trackPoints.length === 0}
                    onClick={() => setTrackPoints([])}
                  >
                    Effacer
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted">Limites de districts affichées pour repérage (facultatif).</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Zone polygonale (dessin)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  label="Phase"
                  value={polyForm.phase}
                  onChange={(e) => setPolyForm((p) => ({ ...p, phase: e.target.value as RiskPhase }))}
                  options={PHASES.map((p) => ({ value: p, label: p }))}
                />
                <Select
                  label="Niveau"
                  value={polyForm.riskLevel}
                  onChange={(e) =>
                    setPolyForm((p) => ({ ...p, riskLevel: e.target.value as RiskLevel }))
                  }
                  options={RISK_LEVELS.map((p) => ({ value: p, label: p }))}
                />
              </div>
              <PolygonDrawMap
                variant="polygon"
                points={polygonPoints}
                onChange={setPolygonPoints}
                height={240}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={polygonPoints.length === 0}
                  onClick={() => setPolygonPoints((p) => p.slice(0, -1))}
                >
                  Annuler le point
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={polygonPoints.length === 0}
                  onClick={() => setPolygonPoints([])}
                >
                  Effacer
                </Button>
              </div>
              <p className="text-xs text-muted">
                ≥ 3 points pour définir la zone (facultatif). Limites de districts affichées pour
                repérage.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Annuler
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Créer l&apos;événement
          </Button>
        </div>
      </form>
    </div>
  );
}