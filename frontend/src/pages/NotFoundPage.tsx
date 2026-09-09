import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="rounded-full bg-brand-soft p-4 text-brand">
        <MapPinOff className="size-8" />
      </span>
      <h1 className="font-display text-3xl text-ink">Page introuvable</h1>
      <p className="max-w-md text-sm text-muted">
        La ressource demandée n&apos;existe pas ou a été déplacée.
      </p>
      <Link to="/">
        <Button>Retour au dashboard</Button>
      </Link>
    </div>
  );
}
