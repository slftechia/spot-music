import type { MediaItem } from '../types';

type PipControls = {
  onToggle: () => void;
};

let pipWindow: Window | null = null;
let pipToggleHandler: (() => void) | null = null;

function hasDocumentPip(): boolean {
  return 'documentPictureInPicture' in window;
}

function closePip() {
  if (pipWindow && !pipWindow.closed) {
    pipWindow.close();
  }
  pipWindow = null;
  pipToggleHandler = null;
}

function renderPipContent(win: Window, track: MediaItem, playing: boolean) {
  const doc = win.document;
  doc.body.innerHTML = '';
  const style = doc.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif;
      background: #121212;
      color: #fff;
      height: 100vh;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
    }
    img {
      width: 56px;
      height: 56px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
      background: #282828;
    }
    .meta { flex: 1; min-width: 0; }
    .title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .artist { font-size: 11px; color: #b3b3b3; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  button {
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 50%;
      background: #1db954;
      color: #000;
      font-size: 18px;
      font-weight: 700;
      flex-shrink: 0;
      cursor: pointer;
    }
  `;
  doc.head.appendChild(style);

  const wrap = doc.createElement('div');
  wrap.style.display = 'contents';

  if (track.artwork) {
    const img = doc.createElement('img');
    img.src = track.artwork;
    img.alt = '';
    wrap.appendChild(img);
  }

  const meta = doc.createElement('div');
  meta.className = 'meta';
  const title = doc.createElement('div');
  title.className = 'title';
  title.textContent = track.title;
  const artist = doc.createElement('div');
  artist.className = 'artist';
  artist.textContent = track.artist || 'Spot Music';
  meta.appendChild(title);
  meta.appendChild(artist);
  wrap.appendChild(meta);

  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = playing ? '❚❚' : '▶';
  btn.addEventListener('click', () => pipToggleHandler?.());
  wrap.appendChild(btn);

  doc.body.appendChild(wrap);
}

export function updateMiniPlayerPip(playing: boolean) {
  if (!pipWindow || pipWindow.closed) return;
  const btn = pipWindow.document.querySelector('button');
  if (btn) btn.textContent = playing ? '❚❚' : '▶';
}

export async function openMiniPlayerPip(track: MediaItem, playing: boolean, controls: PipControls) {
  if (!hasDocumentPip()) return false;
  if (pipWindow && !pipWindow.closed) {
    renderPipContent(pipWindow, track, playing);
    return true;
  }

  try {
    const api = (
      window as Window & {
        documentPictureInPicture?: {
          requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>;
        };
      }
    ).documentPictureInPicture;

    if (!api) return false;

    pipWindow = await api.requestWindow({ width: 360, height: 90 });
    pipToggleHandler = controls.onToggle;
    renderPipContent(pipWindow, track, playing);
    pipWindow.addEventListener('pagehide', closePip);
    return true;
  } catch {
    closePip();
    return false;
  }
}

export function closeMiniPlayerPip() {
  closePip();
}

export function isMiniPlayerPipSupported() {
  return hasDocumentPip();
}
