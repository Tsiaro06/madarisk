import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, LogOut, Settings } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatNumber } from '@/lib/utils';
import { RingGauge } from './RingGauge';

export interface BluePanelMiniStat {
  id: string;
  label: string;
  value: string;
  /** Pastille : couleur de la rampe de risque, pas une classe utilitaire. */
  color: string;
}

export interface BluePanelProps {
  /** Couverture météo : communes disposant d'une observation récente. */
  coverage: {
    percent: number;
    current: number;
    total: number;
    detailLabel: string;
  };
  miniStats: BluePanelMiniStat[];
  bigTotal: { value: number; label: string; ctaLabel: string; linkTo: string };
}

export function BluePanel({ coverage, miniStats, bigTotal }: BluePanelProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const iconButton =
    'grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-dash-pale hover:text-ink';

  return (
    <aside className="dash-card dash-rise dash-rise-2 flex flex-col p-6">
      <header>
        <p className="text-2xl font-bold tracking-tight text-dash-title">
          {user ? `Bonjour, ${user.firstName} !` : 'Bonjour !'}
        </p>
        <p className="mt-1 text-sm text-muted">
          Vue opérationnelle de MadaRisk Map — Madagascar
        </p>
      </header>

      {/* Jauge de couverture : anneau bleu de marque, pourcentage en bulle pâle.
          Sur fond blanc, la bulle ne peut plus être blanche : elle disparaîtrait. */}
      <div className="mt-8 flex flex-col items-center">
        <RingGauge
          value={coverage.percent}
          size={190}
          strokeWidth={14}
          color="#2f5bea"
          trackColor="rgba(47, 91, 234, 0.14)"
          label={`${coverage.detailLabel} : ${coverage.percent} %`}
          bubbleClassName="h-[52%] w-[52%] bg-dash-pale text-3xl font-extrabold text-dash shadow-[0_14px_30px_-16px_rgba(47,91,234,0.45)]"
        >
          {coverage.percent} %
        </RingGauge>

        <div className="mt-5 text-center">
          <p className="text-lg font-bold tabular-nums text-dash-title">
            {formatNumber(coverage.current)}
            <span className="mx-1.5 font-normal text-muted">sur</span>
            {formatNumber(coverage.total)}
          </p>
          <p className="text-sm text-muted">{coverage.detailLabel}</p>
        </div>
      </div>

      {/* Mini-statistiques */}
      <div className="mt-8 grid gap-2.5">
        {miniStats.map((stat) => (
          <div
            key={stat.id}
            className="flex items-center gap-3 rounded-2xl border border-line bg-dash-pale/60 px-4 py-3 transition-colors duration-200 hover:bg-dash-pale"
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: stat.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{stat.label}</span>
            <span className="text-base font-bold tabular-nums text-dash-title">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Total + accès */}
      <div className="mt-8 rounded-2xl border border-line bg-dash-pale/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{bigTotal.label}</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-dash-title">
              {formatNumber(bigTotal.value)}
            </p>
          </div>
          <Link
            to={bigTotal.linkTo}
            aria-label={bigTotal.ctaLabel}
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-dash text-white shadow-lg transition-transform duration-200 hover:scale-105"
          >
            <ArrowUpRight className="size-5" />
          </Link>
        </div>
      </div>

      {/* Pied : profil + déconnexion */}
      <div className="mt-8 flex items-center gap-3 border-t border-line pt-5">
        <div
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-dash-lime text-sm font-bold text-[#1a2e05]"
        >
          {user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}` : '—'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {user ? `${user.firstName} ${user.lastName}` : 'Session inconnue'}
          </p>
          <p className="truncate text-xs text-muted">{user?.email ?? '—'}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mon profil"
            className={iconButton}
            onClick={() => navigate('/profil')}
          >
            <Settings className="size-4" />
          </button>
          <button type="button" aria-label="Se déconnecter" className={iconButton} onClick={handleLogout}>
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
