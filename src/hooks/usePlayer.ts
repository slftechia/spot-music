import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../types';
import { getOnlineAudioSources, needsPlaylistOpen, warmStreamCache } from '../services/api';
import {
  abortProgressivePlayback,
  bufferOnlineAudio,
  playProgressiveOnlineAudio,
  revokeOnlineBlob,
} from '../services/streamBuffer';
import { getDownloadedTrack } from '../services/offlineStorage';
import { isMobileDevice } from '../utils/device';
import {
  closeMiniPlayerPip,
  openMiniPlayerPip,
  updateMiniPlayerPip,
} from '../utils/miniPlayerPip';
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

function applyMediaSession(track: MediaItem, playing: boolean) {
  if (!('mediaSession' in navigator)) return;
  const artwork = track.artwork
    ? [
        { src: track.artwork, sizes: '96x96', type: 'image/jpeg' },
        { src: track.artwork, sizes: '256x256', type: 'image/jpeg' },
        { src: track.artwork, sizes: '512x512', type: 'image/jpeg' },
      ]
    : [];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist || 'Spot Music',
    album: 'Spot Music',
    artwork,
  });
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

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
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
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
  const [backHint, setBackHint] = useState(false);

  const currentTrackRef = useRef<MediaItem | null>(null);
  const isPlayingRef = useRef(false);
  const progressRef = useRef(0);
  const durationRef = useRef(0);
  const wantPlayingRef = useRef(false);
  const userPausedRef = useRef(false);
  const offlineModeRef = useRef(false);
  const bgResumeBusy = useRef(false);
  const bgKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionSyncRef = useRef(0);
  const toggleRef = useRef<() => void>(() => {});
  const seekRef = useRef<(t: number) => void>(() => {});
  const resumeAudioRef = useRef<() => void>(() => {});
  const migrateEmbedRef = useRef<() => void>(() => {});
  const playMobileAudioStreamRef = useRef<(item: MediaItem, startAt?: number) => Promise<void>>(
    async () => {}
  );
  const onlineBlobAbortRef = useRef<AbortController | null>(null);
  const memoryBlobRef = useRef(false);
  const backHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canBackGuard = useCallback(() => {
    return (
      wantPlayingRef.current &&
      (modeRef.current === 'audio' || modeRef.current === 'youtube-embed')
    );
  }, []);

  const ensureBackTrap = useCallback(() => {
    if (!MOBILE || !canBackGuard()) return;
    if (window.history.state?.spotMusicBg) return;
    window.history.pushState({ spotMusicBg: true }, '');
  }, [canBackGuard]);

  const showBackHint = useCallback(() => {
    setBackHint(true);
    if (backHintTimerRef.current) clearTimeout(backHintTimerRef.current);
    backHintTimerRef.current = setTimeout(() => setBackHint(false), 5000);
  }, []);

  currentTrackRef.current = currentTrack;
  isPlayingRef.current = isPlaying;
  progressRef.current = progress;
  durationRef.current = duration;

  const syncMediaSessionPlaying = useCallback(() => {
    if (!('mediaSession' in navigator)) return;
    if (wantPlayingRef.current && !userPausedRef.current) {
      navigator.mediaSession.playbackState = 'playing';
    }
  }, []);

  const resumeAudioIfNeeded = useCallback(() => {
    if (!wantPlayingRef.current || userPausedRef.current) return;
    if (modeRef.current !== 'audio') return;
    const audio = audioRef.current;
    if (!audio?.src) return;

    syncMediaSessionPlaying();
    if (!audio.paused) return;

    const attempt = () => {
      if (!wantPlayingRef.current || userPausedRef.current) return;
      if (modeRef.current !== 'audio' || !audioRef.current?.src) return;
      if (!audioRef.current.paused) return;
      void audioRef.current.play().catch(() => {});
    };

    attempt();
    setTimeout(attempt, 50);
    setTimeout(attempt, 200);
    setTimeout(attempt, 600);
    setTimeout(attempt, 1500);
  }, [syncMediaSessionPlaying]);

  const stopBgKeepAlive = useCallback(() => {
    if (bgKeepAliveRef.current) {
      clearInterval(bgKeepAliveRef.current);
      bgKeepAliveRef.current = null;
    }
  }, []);

  const startBgKeepAlive = useCallback(() => {
    if (bgKeepAliveRef.current) return;
    bgKeepAliveRef.current = setInterval(() => {
      if (!wantPlayingRef.current || userPausedRef.current) {
        stopBgKeepAlive();
        return;
      }
      syncMediaSessionPlaying();
      resumeAudioIfNeeded();
    }, 2000);
  }, [resumeAudioIfNeeded, stopBgKeepAlive, syncMediaSessionPlaying]);

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

  const migrateEmbedToAudio = useCallback(() => {
    if (!MOBILE || bgResumeBusy.current) return;
    if (!wantPlayingRef.current || userPausedRef.current) return;
    const track = currentTrackRef.current;
    if (!track) return;
    if (modeRef.current !== 'youtube-embed' && modeRef.current !== 'youtube') return;

    bgResumeBusy.current = true;
    const startAt = progressRef.current || 0;
    if (embedIframeRef.current) {
      sendEmbedCommand(embedIframeRef.current, 'pauseVideo');
    }
    void (async () => {
      try {
        const downloaded = await getDownloadedTrack(track.id);
        if (downloaded?.blobUrl) {
          modeRef.current = 'audio';
          offlineModeRef.current = true;
          if (embedIframeRef.current) {
            embedIframeRef.current.remove();
            embedIframeRef.current = null;
          }
          stopEmbedPoll();
          const audio = audioRef.current!;
          audio.src = downloaded.blobUrl;
          audio.load();
          if (startAt > 0) {
            try {
              audio.currentTime = startAt;
            } catch {
              /* ignore */
            }
          }
          await audio.play();
          setIsPlaying(true);
          return;
        }
        await playMobileAudioStreamRef.current(track, startAt);
      } finally {
        bgResumeBusy.current = false;
      }
    })();
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
        // Sistema pausa o embed ao ir pra home — migrar para áudio nativo
        if (wantPlayingRef.current && !userPausedRef.current) {
          migrateEmbedRef.current();
          return;
        }
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
    // Preferir o <audio> do DOM (continua no Android como o YouTube Music)
    // Fallback: criar elemento se faltar (HMR / testes)
    let audio = document.getElementById('spot-audio-player') as HTMLAudioElement | null;
    let created = false;
    if (!audio) {
      audio = new Audio();
      audio.id = 'spot-audio-player';
      created = true;
    }
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    audio.preload = 'auto';
    (audio as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false;
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (modeRef.current === 'audio') setProgress(audio!.currentTime);
    };
    const onDurationChange = () => {
      if (modeRef.current === 'audio' && audio!.duration && isFinite(audio!.duration)) {
        setDuration(audio!.duration);
      }
    };
    const onEnded = () => {
      wantPlayingRef.current = false;
      userPausedRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      stopTick();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
    };
    const onPlay = () => {
      if (modeRef.current === 'audio') {
        userPausedRef.current = false;
        wantPlayingRef.current = true;
        setIsPlaying(true);
        setIsBuffering(false);
        setError(null);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
    };
    const onPause = () => {
      if (modeRef.current !== 'audio') return;
      if (userPausedRef.current) {
        setIsPlaying(false);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
        return;
      }
      // Chrome/Android pausa ao Home, recentes ou Voltar — retomar se o usuário não pausou
      if (wantPlayingRef.current) {
        resumeAudioRef.current();
        return;
      }
      setIsPlaying(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    };
    const onWaiting = () => {
      if (modeRef.current === 'audio') setIsBuffering(true);
    };
    const onCanPlay = () => {
      if (modeRef.current === 'audio') setIsBuffering(false);
    };
    const onError = () => {
      if (modeRef.current !== 'audio') return;
      if (wantPlayingRef.current && (offlineModeRef.current || memoryBlobRef.current)) {
        setIsBuffering(false);
        setIsPlaying(false);
        setError('Erro ao reproduzir.');
        wantPlayingRef.current = false;
        return;
      }
      if (wantPlayingRef.current) {
        setIsBuffering(false);
        return;
      }
      setIsBuffering(false);
      setIsPlaying(false);
      setError('Erro ao reproduzir.');
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
      audio!.removeEventListener('timeupdate', onTimeUpdate);
      audio!.removeEventListener('durationchange', onDurationChange);
      audio!.removeEventListener('ended', onEnded);
      audio!.removeEventListener('play', onPlay);
      audio!.removeEventListener('pause', onPause);
      audio!.removeEventListener('waiting', onWaiting);
      audio!.removeEventListener('canplay', onCanPlay);
      audio!.removeEventListener('error', onError);
      // Não pause/destroy o áudio no cleanup se ainda queremos tocar
      // (StrictMode/HMR). Só limpa se criamos o elemento.
      if (created) {
        audio!.pause();
        audio!.src = '';
      }
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

  const playAudioStream = useCallback(async (item: MediaItem, startAt = 0) => {
    modeRef.current = 'audio';
    offlineModeRef.current = false;
    userPausedRef.current = false;
    wantPlayingRef.current = true;
    ytRef.current?.pauseVideo();
    if (embedIframeRef.current) {
      embedIframeRef.current.remove();
      embedIframeRef.current = null;
    }
    stopEmbedPoll();

    const audio = audioRef.current!;
    const fallbackToYoutube = () => {
      if (MOBILE) {
        modeRef.current = 'youtube-embed';
        setError(null);
        setIsBuffering(true);
        playMobileYoutube(item.id);
        return;
      }
      modeRef.current = 'youtube';
      setError(null);
      setIsBuffering(true);
      playDesktopYoutube(item.id);
    };

    try {
      setError(null);
      setIsBuffering(true);
      setIsPlaying(false);

      await warmStreamCache(item);
      applyMediaSession(item, true);

      // Mobile: toca enquanto carrega (MSE) — estável no Home quando bufferizado
      if (MOBILE) {
        onlineBlobAbortRef.current?.abort();
        abortProgressivePlayback(item.id);
        const ac = new AbortController();
        onlineBlobAbortRef.current = ac;

        try {
          modeRef.current = 'audio';
          memoryBlobRef.current = true;
          offlineModeRef.current = false;

          await playProgressiveOnlineAudio(item, audio, {
            signal: ac.signal,
            startAt,
          });

          if (!wantPlayingRef.current || ac.signal.aborted) return;

          navigator.mediaSession.playbackState = 'playing';
          setIsBuffering(false);
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          memoryBlobRef.current = false;

          // MSE indisponível: espera buffer completo
          try {
            const blobUrl = await bufferOnlineAudio(item, { signal: ac.signal });
            if (!wantPlayingRef.current || ac.signal.aborted) return;

            modeRef.current = 'audio';
            memoryBlobRef.current = true;
            audio.src = blobUrl;
            audio.load();
            if (startAt > 0) {
              try {
                audio.currentTime = startAt;
              } catch {
                /* ignore */
              }
              setProgress(startAt);
            }
            await audio.play();
            navigator.mediaSession.playbackState = 'playing';
            setIsBuffering(false);
            return;
          } catch {
            memoryBlobRef.current = false;
          }
        }
      }

      memoryBlobRef.current = false;

      // Desktop (ou fallback mobile): stream HTTP
      const sources = getOnlineAudioSources(item);
      let lastErr: unknown;

      for (const src of sources) {
        try {
          modeRef.current = 'audio';
          audio.src = src;
          audio.load();
          if (startAt > 0) {
            try {
              audio.currentTime = startAt;
            } catch {
              /* ignore */
            }
            setProgress(startAt);
          }

          await audio.play();
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
          return;
        } catch (err) {
          lastErr = err;
          audio.removeAttribute('src');
          audio.load();
        }
      }

      throw lastErr || new Error('audio-load');
    } catch {
      fallbackToYoutube();
    }
  }, [playDesktopYoutube, playMobileYoutube, stopEmbedPoll]);

  playMobileAudioStreamRef.current = playAudioStream;

  const play = useCallback(
    (item: MediaItem, offline = false) => {
      if (needsPlaylistOpen(item)) return;

      if (currentTrack && currentTrack.id !== item.id) {
        onlineBlobAbortRef.current?.abort();
        abortProgressivePlayback(currentTrack.id);
        revokeOnlineBlob(currentTrack.id);
      }

      if (currentTrack?.id === item.id) {
        if (isPlaying) {
          userPausedRef.current = true;
          wantPlayingRef.current = false;
          if (modeRef.current === 'youtube') ytRef.current?.pauseVideo();
          else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
            sendEmbedCommand(embedIframeRef.current, 'pauseVideo');
          } else audioRef.current?.pause();
        } else {
          userPausedRef.current = false;
          wantPlayingRef.current = true;
          if (modeRef.current === 'youtube') {
            ytRef.current?.playVideo();
            setIsBuffering(true);
            setError(null);
          } else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
            sendEmbedCommand(embedIframeRef.current, 'playVideo');
            setIsPlaying(true);
            setError(null);
          } else {
            void audioRef.current?.play();
          }
        }
        return;
      }

      setCurrentTrack(item);
      setProgress(0);
      setDuration(item.duration || 0);
      setIsBuffering(true);
      setIsPlaying(false);
      setError(null);
      userPausedRef.current = false;
      wantPlayingRef.current = true;
      offlineModeRef.current = offline;

      if (offline) {
        modeRef.current = 'audio';
        offlineModeRef.current = true;
        wantPlayingRef.current = true;
        ytRef.current?.pauseVideo();
        if (embedIframeRef.current) {
          embedIframeRef.current.remove();
          embedIframeRef.current = null;
        }
        stopEmbedPoll();
        void (async () => {
          try {
            const downloaded = await getDownloadedTrack(item.id);
            if (!downloaded?.blobUrl) throw new Error('offline');
            const audio = audioRef.current!;
            // Mesmo padrão do YouTube: HTMLAudio no DOM + Media Session
            if ('mediaSession' in navigator) {
              navigator.mediaSession.metadata = new MediaMetadata({
                title: item.title,
                artist: item.artist || 'Spot Music',
                album: 'Spot Music',
                artwork: item.artwork
                  ? [
                      { src: item.artwork, sizes: '96x96', type: 'image/jpeg' },
                      { src: item.artwork, sizes: '256x256', type: 'image/jpeg' },
                      { src: item.artwork, sizes: '512x512', type: 'image/jpeg' },
                    ]
                  : [],
              });
              navigator.mediaSession.playbackState = 'playing';
            }
            audio.src = downloaded.blobUrl;
            audio.load();
            await audio.play();
            setIsPlaying(true);
            setIsBuffering(false);
          } catch {
            wantPlayingRef.current = false;
            setIsBuffering(false);
            setIsPlaying(false);
            setError('Faixa não encontrada offline.');
          }
        })();
        return;
      }

      audioRef.current?.pause();

      // Áudio direto (CDN) — mais rápido que iframe YouTube; fallback embed/desktop
      void playAudioStream(item);
    },
    [currentTrack, isPlaying, playAudioStream, stopEmbedPoll]
  );

  const pause = useCallback(() => {
    userPausedRef.current = true;
    wantPlayingRef.current = false;
    stopBgKeepAlive();
    closeMiniPlayerPip();
    if (modeRef.current === 'youtube') ytRef.current?.pauseVideo();
    else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
      sendEmbedCommand(embedIframeRef.current, 'pauseVideo');
    } else audioRef.current?.pause();
  }, [stopBgKeepAlive]);

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
    userPausedRef.current = false;
    wantPlayingRef.current = true;
    if (modeRef.current === 'youtube') {
      ytRef.current?.playVideo();
      setIsBuffering(true);
      setError(null);
    } else if (modeRef.current === 'youtube-embed' && embedIframeRef.current) {
      sendEmbedCommand(embedIframeRef.current, 'playVideo');
      setIsPlaying(true);
      setError(null);
    } else {
      void audioRef.current?.play();
    }
  }, [currentTrack, isPlaying, pause]);

  toggleRef.current = toggle;
  seekRef.current = seek;
  resumeAudioRef.current = resumeAudioIfNeeded;
  migrateEmbedRef.current = migrateEmbedToAudio;

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const track = currentTrack;
    if (!track) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    const artwork = track.artwork
      ? [
          { src: track.artwork, sizes: '96x96', type: 'image/jpeg' },
          { src: track.artwork, sizes: '256x256', type: 'image/jpeg' },
          { src: track.artwork, sizes: '512x512', type: 'image/jpeg' },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || 'Spot Music',
      album: 'Spot Music',
      artwork,
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    const actionHandlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => toggleRef.current()],
      ['pause', () => toggleRef.current()],
      ['seekto', (details) => {
        if (typeof details.seekTime === 'number') seekRef.current(details.seekTime);
      }],
      ['seekbackward', (details) => {
        const off = details.seekOffset ?? 10;
        seekRef.current(Math.max(0, progressRef.current - off));
      }],
      ['seekforward', (details) => {
        const off = details.seekOffset ?? 10;
        const max = durationRef.current || Number.POSITIVE_INFINITY;
        seekRef.current(Math.min(max, progressRef.current + off));
      }],
      ['stop', () => {
        pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        setProgress(0);
      }],
    ];

    for (const [action, handler] of actionHandlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // ação não suportada neste navegador
      }
    }

    return () => {
      for (const [action] of actionHandlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [currentTrack, isPlaying, pause]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    if (!duration || !isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (isPlaying && now - lastPositionSyncRef.current < 1000) return;
    lastPositionSyncRef.current = now;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(0, progress), duration),
      });
    } catch {
      /* ignore */
    }
  }, [currentTrack, duration, progress, isPlaying]);

  // Home / recentes / tela apagada: manter áudio (proxy same-origin + Media Session)
  useEffect(() => {
    if (!MOBILE) return;

    const onBackground = () => {
      if (!wantPlayingRef.current || userPausedRef.current) return;
      syncMediaSessionPlaying();
      startBgKeepAlive();

      if (modeRef.current === 'youtube-embed' || modeRef.current === 'youtube') {
        migrateEmbedRef.current();
      } else {
        resumeAudioRef.current();
      }

      const track = currentTrackRef.current;
      if (track && modeRef.current === 'audio') {
        void openMiniPlayerPip(track, isPlayingRef.current, {
          onToggle: () => toggleRef.current(),
        });
      }
    };

    const onForeground = () => {
      stopBgKeepAlive();
      if (!wantPlayingRef.current || userPausedRef.current) return;
      resumeAudioRef.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onBackground();
      else onForeground();
    };

    const onPageHide = () => onBackground();
    const onPageShow = () => onForeground();
    const onFreeze = () => {
      syncMediaSessionPlaying();
      resumeAudioRef.current();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('freeze', onFreeze);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('freeze', onFreeze);
      stopBgKeepAlive();
    };
  }, [startBgKeepAlive, stopBgKeepAlive, syncMediaSessionPlaying]);

  // Botão Voltar do Android fecha o PWA — manter na pilha enquanto toca
  useEffect(() => {
    if (!MOBILE) return;

    const onPopState = () => {
      if (!canBackGuard()) return;
      window.history.pushState({ spotMusicBg: true }, '');
      showBackHint();
      resumeAudioRef.current();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [canBackGuard, showBackHint]);

  useEffect(() => {
    if (isPlaying) ensureBackTrap();
    else closeMiniPlayerPip();
  }, [isPlaying, ensureBackTrap]);

  useEffect(() => {
    updateMiniPlayerPip(isPlaying);
  }, [isPlaying]);

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
    backHint,
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
