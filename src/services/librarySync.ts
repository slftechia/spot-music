import { strToU8, strFromU8 } from 'fflate';
import type { MediaItem } from '../types';
import { getRawDownloads, importDownloadEntry } from './offlineStorage';

const MANIFEST_FILE = 'manifest.json';

type ManifestEntry = {
  track: MediaItem;
  audioFile: string;
  downloadedAt: number;
};

export type SyncProgress = {
  phase: 'reading' | 'zipping' | 'saving';
  current: number;
  total: number;
};

let zipWorker: Worker | null = null;

function getZipWorker() {
  if (!zipWorker) {
    zipWorker = new Worker(new URL('../workers/libraryZip.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return zipWorker;
}

function yieldMain() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function runZipInWorker(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = getZipWorker();
    const payload: Record<string, Uint8Array> = {};
    const transfers: ArrayBuffer[] = [];

    for (const [name, data] of Object.entries(files)) {
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      payload[name] = new Uint8Array(buf);
      transfers.push(buf);
    }

    const onMessage = (e: MessageEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (e.data?.type === 'zip-done') resolve(e.data.data as Uint8Array);
      else reject(new Error(e.data?.message || 'ZIP_FAILED'));
    };

    const onError = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      reject(new Error('ZIP_WORKER_FAILED'));
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'zip', files: payload }, transfers);
  });
}

function runUnzipInWorker(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    const worker = getZipWorker();
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

    const onMessage = (e: MessageEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (e.data?.type === 'unzip-done') resolve(e.data.data as Record<string, Uint8Array>);
      else reject(new Error(e.data?.message || 'UNZIP_FAILED'));
    };

    const onError = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      reject(new Error('UNZIP_WORKER_FAILED'));
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'unzip', data: new Uint8Array(buf) }, [buf]);
  });
}

async function saveZipFile(blob: Blob, filename: string) {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (opts: {
        suggestedName: string;
        types: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function exportLibraryZip(
  onProgress?: (p: SyncProgress) => void
): Promise<{ count: number; filename: string }> {
  const entries = await getRawDownloads();
  if (entries.length === 0) {
    throw new Error('EMPTY_LIBRARY');
  }

  const files: Record<string, Uint8Array> = {};
  const manifest: ManifestEntry[] = [];
  const total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const audioFile = `audio/${entry.track.id}.m4a`;
    manifest.push({
      track: entry.track,
      audioFile,
      downloadedAt: entry.downloadedAt,
    });
    files[audioFile] = new Uint8Array(await entry.audioBlob.arrayBuffer());
    onProgress?.({ phase: 'reading', current: i + 1, total });
    await yieldMain();
  }

  files[MANIFEST_FILE] = strToU8(JSON.stringify({ version: 1, tracks: manifest }));

  onProgress?.({ phase: 'zipping', current: 0, total: 1 });
  const zipped = await runZipInWorker(files);
  onProgress?.({ phase: 'zipping', current: 1, total: 1 });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `spot-music-biblioteca-${date}.zip`;

  onProgress?.({ phase: 'saving', current: 0, total: 1 });
  await saveZipFile(new Blob([zipped as BlobPart], { type: 'application/zip' }), filename);
  onProgress?.({ phase: 'saving', current: 1, total: 1 });

  return { count: entries.length, filename };
}

export async function importLibraryZip(
  file: File,
  onProgress?: (p: SyncProgress) => void
): Promise<number> {
  const buf = new Uint8Array(await file.arrayBuffer());

  onProgress?.({ phase: 'zipping', current: 0, total: 1 });
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = await runUnzipInWorker(buf);
  } catch {
    throw new Error('INVALID_FILE');
  }
  onProgress?.({ phase: 'zipping', current: 1, total: 1 });

  const manifestRaw = unzipped[MANIFEST_FILE];
  if (!manifestRaw) throw new Error('INVALID_FILE');

  const manifest = JSON.parse(strFromU8(manifestRaw)) as {
    version?: number;
    tracks: ManifestEntry[];
  };

  if (!Array.isArray(manifest.tracks)) throw new Error('INVALID_FILE');

  const tracks = manifest.tracks.filter((t) => t.track?.id && unzipped[t.audioFile]);
  let imported = 0;

  for (let i = 0; i < tracks.length; i++) {
    const item = tracks[i];
    const audioData = unzipped[item.audioFile];
    const blob = new Blob([audioData as BlobPart], { type: 'audio/mp4' });
    await importDownloadEntry(item.track, blob, item.downloadedAt || Date.now());
    imported++;
    onProgress?.({ phase: 'reading', current: i + 1, total: tracks.length });
    await yieldMain();
  }

  if (imported === 0) throw new Error('NO_TRACKS');
  return imported;
}

export function isLocalDevHost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}
