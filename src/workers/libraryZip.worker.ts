import { zip, unzip } from 'fflate';

type ZipMsg = { type: 'zip'; files: Record<string, Uint8Array> };
type UnzipMsg = { type: 'unzip'; data: Uint8Array };

self.onmessage = (e: MessageEvent<ZipMsg | UnzipMsg>) => {
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

  unzip(msg.data, (err, result) => {
    if (err) {
      self.postMessage({ type: 'error', message: err.message });
      return;
    }
    self.postMessage({ type: 'unzip-done', data: result });
  });
};
