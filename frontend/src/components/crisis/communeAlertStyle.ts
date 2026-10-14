import type { PathOptions } from 'leaflet';
import {
  COMMUNE_ALERT_BORDERS,
  COMMUNE_ALERT_COLORS,
  COMMUNE_ALERT_INFO_TYPE_LABELS,
  COMMUNE_ALERT_SCOPE_LABELS,
  COMMUNE_ALERT_SHORT_LABELS,
  formatAntananarivo,
  isEstimatedAlert,
} from '@/lib/historical';
import type { DisplayedCommuneAlertLevel, EventCommuneAlertRow } from '@/types';

export const GRIS: DisplayedCommuneAlertLevel = 'GRIS';

/**
 * Style d'une commune selon son niveau d'alerte affiché à l'instant consulté.
 * GRIS = aucune ligne active : la commune reste neutre et translucide.
 */
export function alertStyle(
  row: EventCommuneAlertRow | undefined,
  selected: boolean,
): PathOptions {
  const level: DisplayedCommuneAlertLevel = row?.alertLevel ?? GRIS;
  const fill = COMMUNE_ALERT_COLORS[level];
  const border = COMMUNE_ALERT_BORDERS[level];
  const estimated = row ? isEstimatedAlert(row.territoryScope, row.infoType) : false;
  return {
    color: selected ? '#03224c' : border,
    weight: selected ? 3 : level === GRIS ? 0.6 : 1.2,
    dashArray: estimated ? '4 3' : undefined,
    fillColor: fill,
    fillOpacity: selected ? 0.68 : level === GRIS ? 0.08 : 0.5,
    opacity: level === GRIS ? 0.7 : 1,
  };
}

function line(label: string, value: string): HTMLElement {
  const el = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `${label} : `;
  el.appendChild(strong);
  el.appendChild(document.createTextNode(value));
  return el;
}

/** Infobulle : niveau affiché + traçabilité complète (dates, nature, source). */
export function alertTooltipElement(
  name: string,
  row: EventCommuneAlertRow | undefined,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'text-[11px] leading-snug';

  const title = document.createElement('strong');
  title.textContent = name || 'Commune';
  el.appendChild(title);

  if (!row) {
    const neutral = document.createElement('div');
    neutral.textContent = 'Hors alerte à cette date (aucune information documentée).';
    el.appendChild(neutral);
    return el;
  }

  const level = row.alertLevel;
  el.appendChild(line('Niveau', COMMUNE_ALERT_SHORT_LABELS[level]));

  const period =
    row.validTo != null
      ? `du ${formatAntananarivo(row.validFrom)} au ${formatAntananarivo(row.validTo)}`
      : `depuis le ${formatAntananarivo(row.validFrom)}`;
  el.appendChild(line('Validité', period));

  el.appendChild(
    line(
      'Nature',
      `${COMMUNE_ALERT_INFO_TYPE_LABELS[row.infoType]} (${COMMUNE_ALERT_SCOPE_LABELS[row.territoryScope]})`,
    ),
  );

  if (row.sourceName) el.appendChild(line('Source', row.sourceName));
  if (row.comment) {
    const comment = document.createElement('div');
    comment.className = 'pt-0.5 text-slate-600';
    comment.textContent = row.comment;
    el.appendChild(comment);
  }

  if (isEstimatedAlert(row.territoryScope, row.infoType)) {
    const flag = document.createElement('div');
    flag.className = 'pt-0.5 italic text-amber-700';
    flag.textContent = 'Estimation spatiale : niveau hérité, non publié à l’échelle communale.';
    el.appendChild(flag);
  }

  return el;
}
