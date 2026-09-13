/** Minuscolo e senza accenti: "Panca Piàna" → "panca piana". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

interface Searchable {
  name: string;
  muscleGroup: string;
}

/**
 * Ricerca per parole: ogni parola della query deve comparire nel nome o nel gruppo muscolare.
 * I risultati il cui nome inizia con la query vengono prima.
 */
export function searchExercises<T extends Searchable>(items: T[], query: string): T[] {
  const q = normalizeText(query);
  if (!q) return [...items].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const tokens = q.split(/\s+/);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const name = normalizeText(item.name);
    const hay = `${name} ${normalizeText(item.muscleGroup)}`;
    if (!tokens.every((t) => hay.includes(t))) continue;
    const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, 'it'))
    .map((s) => s.item);
}
