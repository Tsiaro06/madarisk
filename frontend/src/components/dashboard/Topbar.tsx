import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Search, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import type { TabItem } from '@/data/dashboardData';

interface TopbarProps {
  brandName: string;
  slogan: string;
  tabs: TabItem[];
}

const iconButton =
  'grid size-10 shrink-0 place-items-center rounded-full text-dash-body transition-colors hover:bg-dash-pale hover:text-dash';

export function Topbar({ brandName, slogan, tabs }: TopbarProps) {
  const location = useLocation();
  const { toast } = useToast();
  const [searchOpen, setSearchOpen] = useState(false);

  function isActive(to: string) {
    return location.pathname === to;
  }

  return (
    <header className="dash-rise dash-rise-1 flex flex-col gap-4 rounded-3xl border border-line bg-surface px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:gap-6">
      {/* Marque */}
      <div className="flex min-w-0 items-center gap-3 lg:w-64">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-dash-light to-dash font-bold text-white shadow-[0_8px_18px_-8px_rgba(47,91,234,0.9)]"
        >
          M
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-dash-title">
            {brandName}
          </p>
          <p className="truncate text-xs text-muted">{slogan}</p>
        </div>
      </div>

      {/* Onglets — pilule blanche, ombre douce sur l'onglet actif */}
      <nav aria-label="Sections du tableau de bord" className="-mx-1 order-last overflow-x-auto lg:order-none lg:mx-0 lg:flex-1">
        <ul className="flex min-w-max items-center gap-1 rounded-full bg-dash-pale/70 p-1.5">
          {tabs.map((tab) => {
            const active = isActive(tab.to);
            return (
              <li key={tab.id}>
                <Link
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
                    active
                      ? 'bg-surface font-semibold text-dash shadow-[0_4px_14px_-6px_rgba(15,23,42,0.28)]'
                      : 'text-dash-body hover:bg-surface/70 hover:text-dash',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-1.5 lg:ml-auto">
        {searchOpen ? (
          <div className="flex flex-1 items-center gap-2 rounded-full bg-dash-pale px-3 py-1.5 lg:flex-none">
            <Search aria-hidden className="size-4 shrink-0 text-dash" />
            <input
              type="search"
              autoFocus
              placeholder="Rechercher une commune…"
              aria-label="Rechercher une commune"
              className="w-full min-w-0 bg-transparent text-sm text-dash-title outline-none placeholder:text-dash-body/70 lg:w-40"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearchOpen(false);
              }}
            />
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="Fermer la recherche"
              className="text-dash-body transition-colors hover:text-dash"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={iconButton}
            aria-label="Rechercher"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-5" />
          </button>
        )}

        <button
          type="button"
          className={iconButton}
          aria-label="Menu"
          onClick={() => toast('Menu principal disponible dans la barre latérale.', 'info')}
        >
          <Menu className="size-5" />
        </button>

        <Link to="/profil" className={iconButton} aria-label="Paramètres">
          <Settings className="size-5" />
        </Link>
      </div>
    </header>
  );
}
