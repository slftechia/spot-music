const RECENT_KEY = 'spot-music-recent-searches';
const MAX_RECENT = 12;

export function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const list = loadRecentSearches().filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
  list.unshift(trimmed);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY);
}
