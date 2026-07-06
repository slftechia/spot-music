import { create } from 'youtube-dl-exec';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const ytdlp = create(join(dir, 'node_modules/youtube-dl-exec/bin/yt-dlp.exe'));

const out = await ytdlp('ytsearch30:"sertanejo 2026"', {
  flatPlaylist: true,
  dumpSingleJson: true,
  skipDownload: true,
});

console.log('entries', out.entries?.length);
for (const e of (out.entries || []).slice(0, 3)) {
  console.log({ title: e.title, dur: e.duration, views: e.view_count, id: e.id });
}

const url = await ytdlp('https://www.youtube.com/watch?v=W3uJAqe9dIA', {
  format: 'bestaudio',
  getUrl: true,
});
console.log('stream url ok', String(url).startsWith('http'));
