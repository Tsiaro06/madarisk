import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import { eventsApi, territoriesApi } from '@/api';
import type {
  EventStatus,
  EventType,
  SeverityLevel,
  TerritorySearchResult,
} from '@/types';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { AdministrativeInterventionPanel } from '@/components/admin/AdministrativeInterventionPanel';
import { EventSelector } from '@/components/crisis/EventSelector';
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
import { cn, formatDate } from '@/lib/utils';

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

const ACTIVE_STATUS_GROUP = 'ACTIVE';
const ACTIVE_STATUSES: readonly EventStatus[] = ['PREVISION', 'ACTIF', 'SUIVI'];

interface LeftPanelProps {
  activeEventId: string | null;
  onSelectEvent: (id: string) => void;
  onSelectCommune: (result: TerritorySearchResult) => void;
  onClose: () => void;
  districtId: string;
  onDistrictChange: (id: string) => void;
  onCreateEvent?: () => void;
  canCreate?: boolean;
  statusLine?: string | null;
  weatherLine?: string | null;
}

function countActiveFilters(f: EventFilters, districtId: string): number {
  let n = 0;
  if (f.type) n += 1;
  if (f.status && f.status !== ACTIVE_STATUS_GROUP) n += 1;
  if (f.severity) n += 1;
  if (f.startedAfter || f.startedBefore) n += 1;
  if (f.search.trim()) n += 1;
  if (districtId) n += 1;
  return n;
}

export function LeftPanel({
  activeEventId,
  onSelectEvent,
  onSelectCommune,
  onClose,
  districtId,
  onDistrictChange,
  onCreateEvent,
  canCreate = false,
  statusLine,
  weatherLine,
}: LeftPanelProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<EventFilters>({
    ...EMPTY_FILTERS,
    status: ACTIVE_STATUS_GROUP,
  });
  const [applied, setApplied] = useState<EventFilters>({
    ...EMPTY_FILTERS,
    status: ACTIVE_STATUS_GROUP,
  });
  const [page, setPage] = useState(1);
  const [communeQuery, setCommuneQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [communeOpen, setCommuneOpen] = useState(false);

  const districtsQ = useQuery({
    queryKey: ['territories', 'districts', 'options'],
    queryFn: () => territoriesApi.districts({ page: 1, limit: 100 }),
  });

  const searchQ = useQuery({
    queryKey: ['territories', 'search', communeQuery],
    queryFn: () => territoriesApi.search(communeQuery, 8),
    enabled: communeOpen && communeQuery.trim().length >= 2,
  });

  const listQ = useQuery({
    queryKey: ['events', 'crisis', applied, page],
    queryFn: () =>
      eventsApi.list({
        page,
        limit: 12,
        type: applied.type || undefined,
        status:
          applied.status && applied.status !== ACTIVE_STATUS_GROUP
            ? applied.status
            : undefined,
        severity: applied.severity || undefined,
        startedAfter: applied.startedAfter
          ? new Date(applied.startedAfter).toISOString()
          : undefined,
        startedBefore: applied.startedBefore
          ? new Date(applied.startedBefore).toISOString()
          : undefined,
        search: applied.search || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const allEvents = listQ.data?.data ?? [];
  const events =
    applied.status === ACTIVE_STATUS_GROUP
      ? allEvents.filter((e) => (ACTIVE_STATUSES as readonly string[]).includes(e.status))
      : allEvents;
  const communeResults = searchQ.data ?? [];
  const filterCount = countActiveFilters(applied, districtId);

  const apply = () => {
    setPage(1);
    setApplied(draft);
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    const next = { ...EMPTY_FILTERS, status: ACTIVE_STATUS_GROUP };
    setDraft(next);
    setApplied(next);
    onDistrictChange('');
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-ink">Événements</p>
          <p className="truncate text-xs text-muted">Choisissez celui à suivre sur la carte</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:bg-canvas hover:text-ink"
          aria-label="Réduire la liste des événements"
          title="Réduire"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      {/* Événement sélectionné + détails */}
      <div className="space-y-2 border-b border-line px-3 py-3">
        <p className="text-xs font-medium text-muted">Événement à suivre</p>
        <EventSelector className="w-full" />
        {activeEventId ? (
          <Link
            to={`/evenements/${activeEventId}`}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-ink transition hover:bg-canvas"
            title="Voir le détail de l’événement sélectionné"
          >
            <Settings className="size-4 text-muted" />
            Détails de l’événement
          </Link>
        ) : (
          <span
            className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-line text-sm font-medium text-muted opacity-50"
            title="Sélectionnez d’abord un événement"
          >
            <Settings className="size-4" />
            Détails de l’événement
          </span>
        )}
      </div>

      {/* Barre d’actions compacte */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={() => {
            setFiltersOpen((v) => !v);
            setCommuneOpen(false);
          }}
          className={cn(
            'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition',
            filtersOpen || filterCount > 0
              ? 'border-slate-300 bg-canvas text-ink'
              : 'border-line bg-surface text-muted hover:bg-canvas hover:text-ink',
          )}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal className="size-3.5" />
          Filtres
          {filterCount > 0 ? (
            <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand-deep">
              {filterCount}
            </span>
          ) : null}
          <ChevronDown className={cn('size-3.5 transition', filtersOpen && 'rotate-180')} />
        </button>
        <button
          type="button"
          onClick={() => {
            setCommuneOpen((v) => !v);
            setFiltersOpen(false);
          }}
          className={cn(
            'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition',
            communeOpen
              ? 'border-slate-300 bg-canvas text-ink'
              : 'border-line bg-surface text-muted hover:bg-canvas hover:text-ink',
          )}
          aria-expanded={communeOpen}
        >
          <Search className="size-3.5" />
          Commune
          <ChevronDown className={cn('size-3.5 transition', communeOpen && 'rotate-180')} />
        </button>
      </div>

      {filtersOpen ? (
        <div className="space-y-2.5 border-b border-line bg-canvas/60 px-3 py-3">
          <Select
            value={draft.type}
            onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
            placeholder="Tous les types"
            options={EVENT_TYPES.map((t: EventType) => ({
              value: t,
              label: EVENT_TYPE_LABELS[t],
            }))}
            className="[&>select]:h-9"
          />
          <Select
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            placeholder="Tous les statuts"
            options={[
              { value: ACTIVE_STATUS_GROUP, label: 'En cours' },
              ...EVENT_STATUSES.map((s: EventStatus) => ({
                value: s,
                label: EVENT_STATUS_LABELS[s],
              })),
            ]}
            className="[&>select]:h-9"
          />
          <Select
            value={draft.severity}
            onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value }))}
            placeholder="Toutes les sévérités"
            options={SEVERITIES.map((s: SeverityLevel) => ({
              value: s,
              label: SEVERITY_LABELS[s],
            }))}
            className="[&>select]:h-9"
          />
          <Select
            value={districtId}
            onChange={(e) => onDistrictChange(e.target.value)}
            placeholder="Toutes les zones"
            options={(districtsQ.data?.data ?? []).map((d) => ({
              value: d.id,
              label: d.name,
            }))}
            className="[&>select]:h-9"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={draft.startedAfter}
              onChange={(e) => setDraft((d) => ({ ...d, startedAfter: e.target.value }))}
              aria-label="Début de période"
              className="h-9 rounded-lg border border-line bg-white px-2 text-xs text-ink outline-none"
            />
            <input
              type="date"
              value={draft.startedBefore}
              onChange={(e) => setDraft((d) => ({ ...d, startedBefore: e.target.value }))}
              aria-label="Fin de période"
              className="h-9 rounded-lg border border-line bg-white px-2 text-xs text-ink outline-none"
            />
          </div>
          <input
            type="search"
            value={draft.search}
            onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            placeholder="Rechercher un événement…"
            aria-label="Rechercher un événement"
            className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={resetFilters}>
              Réinitialiser
            </Button>
            <Button size="sm" className="flex-1" onClick={apply}>
              Appliquer
            </Button>
          </div>
        </div>
      ) : null}

      {communeOpen ? (
        <div className="border-b border-line bg-canvas/60 px-3 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={communeQuery}
              onChange={(e) => setCommuneQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              placeholder="Nom ou code (min. 2 caractères)"
              className="h-9 w-full rounded-lg border border-line bg-white py-2 pl-8 pr-3 text-sm text-ink outline-none placeholder:text-muted"
              autoFocus
            />
          </div>
          {searchQ.isLoading ? <p className="mt-2 text-xs text-muted">Recherche…</p> : null}
          {communeResults.length > 0 ? (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-line bg-white">
              {communeResults.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-canvas"
                    onClick={() => {
                      if (r.type !== 'commune') {
                        toast('Les districts ne sont pas sélectionnables ici', 'info');
                        return;
                      }
                      onSelectCommune(r);
                      setCommuneQuery('');
                      setCommuneOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{r.name}</span>
                      <span className="block text-xs text-muted">
                        {r.district?.name ?? ''} · {r.adminCode}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : communeQuery.trim().length >= 2 && !searchQ.isLoading ? (
            <p className="mt-2 text-xs text-muted">Aucun territoire trouvé.</p>
          ) : null}
        </div>
      ) : null}

      {/* Liste — zone principale */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-xs font-medium text-muted">
            {applied.status === ACTIVE_STATUS_GROUP
              ? `${events.length} en cours`
              : `${listQ.data?.meta?.total ?? '…'} résultat(s)`}
          </p>
          {filterCount > 0 && !filtersOpen ? (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Effacer les filtres
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {listQ.isLoading ? (
            <Spinner label="Chargement…" />
          ) : events.length === 0 ? (
            <EmptyState
              title="Aucun événement"
              description="Ouvrez les filtres ou créez un événement."
              className="py-8"
            />
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
                        'w-full rounded-xl border border-line bg-white p-3 text-left transition hover:border-slate-300 hover:bg-canvas/50',
                        active && 'border-brand/40 bg-brand-soft/60 ring-1 ring-brand/15',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">
                          {ev.name}
                        </p>
                        {active ? (
                          <Badge tone="brand" className="shrink-0">
                            <Zap className="mr-0.5 size-3" /> Suivi
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Badge tone={EVENT_STATUS_TONE[ev.status]}>
                          {EVENT_STATUS_LABELS[ev.status]}
                        </Badge>
                        <Badge tone={EVENT_TYPE_TONE[ev.type]}>
                          {EVENT_TYPE_LABELS[ev.type]}
                        </Badge>
                        {ev.severity ? (
                          <Badge tone={SEVERITY_TONE[ev.severity]}>
                            {SEVERITY_LABELS[ev.severity]}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted">
                        {ev.eventCode} · {formatDate(ev.startedAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {listQ.data?.meta?.totalPages && listQ.data.meta.totalPages > 1 ? (
          <div className="border-t border-line p-2">
            <Pagination
              page={listQ.data.meta.page}
              totalPages={listQ.data.meta.totalPages}
              onChange={setPage}
            />
          </div>
        ) : null}
      </div>

      {(statusLine || weatherLine) ? (
        <div className="space-y-0.5 border-t border-line px-3 py-2 text-[11px] text-muted">
          {statusLine ? <p className="truncate">{statusLine}</p> : null}
          {weatherLine ? <p className="truncate">{weatherLine}</p> : null}
        </div>
      ) : null}

      {canCreate && onCreateEvent ? (
        <div className="border-t border-line p-2">
          <AdministrativeInterventionPanel compact>
            <Button variant="outline" size="sm" className="w-full" onClick={onCreateEvent}>
              <Plus className="size-4" /> Nouvel événement
            </Button>
          </AdministrativeInterventionPanel>
        </div>
      ) : null}
    </div>
  );
}
