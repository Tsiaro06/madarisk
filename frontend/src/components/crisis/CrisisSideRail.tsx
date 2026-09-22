import { MapPinned, PanelLeftOpen, PanelRightOpen, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrisisSideRailProps {
  side: 'left' | 'right';
  label: string;
  onExpand: () => void;
}

export function CrisisSideRail({ side, label, onExpand }: CrisisSideRailProps) {
  const Icon = side === 'left' ? Zap : MapPinned;
  const ExpandIcon = side === 'left' ? PanelLeftOpen : PanelRightOpen;

  return (
    <div className="flex h-full w-12 flex-col items-center border-0 bg-surface py-2">
      <button
        type="button"
        onClick={onExpand}
        className={cn(
          'flex flex-1 flex-col items-center gap-3 rounded-lg px-1 py-2 text-muted transition hover:bg-canvas hover:text-ink',
        )}
        title={`Ouvrir — ${label}`}
        aria-label={`Ouvrir le panneau ${label}`}
      >
        <span className="grid size-9 place-items-center rounded-xl border border-line bg-canvas text-ink">
          <ExpandIcon className="size-4" />
        </span>
        <Icon className="size-4 shrink-0 opacity-70" />
        <span
          className="mt-1 max-h-[12rem] truncate text-[11px] font-semibold tracking-wide text-ink"
          style={{ writingMode: 'vertical-rl', transform: side === 'left' ? 'rotate(180deg)' : undefined }}
        >
          {label}
        </span>
      </button>
    </div>
  );
}
