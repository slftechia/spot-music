import { Download, Play, Trash2, X } from 'lucide-react';
import type { MediaItem } from '../types';
import { formatTime } from '../hooks/usePlayer';
import { prefetchStream, canDownload, MAX_DOWNLOAD_SECONDS } from '../services/api';

interface Props {
  tracks: MediaItem[];
  currentId?: string;
  isPlaying?: boolean;
  downloadedIds: Set<string>;
  downloadingId?: string | null;
  downloadProgress?: number;
  showRemove?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onCancelDownload?: () => void;
  onRemove?: (item: MediaItem) => void;
}

export default function TrackList({
  tracks,
  currentId,
  isPlaying,
  downloadedIds,
  downloadingId,
  downloadProgress,
  showRemove,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onPlay,
  onDownload,
  onCancelDownload,
  onRemove,
}: Props) {
  if (tracks.length === 0) {
    return (
      <p className="text-spotify-light text-center py-12">
        Nenhuma música encontrada.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {tracks.map((track, i) => {
        const active = currentId === track.id;
        const downloaded = downloadedIds.has(track.id);
        const downloading = downloadingId === track.id;
        const selected = selectedIds?.has(track.id);

        return (
          <div
            key={track.id}
            className={`group flex items-center gap-4 px-4 py-2.5 rounded-md transition-colors hover:bg-white/10 ${
              active ? 'bg-white/10' : ''
            } ${selected ? 'bg-spotify-green/10' : ''}`}
          >
            {selectionMode ? (
              <button
                type="button"
                onClick={() => onToggleSelect?.(track)}
                className={`w-8 h-8 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                  selected
                    ? 'border-spotify-green bg-spotify-green text-black'
                    : 'border-white/30 text-transparent hover:border-white/60'
                }`}
                aria-label={selected ? 'Desmarcar' : 'Marcar para exportar'}
              >
                {selected && <span className="text-sm font-bold leading-none">✓</span>}
              </button>
            ) : (
              <button
                onMouseEnter={() => prefetchStream(track)}
                onClick={() => onPlay(track)}
                className="w-8 text-center text-spotify-light text-sm shrink-0"
              >
                {active && isPlaying ? (
                  <span className="flex gap-0.5 justify-center items-end h-4">
                    {[0, 1, 2].map((n) => (
                      <span
                        key={n}
                        className="w-0.5 bg-spotify-green animate-bar"
                        style={{ animationDelay: `${n * 0.15}s`, height: '100%' }}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="group-hover:hidden">{i + 1}</span>
                )}
                <Play
                  size={14}
                  className={`hidden group-hover:block mx-auto fill-white ${active && isPlaying ? 'group-hover:hidden' : ''}`}
                />
              </button>
            )}

            {track.artwork ? (
              <img
                src={track.artwork}
                alt=""
                className="w-10 h-10 rounded object-cover shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-spotify-gray shrink-0" />
            )}

            <button onClick={() => onPlay(track)} className="flex-1 min-w-0 text-left">
              <p className={`text-sm font-medium truncate ${active ? 'text-spotify-green' : ''}`}>
                {track.title}
              </p>
              <p className="text-xs text-spotify-light truncate">{track.artist}</p>
            </button>

            <span className="text-xs text-spotify-light hidden sm:block">
              {track.durationText || formatTime(track.duration, track.duration >= 3600)}
            </span>

            <div className="flex flex-col items-center shrink-0 min-w-[44px]">
              {downloading ? (
                <button
                  type="button"
                  onClick={() => onCancelDownload?.()}
                  className="flex flex-col items-center gap-0.5 p-2 text-red-400 hover:text-red-300 transition-colors"
                  title="Cancelar download"
                  aria-label="Cancelar download"
                >
                  <X size={18} />
                  <span className="text-[9px] font-medium">
                    {downloadProgress !== undefined ? `${downloadProgress}%` : '…'}
                  </span>
                </button>
              ) : downloaded ? (
                showRemove ? (
                  <button
                    onClick={() => onRemove?.(track)}
                    className="p-2 text-spotify-light hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remover download"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <span className="text-xs text-spotify-green px-2">✓ Offline</span>
                )
              ) : (
                <button
                  onClick={() => onDownload(track)}
                  disabled={!canDownload(track)}
                  className="flex flex-col items-center gap-0.5 p-2 text-spotify-light hover:text-white transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-30"
                  title={canDownload(track) ? 'Baixar para offline' : `Máx. ${Math.round(MAX_DOWNLOAD_SECONDS / 3600)}h`}
                  aria-label="Baixar música"
                >
                  <Download size={18} />
                  <span className="text-[9px] font-medium sm:hidden">Baixar</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
