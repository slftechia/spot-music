import { zip, Unzip, UnzipInflate, strFromU8 } from 'fflate';

const MANIFEST_FILE = 'manifest.json';

type ZipMsg = { type: 'zip'; files: Record<string, Uint8Array> };
type ImportStartMsg = { type: 'import-start' };
type ImportChunkMsg = { type: 'import-chunk'; data: Uint8Array | null; final: boolean };

type ManifestEntry = {
  track: { id: string; title?: string; artist?: string; [key: string]: unknown };
  audioFile: string;
  downloadedAt: number;
};

function concatChunks(chunks: Uint8Array[]) {
  const len = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

let unzipper: Unzip | null = null;
let manifestByAudio = new Map<string, ManifestEntry>();
let pendingAudio: { name: string; data: Uint8Array }[] = [];
let tracksSent = 0;

function resetImportState() {
  unzipper = new Unzip();
  unzipper.register(UnzipInflate);
  manifestByAudio = new Map();
  pendingAudio = [];
  tracksSent = 0;

  unzipper.onfile = (file) => {
    const chunks: Uint8Array[] = [];
    file.ondata = (err, dat, final) => {
      if (err) {
        self.postMessage({ type: 'error', message: err.message });
        return;
      }
      if (dat) chunks.push(dat);
      if (!final) return;
      handleExtractedFile(file.name, concatChunks(chunks));
    };
    file.start();
  };
}

function sendTrack(entry: ManifestEntry, data: Uint8Array) {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  tracksSent++;
  self.postMessage(
    {
      type: 'track',
      entry,
      tracksSent,
      audio: new Uint8Array(buf),
    },
    { transfer: [buf] }
  );
}

function flushPendingAudio() {
  const remaining: typeof pendingAudio = [];
  for (const item of pendingAudio) {
    const entry = manifestByAudio.get(item.name);
    if (entry) sendTrack(entry, item.data);
    else remaining.push(item);
  }
  pendingAudio = remaining;
}

function handleExtractedFile(name: string, data: Uint8Array) {
  if (name === MANIFEST_FILE) {
    try {
      const parsed = JSON.parse(strFromU8(data)) as { tracks?: ManifestEntry[] };
      if (!Array.isArray(parsed.tracks)) {
        self.postMessage({ type: 'error', message: 'INVALID_MANIFEST' });
        return;
      }
      for (const entry of parsed.tracks) {
        if (entry.audioFile && entry.track?.id) {
          manifestByAudio.set(entry.audioFile, entry);
        }
      }
      self.postMessage({ type: 'manifest', count: parsed.tracks.length });
      flushPendingAudio();
    } catch {
      self.postMessage({ type: 'error', message: 'INVALID_MANIFEST' });
    }
    return;
  }

  if (!name.startsWith('audio/')) return;

  const entry = manifestByAudio.get(name);
  if (entry) sendTrack(entry, data);
  else pendingAudio.push({ name, data });
}

self.onmessage = (e: MessageEvent<ZipMsg | ImportStartMsg | ImportChunkMsg>) => {
  const msg = e.data;

  if (msg.type === 'zip') {
    zip(msg.files, { level: 0 }, (err, result) => {
      if (err) {
        self.postMessage({ type: 'error', message: err.message });
        return;
      }
      self.postMessage({ type: 'zip-done', data: result }, { transfer: [result.buffer] });
    });
    return;
  }

  if (msg.type === 'import-start') {
    resetImportState();
    return;
  }

  if (msg.type === 'import-chunk') {
    if (!unzipper) resetImportState();
    if (msg.data) unzipper!.push(msg.data, !!msg.final);
    else if (msg.final) unzipper!.push(new Uint8Array(0), true);

    if (msg.final) {
      flushPendingAudio();
      if (tracksSent === 0) {
        self.postMessage({ type: 'error', message: 'NO_TRACKS' });
        return;
      }
      self.postMessage({ type: 'import-done', count: tracksSent });
      unzipper = null;
    }
  }
};
