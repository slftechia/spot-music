import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../types';
import { getStreamUrl, needsPlaylistOpen, prefetchStream } from '../services/api';
import { getDownloadedTrack } from '../services/offlineStorage';

export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };
    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onPlaying = () => setIsBuffering(false);
    const onLoadStart = () => setIsBuffering(true);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('loadstart', onLoadStart);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('loadstart', onLoadStart);
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const tryStartPlayback = useCallback((audio: HTMLAudioElement) => {
    audio.play().catch(() => {});
  }, []);

  const play = useCallback(async (item: MediaItem, offline = false) => {
    if (needsPlaylistOpen(item)) return;

    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack?.id === item.id) {
      if (isPlaying) {
        audio.pause();
      } else {
        tryStartPlayback(audio);
      }
      return;
    }

    if (!offline) prefetchStream(item);

    setCurrentTrack(item);
    setProgress(0);
    setDuration(item.duration || 0);
    setIsBuffering(true);
    setIsPlaying(false);

    let src: string;
    if (offline) {
      const downloaded = await getDownloadedTrack(item.id);
      if (!downloaded?.blobUrl) throw new Error('Faixa não encontrada offline');
      src = downloaded.blobUrl;
    } else {
      src = getStreamUrl(item);
    }

    audio.src = src;
    audio.load();
    tryStartPlayback(audio);
  }, [currentTrack, isPlaying, tryStartPlayback]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) audio.pause();
    else tryStartPlayback(audio);
  }, [currentTrack, isPlaying, tryStartPlayback]);

  return {
    currentTrack,
    isPlaying,
    isBuffering,
    progress,
    duration,
    volume,
    setVolume,
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
