import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPinned,
  Route,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { Polygon } from 'geojson';
import type { z } from 'zod';
import { eventsApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { createCrisisEventSchema } from '@/schemas/forms';
import { useActiveEvent } from '@/stores/activeEvent';
import { RISK_LABELS, type RiskLevel, type RiskPhase } from '@/types';
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  PHASE_LABELS,
  PHASES,
  RISK_LEVELS,
  SEVERITIES,
  SEVERITY_LABELS,
} from '@/lib/eventMeta';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PolygonDrawMap } from '@/components/maps/PolygonDrawMap';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

type CreateEventForm = z.infer<typeof createCrisisEventSchema>;

interface CreateEventModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  { id: 1 as const, title: 'Identité', hint: 'Qui / quoi / quand' },
  { id: 2 as const, title: 'Carte', hint: 'Facultatif' },
];

const TYPE_PREFIX: Partial<Record<CreateEventForm['type'], string>> = {
  CYCLONE: 'CY',
  INONDATION: 'IN',
  SECHERESSE: 'SE',
  FORTE_PLUIE: 'FP',
  VENT_VIOLENT: 'VV',
  GLISSEMENT_TERRAIN: 'GT',
  FEU_VEGETATION: 'FV',
  AUTRE: 'EV',
};

function suggestEventCode(type: CreateEventForm['type']): string {
  const prefix = TYPE_PREFIX[type] ?? 'EV';
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${prefix}-${y}${m}${d}`;
}

export function CreateEventModal({ open, onClose }: CreateEventModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const setActiveEventId = useActiveEvent().setActiveEventId;
  const titleId = useId();
  const [step, setStep] = useState<1 | 2>(1);
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

  const eventType = form.watch('type');
  const isCyclone = eventType === 'CYCLONE';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    setStep(1);
    setTrackPoints([]);
    setPolygonPoints([]);
    form.reset();
  }, [open, form]);

  if (!open) return null;

  const handleClose = () => {
    setTrackPoints([]);
    setPolygonPoints([]);
    setStep(1);
    form.reset();
    onClose();
  };

  const goNext = async () => {
    const ok = await form.trigger(['eventCode', 'name', 'type', 'status', 'severity']);
    if (ok) setStep(2);
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
      toast('Événement créé — il est maintenant suivi sur la carte', 'success');
      await qc.invalidateQueries({ queryKey: ['events'] });
      setActiveEventId(created.id);
      handleClose();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur de création';
      toast(msg, 'error');
      setStep(1);
      if (err instanceof ApiClientError && err.errors) {
        for (const e of err.errors) {
          if (e.field) form.setError(e.field as keyof CreateEventForm, { message: e.message });
        }
      }
    }
  };

  const applySuggestedCode = () => {
    form.setValue('eventCode', suggestEventCode(eventType), { shouldValidate: true });
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        {/* En-tête */}
        <header className="shrink-0 border-b border-line px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                <ShieldAlert className="size-3.5" />
                Intervention administrative
              </div>
              <h2 id={titleId} className="font-display text-xl font-semibold text-ink sm:text-2xl">
                Nouvel événement
              </h2>
              <p className="mt-1 text-sm text-muted">
                Renseignez l’essentiel, puis ajoutez la carte si besoin.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Fermer"
              className="rounded-xl border border-line p-2 text-muted transition hover:bg-canvas hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Étapes */}
          <ol className="mt-5 flex gap-2">
            {STEPS.map((s) => {
              const active = step === s.id;
              const done = step > s.id;
              return (
                <li key={s.id} className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (s.id < step) setStep(s.id);
                      else if (s.id === 2) void goNext();
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition',
                      active
                        ? 'border-brand/30 bg-brand-soft'
                        : done
                          ? 'border-line bg-canvas'
                          : 'border-line bg-white',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                        active || done
                          ? 'bg-brand text-white'
                          : 'bg-slate-100 text-muted',
                      )}
                    >
                      {done ? <Check className="size-3.5" /> : s.id}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {s.title}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </header>

        {/* Corps scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 1 ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    label="Nom de l’événement"
                    placeholder="Ex. : Cyclone Pasrf — approche Est"
                    autoFocus
                    {...form.register('name')}
                    error={form.formState.errors.name?.message}
                    className="h-11 rounded-xl"
                  />
                </div>

                <div>
                  <Input
                    label="Code"
                    placeholder="Ex. : CY-20260922"
                    {...form.register('eventCode')}
                    error={form.formState.errors.eventCode?.message}
                    className="h-11 rounded-xl font-mono"
                  />
                  <button
                    type="button"
                    onClick={applySuggestedCode}
                    className="mt-1.5 text-xs font-medium text-brand hover:underline"
                  >
                    Générer un code ({suggestEventCode(eventType)})
                  </button>
                </div>

                <Select
                  label="Type"
                  {...form.register('type')}
                  options={EVENT_TYPES.map((t) => ({
                    value: t,
                    label: EVENT_TYPE_LABELS[t],
                  }))}
                  className="h-11 rounded-xl"
                />

                <Select
                  label="Sévérité"
                  {...form.register('severity')}
                  options={SEVERITIES.map((s) => ({
                    value: s,
                    label: SEVERITY_LABELS[s],
                   }))}
                  className="h-11 rounded-xl"
                />

                <Select
                  label="Statut initial"
                  {...form.register('status')}
                  options={EVENT_STATUSES.map((s) => ({
                    value: s,
                    label: EVENT_STATUS_LABELS[s],
                  }))}
                  className="h-11 rounded-xl"
                />

                <Input
                  label="Début"
                  type="datetime-local"
                  {...form.register('startedAt')}
                  className="h-11 rounded-xl"
                />
                <Input
                  label="Fin prévue"
                  type="datetime-local"
                  {...form.register('expectedEndAt')}
                  className="h-11 rounded-xl"
                />

                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="font-medium text-ink">Description</span>
                  <textarea
                    rows={3}
                    placeholder="Contexte, source, zone concernée…"
                    className={cn(
                      'rounded-xl border border-line bg-surface px-3 py-2.5 text-ink outline-none transition',
                      'placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15',
                    )}
                    {...form.register('description')}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-canvas/80 px-4 py-3">
                <p className="text-sm font-medium text-ink">
                  Étape facultative — vous pouvez créer sans carte
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {isCyclone
                    ? 'Cliquez sur la carte pour poser des points de trajectoire (au moins 2).'
                    : 'Cliquez sur la carte pour dessiner une zone (au moins 3 points).'}{' '}
                  Vous pourrez compléter plus tard dans le détail de l’événement.
                </p>
              </div>

              {isCyclone ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <Route className="size-4 text-muted" />
                      Trajectoire
                      <Badge tone="neutral">{trackPoints.length} point(s)</Badge>
                    </p>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      Type
                      <select
                        value={trackType}
                        onChange={(e) => setTrackType(e.target.value)}
                        aria-label="Type de trajectoire"
                        className="h-9 rounded-xl border border-line bg-white px-2.5 text-sm text-ink outline-none"
                      >
                        <option value="PREVUE">Prévue</option>
                        <option value="OBSERVEE">Observée</option>
                      </select>
                    </label>
                  </div>
                  <PolygonDrawMap
                    variant="track"
                    points={trackPoints}
                    onChange={setTrackPoints}
                    height={280}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 rounded-xl"
                      disabled={trackPoints.length === 0}
                      onClick={() => setTrackPoints((p) => p.slice(0, -1))}
                    >
                      Annuler le dernier point
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-xl"
                      disabled={trackPoints.length === 0}
                      onClick={() => setTrackPoints([])}
                    >
                      Effacer tout
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <MapPinned className="size-4 text-muted" />
                      Zone d’influence
                      <Badge tone="neutral">{polygonPoints.length} point(s)</Badge>
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label="Phase"
                      value={polyForm.phase}
                      onChange={(e) =>
                        setPolyForm((p) => ({ ...p, phase: e.target.value as RiskPhase }))
                      }
                      options={PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))}
                      className="h-11 rounded-xl"
                    />
                    <Select
                      label="Niveau de risque"
                      value={polyForm.riskLevel}
                      onChange={(e) =>
                        setPolyForm((p) => ({
                          ...p,
                          riskLevel: e.target.value as RiskLevel,
                        }))
                      }
                      options={RISK_LEVELS.map((p) => ({
                        value: p,
                        label: RISK_LABELS[p],
                      }))}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <PolygonDrawMap
                    variant="polygon"
                    points={polygonPoints}
                    onChange={setPolygonPoints}
                    height={280}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 rounded-xl"
                      disabled={polygonPoints.length === 0}
                      onClick={() => setPolygonPoints((p) => p.slice(0, -1))}
                    >
                      Annuler le dernier point
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-xl"
                      disabled={polygonPoints.length === 0}
                      onClick={() => setPolygonPoints([])}
                    >
                      Effacer tout
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied d’actions fixe */}
        <footer className="shrink-0 border-t border-line bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              {step === 1
                ? 'Étape 1 sur 2 — les champs nom et code sont obligatoires.'
                : 'Étape 2 sur 2 — sans points sur la carte, seule la fiche est créée.'}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={handleClose}>
                Annuler
              </Button>
              {step === 2 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="size-4" />
                  Retour
                </Button>
              ) : null}
              {step === 1 ? (
                <Button type="button" className="rounded-xl" onClick={() => void goNext()}>
                  Continuer
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button type="submit" className="rounded-xl" loading={form.formState.isSubmitting}>
                  Créer l’événement
                </Button>
              )}
            </div>
          </div>
        </footer>
      </form>
    </div>
  );
}
