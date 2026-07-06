FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    curl \
    && pip3 install --break-system-packages -U yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
COPY scripts/generate-icons.mjs scripts/generate-icons.mjs
COPY public/icon.svg public/icon.svg
COPY public/favicon.svg public/favicon.svg
RUN npm install --include=dev

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=10000
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

EXPOSE 10000

CMD ["node", "server/index.js"]
