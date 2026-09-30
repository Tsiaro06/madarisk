import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DashNoticeProps {
  title: string;
  children: ReactNode;
  severity?: 'info' | 'warning';
  className?: string;
}

/**
 * Bandeau d'information en bleu marine (fond blanc|text blanc) : il doit se
 * détacher des cartes, toutes blanches, pour qu'une erreur de chargement ne
 * passe pas inaperçue. La gravité est portée par le libellé et l'icône, pas
 * par une teinte : la palette reste limitée à trois couleurs.
 */
export function DashNotice({ title, children, severity = 'info', className }: DashNoticeProps) {
  const Icon = severity === 'warning' ? AlertTriangle : Info;

  return (
    <div
      role={severity === 'warning' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-[var(--dash-navy)] bg-[var(--dash-navy)] px-4 py-3.5 text-white',
        className,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-white/80" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-white/70">{children}</p>
      </div>
    </div>
  );
}