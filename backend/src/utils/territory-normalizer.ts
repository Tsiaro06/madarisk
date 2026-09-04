const ACCENT_MAP: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  ç: 'c', è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ñ: 'n', ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  À: 'A', Á: 'A', Â: 'A', Ã: 'A', Ä: 'A', Å: 'A',
  Ç: 'C', È: 'E', É: 'E', Ê: 'E', Ë: 'E',
  Ì: 'I', Í: 'I', Î: 'I', Ï: 'I',
  Ñ: 'N', Ò: 'O', Ó: 'O', Ô: 'O', Õ: 'O', Ö: 'O',
  Ù: 'U', Ú: 'U', Û: 'U', Ü: 'U',
  Ý: 'Y', Ÿ: 'Y',
};

export function removeAccents(input: string): string {
  return input
    .split('')
    .map((ch) => ACCENT_MAP[ch] ?? ch)
    .join('');
}

export function normalizeName(input: string | null | undefined): string {
  const value = (input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  return value.replace(/[^A-Z0-9]+/g, ' ').trim();
}

export function normalizeCode(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  let prev = new Array<number>(bn + 1);
  let curr = new Array<number>(bn + 1);
  for (let j = 0; j <= bn; j++) prev[j] = j;

  for (let i = 1; i <= an; i++) {
    curr[0] = i;
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bn];
}

export function similarityPercent(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  const dist = levenshtein(x, y);
  const maxLen = Math.max(x.length, y.length);
  return Math.max(0, Math.round(((maxLen - dist) / maxLen) * 100));
}
