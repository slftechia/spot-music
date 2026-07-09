import { searchMedia } from './api';
import { loadRecentSearches } from './searchHistory';
import type { HomeGenreSection } from '../types';

/** Seções da home baseadas nas últimas buscas do usuário. */
export async function getPersonalizedSections(maxQueries = 4): Promise<HomeGenreSection[]> {
  const queries = loadRecentSearches().slice(0, maxQueries);
  if (queries.length === 0) return [];

  const sections = await Promise.all(
    queries.map(async (query) => {
      try {
        const items = await searchMedia(query, 'all');
        return {
          id: `history-${encodeURIComponent(query)}`,
          title: query,
          items: items.slice(0, 8),
        };
      } catch {
        return { id: `history-${encodeURIComponent(query)}`, title: query, items: [] };
      }
    })
  );

  return sections.filter((s) => s.items.length > 0);
}
