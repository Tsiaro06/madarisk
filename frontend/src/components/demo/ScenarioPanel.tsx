import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FlaskConical, RotateCcw } from 'lucide-react';
import { demoApi } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { canManageOps } from '@/lib/roles';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { AdministrativeActionConfirmDialog } from '@/components/ui/AdministrativeActionConfirmDialog';
import { DEMO_MODE, DEMO_STEP_LABELS, DEMO_STEP_ORDER } from '@/config/demo';
import { cn } from '@/lib/utils';
import type { DemoStep } from '@/types/demo';

type PendingAction = { kind: 'step'; step: DemoStep } | { kind: 'reset' } | null;

const QUERY_PREFIXES: string[][] = [
  ['demo'],
  ['events'],
  ['event'],
  ['alerts'],
  ['dashboard'],
  ['crisis'],
  ['risks'],
  ['weather'],
];

export function ScenarioPanel() {
  const role = useAuthStore((s) => s.user?.role);
  const visible = DEMO_MODE && canManageOps(role);
  const [open, setOpen] = useState(true);
  const [pending, setPending] = useState<PendingAction>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const scenarioQ = useQuery({
    queryKey: ['demo', 'scenario'],
    queryFn: () => demoApi.scenario(),
    enabled: visible,
  });

  const currentStep = scenarioQ.data?.step ?? null;

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['demo'] });
    for (const prefix of QUERY_PREFIXES) {
      void qc.invalidateQueries({ queryKey: prefix });
    }
  };

  const stepM = useMutation({
    mutationFn: (step: DemoStep) => demoApi.setStep(step),
    onSuccess: (state) => {
      toast(`Étape appliquée : ${state.step ?? 'prévision'}`, 'success');
      setPending(null);
      invalidateAll();
    },
    onError: () => {
      toast('Impossible de changer l’étape de démonstration', 'error');
    },
  });

  const resetM = useMutation({
    mutationFn: () => demoApi.reset(),
    onSuccess: () => {
      toast('Démonstration réinitialisée', 'success');
      setPending(null);
      invalidateAll();
    },
    onError: () => {
      toast('Impossible de réinitialiser la démonstration', 'error');
    },
  });

  if (!visible) return null;

  const isPending = stepM.isPending || resetM.isPending;

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'reset') {
      resetM.mutate();
    } else {
      stepM.mutate(pending.step);
    }
  };

  const dialogTitle =
    pending?.kind === 'reset'
      ? 'Réinitialiser la démonstration ?'
      : pending
        ? `Afficher : ${DEMO_STEP_LABELS[pending.step]}`
        : '';

  const dialogDescription =
    pending?.kind === 'reset'
      ? 'Le scénario simulé sera supprimé puis reconstruit à l’étape 1. Aucune donnée réelle n’est affectée.'
      : 'Les données simulées correspondant à cette étape seront chargées.';

  return (
    <>
      <section
        aria-label="Scénario de soutenance"
        className="fixed bottom-4 left-4 z-[950] w-[min(92vw,22rem)] overflow-hidden rounded-xl border-2 border-amber-400 bg-amber-50 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 bg-amber-100 px-3 py-2 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <FlaskConical className="size-4 shrink-0 text-amber-700" />
            <span className="font-display text-sm font-semibold text-amber-950">
              Scénario de soutenance
            </span>
          </span>
          <ChevronDown
            className={cn('size-4 shrink-0 text-amber-700 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open ? (
          <div className="space-y-2 px-3 py-3">
            <p className="text-xs text-amber-900">
              Étape courante :{' '}
              <span className="font-semibold">
                {currentStep ? DEMO_STEP_LABELS[currentStep] : 'aucune (réinitialiser)'}
              </span>
            </p>

            {scenarioQ.data ? (
              <p className="text-[11px] text-amber-800/80">
                {scenarioQ.data.counts.tracks} points · {scenarioQ.data.counts.areas} zones ·{' '}
                {scenarioQ.data.counts.exposedCommunes} communes · {scenarioQ.data.counts.risks}{' '}
                risques · {scenarioQ.data.counts.alerts} alertes
              </p>
            ) : null}

            <div className="space-y-1.5 pt-1">
              {DEMO_STEP_ORDER.map((step) => {
                const active = currentStep === step;
                return (
                  <Button
                    key={step}
                    type="button"
                    variant={active ? 'primary' : 'secondary'}
                    className="w-full justify-start text-left text-xs"
                    onClick={() => setPending({ kind: 'step', step })}
                    disabled={isPending}
                  >
                    {DEMO_STEP_LABELS[step]}
                  </Button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="danger"
              className="w-full justify-start text-xs"
              onClick={() => setPending({ kind: 'reset' })}
              disabled={isPending}
            >
              <RotateCcw className="size-3.5" />
              Réinitialiser la démonstration
            </Button>

            <p className="pt-1 text-[10px] leading-snug text-amber-800/80">
              Données simulées uniquement. Aucun appel météo réel, aucune donnée opérationnelle.
            </p>
          </div>
        ) : null}
      </section>

      <AdministrativeActionConfirmDialog
        open={pending !== null}
        onOpenChange={(value) => {
          if (!value && !isPending) setPending(null);
        }}
        title={dialogTitle}
        description={dialogDescription}
        variant={pending?.kind === 'reset' ? 'destructive' : 'warning'}
        actionLabel={pending?.kind === 'reset' ? 'Réinitialiser' : 'Afficher cette étape'}
        isPending={isPending}
        onConfirm={confirm}
        contextLabel="Base"
        contextValue="DÉMONSTRATION"
      />
    </>
  );
}
