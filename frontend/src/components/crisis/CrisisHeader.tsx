import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CloudSun,
  KeyRound,
  LogOut,
  MapPinned,
  Menu,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { canManageOps, ROLE_LABELS } from "@/lib/roles";
import { EventSelector } from "@/components/crisis/EventSelector";
import { useActiveEvent } from "@/stores/activeEvent";
import { cn } from "@/lib/utils";

interface CrisisHeaderProps {
  leftOpen: boolean;
  onToggleLeft: () => void;
  rightOpen: boolean;
  onToggleRight: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  onCreateEvent?: () => void;
}

export function CrisisHeader({
  leftOpen,
  onToggleLeft,
  rightOpen,
  onToggleRight,
  refreshing,
  onRefresh,
  onCreateEvent,
}: CrisisHeaderProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { activeEventId } = useActiveEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canCreate = canManageOps(user?.role);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-ink sm:gap-3 sm:px-4">
      <button
        type="button"
        className="rounded-lg border border-line p-2.5 text-muted transition hover:bg-gray-100 lg:hidden"
        onClick={onToggleLeft}
        aria-label="Ouvrir le panneau de filtres"
      >
        <Menu className="size-4" />
      </button>

      <Link to="/" className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft font-display text-base font-bold text-brand">
          M
        </span>
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="font-display text-sm font-bold tracking-tight text-ink">
            MadaRisk <span className="text-brand">Map</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted">
            Salle de crise
          </span>
        </span>
      </Link>

      <EventSelector className="ml-1 hidden sm:block lg:ml-3" />

      {activeEventId ? (
        <Link
          to={`/evenements/${activeEventId}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink transition hover:bg-gray-50"
          title="Gérer le paramétrage de l'événement actif (trajectoire, zones, risques)"
        >
          <Settings className="size-4 text-brand" />
          <span className="hidden lg:inline">Paramètres</span>
        </Link>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {canCreate && onCreateEvent ? (
          <button
            type="button"
            onClick={onCreateEvent}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
            title="Créer un événement exceptionnel (action administrative journalisée)"
            aria-label="Intervention administrative : créer un événement exceptionnel"
          >
            <ShieldAlert className="size-4" />
            <span className="hidden xl:inline">Intervention administrative</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggleLeft}
          aria-label={
            leftOpen
              ? "Réduire le panneau de filtres"
              : "Ouvrir le panneau de filtres"
          }
          aria-pressed={leftOpen}
          className={cn(
            "hidden rounded-lg border border-line p-2.5 text-muted transition hover:bg-gray-100 lg:block",
            leftOpen && "bg-brand-soft text-brand-deep",
          )}
          title="Panneau filtres / événements"
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={onToggleRight}
          aria-label={
            rightOpen
              ? "Réduire le panneau détails"
              : "Ouvrir le panneau détails"
          }
          aria-pressed={rightOpen}
          className={cn(
            "hidden rounded-lg border border-line p-2.5 text-muted transition hover:bg-gray-100 lg:block",
            rightOpen && "bg-brand-soft text-brand-deep",
          )}
          title="Panneau commune"
        >
          <PanelRight className="size-4" />
        </button>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink transition hover:bg-gray-50"
          title="Actualiser les données de la salle de crise (météo, événements, risques, alertes)"
        >
          <RefreshCw className={cn('size-4 text-brand', refreshing && 'animate-spin')} />
          <span className="hidden md:inline">Actualiser les données</span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/meteo")}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink transition hover:bg-gray-50"
          title="Voir la météo"
        >
          <CloudSun className="size-4 text-brand" />
          <span className="hidden md:inline">Voir la météo</span>
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-line py-1.5 pl-1.5 pr-2.5 transition hover:bg-gray-50"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="grid size-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">
              {user?.firstName?.[0] ?? ""}
              {user?.lastName?.[0] ?? ""}
            </span>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block max-w-[140px] truncate text-xs font-medium text-ink">
                {user?.firstName} {user?.lastName}
              </span>
              <span className="block text-[10px] text-muted">
                {user ? ROLE_LABELS[user.role] : ""}
              </span>
            </span>
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-xl"
              role="menu"
            >
              <Link
                to="/mot-de-passe"
                className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                <KeyRound className="size-4" /> Mot de passe
              </Link>
              <Link
                to="/territoires"
                className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}
              >
                <MapPinned className="size-4" /> Tous les modules
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
  );
}
