import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown, Radio, X, Zap } from 'lucide-react';
import { eventsApi } from '@/api';
import type { EventListItem } from '@/types';
import { useActiveEvent } from '@/stores/activeEvent';
import { cn } from '@/lib/utils';
import { EVENT_STATUS_TONE, EVENT_TYPE_LABELS } from '@/lib/eventMeta';
import { Badge } from '@/components/ui/Badge';

export function EventSelector({ className }: { className?: string }) {
  const { activeEventId, setActiveEventId, activeEvent, activeEventLoading } = useActiveEvent();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const listQ = useQuery({
    queryKey: ['events', 'selector'],
    queryFn: () => eventsApi.list({ page: 1, limit: 100 }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const events = listQ.data?.data ?? [];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = activeEvent
    ? `${activeEvent.eventCode} · ${activeEvent.name}`
    : 'Aucun événement sélectionné';

  return (
    <div ref={wrapRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-12 w-full min-w-0 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink transition hover:bg-canvas',
          activeEventId && 'border-slate-300 bg-canvas',
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Radio className={cn('size-5 shrink-0', activeEventId ? 'text-brand' : 'text-muted')} />
        <span className="min-w-0 flex-1 truncate text-left font-medium">
          {activeEventLoading ? 'Chargement…' : label}
        </span>
        <ChevronsUpDown className="size-5 shrink-0 opacity-70" />
      </button>

      {open ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-2 flex max-h-80 w-full flex-col overflow-hidden rounded-xl border border-line bg-white text-ink shadow-xl"
          role="listbox"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line bg-canvas px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Événement actif
            </p>
            <span className="text-[11px] text-muted">{events.length} événements</span>
          </div>
          <button
            type="button"
            className={cn(
              'flex w-full shrink-0 items-center gap-2 px-3 py-3 text-sm transition hover:bg-canvas',
              !activeEventId && 'bg-canvas font-medium text-ink',
            )}
            onClick={() => {
              setActiveEventId(null);
              setOpen(false);
            }}
          >
            <span className="size-2.5 rounded-full border border-line" />
            Aucun événement
          </button>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            {listQ.isLoading ? (
              <p className="px-3 py-4 text-center text-sm text-muted">Chargement…</p>
            ) : events.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted">Aucun événement</p>
            ) : (
              events.map((ev: EventListItem) => {
                const selected = ev.id === activeEventId;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className={cn(
                      'flex w-full min-w-0 items-start gap-2 px-3 py-3 text-left text-sm transition hover:bg-canvas',
                      selected && 'bg-canvas',
                    )}
                    onClick={() => {
                      setActiveEventId(ev.id);
                      setOpen(false);
                    }}
                  >
                    {selected ? (
                      <Zap className="mt-0.5 size-4 shrink-0 text-brand" />
                    ) : (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-slate-300" />
                    )}
                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span className="block truncate font-medium text-ink">{ev.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="font-mono">{ev.eventCode}</span>
                        <span>·</span>
                        <span>{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</span>
                        <Badge tone={EVENT_STATUS_TONE[ev.status]}>{ev.status}</Badge>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            className="flex w-full shrink-0 items-center justify-center gap-1.5 border-t border-line bg-white px-3 py-2.5 text-xs font-medium text-muted hover:bg-canvas"
            onClick={() => setOpen(false)}
          >
            <X className="size-3.5" /> Fermer
          </button>
        </div>
      ) : null}
    </div>
  );
}
