import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  searchYouTube,
  getTrendingYouTube,
  getPlaylistItems,
  proxyStream,
  prepareStream,
} from './youtube.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'dist');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', source: 'youtube' });
});

app.get('/api/search', async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const filter = String(req.query.filter || 'all');
    if (!query) {
      return res.status(400).json({ error: 'Query obrigatória' });
    }

    const results = await searchYouTube(query, filter);
    res.json({ data: results });
  } catch (err) {
    res.status(500).json({ error: 'Erro na busca', message: String(err) });
  }
});

app.get('/api/trending', async (_req, res) => {
  try {
    const results = await getTrendingYouTube();
    res.json({ data: results });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar trending', message: String(err) });
  }
});

app.get('/api/youtube/playlist/:id', async (req, res) => {
  try {
    const items = await getPlaylistItems(req.params.id);
    res.json({ data: items });
  } catch (err) {
    res.status(500).json({ error: 'Erro na playlist', message: String(err) });
  }
});

app.get('/api/youtube/prepare/:id', async (req, res) => {
  try {
    const result = await prepareStream(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao preparar stream', message: String(err) });
  }
});

app.get('/api/youtube/stream/:id', async (req, res) => {
  try {
    await proxyStream(req.params.id, req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro no stream', message: String(err) });
    }
  }
});

// Compat: rota antiga redireciona para YouTube
app.get('/api/stream/:id', async (req, res) => {
  try {
    await proxyStream(req.params.id, req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro no stream', message: String(err) });
    }
  }
});

if (existsSync(distPath)) {
  app.use(express.static(distPath, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Spot Music rodando na porta ${PORT}${isProd ? ' (produção)' : ''}`);
});
