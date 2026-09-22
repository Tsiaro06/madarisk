import { Menu } from "lucide-react";

interface CrisisHeaderProps {
  /** Ouverture du panneau événements en mobile (overlay). */
  onOpenMobileLeft?: () => void;
}

/** Barre minimale — actions métier déplacées dans le panneau Événements. */
export function CrisisHeader({ onOpenMobileLeft }: CrisisHeaderProps) {
  if (!onOpenMobileLeft) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[600] lg:hidden">
      <button
        type="button"
        className="pointer-events-auto inline-flex h-10 items-center justify-center rounded-xl border border-line bg-white/95 px-3 text-muted shadow-sm backdrop-blur transition hover:bg-white hover:text-ink"
        onClick={onOpenMobileLeft}
        aria-label="Ouvrir la liste des événements"
      >
        <Menu className="size-4" />
      </button>
    </div>
  );
}
