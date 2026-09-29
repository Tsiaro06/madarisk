import { useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { UserRole } from '@/lib/roles';
import { useThemeStore } from '@/stores/themeStore';
import { ThemeSwitch } from './ThemeSwitch';
import {
  SIDEBAR_CONFIG,
  type SidebarAccordion,
  type SidebarConfig,
  type SidebarItem,
  type SidebarLink,
} from './sidebarConfig';

/** Largeurs synchronisées avec les classes `w-[…]` du composant. */
export const SIDEBAR_WIDTH = 336;
export const SIDEBAR_RAIL_WIDTH = 72;

export interface SidebarProps {
  /** Colonne affichée sur desktop. */
  visible: boolean;
  /** Tiroir hors écran en dessous de `lg`. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Nombre d'alertes actives — pastille rouge. */
  alertCount?: number;
  /** Rôle du demandeur, pour filtrer les entrées `roles`. */
  role?: UserRole;
  /** Remplace le menu par défaut. */
  config?: SidebarConfig;
  className?: string;
}

/** Un lien (ou l'un de ses enfants) correspond-il à l'URL courante ? */
function matches(to: string, end: boolean | undefined, pathname: string) {
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

/* -------------------------------------------------------------------- rows */

interface RowProps {
  item: SidebarLink;
  variant: 'rail' | 'full' | 'compact';
  alertCount: number;
  onNavigate: () => void;
}

function Row({ item, variant, alertCount, onNavigate }: RowProps) {
  const Icon = item.icon;
  const badge = item.badge === 'alerts' && alertCount > 0 ? alertCount : undefined;

  if (variant === 'rail') {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        title={item.label}
        className={({ isActive }) =>
          cn(
            'group relative grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-200',
            isActive
              ? 'bg-[var(--sb-accent)] text-white'
              : 'text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon className="size-[19px]" aria-hidden />
            {badge ? (
              <span
                aria-hidden
                className={cn(
                  'absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-semibold leading-none',
                  isActive ? 'bg-white text-[var(--sb-accent)]' : 'bg-[#e5484d] text-white',
                )}
              >
                {badge > 9 ? '9+' : badge}
              </span>
            ) : null}
          </>
        )}
      </NavLink>
    );
  }

  const compact = variant === 'compact';

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={item.label}
      className={({ isActive }) =>
        cn(
          'group flex items-center rounded-full transition-colors duration-200',
          compact ? 'h-9 w-full gap-2 px-1.5' : 'h-10 w-full gap-2.5 px-2.5',
          isActive
            ? 'bg-[var(--sb-accent)] text-white'
            : 'text-[var(--sb-text-soft)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'grid shrink-0 place-items-center',
              compact ? 'size-4' : 'size-5',
              isActive
                ? 'text-white'
                : 'text-[var(--sb-muted)] group-hover:text-[var(--sb-text)]',
            )}
          >
            <Icon className={compact ? 'size-4' : 'size-[17px]'} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                'truncate font-medium leading-none',
                compact ? 'text-[12.5px]' : 'text-[13.5px]',
              )}
            >
              {item.label}
            </span>
            {badge ? (
              <span
                className={cn(
                  'ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[9.5px] font-semibold leading-none',
                  isActive ? 'bg-white/25 text-white' : 'bg-[#e5484d] text-white',
                )}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </span>
        </>
      )}
    </NavLink>
  );
}

/* --------------------------------------------------------------- rail items */

function RailAccordion({
  item,
  pathname,
  open,
  onToggle,
}: {
  item: SidebarAccordion;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = item.icon;
  const active = item.children.some((child) => matches(child.to, child.end, pathname));

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={item.label}
        title={item.label}
        className={cn(
          'grid size-10 place-items-center rounded-full transition-colors duration-200',
          active || open
            ? 'bg-[var(--sb-accent)] text-white'
            : 'text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
        )}
      >
        <Icon className="size-[19px]" aria-hidden />
      </button>
      {/* Filet vertical : indice de sous-menu sous l'icône active. */}
      <span
        aria-hidden
        className={cn(
          'my-1 h-6 w-px',
          active || open ? 'bg-[var(--sb-accent)]/40' : 'bg-[var(--sb-line)]',
        )}
      />
    </div>
  );
}

/* ---------------------------------------------------------- sous-menu complet */

function Submenu({
  item,
  pathname,
  open,
  onToggle,
  onNavigate,
}: {
  item: SidebarAccordion;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const panelId = useId();
  const Icon = item.icon;
  const active = item.children.some((child) => matches(child.to, child.end, pathname));

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'flex h-10 w-full items-center gap-2.5 rounded-full px-2.5 transition-colors duration-200',
          active || open
            ? 'bg-[var(--sb-accent)] text-white'
            : 'text-[var(--sb-text-soft)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
        )}
      >
        <span className="grid size-5 shrink-0 place-items-center">
          <Icon className="size-[17px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium leading-none">
          {item.label}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 transition-transform duration-300',
            open ? 'rotate-180' : 'rotate-0',
          )}
        />
      </button>

      <div
        id={panelId}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <ul className="relative mt-1 space-y-0.5 pl-3">
            <span
              aria-hidden
              className="absolute top-1 bottom-1 left-[5px] w-px bg-[var(--sb-line)]"
            />
            {item.children.map((child) => (
              <li key={child.to}>
                <NavLink
                  to={child.to}
                  end={child.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 w-full items-center gap-2.5 rounded-full pr-2.5 pl-3.5 transition-colors duration-200',
                      isActive
                        ? 'bg-[var(--sb-chip-hover)] text-[var(--sb-text)]'
                        : 'text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          'grid size-4 shrink-0 place-items-center',
                          isActive ? 'text-[var(--sb-accent)]' : 'text-[var(--sb-muted)]',
                        )}
                      >
                        <child.icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none">
                        {child.label}
                      </span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sous-éléments */

function ToggleButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const label = collapsed ? 'Agrandir le menu' : 'Réduire le menu';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--sb-line)] bg-[var(--sb-chip)] text-[var(--sb-text-soft)] transition-colors duration-200 hover:text-[var(--sb-accent)]"
    >
      {collapsed ? (
        <PanelLeftOpen className="size-[17px]" aria-hidden />
      ) : (
        <PanelLeftClose className="size-[17px]" aria-hidden />
      )}
    </button>
  );
}


/* ---------------------------------------------------------------- composant */

export function Sidebar({
  visible,
  open,
  onOpenChange,
  collapsed,
  onCollapsedChange,
  alertCount = 0,
  role,
  config = SIDEBAR_CONFIG,
  className,
}: SidebarProps) {
  const location = useLocation();
  const theme = useThemeStore((s) => s.theme);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean | undefined>>({});
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Le tiroir mobile n'existe pas sur desktop : `visible` y fait foi.
  const shown = isDesktop ? visible : open;

  const close = () => {
    if (!isDesktop) onOpenChange(false);
  };

  const allow = (entry: { roles?: UserRole[] }) =>
    !entry.roles || (role ? entry.roles.includes(role) : false);

  const primary = config.primary.filter(allow);
  const footer = config.footer.filter(allow);
  const sections = config.sections
    .map((section) => ({ ...section, items: section.items.filter(allow) }))
    .filter((section) => section.items.length > 0);

  // En mode rail, les deux colonnes fusionnent pour rester atteignables.
  const railItems: SidebarItem[] = [...primary, ...sections.flatMap((s) => s.items)];

  // Un groupe dont un enfant est la page courante est déplié par défaut ;
  // `openGroups` ne mémorise que les écarts de l'utilisateur.
  const defaultOpen = (id: string) => {
    const group = config.primary.find(
      (entry): entry is SidebarAccordion => entry.kind === 'accordion' && entry.id === id,
    );
    return group
      ? group.children.some((child) => matches(child.to, child.end, location.pathname))
      : false;
  };

  const isOpen = (id: string) => openGroups[id] ?? defaultOpen(id);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !isOpen(id) }));

  return (
    <>
      {!isDesktop && open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px]"
          aria-label="Fermer le menu"
          onClick={() => onOpenChange(false)}
        />
      ) : null}

      <aside
        id="sidebar-principal"
        data-theme={theme}
        // Une colonne masquée reste dans le DOM : sans `inert` ses liens
        // resteraient atteignables au clavier.
        inert={shown ? undefined : true}
        aria-label="Menu latéral"
        className={cn(
          'soft-ui sidebar fixed inset-y-0 left-0 z-40 flex font-menu transition-[width,transform] duration-300 ease-out',
          collapsed ? 'w-[72px] p-2.5' : 'w-[336px] p-3',
          shown ? 'translate-x-0' : '-translate-x-full',
          className,
        )}
      >
        <div
          className="relative flex min-h-0 w-full flex-col overflow-hidden rounded-[32px] transition-[background-color,box-shadow] duration-300"
          style={{
            background: 'var(--sb-surface)',
            boxShadow: collapsed ? 'var(--sb-shadow-collapsed)' : 'var(--sb-shadow)',
          }}
        >
          {!isDesktop ? (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Fermer le menu"
              className="absolute top-3.5 right-3.5 z-10 grid size-8 place-items-center rounded-full text-[var(--sb-muted)] transition-colors duration-200 hover:bg-[var(--sb-hover)] hover:text-[var(--sb-text)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}

          {/* ---------------------------------------- état réduit (rail) */}
          {collapsed ? (
            <>
              <div className="flex flex-col items-center pt-2.5 pb-1">
                <ToggleButton collapsed onClick={() => onCollapsedChange(false)} />
                <span aria-hidden className="mt-2 h-px w-6 bg-[var(--sb-line)]" />
              </div>

              <nav
                className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1"
                aria-label="Navigation principale"
              >
                {railItems.map((item) =>
                  item.kind === 'accordion' ? (
                    <RailAccordion
                      key={item.id}
                      item={item}
                      pathname={location.pathname}
                      open={isOpen(item.id)}
                      // Le rail n'a pas de panneau : le clic restaure la carte
                      // et déplie le sous-menu correspondant.
                      onToggle={() => {
                        if (!isOpen(item.id)) toggleGroup(item.id);
                        onCollapsedChange(false);
                      }}
                    />
                  ) : (
                    <Row
                      key={item.to}
                      item={item}
                      variant="rail"
                      alertCount={alertCount}
                      onNavigate={close}
                    />
                  ),
                )}
              </nav>

              {footer.length > 0 ? (
                <div className="flex flex-col items-center pt-2 pb-2.5">
                  <span aria-hidden className="mb-2 h-px w-6 bg-[var(--sb-line)]" />
                  {footer.map((item) => (
                    <Row
                      key={item.to}
                      item={item}
                      variant="rail"
                      alertCount={alertCount}
                      onNavigate={close}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            /* --------------------------------------- état étendu (carte) */
            <>
              <header
                className={cn(
                  'flex items-center gap-2.5 py-3.5 pr-3.5 pl-3.5',
                  !isDesktop && 'pr-12',
                )}
              >
                <ToggleButton collapsed={false} onClick={() => onCollapsedChange(true)} />
                <span className="font-condensed text-[15px] font-semibold tracking-[0.2em] text-[var(--sb-text)] uppercase">
                  {config.title}
                </span>
                <ThemeSwitch className="ml-auto" />
              </header>
              <span aria-hidden className="mx-3.5 h-px shrink-0 bg-[var(--sb-line)]" />

              <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto px-3.5 py-3.5">
                <nav className="flex min-w-0 flex-1 flex-col" aria-label="Navigation principale">
                  <ul className="space-y-1">
                    {primary.map((item) =>
                      item.kind === 'accordion' ? (
                        <li key={item.id}>
                          <Submenu
                            item={item}
                            pathname={location.pathname}
                            open={isOpen(item.id)}
                            onToggle={() => toggleGroup(item.id)}
                            onNavigate={close}
                          />
                        </li>
                      ) : (
                        <li key={item.to}>
                          <Row
                            item={item}
                            variant="full"
                            alertCount={alertCount}
                            onNavigate={close}
                          />
                        </li>
                      ),
                    )}
                  </ul>

                  {footer.length > 0 ? (
                    <ul className="mt-auto space-y-1 pt-4">
                      {footer.map((item) => (
                        <li key={item.to}>
                          <Row
                            item={item}
                            variant="full"
                            alertCount={alertCount}
                            onNavigate={close}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </nav>

                {sections.length > 0 ? (
                  <>
                    <span aria-hidden className="w-px shrink-0 self-stretch bg-[var(--sb-line)]" />
                    <nav className="w-[120px] shrink-0" aria-label="Menu secondaire">
                      <ul className="space-y-4">
                        {sections.map((section, index) => (
                          <li
                            key={section.id}
                            className={cn(index > 0 && 'border-t border-[var(--sb-line)] pt-4')}
                          >
                            <div className="mb-1.5 flex items-center gap-1.5 pr-1.5 pl-1">
                              <h2 className="min-w-0 flex-1 truncate font-condensed text-[11px] font-semibold tracking-[0.12em] text-[var(--sb-muted)] uppercase">
                                {section.label}
                              </h2>
                              <section.icon
                                className="size-3.5 shrink-0 text-[var(--sb-muted)]"
                                aria-hidden
                              />
                            </div>
                            <ul className="space-y-0.5">
                              {section.items.map((item) => (
                                <li key={item.to}>
                                  <Row
                                    item={item}
                                    variant="compact"
                                    alertCount={alertCount}
                                    onNavigate={close}
                                  />
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
