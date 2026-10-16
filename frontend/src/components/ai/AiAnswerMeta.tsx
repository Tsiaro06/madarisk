import { TriangleAlert } from 'lucide-react';
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
 */
export function AiAnswerMeta({ meta }: { meta: AiStreamMeta }) {
  const sources = meta.internalSources ?? [];
  const limitations = meta.limitations ?? [];

  return (
    <div className="mt-2 space-y-1 border-t border-line pt-2 text-[11px] leading-relaxed text-muted">
      <p>
        <span className="font-medium">Données consultées :</span>{' '}
        {sources.length > 0 ? sources.map(toolLabel).join(', ') : 'aucune'}
      </p>
      <p>
        <span className="font-medium">Date des données :</span>{' '}
        {meta.dataTimestamp ? formatDate(meta.dataTimestamp) : 'inconnue'}
      </p>
      {limitations.length > 0 ? (
        <ul className="space-y-0.5 text-amber-700 dark:text-amber-300">
          {limitations.map((limitation, index) => (
            <li key={`${index}-${limitation}`} className="flex gap-1">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              <span>{limitation}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
