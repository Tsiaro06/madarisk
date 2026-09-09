import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Cpu, Search, X, Zap } from 'lucide-react';
import { eventsApi, territoriesApi } from '@/api';
import type { EventStatus, EventType, SeverityLevel, TerritorySearchResult } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import {
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_TONE,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_TONE,
  SEVERITIES,
  SEVERITY_LABELS,
  SEVERITY_TONE,
} from '@/lib/eventMeta';
import { formatDate, cn } from '@/lib/utils';

export interface EventFilters {
  type: string;
  status: string;
  severity: string;
  startedAfter: string;
  startedBefore: string;
  search: string;
}

const EMPTY_FILTERS: EventFilters = {
  type: '',
  status: '',
  severity: '',
  startedAfter: '',
  startedBefore: '',
  search: '',
};

interface LeftPanelProps {
  activeEventId: string | null;
  onSelectEvent: (id: string) => void;
  onSelectCommune: (result: TerritorySearchResult) => void;
  onClose: () => void;
}

export function LeftPanel({ activeEventId, onSelectEvent, onSelectCommune, onClose }: LeftPanelProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<EventFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<EventFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [communeQuery, setCommuneQuery] = useState('');

  const searchQ = useQuery({
    queryKey: ['territories', 'search', communeQuery],
    queryFn: () => territoriesApi.search(communeQuery, 8),
    enabled: communeQuery.trim().length >= 2,
  });

  const listQ = useQuery({
    queryKey: ['events', 'crisis', applied, page],
    queryFn: () =>
      eventsApi.list({
        page,
        limit: 12,
        type: applied.type || undefined,
        status: applied.status || undefined,
        severity: applied.severity || undefined,
        startedAfter: applied.startedAfter ? new Date(applied.startedAfter).toISOString() : undefined,
        startedBefore: applied.startedBefore ? new Date(applied.startedBefore).toISOString() : undefined,
        search: applied.search || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const events = listQ.data?.data ?? [];

  const apply = () => {
    setPage(1);
    setApplied(draft);
  };

  const communeResults = searchQ.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-brand/10 px-3 py-2.5">
        <p className="font-display text-base text-ink">Filtres & événements</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-brand-soft lg:hidden"
            aria-label="Fermer le panneau"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Recherche commune */}
      <div className="border-b border-brand/10 p-3">
        <Input
          label="Rechercher une commune"
          value={communeQuery}
          onChange={(e) => setCommuneQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          placeholder="Nom ou code (min 2 caractères)"
          className="[&>input]:h-9"
        />
        {searchQ.isLoading ? <p className="mt-1 text-xs text-muted">Recherche…</p> : null}
        {communeResults.length > 0 ? (
          <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-brand/15 bg-white shadow-sm">
            {communeResults.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-brand-soft/50"
                  onClick={() => {
                    if (r.type !== 'commune') {
                      toast('Les districts ne sont pas sélectionnables ici', 'info');
                      return;
                    }
                    onSelectCommune(r);
                    setCommuneQuery('');
                  }}
                >
                  <Search className="size-3.5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{r.name}</span>
                    <span className="block text-xs text-muted">
                      {r.district?.name ?? ''} · {r.adminCode}
                    </span>
                  </span>
                  <Badge tone={r.type === 'commune' ? 'brand' : 'neutral'}>{r.type}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : communeQuery.trim().length >= 2 && !searchQ.isLoading ? (
          <p className="mt-1.5 text-xs text-muted">Aucun territoire trouvé.</p>
        ) : null}
      </div>

      {/* Filtres événements */}
      <div className="space-y-2 border-b border-brand/10 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Cpu className="size-3.5" /> Filtrer les événements
        </div>
        <Select
          value={draft.type}
          onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
          placeholder="Tous les types"
          options={EVENT_TYPES.map((t: EventType) => ({ value: t, label: EVENT_TYPE_LABELS[t] }))}
          className="[&>select]:h-9"
        />
        <Select
          value={draft.status}
          onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
          placeholder="Tous les statuts"
          options={EVENT_STATUSES.map((s: EventStatus) => ({
            value: s,
            label: EVENT_STATUS_LABELS[s],
          }))}
          className="[&>select]:h-9"
        />
        <Select
          value={draft.severity}
          onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value }))}
          placeholder="Toutes les sévérités"
          options={SEVERITIES.map((s: SeverityLevel) => ({ value: s, label: SEVERITY_LABELS[s] }))}
          className="[&>select]:h-9"
        />
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Calendar className="size-3.5" /> Période
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={draft.startedAfter}
            onChange={(e) => setDraft((d) => ({ ...d, startedAfter: e.target.value }))}
            className="h-9 rounded-lg border border-brand/20 bg-white px-3 text-sm text-ink outline-none"
          />
          <input
            type="date"
            value={draft.startedBefore}
            onChange={(e) => setDraft((d) => ({ ...d, startedBefore: e.target.value }))}
            className="h-9 rounded-lg border border-brand/20 bg-white px-3 text-sm text-ink outline-none"
          />
        </div>
        <Input
          value={draft.search}
          onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
          placeholder="Recherche texte…"
          className="[&>input]:h-9"
        />
        <Button size="sm" className="w-full" onClick={apply}>
          Appliquer les filtres
        </Button>
      </div>

      {/* Liste événements */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Événements ({listQ.data?.meta?.total ?? '…'})
          </p>
          <span className="text-[11px] text-muted">clic = contexte actif</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {listQ.isLoading ? (
            <Spinner label="Chargement des événements…" />
          ) : events.length === 0 ? (
            <EmptyState title="Aucun événement" description="Ajustez les filtres ou créez un événement." />
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => {
                const active = ev.id === activeEventId;
                return (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => onSelectEvent(ev.id)}
                      className={cn(
                        'w-full rounded-xl border border-brand/15 bg-white p-3 text-left shadow-sm transition hover:border-brand/40 hover:shadow',
                        active && 'border-brand ring-2 ring-brand/20',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-brand">{ev.eventCode}</span>
                        {active ? (
                          <Badge tone="brand">
                            <Zap className="mr-1 size-3" /> Actif
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-medium text-ink">{ev.name}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={EVENT_STATUS_TONE[ev.status]}>{EVENT_STATUS_LABELS[ev.status]}</Badge>
                        <Badge tone={EVENT_TYPE_TONE[ev.type]}>{EVENT_TYPE_LABELS[ev.type]}</Badge>
                        {ev.severity ? (
                          <Badge tone={SEVERITY_TONE[ev.severity]}>{SEVERITY_LABELS[ev.severity]}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted">
                        Début : {formatDate(ev.startedAt)} · Créé : {formatDate(ev.createdAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {listQ.data?.meta?.totalPages ? (
          <div className="border-t border-brand/10 p-2">
            <Pagination
              page={listQ.data.meta.page}
              totalPages={listQ.data.meta.totalPages}
              onChange={setPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}