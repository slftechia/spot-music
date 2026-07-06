import {
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import SeekBar from './SeekBar';
import type { MediaItem } from '../types';

interface Props {
  track: MediaItem | null;
  isPlaying: boolean;
  isBuffering?: boolean;
  error?: string | null;
  progress: number;
  duration: number;
  volume: number;
  isMobile?: boolean;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onVolumeChange: (v: number) => void;
  onOpenYoutube?: () => void;
}

export default function Player({
  track,
  isPlaying,
  isBuffering,
  error,
  progress,
  duration,
  volume,
  isMobile,
  onToggle,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onVolumeChange,
  onOpenYoutube,
}: Props) {
  if (!track) return null;

  const displayDuration = duration || track.duration || 0;
  const showHours = displayDuration >= 3600;
  const pct = displayDuration ? (progress / displayDuration) * 100 : 0;
  const showBuffering = isBuffering && !isPlaying;

  return (
    <footer
      className={`fixed bottom-0 left-0 right-0 z-50 bg-spotify-gray border-t border-black/40 ${
        isMobile ? 'pb-safe' : 'h-[72px] flex items-center gap-4 px-4'
      }`}
    >
      {isMobile ? (
        <div className="px-3 pt-2 pb-2">
          <SeekBar
            progress={progress}
            duration={displayDuration}
            showHours={showHours}
            onSeek={onSeek}
            onSeekStart={onSeekStart}
            onSeekEnd={onSeekEnd}
          />
          <div className="flex items-center gap-3 mt-2">
            {track.artwork ? (
              <img src={track.artwork} alt="" className="w-11 h-11 rounded object-cover shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded bg-spotify-dark shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{track.title}</p>
              <p className="text-xs text-spotify-light truncate">
                {error ? (
                  <button type="button" onClick={onOpenYoutube} className="text-amber-300 underline">
                    {error}
                  </button>
                ) : (
                  track.artist
                )}
              </p>
            </div>
            <button
              onClick={onToggle}
              className="w-10 h-10 shrink-0 flex items-center justify-center bg-white rounded-full text-black"
            >
              {showBuffering ? (
                <Loader2 size={18} className="animate-spin text-black" />
              ) : isPlaying ? (
                <Pause size={18} fill="black" />
              ) : (
                <Play size={18} fill="black" className="ml-0.5" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 w-[30%] min-w-0">
            {track.artwork ? (
              <img src={track.artwork} alt="" className="w-14 h-14 rounded object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded bg-spotify-dark shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{track.title}</p>
              <p className="text-xs text-spotify-light truncate">
                {error ? (
                  <button type="button" onClick={onOpenYoutube} className="text-amber-300 underline">
                    {error} — Abrir no YouTube
                  </button>
                ) : (
                  track.artist
                )}
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center gap-1 max-w-xl">
            <div className="flex items-center gap-4">
              <button className="text-spotify-light hover:text-white transition-colors">
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
              <button className="text-spotify-light hover:text-white transition-colors">
                <SkipForward size={18} />
              </button>
            </div>
            <SeekBar
              progress={progress}
              duration={displayDuration}
              showHours={showHours}
              onSeek={onSeek}
              onSeekStart={onSeekStart}
              onSeekEnd={onSeekEnd}
            />
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
        </>
      )}

      <div
        className="absolute top-0 left-0 h-0.5 bg-spotify-green transition-[width] duration-300 pointer-events-none"
        style={{ width: `${pct}%` }}
      />
    </footer>
  );
}
