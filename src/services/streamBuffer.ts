import type { MediaItem } from '../types';
import { getOnlineAudioSources } from './api';

const MAX_BLOB_BYTES = 28 * 1024 * 1024;
const MIN_START_BYTES = 96 * 1024;

const blobUrlCache = new Map<string, string>();

const MIME_CANDIDATES = [
  'audio/mp4; codecs="mp4a.40.2"',
  'audio/mp4; codecs="mp4a.40.5"',
  'audio/mp4',
  'audio/webm; codecs="opus"',
  'audio/mpeg',
];

type ActiveSession = { abort: () => void };

const activeSessions = new Map<string, ActiveSession>();

function pickMime(contentType: string | null): string | null {
  const base = (contentType || 'audio/mp4').split(';')[0].trim().toLowerCase();
  const ordered = [
    ...MIME_CANDIDATES.filter((m) => m.startsWith(base)),
    ...MIME_CANDIDATES,
  ];
  for (const mime of ordered) {
    if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

export function revokeOnlineBlob(videoId: string) {
  abortProgressivePlayback(videoId);
  const url = blobUrlCache.get(videoId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(videoId);
  }
}

export function getCachedOnlineBlob(videoId: string) {
  return blobUrlCache.get(videoId) ?? null;
}

export function abortProgressivePlayback(videoId?: string) {
  if (videoId) {
    activeSessions.get(videoId)?.abort();
    activeSessions.delete(videoId);
    return;
  }
  for (const [id, session] of activeSessions) {
    session.abort();
    activeSessions.delete(id);
  }
}

function waitSourceBuffer(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve();
  return new Promise((resolve) => {
    sb.addEventListener('updateend', () => resolve(), { once: true });
  });
}

async function appendChunk(sb: SourceBuffer, chunk: Uint8Array) {
  await waitSourceBuffer(sb);
  sb.appendBuffer(chunk as BufferSource);
  await waitSourceBuffer(sb);
}

/**
 * Toca assim que os primeiros ~96KB chegam e continua carregando no buffer MSE.
 * Dados ficam na memória — estável ao pressionar Home no Android.
 */
export async function playProgressiveOnlineAudio(
  item: MediaItem,
  audio: HTMLAudioElement,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (pct: number) => void;
    startAt?: number;
  }
): Promise<void> {
  const cached = blobUrlCache.get(item.id);
  if (cached) {
    audio.src = cached;
    audio.load();
    if (opts?.startAt && opts.startAt > 0) {
      try {
        audio.currentTime = opts.startAt;
      } catch {
        /* ignore */
      }
    }
    await audio.play();
    opts?.onProgress?.(100);
    return;
  }

  if (typeof MediaSource === 'undefined') {
    throw new Error('MSE_UNSUPPORTED');
  }

  const urls = getOnlineAudioSources(item);
  let lastErr: unknown;

  for (const url of urls) {
    try {
      await startProgressive(url, item, audio, opts);
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastErr = err;
    }
  }

  throw lastErr || new Error('PROGRESSIVE_FAILED');
}

async function startProgressive(
  url: string,
  item: MediaItem,
  audio: HTMLAudioElement,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (pct: number) => void;
    startAt?: number;
  }
) {
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > MAX_BLOB_BYTES) throw new Error('TOO_LARGE');

  const reader = res.body?.getReader();
  if (!reader) throw new Error('NO_BODY');

  const mime = pickMime(res.headers.get('content-type'));
  if (!mime) throw new Error('MSE_UNSUPPORTED');

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  let aborted = false;
  let playStarted = false;

  const abort = () => {
    if (aborted) return;
    aborted = true;
    void reader.cancel().catch(() => {});
    if (mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream();
      } catch {
        /* ignore */
      }
    }
    URL.revokeObjectURL(objectUrl);
  };

  activeSessions.set(item.id, { abort });
  opts?.signal?.addEventListener('abort', abort, { once: true });

  await new Promise<void>((resolve, reject) => {
    const fail = (err: unknown) => {
      abort();
      activeSessions.delete(item.id);
      reject(err);
    };

    mediaSource.addEventListener(
      'sourceopen',
      () => {
        void (async () => {
          try {
            const sb = mediaSource.addSourceBuffer(mime);
            const allChunks: Uint8Array[] = [];
            let received = 0;

            audio.src = objectUrl;

            while (!aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!value?.length) continue;

              received += value.length;
              if (received > MAX_BLOB_BYTES) throw new Error('TOO_LARGE');

              allChunks.push(value);
              await appendChunk(sb, value);

              if (contentLength && opts?.onProgress) {
                opts.onProgress(Math.round((received / contentLength) * 100));
              } else if (opts?.onProgress) {
                opts.onProgress(Math.min(99, Math.round(received / 1_500_000)));
              }

              if (!playStarted && received >= MIN_START_BYTES) {
                playStarted = true;
                if (opts?.startAt && opts.startAt > 0) {
                  try {
                    audio.currentTime = opts.startAt;
                  } catch {
                    /* ignore */
                  }
                }
                await audio.play();
                resolve();
              }
            }

            if (!playStarted) {
              if (opts?.startAt && opts.startAt > 0) {
                try {
                  audio.currentTime = opts.startAt;
                } catch {
                  /* ignore */
                }
              }
              await audio.play();
              resolve();
            }

            if (mediaSource.readyState === 'open') {
              try {
                mediaSource.endOfStream();
              } catch {
                /* ignore */
              }
            }

            const blob = new Blob(allChunks as BlobPart[], {
              type: res.headers.get('content-type') || 'audio/mp4',
            });
            const blobUrl = URL.createObjectURL(blob);
            blobUrlCache.set(item.id, blobUrl);
            opts?.onProgress?.(100);
            activeSessions.delete(item.id);
          } catch (err) {
            fail(err);
          }
        })();
      },
      { once: true }
    );

    mediaSource.addEventListener('error', () => fail(new Error('MEDIA_SOURCE_ERROR')), { once: true });
  });
}

/** Fallback: espera download completo antes de tocar */
export async function bufferOnlineAudio(
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
