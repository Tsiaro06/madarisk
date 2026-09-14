import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CloudSun,
  FileUp,
  GitCompare,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Shield,
  Siren,
  Users,
  X,
  FileText,
  Zap,
} from 'lucide-react';
import { alertsApi } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LABELS } from '@/lib/roles';
import type { UserRole } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Spinner } from '@/components/ui/Spinner';
import { AiChatBubble } from '@/components/ai/AiChatBubble';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/territoires', label: 'Territoires', icon: MapPinned },
  { to: '/evenements', label: 'Événements', icon: Zap },
  { to: '/meteo', label: 'Météo', icon: CloudSun },
  { to: '/risques', label: 'Risques', icon: Shield },
  { to: '/alertes', label: 'Alertes', icon: Siren },
  { to: '/imports', label: 'Imports', icon: FileUp, roles: ['ANALYSTE_SIG', 'SUPER_ADMIN'] },
  { to: '/matching', label: 'Matching', icon: GitCompare, roles: ['ANALYSTE_SIG', 'SUPER_ADMIN'] },
  { to: '/rapports', label: 'Rapports', icon: FileText },
  { to: '/administration', label: 'Administration', icon: Users, roles: ['SUPER_ADMIN'] },
  {
    to: '/configurations-risque',
    label: 'Config. risque',
    icon: Settings2,
    roles: ['SUPER_ADMIN'],
  },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const links = useMemo(
    () =>
      NAV.filter((item) => {
        if (!item.roles) return true;
        return user?.role ? item.roles.includes(user.role) : false;
      }),
    [user?.role],
  );

  const urgentQuery = useQuery({
    queryKey: ['alerts', 'urgent-banner'],
    queryFn: () => alertsApi.list({ activeOnly: true, limit: 5, page: 1 }),
    refetchInterval: 60_000,
  });

  const urgent = urgentQuery.data?.data ?? [];

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) return <Spinner label="Chargement de la session…" />;

  return (
    <div
      className={cn(
        'min-h-screen lg:h-screen lg:grid lg:overflow-hidden',
        collapsed ? 'lg:grid-cols-[64px_1fr]' : 'lg:grid-cols-[260px_1fr]',
      )}
    >
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-line bg-surface transition-[width,transform] duration-200 lg:static lg:translate-x-0',
          collapsed ? 'lg:w-[64px]' : 'lg:w-[260px]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-4">
          <Link
            to="/"
            className={cn(
              'font-display text-lg font-bold tracking-tight text-ink',
              collapsed ? 'select-none text-brand' : 'mr-1',
            )}
            onClick={() => setOpen(false)}
            title={collapsed ? 'MadaRisk Map' : undefined}
          >
            {collapsed ? 'M' : (
              <>
                MadaRisk <span className="text-brand">Map</span>
              </>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="hidden rounded-lg p-1.5 text-muted transition hover:bg-gray-100 lg:inline-flex"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Agrandir le menu' : 'Rétrécir le menu'}
              title={collapsed ? 'Agrandir le menu' : 'Rétrécir le menu'}
            >
              {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </button>
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted hover:bg-gray-100 lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setOpen(false)}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                    collapsed && 'justify-center px-2',
                    isActive ? 'bg-brand-soft text-brand-deep' : 'text-muted hover:bg-gray-100 hover:text-ink',
                  )
                }
              >
                <Icon className={cn('size-4 shrink-0 opacity-90', collapsed && 'size-5')} />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </NavLink>
            );
          })}
        </nav>
        <div className={cn('border-t border-line px-5 py-4 text-xs text-muted', collapsed && 'hidden')}>
          Salle de crise · Madagascar
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Fermer le menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-col lg:overflow-y-auto">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-line p-2 text-muted hover:bg-gray-100 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Poste de commandement</p>
              <p className="text-base font-semibold tracking-tight text-ink">Cartographie des risques</p>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm shadow-sm"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {user.firstName?.[0]}
                {user.lastName?.[0]}
              </span>
              <span className="hidden sm:block">
                <span className="block font-medium text-ink">
                  {user.firstName} {user.lastName}
                </span>
                <span className="block text-xs text-muted">{ROLE_LABELS[user.role]}</span>
              </span>
            </button>
            {menuOpen ? (
              <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
                <Link
                  to="/mot-de-passe"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  <KeyRound className="size-4" /> Mot de passe
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-risk-extreme hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false);
                    void onLogout();
                  }}
                >
                  <LogOut className="size-4" /> Déconnexion
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {urgent.length > 0 ? (
          <div className="space-y-2 px-4 pt-4 sm:px-6">
            <AlertBanner tone="danger" title="Alertes actives">
              <ul className="space-y-1">
                {urgent.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <Link to="/alertes" className="underline-offset-2 hover:underline">
                      {a.title} · {a.severity}
                    </Link>
                  </li>
                ))}
              </ul>
            </AlertBanner>
          </div>
        ) : null}

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>

        <footer className="border-t border-line px-4 py-3 text-center text-xs text-muted sm:px-6">
          MadaRisk Map — interface salle de crise
        </footer>
      </div>

      <AiChatBubble />
    </div>
  );
}
