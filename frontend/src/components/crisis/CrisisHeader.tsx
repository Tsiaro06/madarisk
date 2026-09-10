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
  Plus,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { ROLE_LABELS } from "@/lib/roles";
import { EventSelector } from "@/components/crisis/EventSelector";
import { cn } from "@/lib/utils";

interface CrisisHeaderProps {
  canCreate: boolean;
  onOpenCreate: () => void;
  leftOpen: boolean;
  onToggleLeft: () => void;
  rightOpen: boolean;
  onToggleRight: () => void;
}

export function CrisisHeader({
  canCreate,
  onOpenCreate,
  leftOpen,
  onToggleLeft,
  rightOpen,
  onToggleRight,
}: CrisisHeaderProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[#073f42] px-3 text-white sm:gap-3 sm:px-4">
      <button
        type="button"
        className="rounded-lg border border-white/15 p-2 lg:hidden"
        onClick={onToggleLeft}
        aria-label="Ouvrir le panneau de filtres"
      >
        <Menu className="size-4" />
      </button>

      <Link to="/" className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 font-display text-lg font-bold text-teal-200">
          M
        </span>
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="font-display text-sm font-bold tracking-tight">
            MadaRisk <span className="text-teal-200">Map</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-teal-100/70">
            Salle de crise
          </span>
        </span>
      </Link>

      <EventSelector className="ml-1 hidden sm:block lg:ml-3" />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Mobile event selector is accessible via the left drawer; desktop toggles */}
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
            "hidden rounded-lg border border-white/15 p-2 transition hover:bg-white/10 lg:block",
            leftOpen && "bg-white/15",
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
            "hidden rounded-lg border border-white/15 p-2 transition hover:bg-white/10 lg:block",
            rightOpen && "bg-white/15",
          )}
          title="Panneau commune"
        >
          <PanelRight className="size-4" />
        </button>

        {canCreate ? (
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b4531f]"
          >
            <Plus className="size-4" />
            <span className="hidden md:inline">Créer un événement</span>
            <span className="md:hidden">Créer</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => navigate("/meteo")}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm font-medium text-white transition hover:bg-white/10"
          title="Voir la météo"
        >
          <CloudSun className="size-4 text-teal-200" />
          <span className="hidden md:inline">Voir la météo</span>
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-white/15 py-1.5 pl-1.5 pr-2.5 transition hover:bg-white/10"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="grid size-7 place-items-center rounded-full bg-white/15 text-xs font-bold">
              {user?.firstName?.[0] ?? ""}
              {user?.lastName?.[0] ?? ""}
            </span>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block max-w-[140px] truncate text-xs font-medium">
                {user?.firstName} {user?.lastName}
              </span>
              <span className="block text-[10px] text-teal-100/70">
                {user ? ROLE_LABELS[user.role] : ""}
              </span>
            </span>
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-brand/15 bg-white text-ink shadow-xl"
              role="menu"
            >
              <Link
                to="/mot-de-passe"
                className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-brand-soft"
                onClick={() => setMenuOpen(false)}
              >
                <KeyRound className="size-4" /> Mot de passe
              </Link>
              <Link
                to="/territoires"
                className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-brand-soft"
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
