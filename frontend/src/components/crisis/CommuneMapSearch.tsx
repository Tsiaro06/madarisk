import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MapPinned, Search, X } from 'lucide-react';
import { territoriesApi } from '@/api';
import { cn } from '@/lib/utils';

interface CommuneMapSearchProps {
  onSelect: (communeId: string, name: string) => void;
  className?: string;
}

export function CommuneMapSearch({ onSelect, className }: CommuneMapSearchProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const searchQ = useQuery({
    queryKey: ['territories', 'map-search', debounced],
    queryFn: () => territoriesApi.search(debounced, 10),
    enabled: debounced.length >= 2,
  });

  const communes = (searchQ.data ?? []).filter((r) => r.type === 'commune');

  return (
    <div
      ref={rootRef}
      className={cn('pointer-events-auto w-[min(22rem,calc(100vw-6rem))]', className)}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Enter') e.preventDefault();
          }}
          placeholder="Rechercher une commune…"
          aria-label="Rechercher une commune sur la carte"
          autoComplete="off"
          className="h-10 w-full rounded-xl border border-line/90 bg-white/95 py-2 pl-10 pr-9 text-sm text-ink shadow-sm outline-none backdrop-blur placeholder:text-muted focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
        />
        {query ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink"
            aria-label="Effacer la recherche"
            onClick={() => {
              setQuery('');
              setDebounced('');
              setOpen(false);
            }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {open && debounced.length >= 2 ? (
        <ul
          className="mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-line bg-white/95 py-1 shadow-lg backdrop-blur"
          role="listbox"
          aria-label="Résultats de recherche"
        >
          {searchQ.isFetching ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> Recherche…
            </li>
          ) : communes.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-muted">Aucune commune trouvée</li>
          ) : (
            communes.map((r) => (
              <li key={r.id} role="option">
                <button
                  type="button"
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-brand-soft"
                  onClick={() => {
                    onSelect(r.id, r.name);
                    setQuery(r.name);
                    setOpen(false);
                  }}
                >
                  <MapPinned className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{r.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.adminCode}
                      {r.district?.name ? ` · ${r.district.name}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
