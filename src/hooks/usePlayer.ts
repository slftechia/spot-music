import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../types';
import { needsPlaylistOpen } from '../services/api';
import { getDownloadedTrack } from '../services/offlineStorage';

type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
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
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
            onError?: (e: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; BUFFERING: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeAPI() {
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

export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const ytReady = useRef(false);
  const modeRef = useRef<'youtube' | 'audio'>('youtube');
  const tickRef = useRef<number | null>(null);

  const [currentTrack, setCurrentTrack] = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    const loop = () => {
      if (modeRef.current === 'youtube' && ytRef.current) {
        const t = ytRef.current.getCurrentTime();
        const d = ytRef.current.getDuration();
        if (isFinite(t)) setProgress(t);
        if (isFinite(d) && d > 0) setDuration(d);
      }
      tickRef.current = requestAnimationFrame(loop);
    };
    tickRef.current = requestAnimationFrame(loop);
  }, [stopTick]);

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
        startTick();
      }
    };
    const onPause = () => {
      if (modeRef.current === 'audio') {
        setIsPlaying(false);
        stopTick();
      }
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

    loadYouTubeAPI().then(() => {
      if (!document.getElementById('yt-player-host')) return;
      ytRef.current = new window.YT!.Player('yt-player-host', {
        height: 1,
        width: 1,
        playerVars: {
          playsinline: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            ytReady.current = true;
            ytRef.current?.setVolume(volume);
          },
          onStateChange: (e) => {
            if (modeRef.current !== 'youtube') return;
            const PS = window.YT!.PlayerState;
            if (e.data === PS.PLAYING) {
              setIsPlaying(true);
              setIsBuffering(false);
              setError(null);
              startTick();
            } else if (e.data === PS.PAUSED) {
              setIsPlaying(false);
              stopTick();
            } else if (e.data === PS.BUFFERING) {
              setIsBuffering(true);
            } else if (e.data === PS.ENDED) {
              setIsPlaying(false);
              setIsBuffering(false);
              stopTick();
            }
          },
          onError: () => {
            if (modeRef.current === 'youtube') {
              setError('Vídeo indisponível para reprodução.');
              setIsBuffering(false);
              setIsPlaying(false);
            }
          },
        },
      });
    });

    return () => {
      stopTick();
      audio.pause();
      audio.src = '';
      ytRef.current?.destroy();
    };
  }, [startTick, stopTick, volume]);

  useEffect(() => {
    if (modeRef.current === 'youtube') ytRef.current?.setVolume(volume);
    else if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume]);

  const play = useCallback(async (item: MediaItem, offline = false) => {
    if (needsPlaylistOpen(item)) return;

    if (currentTrack?.id === item.id) {
      if (isPlaying) {
        if (modeRef.current === 'youtube') ytRef.current?.pauseVideo();
        else audioRef.current?.pause();
      } else {
        if (modeRef.current === 'youtube') ytRef.current?.playVideo();
        else audioRef.current?.play();
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
      const downloaded = await getDownloadedTrack(item.id);
      if (!downloaded?.blobUrl) throw new Error('Faixa não encontrada offline');
      const audio = audioRef.current!;
      audio.src = downloaded.blobUrl;
      audio.load();
      await audio.play();
      return;
    }

    modeRef.current = 'youtube';
    audioRef.current?.pause();

    await loadYouTubeAPI();
    if (!ytReady.current || !ytRef.current) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (ytReady.current && ytRef.current) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }

    ytRef.current!.loadVideoById(item.id);
    ytRef.current!.playVideo();
  }, [currentTrack, isPlaying, volume]);

  const pause = useCallback(() => {
    if (modeRef.current === 'youtube') ytRef.current?.pauseVideo();
    else audioRef.current?.pause();
  }, []);

  const seek = useCallback((time: number) => {
    setProgress(time);
    if (modeRef.current === 'youtube') ytRef.current?.seekTo(time, true);
    else if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  const toggle = useCallback(() => {
    if (!currentTrack) return;
    if (isPlaying) pause();
    else if (modeRef.current === 'youtube') ytRef.current?.playVideo();
    else audioRef.current?.play();
  }, [currentTrack, isPlaying, pause]);

  const setVolumeLevel = useCallback((v: number) => {
    const vol = Math.round(v * 100);
    setVolume(vol);
  }, []);

  return {
    currentTrack,
    isPlaying,
    isBuffering,
    error,
    progress,
    duration,
    volume: volume / 100,
    setVolume: setVolumeLevel,
    play,
    pause,
    seek,
    toggle,
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
