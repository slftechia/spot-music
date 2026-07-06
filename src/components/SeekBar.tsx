import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTime } from '../hooks/usePlayer';

interface Props {
  progress: number;
  duration: number;
  showHours?: boolean;
  onSeek: (time: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
}

export default function SeekBar({
  progress,
  duration,
  showHours,
  onSeek,
  onSeekStart,
  onSeekEnd,
}: Props) {
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const scrubbingRef = useRef(false);

  const max = duration > 0 ? duration : 100;
  const shown = scrubbing ? scrubValue : progress;

  useEffect(() => {
    if (!scrubbing) setScrubValue(progress);
  }, [progress, scrubbing]);

  const beginScrub = useCallback(() => {
    scrubbingRef.current = true;
    setScrubbing(true);
    setScrubValue(progress);
    onSeekStart?.();
  }, [progress, onSeekStart]);

  const endScrub = useCallback(
    (value: number) => {
      if (!scrubbingRef.current) return;
      scrubbingRef.current = false;
      setScrubbing(false);
      onSeek(value);
      onSeekEnd?.();
    },
    [onSeek, onSeekEnd]
  );

  return (
    <div
      className="flex items-center gap-2 w-full touch-none select-none"
      style={{ touchAction: 'none' }}
    >
      <span className="text-[10px] text-spotify-light w-10 text-right tabular-nums shrink-0">
        {formatTime(shown, showHours)}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(shown, max)}
        onPointerDown={beginScrub}
        onTouchStart={beginScrub}
        onInput={(e) => setScrubValue(Number(e.currentTarget.value))}
        onChange={(e) => endScrub(Number(e.currentTarget.value))}
        className="flex-1 h-3 sm:h-1.5 accent-spotify-green cursor-pointer appearance-none bg-white/20 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0"
        aria-label="Posição da música"
      />
      <span className="text-[10px] text-spotify-light w-10 tabular-nums shrink-0">
        {formatTime(duration, showHours)}
      </span>
    </div>
  );
}
