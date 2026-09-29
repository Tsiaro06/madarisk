import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, LogOut, Menu, UserRound } from 'lucide-react';
import { alertsApi } from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Spinner } from '@/components/ui/Spinner';
import { AiChatBubble } from '@/components/ai/AiChatBubble';
import { Sidebar, SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH } from './Sidebar';

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
    match: (p) => p.startsWith('/administration'),
    title: 'Utilisateurs',
    subtitle: 'Gérer les accès',
  },
  {
    match: (p) => p.startsWith('/profil'),
    title: 'Mon profil',
    subtitle: 'Compte et sécurité',
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
  const [sidebarVisible, setSidebarVisible] = useState(true);
  // Même valeur que le breakpoint `lg` de Tailwind, qui n'est pas exposé au
  // JS : c'est la seule façon de brancher le clic de l'icône du navbar sur le
  // tiroir mobile ou sur la colonne desktop.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const menuRef = useRef<HTMLDivElement>(null);

  const fullBleed =
    location.pathname === '/' || location.pathname.startsWith('/meteo');

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

  // Une seule icône, deux comportements selon la largeur : tiroir hors écran
  // en dessous de `lg`, colonne de grille au-dessus.
  const sidebarExpanded = isDesktop ? sidebarVisible : open;
  const menuLabel = isDesktop
    ? sidebarVisible
      ? 'Masquer le menu latéral'
      : 'Afficher le menu latéral'
    : 'Ouvrir le menu';

  // Le sidebar est en `fixed` : la colonne de contenu se décale d'autant.
  const reserved = isDesktop
    ? !sidebarVisible
      ? 0
      : collapsed
        ? SIDEBAR_RAIL_WIDTH
        : SIDEBAR_WIDTH
    : 0;

  if (!user) return <Spinner label="Chargement de la session…" />;

  return (
    <div
      className="min-h-screen lg:h-screen lg:overflow-hidden"
      style={{ '--sidebar-offset': `${reserved}px` } as CSSProperties}
    >
      <Sidebar
        visible={sidebarVisible}
        open={open}
        onOpenChange={setOpen}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        alertCount={urgent.length}
        role={user.role}
      />

      <div
        className="flex min-h-0 min-w-0 flex-col lg:h-screen lg:overflow-hidden lg:pl-[var(--sidebar-offset)] lg:transition-[padding] duration-300 ease-out"
      >
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-md sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface text-muted transition',
                'hover:border-brand/35 hover:bg-brand-soft hover:text-brand-deep',
                sidebarExpanded && 'border-brand/40 bg-brand-soft text-brand-deep',
              )}
              onClick={() => (isDesktop ? setSidebarVisible((v) => !v) : setOpen(true))}
              aria-controls="sidebar-principal"
              aria-expanded={sidebarExpanded}
              aria-label={menuLabel}
              title={menuLabel}
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

          <div className="flex shrink-0 items-center gap-2">
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={cn(
                  'grid size-10 place-items-center rounded-full border border-line bg-surface text-ink/70 transition',
                  'hover:border-brand/35 hover:bg-brand-soft hover:text-brand-deep',
                  menuOpen && 'border-brand/40 bg-brand-soft text-brand-deep',
                )}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Menu compte"
                title="Mon compte"
              >
                <UserRound className="size-5" />
              </button>
              {menuOpen ? (
                <div
                  className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
                  role="menu"
                >
                  <Link
                    to="/profil"
                    className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink hover:bg-brand-soft"
                    onClick={() => setMenuOpen(false)}
                    role="menuitem"
                  >
                    <UserRound className="size-4 text-brand" /> Mon profil
                  </Link>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-risk-extreme hover:bg-red-50"
                    role="menuitem"
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
