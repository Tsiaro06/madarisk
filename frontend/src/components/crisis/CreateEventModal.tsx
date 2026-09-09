import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { z } from 'zod';
import { eventsApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { createCrisisEventSchema } from '@/schemas/forms';
import { useActiveEvent } from '@/stores/activeEvent';
import { EVENT_STATUSES, EVENT_STATUS_LABELS, EVENT_TYPES, EVENT_TYPE_LABELS, SEVERITIES, SEVERITY_LABELS } from '@/lib/eventMeta';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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

  const onSubmit = async (values: CreateEventForm) => {
    const body = {
      ...values,
      startedAt: values.startedAt ? new Date(values.startedAt).toISOString() : null,
      expectedEndAt: values.expectedEndAt ? new Date(values.expectedEndAt).toISOString() : null,
    };
    try {
      const created = await eventsApi.create(body);
      toast('Événement créé', 'success');
      form.reset();
      onClose();
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
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-ink">Créer un événement</h2>
            <p className="text-sm text-muted">Nouvelle crise à suivre en salle de crise</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-muted hover:bg-brand-soft">
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

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
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