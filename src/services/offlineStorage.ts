import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DownloadedTrack, MediaItem } from '../types';
import { canDownload, getDownloadUrl } from './api';

interface SpotMusicDB extends DBSchema {
  downloads: {
    key: string;
    value: {
      track: MediaItem;
      audioBlob: Blob;
      downloadedAt: number;
    };
  };
}

const DB_NAME = 'spot-music-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SpotMusicDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SpotMusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('downloads')) {
          db.createObjectStore('downloads', { keyPath: 'track.id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function downloadTrack(
  track: MediaItem,
  onProgress?: (pct: number) => void
): Promise<DownloadedTrack> {
  if (!canDownload(track)) {
    throw new Error('DOWNLOAD_TOO_LONG');
  }

  const existing = await getDownloadedTrack(track.id);
  if (existing) return existing;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const res = await fetch(getDownloadUrl(track), { signal: controller.signal });
    if (!res.ok) throw new Error('Falha ao baixar');

    const contentLength = Number(res.headers.get('content-length') || 0);
    const reader = res.body?.getReader();
    if (!reader) {
      const blob = await res.blob();
      await saveDownload(track, blob);
      return buildDownloaded(track, blob);
    }

    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength && onProgress) {
        onProgress(Math.round((received / contentLength) * 100));
      } else if (onProgress && received > 0) {
        onProgress(Math.min(99, Math.round(received / 500000)));
      }
    }

    const blob = new Blob(chunks as BlobPart[], { type: 'audio/mp4' });
    await saveDownload(track, blob);
    return buildDownloaded(track, blob);
  } finally {
    clearTimeout(timeout);
  }
}

async function saveDownload(track: MediaItem, audioBlob: Blob) {
  const db = await getDB();
  await db.put('downloads', {
    track,
    audioBlob,
    downloadedAt: Date.now(),
  });
}

function buildDownloaded(track: MediaItem, blob: Blob): DownloadedTrack {
  return {
    ...track,
    downloadedAt: Date.now(),
    blobUrl: URL.createObjectURL(blob),
  };
}

export async function getDownloadedTrack(id: string): Promise<DownloadedTrack | null> {
  const db = await getDB();
  const entry = await db.get('downloads', id);
  if (!entry) return null;
  return buildDownloaded(entry.track, entry.audioBlob);
}

export async function getAllDownloads(): Promise<DownloadedTrack[]> {
  const db = await getDB();
  const entries = await db.getAll('downloads');
  return entries
    .sort((a, b) => b.downloadedAt - a.downloadedAt)
    .map((e) => buildDownloaded(e.track, e.audioBlob));
}

export async function removeDownload(id: string) {
  const db = await getDB();
  const entry = await db.get('downloads', id);
  if (entry) {
    const downloaded = buildDownloaded(entry.track, entry.audioBlob);
    if (downloaded.blobUrl) URL.revokeObjectURL(downloaded.blobUrl);
  }
  await db.delete('downloads', id);
}

export async function isDownloaded(id: string): Promise<boolean> {
  const db = await getDB();
  const entry = await db.get('downloads', id);
  return !!entry;
}
