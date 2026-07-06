import type { MediaItem, SearchFilter } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function searchMedia(query: string, filter: SearchFilter = 'all') {
  const res = await fetch(
    `${API_BASE}/search?q=${encodeURIComponent(query)}&filter=${filter}`
  );
  if (!res.ok) throw new Error('Falha na busca');
  const data = await res.json();
  return data.data as MediaItem[];
}

/** @deprecated */
export const searchTracks = searchMedia;

export async function getTrending() {
  const res = await fetch(`${API_BASE}/trending`);
  if (!res.ok) throw new Error('Falha ao carregar trending');
  const data = await res.json();
  return data.data as MediaItem[];
}

export async function getPlaylistItems(playlistId: string) {
  const res = await fetch(`${API_BASE}/youtube/playlist/${playlistId}`);
  if (!res.ok) throw new Error('Falha ao carregar playlist');
  const data = await res.json();
  return data.data as MediaItem[];
}

export function prefetchStream(item: MediaItem) {
  if (item.source !== 'youtube') return;
  fetch(`${API_BASE}/youtube/prepare/${item.id}`).catch(() => {});
}

export function getStreamUrl(item: MediaItem | string) {
  const id = typeof item === 'string' ? item : item.id;
  return `${API_BASE}/youtube/stream/${id}`;
}

export function isPlayable(item: MediaItem) {
  return item.type !== 'playlist' && item.type !== 'album';
}

export function needsPlaylistOpen(item: MediaItem) {
  return item.type === 'playlist' || item.type === 'album';
}
