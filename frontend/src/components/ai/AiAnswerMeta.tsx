import { CalendarClock, Database, TriangleAlert } from 'lucide-react';
import type { AiStreamMeta } from '@/api/ai-stream';
import { formatDate } from '@/lib/utils';
import { toolLabel } from '@/components/ai/toolLabels';

/**
 * Sources, date et limites d'une réponse de l'assistant.
 *
 * Ces métadonnées accompagnent le tour dès son premier morceau de texte (elles
 * sont émises avant lui côté flux) : l'utilisateur sait donc toujours d'où vient
 * la réponse, de quand datent les données, et ce que l'assistant n'a pas pu
 * établir — au lieu de le croire sur parole.
 *
 * Présentation en encart discret sous la réponse : l'information reste lisible
 * sans concurrencer le texte de l'assistant.
 */
export function AiAnswerMeta({ meta }: { meta: AiStreamMeta }) {
  const sources = meta.internalSources ?? [];
  const limitations = meta.limitations ?? [];

  return (
    <div className="mt-2.5 space-y-1.5 rounded-xl border border-line/80 bg-surface-subtle/80 p-2.5 text-[10.5px] leading-relaxed text-muted">
      <p className="flex items-start gap-1.5">
        <Database className="mt-px size-3 shrink-0 text-brand/70" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-semibold text-ink/80">Données consultées :</span>{' '}
          <span>{sources.length > 0 ? sources.map(toolLabel).join(', ') : 'aucune'}</span>
        </span>
      </p>

      <p className="flex items-start gap-1.5">
        <CalendarClock className="mt-px size-3 shrink-0 text-brand/70" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-semibold text-ink/80">Date des données :</span>{' '}
          <span>{meta.dataTimestamp ? formatDate(meta.dataTimestamp) : 'inconnue'}</span>
        </span>
      </p>

      {limitations.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-amber-500/10 p-1.5 text-amber-800 dark:text-amber-300">
          {limitations.map((limitation, index) => (
            <li key={`${index}-${limitation}`} className="flex gap-1.5">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{limitation}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
