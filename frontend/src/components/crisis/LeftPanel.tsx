import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Cpu, MapPin, Search, X, Zap } from 'lucide-react';
import { eventsApi, territoriesApi, weatherApi } from '@/api';
import type {
  EventListItem,
  EventStatus,
  EventType,
  SeverityLevel,
  TerritorySearchResult,
} from '@/types';
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
}

export function LeftPanel({
  activeEventId,
  onSelectEvent,
  onSelectCommune,
  onClose,
  districtId,
  onDistrictChange,
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

  const districtsQ = useQuery({
    queryKey: ['territories', 'districts', 'options'],
    queryFn: () => territoriesApi.districts({ page: 1, limit: 100 }),
  });

  const monitoringQ = useQuery({
    queryKey: ['weather', 'monitoring'],
    queryFn: () => weatherApi.monitoring(),
  });

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
        status:
          applied.status && applied.status !== ACTIVE_STATUS_GROUP
            ? applied.status
            : undefined,
        severity: applied.severity || undefined,
        startedAfter: applied.startedAfter ? new Date(applied.startedAfter).toISOString() : undefined,
        startedBefore: applied.startedBefore ? new Date(applied.startedBefore).toISOString() : undefined,
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

  const apply = () => {
    setPage(1);
    setApplied(draft);
  };

  const lastEventUpdate = events.reduce<EventListItem | null>(
    (latest, e) =>
      latest == null || (e.updatedAt ?? '') > (latest.updatedAt ?? '') ? e : latest,
    null,
  );
  const observations = monitoringQ.data?.sync?.observations;
  const weatherLine = observations
    ? `${
        observations.status === 'FRESH'
          ? 'Fraîches'
          : observations.status === 'STALE'
            ? 'Périmées'
            : observations.status === 'NEVER'
              ? 'Jamais synchronisées'
              : 'Indisponibles'
      }${observations.lastDataAt ? ` · Obs. ${formatDate(observations.lastDataAt)}` : ''}`
    : null;
  const lastUpdateLine = lastEventUpdate
    ? formatDate(lastEventUpdate.updatedAt) +
      (lastEventUpdate.sourceName ? ` · ${lastEventUpdate.sourceName}` : '')
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
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
      <div className="border-b border-line p-4">
        <Input
          label="Rechercher une commune"
          value={communeQuery}
          onChange={(e) => setCommuneQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          placeholder="Nom ou code (min 2 caractères)"
          className="[&>input]:h-10"
        />
        {searchQ.isLoading ? <p className="mt-1 text-xs text-muted">Recherche…</p> : null}
        {communeResults.length > 0 ? (
          <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-brand/15 bg-white shadow-sm">
            {communeResults.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-gray-50"
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
      <div className="space-y-3 border-b border-line p-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Cpu className="size-3.5" /> Filtrer les événements
        </div>
        <Select
          value={draft.type}
          onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
          placeholder="Tous les types"
          options={EVENT_TYPES.map((t: EventType) => ({ value: t, label: EVENT_TYPE_LABELS[t] }))}
          className="[&>select]:h-10"
        />
        <Select
          value={draft.status}
          onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
          placeholder="Tous les statuts"
          options={[
            { value: ACTIVE_STATUS_GROUP, label: 'En cours (PREVISION / ACTIF / SUIVI)' },
            ...EVENT_STATUSES.map((s: EventStatus) => ({
              value: s,
              label: EVENT_STATUS_LABELS[s],
            })),
          ]}
          className="[&>select]:h-10"
        />
        <Select
          value={draft.severity}
          onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value }))}
          placeholder="Toutes les sévérités"
          options={SEVERITIES.map((s: SeverityLevel) => ({ value: s, label: SEVERITY_LABELS[s] }))}
          className="[&>select]:h-10"
        />
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <MapPin className="size-3.5" /> Zone
        </div>
        <Select
          value={districtId}
          onChange={(e) => onDistrictChange(e.target.value)}
          placeholder="Toutes les zones"
          options={(districtsQ.data?.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          className="[&>select]:h-10"
        />
        <p className="text-[11px] text-muted">
          La zone sélectionnée restreint la carte aux communes et observations de ce district.
        </p>
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Calendar className="size-3.5" /> Période
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={draft.startedAfter}
            onChange={(e) => setDraft((d) => ({ ...d, startedAfter: e.target.value }))}
            aria-label="Début de période"
            className="h-10 rounded-lg border border-brand/20 bg-white px-3 text-sm text-ink outline-none"
          />
          <input
            type="date"
            value={draft.startedBefore}
            onChange={(e) => setDraft((d) => ({ ...d, startedBefore: e.target.value }))}
            aria-label="Fin de période"
            className="h-10 rounded-lg border border-brand/20 bg-white px-3 text-sm text-ink outline-none"
          />
        </div>
        <Input
          value={draft.search}
          onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
          placeholder="Recherche texte…"
          aria-label="Rechercher un événement"
          className="[&>input]:h-10"
        />
        <Button size="md" className="w-full" onClick={apply}>
          Appliquer les filtres
        </Button>
      </div>

      {/* Liste événements */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Événements ({applied.status === ACTIVE_STATUS_GROUP ? events.length : listQ.data?.meta?.total ?? '…'})
          </p>
          <span className="text-[11px] text-muted">clic = contexte actif</span>
        </div>
        {lastUpdateLine || weatherLine ? (
          <div className="mx-3 mb-3 rounded-lg border border-brand/10 bg-white px-3 py-2 text-[11px] text-muted">
            {lastUpdateLine ? (
              <p>
                <span className="font-medium text-ink">Dernière mise à jour :</span> {lastUpdateLine}
              </p>
            ) : null}
            {weatherLine ? (
              <p className="mt-0.5">
                <span className="font-medium text-ink">Météo :</span> {weatherLine}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {listQ.isLoading ? (
            <Spinner label="Chargement des événements…" />
          ) : events.length === 0 ? (
            <EmptyState title="Aucun événement" description="Ajustez les filtres ou créez un événement." />
          ) : (
            <ul className="space-y-2.5">
              {events.map((ev) => {
                const active = ev.id === activeEventId;
                return (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => onSelectEvent(ev.id)}
                      className={cn(
                        'w-full rounded-xl border border-line bg-white p-3.5 text-left shadow-sm transition hover:border-brand/40 hover:shadow',
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
          <div className="border-t border-line p-2">
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