import type { MediaItem } from '../types';
import { getAudioProxyUrl, getOnlineAudioSources } from './api';

const MAX_BLOB_BYTES = 28 * 1024 * 1024;

const blobUrlCache = new Map<string, string>();
const inflightBuffers = new Map<string, Promise<string>>();

export function revokeOnlineBlob(videoId: string) {
  const url = blobUrlCache.get(videoId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(videoId);
  }
  inflightBuffers.delete(videoId);
}

export function getCachedOnlineBlob(videoId: string) {
  return blobUrlCache.get(videoId) ?? null;
}

/** Inicia download para blob em paralelo (não bloqueia o play). */
export function prefetchOnlineBlob(
  item: MediaItem,
  opts?: { signal?: AbortSignal; onProgress?: (pct: number) => void }
): Promise<string> {
  const cached = blobUrlCache.get(item.id);
  if (cached) return Promise.resolve(cached);

  const inflight = inflightBuffers.get(item.id);
  if (inflight) return inflight;

  const job = bufferOnlineAudio(item, opts).finally(() => {
    inflightBuffers.delete(item.id);
  });
  inflightBuffers.set(item.id, job);
  return job;
}

/** Troca stream HTTP por blob na memória (mesmo instante da faixa). */
export async function swapAudioToBlob(
  audio: HTMLAudioElement,
  blobUrl: string,
  keepPlaying = true
): Promise<void> {
  const t = audio.currentTime || 0;
  const playing = keepPlaying && !audio.paused;
  audio.src = blobUrl;
  audio.load();
  if (t > 0) {
    try {
      audio.currentTime = t;
    } catch {
      /* ignore */
    }
  }
  if (playing) {
    await audio.play();
  }
}

export function getImmediatePlayUrl(item: MediaItem): string {
  return getAudioProxyUrl(item);
}

async function bufferOnlineAudio(
  item: MediaItem,
  opts?: { signal?: AbortSignal; onProgress?: (pct: number) => void }
): Promise<string> {
  const cached = blobUrlCache.get(item.id);
  if (cached) return cached;

  const urls = getOnlineAudioSources(item);
  let lastErr: unknown;

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: opts?.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentLength = Number(res.headers.get('content-length') || 0);
      if (contentLength > MAX_BLOB_BYTES) throw new Error('TOO_LARGE');

      const mime = res.headers.get('content-type') || 'audio/mp4';
      const reader = res.body?.getReader();

      if (!reader) {
        const blob = await res.blob();
        if (blob.size > MAX_BLOB_BYTES) throw new Error('TOO_LARGE');
        const blobUrl = URL.createObjectURL(blob);
        blobUrlCache.set(item.id, blobUrl);
        opts?.onProgress?.(100);
        return blobUrl;
      }

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BLOB_BYTES) throw new Error('TOO_LARGE');
        chunks.push(value);
        if (contentLength && opts?.onProgress) {
          opts.onProgress(Math.round((received / contentLength) * 100));
        } else if (opts?.onProgress && received > 0) {
          opts.onProgress(Math.min(99, Math.round(received / 1_500_000)));
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(item.id, blobUrl);
      opts?.onProgress?.(100);
      return blobUrl;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastErr = err;
    }
  }

  throw lastErr || new Error('BUFFER_FAILED');
}
