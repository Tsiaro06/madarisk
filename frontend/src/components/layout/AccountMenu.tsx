import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, type UserRole } from '@/lib/roles';

interface AccountMenuProps {
  name: string;
  email: string;
  role: UserRole;
  initials: string;
  onLogout: () => void;
}

const menuItemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150';

/**
 * Déclencheur de compte : pastille d'initiales + nom + chevron sur desktop,
 * réduit à la seule pastille sur mobile. Le menu suit le motif « menu button »
 * (APG) : ouverture au clic ou avec `ArrowDown`, fermeture au clic extérieur,
 * avec `Échap` (le focus revient au déclencheur) ; navigation clavier
 * ArrowUp / ArrowDown / Home / End au sein des menuitems.
 */
export function AccountMenu({ name, email, role, initials, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = () => setOpen(false);

  // Clic extérieur + Échap : les deux laissent le focus au déclencheur.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // À l'ouverture, le premier item prend le focus : le clavier entre
  // directement dans le menu, comme l'attend le motif « menu button ».
  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const items = () =>
    Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = items();
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    const focusAt = (pos: number) => list[((pos % list.length) + list.length) % list.length]?.focus();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(list.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Menu compte"
        title="Mon compte"
        className={cn(
          'flex h-10 items-center gap-2 rounded-full border py-1 pr-1.5 pl-1 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          open
            ? 'border-brand/50 bg-brand-soft text-brand-deep'
            : 'border-line bg-surface text-ink/80 hover:border-brand/35 hover:bg-brand-soft hover:text-brand-deep',
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-deep to-[#03224c] text-[11px] font-semibold text-white shadow-inner ring-1 ring-black/5 select-none">
          {initials}
        </span>
        <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
          <span className="w-full max-w-[10rem] truncate text-[13px] font-semibold">{name}</span>
          <span className="w-full truncate text-[11px] text-muted">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronDown
          className={cn(
            'mr-1 hidden size-3.5 shrink-0 transition-transform duration-150 sm:block',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-label="Menu compte"
          onKeyDown={onPanelKeyDown}
          className="account-menu absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface/95 shadow-xl backdrop-blur-xl"
        >
          {/* En-tête : identité de l'utilisateur. */}
          <div className="flex items-center gap-3 border-b border-line/70 px-3 py-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-deep to-[#03224c] text-sm font-semibold text-white shadow-inner ring-1 ring-black/5"
              aria-hidden
            >
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>
          </div>

          <div className="p-1.5">
            <Link
              to="/profil"
              role="menuitem"
              onClick={close}
              className={cn(menuItemClass, 'text-ink hover:bg-brand-soft hover:text-brand-deep')}
            >
              <UserRound className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Mon profil</span>
            </Link>

            <hr className="mx-1 my-1 border-line/70" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onLogout();
              }}
              className={cn(menuItemClass, 'text-risk-extreme hover:bg-red-500/10')}
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">Se déconnecter</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}