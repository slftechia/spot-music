import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { create } from 'youtube-dl-exec';
import { Innertube } from 'youtubei.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ytdlp = create(process.platform === 'win32'
  ? join(root, 'node_modules/youtube-dl-exec/bin/yt-dlp.exe')
  : undefined);

let innertube = null;

async function getInnertube() {
  if (!innertube) innertube = await Innertube.create();
  return innertube;
}

function parseDuration(text) {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatViews(count) {
  if (!count) return '';
  const text = String(count);
  return text.includes('view') ? text : `${Number(count).toLocaleString('pt-BR')} visualizações`;
}

function isCompilation(title, durationSec) {
  const lower = (title || '').toLowerCase();
  const keywords = ['mix', 'compila', 'playlist', 'top ', 'melhores', 'mais tocadas', 'ao vivo', 'dvd', 'álbum', 'album', 'set ', '1 hora', '2 hora'];
  return durationSec >= 1200 || keywords.some((k) => lower.includes(k));
}

function classifyVideo(title, durationSec) {
  return isCompilation(title, durationSec) ? 'compilation' : 'video';
}

function bestThumbnail(thumbnails) {
  if (!thumbnails?.length) return '';
  const sorted = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0]?.url || '';
}

function mapVideo(item) {
  const durationSec = parseDuration(item.duration?.text);
  const title = item.title?.text || '';
  return {
    id: item.id,
    title,
    artist: item.author?.name || 'YouTube',
    artwork: bestThumbnail(item.thumbnails) || `https://i.ytimg.com/vi/${item.id}/hq720.jpg`,
    duration: durationSec,
    durationText: item.duration?.text || '',
    type: classifyVideo(title, durationSec),
    source: 'youtube',
    viewCount: formatViews(item.view_count?.text || item.short_view_count?.text),
    description: item.description?.text?.slice(0, 200) || '',
  };
}

function mapLockup(item) {
  const type = item.content_type === 'ALBUM' ? 'album' : 'playlist';
  const meta = item.metadata;
  const title = meta?.title?.text || meta?.title || 'Sem título';
  const lines = meta?.lines || [];
  const artist = lines[0]?.text || 'YouTube';
  const extra = lines[1]?.text || '';

  let videoCount = 0;
  const countMatch = extra.match(/(\d+)\s*(vídeos|videos|músicas|musicas)/i);
  if (countMatch) videoCount = Number(countMatch[1]);

  return {
    id: item.content_id,
    title,
    artist,
    artwork:
      item.content_image?.image?.sources?.[0]?.url ||
      item.content_image?.image?.sources?.at(-1)?.url ||
      '',
    duration: 0,
    durationText: extra,
    type,
    source: 'youtube',
    viewCount: extra,
    videoCount,
    playlistId: item.content_id,
  };
}

function mapPlaylist(item) {
  return {
    id: item.id,
    title: item.title?.text || '',
    artist: item.author?.name || 'YouTube',
    artwork: bestThumbnail(item.thumbnails) || '',
    duration: 0,
    durationText: item.video_count ? `${item.video_count} vídeos` : '',
    type: 'playlist',
    source: 'youtube',
    viewCount: item.view_count?.text || '',
    videoCount: Number(item.video_count) || 0,
    playlistId: item.id,
  };
}

function matchesFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'videos') return item.type === 'video';
  if (filter === 'compilations') return item.type === 'compilation';
  if (filter === 'playlists') return item.type === 'playlist';
  if (filter === 'albums') return item.type === 'album';
  return true;
}

function sortLikeYouTube(items) {
  const order = { compilation: 0, playlist: 1, album: 2, video: 3, track: 4 };
  return [...items].sort((a, b) => {
    const oa = order[a.type] ?? 5;
    const ob = order[b.type] ?? 5;
    if (oa !== ob) return oa - ob;
    return (b.duration || 0) - (a.duration || 0);
  });
}

export async function searchYouTube(query, filter = 'all') {
  const yt = await getInnertube();
  const results = await yt.search(query, { type: 'all' });
  const items = [];

  for (const item of results.results || []) {
    try {
      if (item.type === 'Video') {
        const mapped = mapVideo(item);
        if (matchesFilter(mapped, filter)) items.push(mapped);
      } else if (item.type === 'Playlist') {
        const mapped = mapPlaylist(item);
        if (matchesFilter(mapped, filter)) items.push(mapped);
      } else if (item.type === 'LockupView' && item.content_id) {
        const mapped = mapLockup(item);
        if (matchesFilter(mapped, filter)) items.push(mapped);
      }
    } catch {
      continue;
    }
  }

  return sortLikeYouTube(items).slice(0, 40);
}

export async function getTrendingYouTube() {
  return searchYouTube('músicas mais tocadas 2026 mix compilação', 'all');
}

const URL_TTL_MS = 5 * 60 * 60 * 1000;
const urlCache = new Map();
const inflight = new Map();

export async function getStreamUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached.url;

  if (inflight.has(videoId)) return inflight.get(videoId);

  const promise = ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
    format: 'bestaudio/best',
    getUrl: true,
  })
    .then((url) => {
      const trimmed = String(url).trim();
      urlCache.set(videoId, { url: trimmed, expires: Date.now() + URL_TTL_MS });
      inflight.delete(videoId);
      return trimmed;
    })
    .catch((err) => {
      inflight.delete(videoId);
      throw err;
    });

  inflight.set(videoId, promise);
  return promise;
}

export async function prepareStream(videoId) {
  await getStreamUrl(videoId);
  return { ready: true };
}

export async function getPlaylistItems(playlistId) {
  const data = await ytdlp(`https://www.youtube.com/playlist?list=${playlistId}`, {
    flatPlaylist: true,
    dumpSingleJson: true,
    skipDownload: true,
    playlistend: 50,
  });

  const entries = data.entries || [];
  return entries
    .filter((e) => e.id)
    .map((e) => {
      const durationSec = Number(e.duration) || 0;
      const title = e.title || '';
      return {
        id: e.id,
        title,
        artist: e.uploader || e.channel || data.uploader || 'YouTube',
        artwork: bestThumbnail(e.thumbnails) || `https://i.ytimg.com/vi/${e.id}/hq720.jpg`,
        duration: durationSec,
        durationText: durationSec ? formatSeconds(durationSec) : '',
        type: classifyVideo(title, durationSec),
        source: 'youtube',
        viewCount: e.view_count ? formatViews(e.view_count) : '',
      };
    });
}

function formatSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export async function proxyStream(videoId, req, res) {
  const streamUrl = await getStreamUrl(videoId);
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  const response = await fetch(streamUrl, { headers });
  if (!response.ok) {
    if (!res.headersSent) {
      res.status(response.status).json({ error: 'Stream indisponível' });
    }
    return;
  }

  const passthrough = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
  for (const h of passthrough) {
    const val = response.headers.get(h);
    if (val) res.setHeader(h, val);
  }
  res.status(response.status);
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (!response.body) {
    res.end();
    return;
  }

  const readable = Readable.fromWeb(response.body);
  const abort = () => readable.destroy();
  req.on('close', abort);

  try {
    await pipeline(readable, res);
  } catch (err) {
    const code = err?.code || '';
    const benign = ['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'ERR_HTTP_HEADERS_SENT', 'EPIPE'];
    if (!benign.includes(code)) {
      console.error('Stream error:', err.message);
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro no stream' });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
