import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { existsSync } from 'fs';
import { create } from 'youtube-dl-exec';
import { Innertube } from 'youtubei.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ytdlpBinary =
  process.env.YTDLP_PATH ||
  (process.platform === 'win32'
    ? join(root, 'node_modules/youtube-dl-exec/bin/yt-dlp.exe')
    : join(root, 'node_modules/youtube-dl-exec/bin/yt-dlp'));

const ytdlp = create(ytdlpBinary);

function baseYtdlpOpts() {
  const opts = {
    noWarnings: true,
    noCheckCertificates: true,
    remoteComponents: 'ejs:github',
  };
  const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;
  if (cookiesPath && existsSync(cookiesPath)) {
    opts.cookies = cookiesPath;
  }
  return opts;
}

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

function sortForMobile(items) {
  const short = items.filter((i) => i.duration > 0 && i.duration <= 480);
  const medium = items.filter((i) => i.duration > 480 && i.duration <= 1200);
  const long = items.filter((i) => !i.duration || i.duration > 1200);
  return [...short, ...medium, ...long].slice(0, 30);
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
  const yt = await getInnertube();
  const results = await yt.search('musicas 2026 official', { type: 'video' });
  const items = [];
  for (const item of results.results || []) {
    if (item.type === 'Video') items.push(mapVideo(item));
  }
  return sortForMobile(items);
}

const URL_TTL_MS = 5 * 60 * 60 * 1000;
const urlCache = new Map();
const inflight = new Map();


const CLIENT_FALLBACKS = [
  'youtube:player_client=android,web;player_skip=webpage,configs',
  'youtube:player_client=android,web',
  'youtube:player_client=ios',
  'youtube:player_client=tv_embedded',
];

async function resolveWithGetUrl(videoUrl) {
  let lastErr;
  for (const extractorArgs of CLIENT_FALLBACKS) {
    try {
      const raw = await ytdlp(videoUrl, {
        ...baseYtdlpOpts(),
        extractorArgs,
        format: 'bestaudio[ext=m4a]/bestaudio/best',
        getUrl: true,
      });
      const trimmed = String(raw ?? '').trim();
      if (trimmed.startsWith('http')) return trimmed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('yt-dlp getUrl falhou');
}

async function resolveWithJson(videoUrl) {
  const info = await ytdlp(videoUrl, {
    ...baseYtdlpOpts(),
    extractorArgs: CLIENT_FALLBACKS[0],
    format: 'bestaudio/best',
    dumpSingleJson: true,
    skipDownload: true,
  });

  const candidates = [
    ...(info.requested_formats || []),
    ...(info.formats || []),
  ].filter((f) => f?.url && f.acodec !== 'none' && f.acodec !== 'none');

  candidates.sort((a, b) => (b.abr || 0) - (a.abr || 0));
  if (candidates[0]?.url) return candidates[0].url;
  throw new Error('Nenhum formato de áudio no JSON');
}

async function resolveWithInvidious(videoId) {
  const listRes = await fetch('https://api.invidious.io/instances.json?sort_by=health');
  const instances = await listRes.json();

  for (const [host, meta] of instances.slice(0, 8)) {
    const base = meta?.uri || `https://${host}`;
    try {
      const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpotMusic/1.0)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const audio = (data.adaptiveFormats || [])
        .filter((f) => f.type?.includes('audio') && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (audio?.url) return audio.url;
    } catch {
      continue;
    }
  }
  throw new Error('Invidious indisponível');
}

export async function getStreamUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached.url;

  if (inflight.has(videoId)) return inflight.get(videoId);

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const promise = (async () => {
    let streamUrl;
    try {
      streamUrl = await resolveWithGetUrl(videoUrl);
    } catch {
      try {
        streamUrl = await resolveWithJson(videoUrl);
      } catch {
        streamUrl = await resolveWithInvidious(videoId);
      }
    }
    urlCache.set(videoId, { url: streamUrl, expires: Date.now() + URL_TTL_MS });
    return streamUrl;
  })()
    .finally(() => inflight.delete(videoId));

  inflight.set(videoId, promise);
  return promise;
}

export async function prepareStream(videoId) {
  const url = await getStreamUrl(videoId);
  return { ready: true, cached: urlCache.has(videoId) };
}

export async function getPlaylistItems(playlistId) {
  const data = await ytdlp(`https://www.youtube.com/playlist?list=${playlistId}`, {
    ...baseYtdlpOpts(),
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

/** Redireciona para CDN do YouTube — rápido no mobile */
export async function streamRedirect(videoId, res) {
  const streamUrl = await getStreamUrl(videoId);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.redirect(302, streamUrl);
}

/** Proxy com range — usado só para download */
export async function proxyStream(videoId, req, res) {
  const streamUrl = await getStreamUrl(videoId);
  const headers = { 'User-Agent': 'Mozilla/5.0' };
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
  res.setHeader('Access-Control-Allow-Origin', '*');

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

export const MAX_DOWNLOAD_SECONDS = 20 * 60;
