import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useThemeStore } from '@/stores/themeStore';
import { ThemeSwitch } from './ThemeSwitch';

/* ------------------------------------------------------------------ types */

export interface NavbarCrumb {
  label: string;
  /** Route du segment : rendu en `Link` quand fourni. */
  to?: string;
  /** Action locale, à la place de `to`. */
  onSelect?: () => void;
}

/** Ton de l'alerte — pilote la pastille de la ligne de notification. */
export type NavbarNotificationTone = 'neutral' | 'warning' | 'danger';

export interface NavbarNotification {
  id: string;
  title: string;
  description?: string;
  /** Horodatage ou source, aligné à droite. */
  meta?: string;
  tone?: NavbarNotificationTone;
  to?: string;
  onSelect?: () => void;
}

export interface NavbarUser {
  name: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
  /** Remplace les initiales dérivées du nom. */
  initials?: string;
}

/** Entrée de menu : lien de route ou action locale, comme `sidebarConfig`. */
export interface NavbarMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  to?: string;
  onSelect?: () => void;
  /** Coloration rouge (déconnexion). */
  danger?: boolean;
}

export interface NavbarAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
}

export interface NavbarProps {
  /** Titre de page, en condensé majuscule comme le titre de la sidebar. */
  title: string;
  /** Fil d'Ariane ; le dernier segment est le segment courant (gras). */
  breadcrumb?: NavbarCrumb[];
  /** Alertes du menu cloche — la pastille en affiche le nombre. */
  notifications?: NavbarNotification[];
  user?: NavbarUser;
  /** Action principale « + Nouveau », masquée sur mobile. */
  createAction?: NavbarAction;
  /** Remplace le menu compte par défaut (profil, paramètres, déconnexion). */
  accountMenu?: NavbarMenuItem[];
  onToggleSidebar?: () => void;
  /** Sidebar réduite : bascule l'icône du bouton (convention `Sidebar`). */
  sidebarCollapsed?: boolean;
  onSearch?: (value: string) => void;
  searchDefaultValue?: string;
  searchPlaceholder?: string;
  className?: string;
}

/** Menu compte par défaut ; le parent branché les handlers par `id`. */
const NAVBAR_ACCOUNT_MENU: NavbarMenuItem[] = [
  { id: 'profile', label: 'Profil', icon: UserRound, to: '/profil' },
  { id: 'settings', label: 'Paramètres', icon: Settings },
  { id: 'logout', label: 'Déconnexion', icon: LogOut, danger: true },
];

const TONE_DOT: Record<NavbarNotificationTone, string> = {
  neutral: 'bg-[var(--sb-muted)]',
  warning: 'bg-[#d9a441]',
  danger: 'bg-[#e5484d]',
};

/** `⌘ K` sur Apple, `Ctrl K` ailleurs. */
function shortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K';
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/* ------------------------------------------------------------------ menus */

interface DropdownProps {
  /** `aria-label` et infobulle du bouton. */
  label: string;
  trigger: ReactNode;
  /** Pastille superposée (compteur de notifications). */
  badge?: ReactNode;
  align?: 'left' | 'right';
  triggerClassName?: string;
  children: (close: () => void) => ReactNode;
}

function Dropdown({ label, trigger, badge, align = 'right', triggerClassName, children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = () => setOpen(false);

  // Clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Échap ferme et rend la main au bouton.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
        aria-label={label}
        title={label}
        className={cn(
          'relative grid size-10 place-items-center rounded-full border text-[var(--sb-text-soft)] transition-colors duration-200',
          open
            ? 'border-[var(--sb-accent)]/40 bg-[var(--sb-accent-soft)] text-[var(--sb-accent)]'
            : 'border-[var(--sb-line)] bg-[var(--sb-chip)] hover:bg-[var(--sb-chip-hover)] hover:text-[var(--sb-text)]',
          triggerClassName,
        )}
      >
        {trigger}
        {badge}
      </button>

      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          className={cn(
            'navbar-menu soft-ui absolute z-50 mt-2 w-[288px] overflow-hidden rounded-[20px] border border-[var(--sb-line)] p-1.5 backdrop-blur-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          style={{ background: 'var(--sb-surface-glass)', boxShadow: 'var(--sb-shadow)' }}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

const menuItemClass =
  'flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors duration-150';

/* --------------------------------------------------------------- recherche */

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  /** pastille « Ctrl K », masquée si le champ est étroit. */
  showShortcut?: boolean;
}

function SearchField({
  value,
  onChange,
  onSubmit,
  inputRef,
  placeholder,
  showShortcut = true,
}: SearchFieldProps) {
  const id = useId();

  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="w-full">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-[17px] -translate-y-1/2 text-[var(--sb-muted)]"
          aria-hidden
        />
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
          className={cn(
            'h-10 w-full rounded-full border border-[var(--sb-line)] bg-[var(--sb-chip)] pr-3 pl-10 text-sm font-medium text-[var(--sb-text)] outline-none',
            'placeholder:font-normal placeholder:text-[var(--sb-muted)]',
            'focus:border-[var(--sb-accent)] focus:ring-4 focus:ring-[var(--sb-accent)]/15',
            '[&::-webkit-search-cancel-button]:hidden',
          )}
        />
        {showShortcut ? (
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-full border border-[var(--sb-line)] bg-[var(--sb-chip-hover)] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--sb-muted)] select-none xl:block">
            {shortcutLabel()}
          </kbd>
        ) : null}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ navbar */

export function Navbar({
  title,
  breadcrumb = [],
  notifications = [],
  user,
  createAction,
  accountMenu = NAVBAR_ACCOUNT_MENU,
  onToggleSidebar,
  sidebarCollapsed = false,
  onSearch,
  searchDefaultValue = '',
  searchPlaceholder = 'Rechercher…',
  className,
}: NavbarProps) {
  const theme = useThemeStore((s) => s.theme);
  // Tablette à partir de `md` : la recherche se replie sur son icône.
  const isTablet = useMediaQuery('(min-width: 768px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState(searchDefaultValue);
  const searchRef = useRef<HTMLInputElement>(null);
  // Incrémenté à chaque `Ctrl/⌘ K` : le champ peut être déjà monté sur desktop,
  // où l'ouverture ne change rien au rendu — seul le jeton déclenche le focus.
  const [focusToken, setFocusToken] = useState(0);

  // Sur desktop le champ est toujours déplié ; ailleurs il s'ouvre au clic.
  const searchVisible = isTablet && (isDesktop || searchOpen);
  const ToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = sidebarCollapsed ? 'Agrandir le menu' : 'Réduire le menu';

  useEffect(() => {
    if (!isTablet) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setFocusToken((token) => token + 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isTablet]);

  useEffect(() => {
    if (focusToken === 0) return;
    searchRef.current?.focus();
  }, [focusToken, searchVisible]);

  const submitSearch = () => onSearch?.(query);

  const crumbs = breadcrumb.map((crumb, index) => {
    const isCurrent = index === breadcrumb.length - 1;
    const shared = cn(
      'rounded-full px-1.5 py-0.5 transition-colors duration-150',
      isCurrent
        ? 'font-semibold text-[var(--sb-text)]'
        : 'font-medium text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
    );

    return (
      <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
        {index > 0 ? (
          <ChevronRight className="size-3.5 shrink-0 text-[var(--sb-muted)]" aria-hidden />
        ) : null}
        {crumb.to ? (
          <Link to={crumb.to} className={cn(shared, 'truncate')} onClick={crumb.onSelect}>
            {crumb.label}
          </Link>
        ) : crumb.onSelect ? (
          <button type="button" className={cn(shared, 'truncate')} onClick={crumb.onSelect}>
            {crumb.label}
          </button>
        ) : (
          // Le segment courant n'est pas cliquable : `aria-current` le désigne.
          <span className={cn(shared, 'truncate')} aria-current="page">
            {crumb.label}
          </span>
        )}
      </li>
    );
  });

  // `close` est fourni par le `Dropdown` : chaque item referme le menu.
  const accountItems = (close: () => void) =>
    accountMenu.map((item) => {
      const Icon = item.icon;
      const className = cn(
        menuItemClass,
        item.danger
          ? 'text-[#e5484d] hover:bg-[#e5484d]/10'
          : 'text-[var(--sb-text-soft)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
      );
      const content = (
        <>
          {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </>
      );

      if (item.to) {
        return (
          <Link
            key={item.id}
            to={item.to}
            role="menuitem"
            className={className}
            onClick={() => {
              item.onSelect?.();
              close();
            }}
          >
            {content}
          </Link>
        );
      }
      return (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={className}
          onClick={() => {
            item.onSelect?.();
            close();
          }}
        >
          {content}
        </button>
      );
    });

  return (
    <header className={cn('sticky top-0 z-20 px-3 pt-3 pb-1 sm:px-5 sm:pt-4', className)}>
      <div
        className="soft-ui navbar relative flex h-[68px] items-center gap-2 rounded-[26px] px-2.5 backdrop-blur-xl sm:gap-3 sm:px-3.5"
        data-theme={theme}
        style={{ background: 'var(--sb-surface-glass)', boxShadow: 'var(--sb-shadow)' }}
      >
        {/* ------------------------------------------------- gauche */}
        <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            disabled={!onToggleSidebar}
            aria-label={toggleLabel}
            aria-expanded={!sidebarCollapsed}
            title={toggleLabel}
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-full border border-[var(--sb-line)] bg-[var(--sb-chip)]',
              'text-[var(--sb-text-soft)] transition-colors duration-200',
              'hover:bg-[var(--sb-chip-hover)] hover:text-[var(--sb-accent)]',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <ToggleIcon className="size-[18px]" aria-hidden />
          </button>

          {/* Fil d'Ariane à partir de `md` ; en dessous, la place revient au
              titre. Le `h1` reste toujours présent — masqué visuellement sur
              grand écran — pour que la page garde un titre dans l'arbre
              d'accessibilité. */}
          {isTablet && breadcrumb.length > 0 ? (
            <nav aria-label="Fil d’Ariane" className="min-w-0">
              <ol className="flex min-w-0 items-center text-[13.5px]">{crumbs}</ol>
            </nav>
          ) : null}
          <h1
            className={cn(
              'min-w-0 truncate pr-1 font-condensed text-[15px] font-semibold tracking-[0.16em] text-[var(--sb-text)] uppercase',
              isTablet && breadcrumb.length > 0 && 'sr-only',
            )}
          >
            {title}
          </h1>
        </div>

        {/* ------------------------------------------------- centre */}
        <div className="flex min-w-0 flex-1 justify-center">
          {isTablet ? (
            searchVisible ? (
              <div className="flex w-full max-w-[440px] items-center gap-1.5">
                <SearchField
                  value={query}
                  onChange={(value) => {
                    setQuery(value);
                    onSearch?.(value);
                  }}
                  onSubmit={submitSearch}
                  inputRef={searchRef}
                  placeholder={searchPlaceholder}
                />
                {!isDesktop ? (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(false)}
                    aria-label="Fermer la recherche"
                    title="Fermer la recherche"
                    className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--sb-line)] bg-[var(--sb-chip)] text-[var(--sb-text-soft)] transition-colors duration-200 hover:bg-[var(--sb-chip-hover)] hover:text-[var(--sb-text)]"
                  >
                    <X className="size-[17px]" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Rechercher"
                title="Rechercher"
                className="grid size-10 place-items-center rounded-full border border-[var(--sb-line)] bg-[var(--sb-chip)] text-[var(--sb-text-soft)] transition-colors duration-200 hover:bg-[var(--sb-chip-hover)] hover:text-[var(--sb-text)]"
              >
                <Search className="size-[17px]" aria-hidden />
              </button>
            )
          ) : null}
        </div>

        {/* ------------------------------------------------- droite */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {/* Sous `md`, création et thème sont déplacés dans le menu compte :
              les retirer du DOM évite deux libellés identiques à l'écran. */}
          {createAction && isTablet ? (
            <button
              type="button"
              onClick={createAction.onSelect}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold text-white',
                'bg-[var(--sb-accent)] transition-[filter,box-shadow] duration-200',
                'hover:brightness-110 hover:shadow-[0_10px_24px_-10px_var(--sb-accent)]',
              )}
            >
              {createAction.icon ? <createAction.icon className="size-4" aria-hidden /> : (
                <Plus className="size-4" aria-hidden />
              )}
              {createAction.label}
            </button>
          ) : null}

          {/* Le thème est piloté par le store global : la sidebar suit. */}
          {isTablet ? <ThemeSwitch /> : null}

          <Dropdown
            label="Notifications"
            badge={
              notifications.length > 0 ? (
                <span
                  className="absolute top-0.5 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#e5484d] px-1 text-[9px] font-bold leading-none text-white"
                  aria-hidden
                >
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              ) : null
            }
            trigger={<Bell className="size-[18px]" aria-hidden />}
          >
            {(close) => (
              <>
                <p className="px-2.5 pt-1 pb-2 font-condensed text-[11px] font-semibold tracking-[0.12em] text-[var(--sb-muted)] uppercase">
                  Notifications
                </p>
                {notifications.length > 0 ? (
                  <ul className="space-y-0.5">
                    {notifications.map((notification) => {
                      const row = cn(
                        menuItemClass,
                        'items-start',
                        'text-[var(--sb-text-soft)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
                      );
                      const inner = (
                        <>
                          <span
                            className={cn(
                              'mt-1.5 size-2 shrink-0 rounded-full',
                              TONE_DOT[notification.tone ?? 'neutral'],
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-[var(--sb-text)]">
                              {notification.title}
                            </span>
                            {notification.description ? (
                              <span className="mt-0.5 block line-clamp-2 text-[12.5px] font-normal text-[var(--sb-muted)]">
                                {notification.description}
                              </span>
                            ) : null}
                          </span>
                          {notification.meta ? (
                            <span className="shrink-0 text-[11px] text-[var(--sb-muted)]">
                              {notification.meta}
                            </span>
                          ) : null}
                        </>
                      );

                      return (
                        <li key={notification.id}>
                          {notification.to ? (
                            <Link
                              to={notification.to}
                              role="menuitem"
                              className={row}
                              onClick={() => {
                                notification.onSelect?.();
                                close();
                              }}
                            >
                              {inner}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              role="menuitem"
                              className={row}
                              onClick={() => {
                                notification.onSelect?.();
                                close();
                              }}
                            >
                              {inner}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-2.5 py-4 text-center text-[13px] text-[var(--sb-muted)]">
                    Aucune notification
                  </p>
                )}
              </>
            )}
          </Dropdown>

          <Dropdown label="Menu compte" trigger={AvatarTrigger(user)}>
            {(close) => (
              <>
                {/* Sur mobile, la barre se limite à toggle / titre / cloche /
                    avatar : le reste de la navigation tient dans ce menu. */}
                {isTablet ? null : (
                  <>
                    {createAction ? (
                      <button
                        type="button"
                        role="menuitem"
                        className={cn(menuItemClass, 'text-white bg-[var(--sb-accent)] hover:brightness-110')}
                        onClick={() => {
                          createAction.onSelect();
                          close();
                        }}
                      >
                        <Plus className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{createAction.label}</span>
                      </button>
                    ) : null}

                    {breadcrumb.length > 0 ? (
                      <ol className="my-1 border-y border-[var(--sb-line)] py-1">
                        {breadcrumb.map((crumb, index) => (
                          <li key={`${crumb.label}-${index}`}>
                            {crumb.to ? (
                              <Link
                                to={crumb.to}
                                role="menuitem"
                                className={cn(
                                  menuItemClass,
                                  'text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
                                )}
                                onClick={() => {
                                  crumb.onSelect?.();
                                  close();
                                }}
                              >
                                {crumb.label}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                className={cn(
                                  menuItemClass,
                                  'text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
                                )}
                                onClick={() => {
                                  crumb.onSelect?.();
                                  close();
                                }}
                              >
                                {crumb.label}
                              </button>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : null}

                    <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                      <span className="text-[13px] font-medium text-[var(--sb-muted)]">
                        Mode sombre
                      </span>
                      <ThemeSwitch showLabel={false} />
                    </div>

                    <span aria-hidden className="mx-1 my-1 block h-px bg-[var(--sb-line)]" />
                  </>
                )}

                {user ? (
                  <div className="px-2.5 pt-1.5 pb-2">
                    <p className="truncate text-[13.5px] font-semibold text-[var(--sb-text)]">
                      {user.name}
                    </p>
                    {user.email ? (
                      <p className="truncate text-[12px] text-[var(--sb-muted)]">{user.email}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-0.5">{accountItems(close)}</div>
              </>
            )}
          </Dropdown>
        </div>
      </div>
    </header>
  );
}

function AvatarTrigger(user?: NavbarUser) {
  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className="size-7 rounded-full object-cover ring-1 ring-[var(--sb-line)]"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-8 place-items-center rounded-full bg-[var(--sb-accent-soft)] text-[11.5px] font-bold text-[var(--sb-accent)] ring-1 ring-[var(--sb-accent)]/30"
    >
      {user?.initials ?? initialsOf(user?.name ?? '')}
    </span>
  );
}
