import type { MediaItem, SearchFilter, HomeGenreSection } from '../types';
import { isMobileDevice } from '../utils/device';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** PC: mixes longos para exportar. Celular: até 20 min (como antes). */
export const MAX_DOWNLOAD_SECONDS_DESKTOP = 3 * 60 * 60;
export const MAX_DOWNLOAD_SECONDS_MOBILE = 20 * 60;
/** @deprecated Use getMaxDownloadSeconds() — mantido para imports existentes. */
export const MAX_DOWNLOAD_SECONDS = MAX_DOWNLOAD_SECONDS_MOBILE;
export const DOWNLOADS_ENABLED = true;

export function getMaxDownloadSeconds() {
  return isMobileDevice() ? MAX_DOWNLOAD_SECONDS_MOBILE : MAX_DOWNLOAD_SECONDS_DESKTOP;
}

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
  return data.data as HomeGenreSection[];
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

const prepareInflight = new Map<string, Promise<void>>();

export function prefetchStream(item: MediaItem | string) {
  const id = typeof item === 'string' ? item : item.id;
  if (!id) return;

  const existing = prepareInflight.get(id);
  if (existing) {
    void existing.catch(() => {});
    return;
  }

  const job = prepareStream(id).finally(() => {
    prepareInflight.delete(id);
  });
  prepareInflight.set(id, job);
  void job.catch(() => {});
}

/** Aguarda prepare com teto — usado no play para não bloquear demais */
export async function warmStreamCache(item: MediaItem | string, maxWaitMs = 2200) {
  prefetchStream(item);
  const id = typeof item === 'string' ? item : item.id;
  const job = prepareInflight.get(id);
  if (!job) return;

  await Promise.race([
    job.catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
  ]);
}

export function getStreamUrl(item: MediaItem | string) {
  const id = typeof item === 'string' ? item : item.id;
  return `${API_BASE}/youtube/stream/${id}`;
}

/** Proxy same-origin — melhor para <audio> com Media Session / background */
export function getAudioProxyUrl(item: MediaItem | string) {
  const id = typeof item === 'string' ? item : item.id;
  return `${API_BASE}/youtube/download/${id}`;
}

export function getDownloadUrl(item: MediaItem | string) {
  const id = typeof item === 'string' ? item : item.id;
  return `${API_BASE}/youtube/download/${id}`;
}

export function canDownload(item: MediaItem) {
  if (!item.duration) return true;
  return item.duration <= getMaxDownloadSeconds();
}

export function downloadBlockedReason(item: MediaItem) {
  if (!canDownload(item)) {
    const max = getMaxDownloadSeconds();
    if (max < 3600) {
      return `No celular o limite é ${Math.round(max / 60)} min. Ouça online ou baixe no PC e importe.`;
    }
    return `Muito longo para baixar (máx. ${Math.round(max / 3600)}h). Ouça online.`;
  }
  return null;
}

export function isPlayable(item: MediaItem) {
  return item.type !== 'playlist' && item.type !== 'album';
}

export function needsPlaylistOpen(item: MediaItem) {
  return item.type === 'playlist' || item.type === 'album';
}
