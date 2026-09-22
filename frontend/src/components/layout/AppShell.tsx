import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CloudSun,
  FileText,
  FileUp,
  GitCompare,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Map,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Shield,
  Siren,
  Users,
  X,
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
  hint: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Commencer ici',
    items: [
      {
        to: '/',
        label: 'Carte de crise',
        hint: 'Suivre la situation en direct',
        icon: Map,
      },
      {
        to: '/dashboard',
        label: 'Tableau de bord',
        hint: 'Chiffres clés du jour',
        icon: LayoutDashboard,
      },
      {
        to: '/meteo',
        label: 'Météo',
        hint: 'Pluie, vent, températures',
        icon: CloudSun,
      },
    ],
  },
  {
    title: 'Surveillance',
    items: [
      {
        to: '/evenements',
        label: 'Événements',
        hint: 'Cyclones et crises suivies',
        icon: Zap,
      },
      {
        to: '/alertes',
        label: 'Alertes',
        hint: 'Notifications à traiter',
        icon: Siren,
      },
      {
        to: '/risques',
        label: 'Niveaux de risque',
        hint: 'Par commune, automatiquement',
        icon: Shield,
      },
      {
        to: '/territoires',
        label: 'Territoires',
        hint: 'Districts et communes',
        icon: MapPinned,
      },
    ],
  },
  {
    title: 'Documents',
    items: [
      {
        to: '/rapports',
        label: 'Rapports',
        hint: 'Bilans et exports',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Outils experts',
    items: [
      {
        to: '/imports',
        label: 'Imports de données',
        hint: 'Charger des fichiers',
        icon: FileUp,
        roles: ['ANALYSTE_SIG', 'SUPER_ADMIN'],
      },
      {
        to: '/matching',
        label: 'Rapprochement',
        hint: 'Associer les données',
        icon: GitCompare,
        roles: ['ANALYSTE_SIG', 'SUPER_ADMIN'],
      },
      {
        to: '/administration',
        label: 'Utilisateurs',
        hint: 'Comptes et droits',
        icon: Users,
        roles: ['SUPER_ADMIN'],
      },
      {
        to: '/configurations-risque',
        label: 'Réglages risque',
        hint: 'Seuils et paramètres',
        icon: Settings2,
        roles: ['SUPER_ADMIN'],
      },
    ],
  },
];

const PAGE_META: { match: (path: string) => boolean; title: string; subtitle: string }[] = [
  {
    match: (p) => p === '/',
    title: 'Carte de crise',
    subtitle: 'Choisissez un événement à gauche, explorez la carte',
  },
  {
    match: (p) => p.startsWith('/dashboard'),
    title: 'Tableau de bord',
    subtitle: 'Vue d’ensemble des risques et alertes',
  },
  {
    match: (p) => p.startsWith('/meteo'),
    title: 'Météo',
    subtitle: 'Observations et prévisions par commune',
  },
  {
    match: (p) => p.startsWith('/evenements'),
    title: 'Événements',
    subtitle: 'Crises détectées et suivies',
  },
  {
    match: (p) => p.startsWith('/alertes'),
    title: 'Alertes',
    subtitle: 'Ce qui demande votre attention',
  },
  {
    match: (p) => p.startsWith('/risques'),
    title: 'Niveaux de risque',
    subtitle: 'Évaluation automatique par territoire',
  },
  {
    match: (p) => p.startsWith('/territoires'),
    title: 'Territoires',
    subtitle: 'Districts et communes de Madagascar',
  },
  {
    match: (p) => p.startsWith('/rapports'),
    title: 'Rapports',
    subtitle: 'Bilans et documents de synthèse',
  },
  {
    match: (p) => p.startsWith('/imports'),
    title: 'Imports',
    subtitle: 'Charger des données sur la plateforme',
  },
  {
    match: (p) => p.startsWith('/matching'),
    title: 'Rapprochement',
    subtitle: 'Associer les jeux de données',
  },
  // {
  //   match: (p) => p.startsWith('/administration'),
  //   title: 'Utilisateurs',
  //   subtitle: 'Gérer les accès',
  // },
  {
    match: (p) => p.startsWith('/configurations-risque'),
    title: 'Réglages risque',
    subtitle: 'Paramètres de calcul',
  },
  {
    match: (p) => p.startsWith('/mot-de-passe'),
    title: 'Mot de passe',
    subtitle: 'Sécuriser votre compte',
  },
];

function pageMeta(pathname: string) {
  return (
    PAGE_META.find((m) => m.match(pathname)) ?? {
      title: 'MadaRisk Map',
      subtitle: 'Cartographie des risques · Madagascar',
    }
  );
}

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fullBleed =
    location.pathname === '/' || location.pathname.startsWith('/meteo');

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!item.roles) return true;
          return user?.role ? item.roles.includes(user.role) : false;
        }),
      })).filter((g) => g.items.length > 0),
    [user],
  );

  const urgentQuery = useQuery({
    queryKey: ['alerts', 'urgent-banner'],
    queryFn: () => alertsApi.list({ activeOnly: true, limit: 5, page: 1 }),
    refetchInterval: 60_000,
  });

  const urgent = urgentQuery.data?.data ?? [];
  const meta = pageMeta(location.pathname);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!user) return <Spinner label="Chargement de la session…" />;

  return (
    <div
      className={cn(
        'min-h-screen lg:h-screen lg:grid lg:overflow-hidden',
        collapsed ? 'lg:grid-cols-[72px_1fr]' : 'lg:grid-cols-[272px_1fr]',
      )}
    >
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-line bg-surface transition-[width,transform] duration-200 lg:static lg:translate-x-0',
          collapsed ? 'lg:w-[72px]' : 'lg:w-[272px]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-3">
          <Link
            to="/"
            className={cn(
              'flex min-w-0 items-center gap-2.5',
              collapsed && 'justify-center',
            )}
            onClick={() => setOpen(false)}
            title="MadaRisk Map"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-deep/90 font-display text-base font-bold text-white">
              M
            </span>
            {!collapsed ? (
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-display text-base font-semibold text-ink">
                  MadaRisk <span className="text-brand">Map</span>
                </span>
                <span className="block text-[11px] text-muted">Madagascar · risques</span>
              </span>
            ) : null}
          </Link>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="hidden rounded-lg p-1.5 text-muted transition hover:bg-brand-soft hover:text-brand-deep lg:inline-flex"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
              title={collapsed ? 'Agrandir le menu' : 'Réduire le menu'}
            >
              {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </button>
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted hover:bg-brand-soft lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Navigation principale">
          {groups.map((group) => (
            <div key={group.title}>
              {!collapsed ? (
                <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {group.title}
                </p>
              ) : (
                <div className="mx-auto mb-1.5 h-px w-6 bg-line" aria-hidden />
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setOpen(false)}
                      title={collapsed ? `${item.label} — ${item.hint}` : item.hint}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition',
                          collapsed && 'justify-center px-2',
                          isActive
                            ? 'bg-brand-soft text-brand-deep ring-1 ring-brand/15'
                            : 'text-ink/75 hover:bg-canvas hover:text-ink',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={cn(
                              'size-4 shrink-0',
                              collapsed && 'size-5',
                              isActive ? 'opacity-100' : 'opacity-80 group-hover:opacity-100',
                            )}
                          />
                          {!collapsed ? (
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium leading-tight">
                                {item.label}
                              </span>
                              <span
                                className={cn(
                                  'block truncate text-[11px] leading-tight',
                                  isActive ? 'text-brand-deep/70' : 'text-muted',
                                )}
                              >
                                {item.hint}
                              </span>
                            </span>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {!collapsed ? (
          <div className="border-t border-line bg-canvas px-4 py-3 text-xs text-muted">
            <p className="font-medium text-ink">Besoin d’aide ?</p>
            <p className="mt-0.5 leading-snug">
              Commencez par la <strong className="font-semibold text-ink">carte de crise</strong>,
              puis ouvrez la météo ou les alertes.
            </p>
          </div>
        ) : null}
      </aside>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
          aria-label="Fermer le menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-col lg:overflow-hidden">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-md sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-line bg-surface p-2 text-muted transition hover:bg-brand-soft hover:text-brand-deep lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold tracking-tight text-ink sm:text-xl">
                {meta.title}
              </p>
              <p className="hidden truncate text-sm text-muted sm:block">{meta.subtitle}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* <p className="hidden text-sm text-muted md:block">
              Bonjour, <span className="font-medium text-ink">{firstName}</span>
            </p> */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-left text-sm shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/50"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {user.firstName?.[0]}
                  {user.lastName?.[0]}
                </span>
                <span className="hidden sm:block">
                  <span className="block max-w-[140px] truncate font-medium text-ink">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="block text-xs text-muted">{ROLE_LABELS[user.role]}</span>
                </span>
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
                  role="menu"
                >
                  <Link
                    to="/mot-de-passe"
                    className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-brand-soft"
                    onClick={() => setMenuOpen(false)}
                  >
                    <KeyRound className="size-4 text-brand" /> Mot de passe
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
          </div>
        </header>

        {!fullBleed && urgent.length > 0 ? (
          <div className="space-y-2 px-4 pt-4 sm:px-6">
            <AlertBanner tone="danger" title="Alertes actives — à consulter">
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

        <main
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            fullBleed ? 'overflow-hidden p-0' : 'overflow-y-auto px-4 py-6 sm:px-6 sm:py-8',
          )}
        >
          <Outlet />
        </main>

        {!fullBleed ? (
          <footer className="border-t border-line px-4 py-3 text-center text-xs text-muted sm:px-6">
            MadaRisk Map — plateforme de cartographie des risques
          </footer>
        ) : null}
      </div>

      <AiChatBubble />
    </div>
  );
}
