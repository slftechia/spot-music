import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../types';
import { needsPlaylistOpen } from '../services/api';
import { getDownloadedTrack } from '../services/offlineStorage';
import { isMobileDevice } from '../utils/device';
import {
  buildEmbedUrl,
  parseEmbedMessage,
  sendEmbedCommand,
  startEmbedListening,
  YT_STATE,
} from '../utils/youtubeEmbed';

type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          height?: string | number;
          width?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
            onError?: (e: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; BUFFERING: number; ENDED: number; CUED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const MOBILE = isMobileDevice();
const BUFFERING_TIMEOUT_MS = 12000;

let ytApiPromise: Promise<void> | null = null;

export function loadYouTubeAPI() {
  if (MOBILE) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

function mountMobileEmbed(videoId: string): HTMLIFrameElement | null {
  const host = document.getElementById('yt-embed-host');
  if (!host) return null;

  host.replaceChildren();
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.title = 'YouTube player';
  iframe.className = 'absolute inset-0 w-full h-full border-0';
  iframe.src = buildEmbedUrl(videoId, true);
  host.appendChild(iframe);
  return iframe;
}

export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const embedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytReady = useRef(false);
  const modeRef = useRef<'youtube' | 'youtube-embed' | 'audio'>('youtube');
  const tickRef = useRef<number | null>(null);
  const volumeRef = useRef(80);
  const progressLockUntil = useRef(0);
  const embedPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [currentTrack, setCurrentTrack] = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);

  const stopEmbedPoll = useCallback(() => {
    if (embedPollRef.current) {
      clearInterval(embedPollRef.current);
      embedPollRef.current = null;
    }
  }, []);

  const startEmbedPoll = useCallback(() => {
    stopEmbedPoll();
    embedPollRef.current = setInterval(() => {
      if (modeRef.current !== 'youtube-embed' || !embedIframeRef.current) return;
      if (Date.now() < progressLockUntil.current) return;
      sendEmbedCommand(embedIframeRef.current, 'getCurrentTime');
      sendEmbedCommand(embedIframeRef.current, 'getDuration');
    }, 1000);
  }, [stopEmbedPoll]);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startDesktopTick = useCallback(() => {
    stopTick();
    const loop = () => {
      if (modeRef.current === 'youtube' && ytRef.current) {
        const t = ytRef.current.getCurrentTime();
        const d = ytRef.current.getDuration();
        if (isFinite(t) && Date.now() > progressLockUntil.current) setProgress(t);
        if (isFinite(d) && d > 0) setDuration(d);
      }
      tickRef.current = requestAnimationFrame(loop);
    };
    tickRef.current = requestAnimationFrame(loop);
  }, [stopTick]);

  const handleEmbedState = useCallback(
    (state: number) => {
      if (modeRef.current !== 'youtube-embed') return;

      if (state === YT_STATE.PLAYING) {
        setIsPlaying(true);
        setIsBuffering(false);
        setError(null);
        startEmbedPoll();
      } else if (state === YT_STATE.PAUSED) {
        setIsPlaying(false);
        setIsBuffering(false);
        stopEmbedPoll();
      } else if (state === YT_STATE.BUFFERING) {
        setIsBuffering(true);
      } else if (state === YT_STATE.ENDED) {
        setIsPlaying(false);
        setIsBuffering(false);
        stopEmbedPoll();
      } else if (state === YT_STATE.CUED) {
        setIsBuffering(false);
      }
    },
    [startEmbedPoll, stopEmbedPoll]
  );

  const handleEmbedMessage = useCallback(
    (event: MessageEvent) => {
      if (event.origin !== 'https://www.youtube.com') return;
      const data = parseEmbedMessage(event.data);
      if (!data?.info) return;

      if (data.info.playerState !== undefined) {
        handleEmbedState(data.info.playerState);
      }
      if (typeof data.info.currentTime === 'number' && isFinite(data.info.currentTime)) {
        if (Date.now() > progressLockUntil.current) {
          setProgress(data.info.currentTime);
        }
      }
      if (typeof data.info.duration === 'number' && data.info.duration > 0) {
        setDuration(data.info.duration);
      }
    },
    [handleEmbedState]
  );

  useEffect(() => {
    window.addEventListener('message', handleEmbedMessage);
    return () => window.removeEventListener('message', handleEmbedMessage);
  }, [handleEmbedMessage]);

  useEffect(() => {
    const audio = new Audio();
    audio.setAttribute('playsinline', 'true');
    audio.preload = 'auto';
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (modeRef.current === 'audio') setProgress(audio.currentTime);
    };
    const onDurationChange = () => {
      if (modeRef.current === 'audio' && audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      stopTick();
    };
    const onPlay = () => {
      if (modeRef.current === 'audio') {
        setIsPlaying(true);
        setIsBuffering(false);
      }
    };
    const onPause = () => {
      if (modeRef.current === 'audio') setIsPlaying(false);
    };
    const onWaiting = () => {
      if (modeRef.current === 'audio') setIsBuffering(true);
    };
    const onCanPlay = () => {
      if (modeRef.current === 'audio') setIsBuffering(false);
    };
    const onError = () => {
      if (modeRef.current === 'audio') {
        setIsBuffering(false);
        setIsPlaying(false);
        setError('Erro ao reproduzir offline.');
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('error', onError);

    if (!MOBILE) {
      loadYouTubeAPI().then(() => {
        const host = document.getElementById('yt-player-host');
        if (!host || ytRef.current) return;

        ytRef.current = new window.YT!.Player(host, {
          height: 200,
          width: 300,
          playerVars: {
            playsinline: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            origin: window.location.origin,
            enablejsapi: 1,
          },
          events: {
            onReady: () => {
              ytReady.current = true;
              ytRef.current?.setVolume(volumeRef.current);
            },
            onStateChange: (e) => {
              if (modeRef.current !== 'youtube') return;
              const PS = window.YT!.PlayerState;
              if (e.data === PS.PLAYING) {
                setIsPlaying(true);
                setIsBuffering(false);
                setError(null);
                startDesktopTick();
              } else if (e.data === PS.PAUSED) {
                setIsPlaying(false);
                stopTick();
              } else if (e.data === PS.BUFFERING) {
                setIsBuffering(true);
              } else if (e.data === PS.ENDED) {
                setIsPlaying(false);
                setIsBuffering(false);
                stopTick();
              } else if (e.data === PS.CUED) {
                setIsBuffering(false);
              }
            },
            onError: () => {
              if (modeRef.current === 'youtube') {
                setError('Vídeo indisponível. Tente outra música.');
                setIsBuffering(false);
                setIsPlaying(false);
              }
            },
          },
        });
      });
    }

    return () => {
      stopTick();
      stopEmbedPoll();
      audio.pause();
      audio.src = '';
      ytRef.current?.destroy();
      ytRef.current = null;
      ytReady.current = false;
    };
  }, [startDesktopTick, stopTick, stopEmbedPoll]);

  useEffect(() => {
    volumeRef.current = volume;
    if (modeRef.current === 'youtube') {
      ytRef.current?.setVolume(volume);
    } else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
      sendEmbedCommand(embedIframeRef.current, 'setVolume', [volume]);
    } else if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  useEffect(() => {
    if (!isBuffering || isPlaying) return;
    const timer = setTimeout(() => {
      setIsBuffering(false);
      setError('Não iniciou. Toque play de novo ou abra no YouTube.');
    }, BUFFERING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isBuffering, isPlaying, currentTrack?.id]);

  const playDesktopYoutube = useCallback((videoId: string) => {
    if (!ytRef.current || !ytReady.current) {
      setError('Player carregando. Toque de novo.');
      setIsBuffering(false);
      return;
    }
    ytRef.current.loadVideoById(videoId);
    ytRef.current.playVideo();
  }, []);

  const playMobileYoutube = useCallback((videoId: string) => {
    const iframe = mountMobileEmbed(videoId);
    if (!iframe) {
      setError('Erro ao iniciar player.');
      setIsBuffering(false);
      return;
    }

    embedIframeRef.current = iframe;
    iframe.addEventListener('load', () => {
      startEmbedListening(iframe);
      sendEmbedCommand(iframe, 'setVolume', [volumeRef.current]);
      sendEmbedCommand(iframe, 'playVideo');
      setIsBuffering(false);
      setIsPlaying(true);
      startEmbedPoll();
    });
  }, [startEmbedPoll]);

  const play = useCallback(
    (item: MediaItem, offline = false) => {
      if (needsPlaylistOpen(item)) return;

      if (currentTrack?.id === item.id) {
        if (isPlaying) {
          if (modeRef.current === 'youtube') ytRef.current?.pauseVideo();
          else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
            sendEmbedCommand(embedIframeRef.current, 'pauseVideo');
          } else audioRef.current?.pause();
        } else if (modeRef.current === 'youtube') {
          ytRef.current?.playVideo();
          setIsBuffering(true);
          setError(null);
        } else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
          sendEmbedCommand(embedIframeRef.current, 'playVideo');
          setIsPlaying(true);
          setError(null);
        } else {
          audioRef.current?.play();
        }
        return;
      }

      setCurrentTrack(item);
      setProgress(0);
      setDuration(item.duration || 0);
      setIsBuffering(true);
      setIsPlaying(false);
      setError(null);

      if (offline) {
        modeRef.current = 'audio';
        ytRef.current?.pauseVideo();
        if (embedIframeRef.current) {
          embedIframeRef.current.remove();
          embedIframeRef.current = null;
        }
        void (async () => {
          try {
            const downloaded = await getDownloadedTrack(item.id);
            if (!downloaded?.blobUrl) throw new Error('offline');
            const audio = audioRef.current!;
            audio.src = downloaded.blobUrl;
            audio.load();
            await audio.play();
          } catch {
            setIsBuffering(false);
            setIsPlaying(false);
            setError('Faixa não encontrada offline.');
          }
        })();
        return;
      }

      audioRef.current?.pause();

      if (MOBILE) {
        modeRef.current = 'youtube-embed';
        playMobileYoutube(item.id);
        return;
      }

      modeRef.current = 'youtube';
      playDesktopYoutube(item.id);
    },
    [currentTrack, isPlaying, playDesktopYoutube, playMobileYoutube]
  );

  const pause = useCallback(() => {
    if (modeRef.current === 'youtube') ytRef.current?.pauseVideo();
    else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
      sendEmbedCommand(embedIframeRef.current, 'pauseVideo');
    } else audioRef.current?.pause();
  }, []);

  const lockProgress = useCallback((ms = 2500) => {
    progressLockUntil.current = Date.now() + ms;
  }, []);

  const seek = useCallback((time: number) => {
    lockProgress();
    setProgress(time);
    if (modeRef.current === 'youtube') ytRef.current?.seekTo(time, true);
    else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
      sendEmbedCommand(embedIframeRef.current, 'seekTo', [time, true]);
    } else if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, [lockProgress]);

  const seekStart = useCallback(() => {
    lockProgress(60000);
  }, [lockProgress]);

  const seekEnd = useCallback(() => {
    lockProgress(2500);
  }, [lockProgress]);

  const toggle = useCallback(() => {
    if (!currentTrack) return;
    if (isPlaying) {
      pause();
      return;
    }
    if (modeRef.current === 'youtube') {
      ytRef.current?.playVideo();
      setIsBuffering(true);
      setError(null);
    } else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
      sendEmbedCommand(embedIframeRef.current, 'playVideo');
      setIsPlaying(true);
      setError(null);
    } else {
      audioRef.current?.play();
    }
  }, [currentTrack, isPlaying, pause]);

  const setVolumeLevel = useCallback((v: number) => {
    setVolume(Math.round(v * 100));
  }, []);

  const openInYoutube = useCallback(() => {
    if (!currentTrack) return;
    window.open(`https://www.youtube.com/watch?v=${currentTrack.id}`, '_blank', 'noopener');
  }, [currentTrack]);

  return {
    currentTrack,
    isPlaying,
    isBuffering,
    error,
    progress,
    duration,
    volume: volume / 100,
    isMobile: MOBILE,
    setVolume: setVolumeLevel,
    play,
    pause,
    seek,
    seekStart,
    seekEnd,
    toggle,
    openInYoutube,
  };
}

export function formatTime(seconds: number, withHours = false) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0 || withHours) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
