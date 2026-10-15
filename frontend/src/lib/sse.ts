export interface SseFrame {
  event: string;
  data: string;
}

/**
 * Découpe un tampon de flux SSE en frames complètes (`event:` / `data:`,
 * séparées par une ligne vide). Les commentaires (: ping) et les frames sans
 * `data:` sont ignorés. Fonction pure — testable sans réseau.
 *
 * Partagée par le flux temps réel (`/stream`) et par la réponse en flux de
 * l'assistant (`/ai/chat`) : un seul analyseur, donc un seul comportement.
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let rest = buffer;
  let idx: number;

  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);

    let event = 'message';
    const dataLines: string[] = [];

    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }

    if (dataLines.length > 0) frames.push({ event, data: dataLines.join('\n') });
  }

  return { frames, rest };
}
