import { strToU8 } from 'fflate';
import type { MediaItem } from '../types';
import { getRawDownloads, importDownloadEntry } from './offlineStorage';

const MANIFEST_FILE = 'manifest.json';
const MAX_PART_BYTES = 180 * 1024 * 1024;
const MAX_TRACKS_PER_PART = 8;

type ManifestEntry = {
  track: MediaItem;
  audioFile: string;
  downloadedAt: number;
};

export type SyncProgress = {
  phase: 'reading' | 'zipping' | 'saving' | 'extracting' | 'importing';
  current: number;
  total: number;
  part?: number;
  parts?: number;
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

type RawEntry = Awaited<ReturnType<typeof getRawDownloads>>[number];

function splitIntoParts(entries: RawEntry[]) {
  const parts: RawEntry[][] = [];
  let current: RawEntry[] = [];
  let currentSize = 0;

  for (const entry of entries) {
    const size = entry.audioBlob.size;
    const wouldOverflow =
      current.length > 0 &&
      (currentSize + size > MAX_PART_BYTES || current.length >= MAX_TRACKS_PER_PART);

    if (wouldOverflow) {
      parts.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(entry);
    currentSize += size;
  }

  if (current.length) parts.push(current);
  return parts;
}

async function exportPart(
  partEntries: RawEntry[],
  partIndex: number,
  totalParts: number,
  date: string,
  onProgress?: (p: SyncProgress) => void,
  label = 'biblioteca'
) {
  const files: Record<string, Uint8Array> = {};
  const manifest: ManifestEntry[] = [];

  for (let i = 0; i < partEntries.length; i++) {
    const entry = partEntries[i];
    const audioFile = `audio/${entry.track.id}.m4a`;
    manifest.push({
      track: entry.track,
      audioFile,
      downloadedAt: entry.downloadedAt,
    });
    files[audioFile] = new Uint8Array(await entry.audioBlob.arrayBuffer());
    onProgress?.({
      phase: 'reading',
      current: i + 1,
      total: partEntries.length,
      part: partIndex,
      parts: totalParts,
    });
    await yieldMain();
  }

  files[MANIFEST_FILE] = strToU8(
    JSON.stringify({ version: 1, part: partIndex, totalParts, tracks: manifest })
  );

  onProgress?.({ phase: 'zipping', current: partIndex, total: totalParts, part: partIndex, parts: totalParts });
  const zipped = await runZipInWorker(files);

  const filename =
    totalParts === 1
      ? `spot-music-${label}-${date}.zip`
      : `spot-music-${label}-${date}-parte${partIndex}-de-${totalParts}.zip`;

  onProgress?.({ phase: 'saving', current: partIndex, total: totalParts, part: partIndex, parts: totalParts });
  await saveZipFile(new Blob([zipped as BlobPart], { type: 'application/zip' }), filename);
  return filename;
}

export async function exportLibraryZip(
  onProgress?: (p: SyncProgress) => void,
  trackIds?: string[]
): Promise<{ count: number; filenames: string[] }> {
  let entries = await getRawDownloads();
  if (trackIds?.length) {
    const idSet = new Set(trackIds);
    entries = entries.filter((e) => idSet.has(e.track.id));
  }
  if (entries.length === 0) {
    throw new Error(trackIds?.length ? 'EMPTY_SELECTION' : 'EMPTY_LIBRARY');
  }

  const parts = splitIntoParts(entries);
  const date = new Date().toISOString().slice(0, 10);
  const label = trackIds?.length ? 'selecao' : 'biblioteca';
  const filenames: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const filename = await exportPart(parts[i], i + 1, parts.length, date, onProgress, label);
    filenames.push(filename);
    await yieldMain();
  }

  return { count: entries.length, filenames };
}

export async function importLibraryZip(
  file: File,
  onProgress?: (p: SyncProgress) => void
): Promise<number> {
  const worker = getZipWorker();
  worker.postMessage({ type: 'import-start' });

  let imported = 0;
  let total = 1;
  let importChain = Promise.resolve();

  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data?.type) return;

      if (data.type === 'manifest') {
        total = Math.max(1, data.count as number);
        onProgress?.({ phase: 'extracting', current: 0, total });
        return;
      }

      if (data.type === 'track') {
        const entry = data.entry as ManifestEntry;
        const audio = data.audio as Uint8Array;
        if (!audio) return;

        importChain = importChain.then(async () => {
          const blob = new Blob([audio as BlobPart], { type: 'audio/mp4' });
          await importDownloadEntry(entry.track, blob, entry.downloadedAt || Date.now());
          imported++;
          onProgress?.({ phase: 'importing', current: imported, total });
          await yieldMain();
        });
        return;
      }

      if (data.type === 'import-done') {
        importChain
          .then(() => {
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            resolve(imported);
          })
          .catch(reject);
        return;
      }

      if (data.type === 'error') {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        const code = data.message as string;
        if (code === 'NO_TRACKS') reject(new Error('NO_TRACKS'));
        else if (code === 'INVALID_MANIFEST') reject(new Error('INVALID_FILE'));
        else reject(new Error('IMPORT_FAILED'));
      }
    };

    const onError = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      reject(new Error('IMPORT_WORKER_FAILED'));
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    (async () => {
      try {
        const reader = file.stream().getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            worker.postMessage({ type: 'import-chunk', data: null, final: true });
            break;
          }
          const chunk = value;
          const buf = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
          worker.postMessage({ type: 'import-chunk', data: new Uint8Array(buf), final: false }, { transfer: [buf] });
          onProgress?.({ phase: 'extracting', current: Math.min(imported, total), total });
          await yieldMain();
        }
      } catch {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        reject(new Error('IMPORT_FAILED'));
      }
    })();
  });
}

export function isLocalDevHost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}
