# Spot Music

App de streaming de músicas estilo Spotify. Busque, ouça online e baixe faixas para reprodução offline.

## Funcionalidades

- Busca de músicas por nome ou artista
- Player com controles de play/pause, seek e volume
- Download para biblioteca offline (IndexedDB)
- PWA instalável no celular/desktop
- Modo offline automático para músicas baixadas
- UI inspirada no Spotify

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React + Vite + Tailwind + PWA |
| API | Node.js + Express (proxy Audius) |
| Offline | IndexedDB |
| Hosting frontend | Firebase Hosting |
| Hosting API | Render (plano free) |

As músicas vêm da [Audius](https://audius.co) — plataforma descentralizada com catálogo gratuito e legal.

## Desenvolvimento local

```bash
npm install
node scripts/generate-icons.mjs
npm run dev:all
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## Deploy

### 1. API no Render

1. Crie conta em [render.com](https://render.com)
2. New → Blueprint → conecte este repositório (usa `render.yaml`)
3. Ou crie um **Web Service** manual:
   - Build: `npm install`
   - Start: `node server/index.js`
4. Anote a URL: `https://spot-music-api.onrender.com`

### 2. Frontend no Firebase

1. Instale Firebase CLI: `npm i -g firebase-tools`
2. `firebase login`
3. `firebase projects:create spot-music-SEU-NOME` (ou use projeto existente)
4. Edite `.firebaserc` com o project ID
5. Crie `.env.production`:

```
VITE_API_URL=https://spot-music-api.onrender.com/api
```

6. Build e deploy:

```bash
npm run build
firebase deploy --only hosting
```

Seu app ficará em `https://SEU-PROJECT-ID.web.app`

### 3. CORS

A API já aceita requisições de qualquer origem. Em produção, você pode restringir no `server/index.js`.

## Uso offline

1. Com internet, busque uma música
2. Passe o mouse e clique no ícone de download
3. A faixa aparece em **Biblioteca**
4. Sem internet, abra a Biblioteca e toque normalmente

## Estrutura

```
spot-music/
├── src/           # React app
├── server/        # API Express
├── public/        # Assets estáticos
├── firebase.json  # Config Firebase Hosting
└── render.yaml    # Config Render
```

## Licença

Projeto pessoal/educacional. Músicas fornecidas via API Audius sob seus termos de uso.
