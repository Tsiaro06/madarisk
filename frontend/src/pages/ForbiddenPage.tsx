import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="rounded-full bg-amber-100 p-4 text-amber-800">
        <ShieldAlert className="size-8" />
      </span>
      <h1 className="font-display text-3xl text-ink">Accès interdit</h1>
      <p className="max-w-md text-sm text-muted">
        Votre rôle ne permet pas d&apos;accéder à cette section de la salle de crise.
      </p>
      <Link to="/">
        <Button>Retour au dashboard</Button>
      </Link>
    </div>
  );
}
