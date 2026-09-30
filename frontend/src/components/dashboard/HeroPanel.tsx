import { Bell, CloudSun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn, formatNumber } from '@/lib/utils';
import type { HeroView } from '@/data/dashboardView';
import { useAuthStore } from '@/stores/authStore';
import { RingGauge } from './RingGauge';

interface HeroPanelProps {
  hero: HeroView;
  className?: string;
}

export function HeroPanel({ hero, className }: HeroPanelProps) {
  const user = useAuthStore((s) => s.user);

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <aside className={cn('dash-hero dash-rise flex flex-col p-6', className)}>
      <header>
        <p className="text-sm text-(--dash-text-muted)">{hero.subtitle}</p>
      </header>

      <div className="my-7 flex justify-center">
        <RingGauge
          value={hero.coverage.percent}
          size={208}
          thickness={13}
          ariaLabel={`${hero.coverage.percent} % des communes évaluées`}
          detail={`${formatNumber(hero.coverage.covered)} sur ${formatNumber(hero.coverage.total)} communes évaluées`}
        />
      </div>

      <ul className="space-y-3 border-t border-(--dash-line) pt-5">
        {hero.miniStats.map((stat) => (
          <li key={stat.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5 text-sm text-(--dash-text-soft)">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full ring-1 ring-(--dash-navy-14)"
                style={{ backgroundColor: stat.color }}
              />
              <span className="truncate">{stat.label}</span>
            </span>
            <span className="font-[Outfit] text-lg font-bold tabular-nums text-(--dash-text)">
              {formatNumber(stat.value)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-2xl border border-(--dash-navy-14) bg-white p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="dash-figure">{formatNumber(hero.total.value)}</p>
            <p className="mt-1 truncate text-xs text-(--dash-text-muted)">
              {hero.total.label}
            </p>
          </div>
          <Link
            to="/risques"
            aria-label="Ouvrir la carte des risques"
            title="Ouvrir la carte des risques"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-(--dash-navy) text-white transition hover:bg-(--dash-navy-80) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dash-navy)"
          >
            <CloudSun className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <footer className="mt-auto flex items-center gap-3 border-t border-(--dash-line) pt-5">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-(--dash-navy) text-sm font-bold text-white"
        >
          {initials || '—'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-(--dash-text)">
            {user ? `${user.firstName} ${user.lastName}` : 'Utilisateur'}
          </p>
          <p className="truncate text-xs text-(--dash-text-muted)">{user?.email ?? '—'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to="/alertes"
            aria-label="Notifications et alertes"
            title="Notifications et alertes"
            className="inline-grid size-9 place-items-center rounded-full border border-(--dash-navy-14) bg-white text-(--dash-navy) transition hover:border-(--dash-navy) hover:bg-(--dash-navy) hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dash-navy)"
          >
            <Bell className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </footer>
    </aside>
  );
}