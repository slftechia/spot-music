import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const APP_NAME = 'SpotMusic';
const API_BASE = 'https://api.audius.co/v1';
const URL_TTL_MS = 55 * 60 * 1000;

const urlCache = new Map();
const inflight = new Map();
const trackCache = new Map();

export const MAX_DOWNLOAD_SECONDS = 3 * 60 * 60;

const HOME_GENRES = [
  { id: 'electronic', title: 'Electronic', query: 'electronic' },
  { id: 'hip-hop', title: 'Hip-Hop', query: 'hip hop' },
  { id: 'pop', title: 'Pop', query: 'pop' },
  { id: 'rock', title: 'Rock', query: 'rock' },
  { id: 'latin', title: 'Latin / Brasil', query: 'brazil' },
  { id: 'rnb', title: 'R&B', query: 'rnb' },
];

function formatDuration(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function bestArtwork(track) {
  const art = track?.artwork;
  return art?.['480x480'] || art?.['1000x1000'] || art?.['150x150'] || '';
}

function mapTrack(track) {
  if (!track?.id || !track.is_streamable) return null;
  const duration = Number(track.duration) || 0;
  return {
    id: String(track.id),
    title: track.title || 'Sem título',
    artist: track.user?.name || track.user?.handle || 'Audius',
    artwork: bestArtwork(track),
    duration,
    durationText: formatDuration(duration),
    type: duration >= 1200 ? 'compilation' : 'track',
    source: 'audius',
    viewCount: track.play_count ? `${Number(track.play_count).toLocaleString('pt-BR')} plays` : '',
    description: (track.description || '').slice(0, 200),
    downloadable: !!track.is_downloadable || !!track.access?.download,
  };
}

async function audiusFetch(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('app_name', APP_NAME);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Audius HTTP ${res.status}`);
  return res.json();
}

export async function searchAudius(query, filter = 'all') {
  const data = await audiusFetch('/tracks/search', { query, limit: 40 });
  let items = (data.data || []).map(mapTrack).filter(Boolean);

  if (filter === 'compilations') {
    items = items.filter((i) => i.type === 'compilation' || i.duration >= 600);
  } else if (filter === 'videos' || filter === 'tracks') {
    items = items.filter((i) => i.type === 'track');
  }
  // playlists/albums: Audius search de tracks; retorna tracks mesmo assim

  return items;
}

export async function getTrendingAudius() {
  const sections = await Promise.all(
    HOME_GENRES.map(async (genre) => {
      try {
        const data = await audiusFetch('/tracks/search', {
          query: genre.query,
          limit: 12,
        });
        const items = (data.data || []).map(mapTrack).filter(Boolean).slice(0, 8);
        return { id: genre.id, title: genre.title, items };
      } catch {
        return { id: genre.id, title: genre.title, items: [] };
      }
    })
  );
  return sections.filter((s) => s.items.length > 0);
}

export async function getAudiusSuggestions(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  try {
    const data = await audiusFetch('/tracks/search', { query: q, limit: 8 });
    const titles = (data.data || [])
      .map((t) => t.title)
      .filter(Boolean)
      .slice(0, 8);
    return [...new Set(titles)];
  } catch {
    return [];
  }
}

export async function getTrack(id) {
  const cached = trackCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.track;

  const data = await audiusFetch(`/tracks/${id}`);
  const track = data.data;
  if (!track) throw new Error('Faixa não encontrada');
  trackCache.set(id, { track, expires: Date.now() + URL_TTL_MS });
  return track;
}

export async function getStreamUrl(trackId) {
  const cached = urlCache.get(trackId);
  if (cached && cached.expires > Date.now()) return cached.url;
  if (inflight.has(trackId)) return inflight.get(trackId);

  const promise = (async () => {
    // Preferir URL assinada do objeto track (já vem no search/trending)
    try {
      const track = await getTrack(trackId);
      const direct = track.stream?.url;
      if (direct?.startsWith('http')) {
        urlCache.set(trackId, { url: direct, expires: Date.now() + URL_TTL_MS });
        return direct;
      }
    } catch {
      /* fallback abaixo */
    }

    // Endpoint oficial de stream (redirect para CDN)
    const url = `${API_BASE}/tracks/${trackId}/stream?app_name=${encodeURIComponent(APP_NAME)}`;
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    const location = res.headers.get('location');
    if (location?.startsWith('http')) {
      urlCache.set(trackId, { url: location, expires: Date.now() + URL_TTL_MS });
      return location;
    }
    if (res.ok) {
      urlCache.set(trackId, { url, expires: Date.now() + URL_TTL_MS });
      return url;
    }
    throw new Error('Stream Audius indisponível');
  })().finally(() => inflight.delete(trackId));

  inflight.set(trackId, promise);
  return promise;
}

export async function prepareStream(trackId) {
  const url = await getStreamUrl(trackId);
  return { ready: true, cached: urlCache.has(trackId), url: !!url };
}

export async function getPlaylistItems(playlistId) {
  const data = await audiusFetch(`/playlists/${playlistId}/tracks`, { limit: 50 });
  return (data.data || []).map(mapTrack).filter(Boolean);
}

/** Redirect rápido para CDN Audius */
export async function streamRedirect(trackId, res) {
  const streamUrl = await getStreamUrl(trackId);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.redirect(302, streamUrl);
}

/** Proxy com Range — ideal para <audio> + Media Session + download offline */
export async function proxyStream(trackId, req, res) {
  const streamUrl = await getStreamUrl(trackId);
  const headers = {
    'User-Agent': 'SpotMusic/1.0',
    Accept: '*/*',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const response = await fetch(streamUrl, {
    headers,
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok && response.status !== 206) {
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
  if (!res.getHeader('content-type')) {
    res.setHeader('Content-Type', 'audio/mpeg');
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
      console.error('Audius stream error:', err.message);
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro no stream' });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}
