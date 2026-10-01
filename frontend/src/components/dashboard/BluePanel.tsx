import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Bell, LogOut, Settings } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { formatNumber } from '@/lib/utils';
import { dashboardData } from '@/data/dashboardData';
import { RingGauge } from './RingGauge';

export function BluePanel() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { coverage, miniStats, bigTotal } = dashboardData;

  const firstName = user?.firstName ?? 'Analyste';
  const displayName = user ? `${user.firstName} ${user.lastName}` : 'Session de démonstration';
  const email = user?.email ?? 'demo@madarisk.mg';
  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}` : 'MR';

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const iconButton =
    'grid size-9 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white';

  return (
    <aside className="dash-panel-blue dash-rise dash-rise-2 flex flex-col rounded-3xl p-6">
      <header>
        <p className="text-2xl font-bold tracking-tight">Bonjour, {firstName} !</p>
        <p className="mt-1 text-sm text-white/75">
          Vue opérationnelle de MadaRisk Map — Madagascar
        </p>
      </header>

      {/* Jauge de couverture : anneau blanc, pourcentage en bulle blanche */}
      <div className="mt-8 flex flex-col items-center">
        <RingGauge
          value={coverage.percent}
          size={190}
          strokeWidth={14}
          color="#ffffff"
          trackColor="rgba(255, 255, 255, 0.28)"
          label={`${coverage.detailLabel} : ${coverage.percent} %`}
          bubbleClassName="h-[52%] w-[52%] bg-white text-3xl font-extrabold text-dash shadow-[0_14px_30px_-12px_rgba(12,26,84,0.6)]"
        >
          {coverage.percent} %
        </RingGauge>

        <div className="mt-5 text-center">
          <p className="text-lg font-bold tabular-nums">
            {formatNumber(coverage.current)}
            <span className="mx-1.5 font-normal text-white/70">sur</span>
            {formatNumber(coverage.total)}
          </p>
          <p className="text-sm text-white/70">{coverage.detailLabel}</p>
        </div>
      </div>

      {/* Mini-statistiques */}
      <div className="mt-8 grid gap-2.5">
        {miniStats.map((stat) => (
          <div
            key={stat.id}
            className="flex items-center gap-3 rounded-2xl bg-white/12 px-4 py-3 ring-1 ring-inset ring-white/20 backdrop-blur-sm transition-colors duration-200 hover:bg-white/20"
          >
            <span className={`size-2.5 shrink-0 rounded-full ${stat.dotClass}`} />
            <span className="min-w-0 flex-1 truncate text-sm text-white/85">{stat.label}</span>
            <span className="text-base font-bold tabular-nums">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Total + accès */}
      <div className="mt-8 rounded-2xl bg-white/12 p-4 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-white/70">{bigTotal.label}</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">
              {formatNumber(bigTotal.value)}
            </p>
          </div>
          <Link
            to={bigTotal.linkTo}
            aria-label={bigTotal.ctaLabel}
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-dash shadow-lg transition-transform duration-200 hover:scale-105"
          >
            <ArrowUpRight className="size-5" />
          </Link>
        </div>
      </div>

      {/* Pied : profil + actions */}
      <div className="mt-8 flex items-center gap-3 border-t border-white/20 pt-5">
        <div
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-dash-lime text-sm font-bold text-[#1a2e05]"
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{displayName}</p>
          <p className="truncate text-xs text-white/70">{email}</p>
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
          <button
            type="button"
            aria-label="Notifications"
            className={iconButton}
            onClick={() => toast('Aucune nouvelle notification.', 'info')}
          >
            <Bell className="size-4" />
          </button>
          <button type="button" aria-label="Se déconnecter" className={iconButton} onClick={handleLogout}>
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
