import type { MediaItem, SearchFilter } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
export const MAX_DOWNLOAD_SECONDS = 20 * 60;
export const DOWNLOADS_ENABLED = false;

export async function getSearchSuggestions(query: string) {
  const res = await fetch(`${API_BASE}/suggest?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data as string[]) || [];
}

export async function searchMedia(query: string, filter: SearchFilter = 'all') {
  const res = await fetch(
    `${API_BASE}/search?q=${encodeURIComponent(query)}&filter=${filter}`
  );
  if (!res.ok) throw new Error('Falha na busca');
  const data = await res.json();
  return data.data as MediaItem[];
}

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

export async function prepareStream(item: MediaItem | string): Promise<void> {
  const id = typeof item === 'string' ? item : item.id;
  const res = await fetch(`${API_BASE}/youtube/prepare/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Falha ao preparar áudio');
  }
}

export function prefetchStream(_item: MediaItem) {
  // Playback usa YouTube IFrame no cliente — sem prefetch no servidor
}

export function getStreamUrl(item: MediaItem | string) {
  const id = typeof item === 'string' ? item : item.id;
  return `${API_BASE}/youtube/stream/${id}`;
}

export function getDownloadUrl(item: MediaItem | string) {
  const id = typeof item === 'string' ? item : item.id;
  return `${API_BASE}/youtube/download/${id}`;
}

export function canDownload(item: MediaItem) {
  if (!item.duration) return true;
  return item.duration <= MAX_DOWNLOAD_SECONDS;
}

export function downloadBlockedReason(item: MediaItem) {
  if (!canDownload(item)) {
    const min = Math.round(MAX_DOWNLOAD_SECONDS / 60);
    return `Muito longo para baixar (máx. ${min} min). Ouça online.`;
  }
  return 'Download offline temporariamente indisponível. Ouça online pelo app.';
}

export function isPlayable(item: MediaItem) {
  return item.type !== 'playlist' && item.type !== 'album';
}

export function needsPlaylistOpen(item: MediaItem) {
  return item.type === 'playlist' || item.type === 'album';
}
