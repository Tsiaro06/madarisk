import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio, RefreshCw, ShieldAlert } from 'lucide-react';
import { risksApi, eventsApi, territoriesApi } from '@/api';
import { ApiClientError } from '@/api/client';
import { RISK_LABELS, type RiskLevel, type RiskPhase } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { SkeletonMap, SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { GeoJsonMap } from '@/components/maps/GeoJsonMap';
import { RefreshDataButton } from '@/components/ui/RefreshDataButton';
import { AdministrativeInterventionPanel } from '@/components/admin/AdministrativeInterventionPanel';
import { useToast } from '@/components/ui/Toast';
import { formatNumber, formatDate } from '@/lib/utils';

const PHASES: RiskPhase[] = ['AVANT', 'PENDANT', 'APRES', 'RETABLISSEMENT'];

/**
 * Libellés de phase en français. Les valeurs d'enum stockées restent en
 * anglais (`RiskPhase`), mais l'interface est en français de bout en bout.
 */
const PHASE_LABELS: Record<RiskPhase, string> = {
  AVANT: 'Avant',
  PENDANT: 'Pendant',
  APRES: 'Après',
  RETABLISSEMENT: 'Rétablissement',
};

const RISK_LEVELS: RiskLevel[] = ['FAIBLE', 'MODERE', 'ELEVE', 'EXTREME'];

/** Nombre d'événements proposés dans le sélecteur de filtre. */
const EVENT_OPTIONS_LIMIT = 100;
/** Nombre de communes affichées dans le tableau des priorités. */
const PRIORITY_LIMIT = 20;

function tone(level: RiskLevel) {
  if (level === 'EXTREME') return 'danger' as const;
  if (level === 'ELEVE') return 'warning' as const;
  if (level === 'MODERE') return 'info' as const;
  return 'success' as const;
}

export function RisquesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Filtres d'affichage : portent sur les données déjà évaluées.
  const [filterEventId, setFilterEventId] = useState('');
  const [filterPhase, setFilterPhase] = useState<RiskPhase | ''>('');
  const [filterLevel, setFilterLevel] = useState<RiskLevel | ''>('');

  // Paramètres du recalcul manuel (action administrative journalisée).
  const [recalcEventId, setRecalcEventId] = useState('');
  const [recalcDistrictId, setRecalcDistrictId] = useState('');
  const [recalcPhase, setRecalcPhase] = useState<RiskPhase>('PENDANT');

  const eventsQ = useQuery({
    queryKey: ['events', 'options'],
    queryFn: () => eventsApi.list({ limit: EVENT_OPTIONS_LIMIT }),
    staleTime: 60_000,
  });

  const districtsQ = useQuery({
    queryKey: ['territories', 'districts', 'options'],
    queryFn: () => territoriesApi.districts({ limit: 200 }),
    staleTime: 5 * 60_000,
  });

  const priorityQ = useQuery({
    queryKey: ['risks', 'priority', filterEventId, filterPhase, filterLevel],
    queryFn: () =>
      risksApi.priorityDetailed({
        limit: PRIORITY_LIMIT,
        ...(filterEventId ? { eventId: filterEventId } : {}),
        ...(filterPhase ? { phase: filterPhase } : {}),
        ...(filterLevel ? { riskLevel: filterLevel } : {}),
      }),
  });

  const mapQ = useQuery({
    queryKey: ['risks', 'map-layer', filterEventId, filterPhase, filterLevel],
    queryFn: () =>
      risksApi.mapLayer({
        ...(filterEventId ? { eventId: filterEventId } : {}),
        ...(filterPhase ? { phase: filterPhase } : {}),
        ...(filterLevel ? { riskLevel: filterLevel } : {}),
      }),
  });

  const recalcM = useMutation({
    mutationFn: () =>
      risksApi.recalculate({
        eventId: recalcEventId || undefined,
        districtId: recalcDistrictId || undefined,
        phase: recalcPhase,
      }),
    onSuccess: (data) => {
      toast(
        `Risques recalculés pour ${formatNumber(data.totalCommunes)} commune(s) — phase « ${
          PHASE_LABELS[recalcPhase]
        } ».`,
        'success',
      );
      void qc.invalidateQueries({ queryKey: ['risks'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiClientError ? err.message : 'Erreur lors du recalcul des risques';
      toast(msg, 'error');
    },
  });

  const onRecalc = (e: FormEvent) => {
    e.preventDefault();
    recalcM.mutate();
  };

  /** Le périmètre du recalcul : événement, puis district, sinon global. */
  const recalcScopeLabel = recalcEventId
    ? 'événement sélectionné'
    : recalcDistrictId
      ? 'district sélectionné'
      : 'toutes les communes (global)';

  // `total` suit les filtres (il vaut 0 pour un événement sans évaluation) ;
  // `coverageTotal` reste la couverture globale. Les confondre faisait écrire
  // « 1 577 communes sont pourtant évaluées » alors que la liste filtrée était
  // vide, en laissant croire à un simple problème d'affichage.
  const filteredTotal = priorityQ.data?.meta?.total ?? 0;
  const coverageTotal = priorityQ.data?.meta?.coverageTotal ?? filteredTotal;
  const mapCount = mapQ.data?.features.length ?? 0;
  const hasFilters = Boolean(filterEventId || filterPhase || filterLevel);
  const noAssessments = !priorityQ.isLoading && coverageTotal === 0 && !hasFilters;
  const emptyBecauseFilters = !priorityQ.isLoading && filteredTotal === 0 && hasFilters;
  const selectedEvent = (eventsQ.data?.data ?? []).find((ev) => ev.id === filterEventId);
  const selectedEventClosed = selectedEvent?.status === 'CLOTURE';

  const clearFilters = () => {
    setFilterEventId('');
    setFilterPhase('');
    setFilterLevel('');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink">Niveaux de risque</h1>
          <p className="text-sm text-muted">
            Évaluation automatique des risques par commune, par phase et par événement
          </p>
          {!priorityQ.isLoading ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
              <Radio className="size-3.5 shrink-0 text-emerald-600" />
              <span className="font-medium text-ink">Surveillance automatique active</span>
              <span>·</span>
              <span>
                {formatNumber(coverageTotal)} commune(s) évaluée(s)
                {priorityQ.data?.meta?.total != null && mapQ.data != null
                  ? ` · ${formatNumber(mapCount)} commune(s) affichée(s) sur la carte`
                  : ''}
              </span>
            </p>
          ) : null}
        </div>
        <RefreshDataButton
          queryKey={['risks']}
          onRefresh={() => void qc.refetchQueries({ queryKey: ['risks'] })}
        />
      </div>

      {priorityQ.isError || mapQ.isError ? (
        <AlertBanner tone="danger" title="Échec du chargement">
          Impossible de charger les données de risque. Réessayez ou rechargez la page.
        </AlertBanner>
      ) : null}

      <Card title="Filtres d'affichage">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Événement"
            value={filterEventId}
            onChange={(e) => setFilterEventId(e.target.value)}
            options={[
              { value: '', label: 'Tous les événements' },
              ...(eventsQ.data?.data ?? []).map((ev) => ({
                value: ev.id,
                label: `${ev.eventCode} · ${ev.name}`,
              })),
            ]}
          />
          <Select
            label="Phase"
            value={filterPhase}
            onChange={(e) => setFilterPhase(e.target.value as RiskPhase | '')}
            options={[
              { value: '', label: 'Toutes les phases' },
              ...PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] })),
            ]}
          />
          <Select
            label="Niveau"
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as RiskLevel | '')}
            options={[
              { value: '', label: 'Tous les niveaux' },
              ...RISK_LEVELS.map((l) => ({ value: l, label: RISK_LABELS[l] })),
            ]}
          />
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="w-full"
            >
              Réinitialiser les filtres
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          Ces filtres s'appliquent aux évaluations déjà enregistrées (liste et carte).
        </p>
      </Card>

      {noAssessments ? (
        <AlertBanner tone="warning" title="Aucune évaluation de risque enregistrée">
          L'évaluation est normalement automatique, mais elle ne se déclenche qu'autour d'un
          événement actif — et aucun événement n'est actuellement en cours. Utilisez
          « Relancer le calcul des risques » ci-dessous en périmètre <strong>global</strong> pour
          obtenir un premier état de référence sur l'ensemble des communes.
        </AlertBanner>
      ) : null}

      {emptyBecauseFilters ? (
        <AlertBanner tone="info" title="Aucune évaluation pour ces filtres">
          {filterEventId
            ? selectedEventClosed
              ? "Cet événement est clôturé : aucune évaluation de risque n'a été enregistrée, et le calcul automatique ne couvre que les événements actifs."
              : "Aucune évaluation de risque n'est encore enregistrée pour cet événement."
            : 'Aucune évaluation de risque ne correspond à ces filtres.'}{' '}
          {coverageTotal > 0
            ? `${formatNumber(coverageTotal)} commune(s) sont évaluées pour d'autres événements ou phases : élargissez ou réinitialisez les filtres.`
            : null}{' '}
          <button type="button" className="underline" onClick={clearFilters}>
            Réinitialiser
          </button>
        </AlertBanner>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Communes prioritaires">
          {priorityQ.isLoading ? (
            <SkeletonTable rows={6} columns={4} />
          ) : (priorityQ.data?.data.length ?? 0) === 0 ? (
            <EmptyState title="Aucune commune prioritaire" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line bg-gray-50 text-muted">
                  <tr>
                    <th className="px-3 py-2.5">Commune</th>
                    <th className="px-3 py-2.5">Score</th>
                    <th className="px-3 py-2.5">Niveau</th>
                    <th className="px-3 py-2.5">Évalué le</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityQ.data?.data.map((c) => (
                    <tr key={c.communeId} className="border-b border-brand/5">
                      <td className="px-3 py-2.5">
                        <Link
                          className="text-brand hover:underline"
                          to={`/territoires/communes/${c.communeId}`}
                        >
                          {c.communeName}
                        </Link>
                        <div className="text-xs text-muted">{c.districtName}</div>
                      </td>
                      <td className="px-3 py-2.5">{formatNumber(c.riskScore)}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={tone(c.riskLevel)}>{RISK_LABELS[c.riskLevel]}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {formatDate(c.assessedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTotal > PRIORITY_LIMIT ? (
                <p className="mt-2 text-xs text-muted">
                  Les {PRIORITY_LIMIT} communes au score le plus élevé —{' '}
                  {formatNumber(filteredTotal)} évaluée(s)
                  {hasFilters ? ' pour ces filtres' : ' au total'}.
                </p>
              ) : null}
            </div>
          )}
        </Card>

        <Card title="Carte des risques">
          {mapQ.isLoading ? (
            <SkeletonMap height={480} />
          ) : (
            <>
              <GeoJsonMap data={mapQ.data} height={480} />
              {mapCount === 0 && !emptyBecauseFilters ? (
                <p className="mt-2 text-xs text-muted">
                  Aucune commune évaluée à afficher. Lancez un recalcul global pour colorer la
                  carte.
                </p>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <AdministrativeInterventionPanel title="Risques">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_auto]" onSubmit={onRecalc}>
          <Select
            label="Événement (recalcul)"
            value={recalcEventId}
            onChange={(e) => setRecalcEventId(e.target.value)}
            options={[
              { value: '', label: 'Tous (global)' },
              ...(eventsQ.data?.data ?? []).map((ev) => ({
                value: ev.id,
                label: `${ev.eventCode} · ${ev.name}`,
              })),
            ]}
          />
          <Select
            label="District (recalcul)"
            value={recalcDistrictId}
            onChange={(e) => setRecalcDistrictId(e.target.value)}
            options={[
              { value: '', label: 'Tous les districts' },
              ...(districtsQ.data?.data ?? []).map((d) => ({
                value: d.id,
                label: d.name,
              })),
            ]}
          />
          <Select
            label="Phase"
            value={recalcPhase}
            onChange={(e) => setRecalcPhase(e.target.value as RiskPhase)}
            options={PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))}
          />
          <div className="flex items-end">
            <Button type="submit" loading={recalcM.isPending}>
              <RefreshCw className="size-4" />
              Relancer le calcul
            </Button>
          </div>
        </form>
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Périmètre : <strong>{recalcScopeLabel}</strong>. Recalcul manuel des scores et niveaux
            par commune pour la phase choisie (relance contrôlée — le calcul est normalement
            automatique). Un recalcul global peut prendre quelques secondes.
          </span>
        </p>
      </AdministrativeInterventionPanel>
    </div>
  );
}
