import {
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatTime } from '../hooks/usePlayer';
import type { MediaItem } from '../types';

interface Props {
  track: MediaItem | null;
  isPlaying: boolean;
  isBuffering?: boolean;
  error?: string | null;
  progress: number;
  duration: number;
  volume: number;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (v: number) => void;
}

export default function Player({
  track,
  isPlaying,
  isBuffering,
  error,
  progress,
  duration,
  volume,
  onToggle,
  onSeek,
  onVolumeChange,
}: Props) {
  if (!track) return null;

  const displayDuration = duration || track.duration || 0;
  const showHours = displayDuration >= 3600;
  const pct = displayDuration ? (progress / displayDuration) * 100 : 0;
  const showBuffering = isBuffering && !isPlaying;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 h-[72px] bg-spotify-gray border-t border-black/40 px-4 flex items-center gap-4">
      <div className="flex items-center gap-3 w-[30%] min-w-0">
        {track.artwork ? (
          <img src={track.artwork} alt="" className="w-14 h-14 rounded object-cover shrink-0 hidden sm:block" />
        ) : (
          <div className="w-14 h-14 rounded bg-spotify-dark shrink-0 hidden sm:block" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{track.title}</p>
          <p className="text-xs text-spotify-light truncate">
            {error || track.artist}
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center gap-1 max-w-xl">
        <div className="flex items-center gap-4">
          <button className="text-spotify-light hover:text-white transition-colors hidden sm:block">
            <SkipBack size={18} />
          </button>
          <button
            onClick={onToggle}
            className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-black hover:scale-105 transition-transform"
          >
            {showBuffering ? (
              <Loader2 size={16} className="animate-spin text-black" />
            ) : isPlaying ? (
              <Pause size={16} fill="black" />
            ) : (
              <Play size={16} fill="black" className="ml-0.5" />
            )}
          </button>
          <button className="text-spotify-light hover:text-white transition-colors hidden sm:block">
            <SkipForward size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 w-full">
          <span className="text-[10px] text-spotify-light w-10 text-right">{formatTime(progress, showHours)}</span>
          <input
            type="range"
            min={0}
            max={displayDuration || 100}
            value={progress}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="flex-1 h-1 accent-spotify-green cursor-pointer"
          />
          <span className="text-[10px] text-spotify-light w-10">
            {track.durationText || formatTime(displayDuration, showHours)}
          </span>
        </div>
      </div>

      <div className="w-[30%] hidden md:flex items-center justify-end gap-2">
        <button
          onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
          className="text-spotify-light hover:text-white"
        >
          {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="w-24 h-1 accent-spotify-green cursor-pointer"
        />
      </div>

      <div
        className="absolute top-0 left-0 h-0.5 bg-spotify-green transition-all pointer-events-none"
        style={{ width: `${pct}%` }}
      />
    </footer>
  );
}
