export const YT_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export function buildEmbedUrl(videoId: string, autoplay = true) {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    playsinline: '1',
    controls: '0',
    modestbranding: '1',
    rel: '0',
    enablejsapi: '1',
    origin: window.location.origin,
  });
  return `https://www.youtube.com/embed/${videoId}?${params}`;
}

export function sendEmbedCommand(
  iframe: HTMLIFrameElement,
  func: string,
  args: unknown[] = []
) {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func, args }),
    '*'
  );
}

export function startEmbedListening(iframe: HTMLIFrameElement) {
  iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
}

export type EmbedMessage = {
  event?: string;
  info?: {
    playerState?: number;
    currentTime?: number;
    duration?: number;
  };
};

export function parseEmbedMessage(data: unknown): EmbedMessage | null {
  if (typeof data !== 'string') return null;
  try {
    return JSON.parse(data) as EmbedMessage;
  } catch {
    return null;
  }
}
