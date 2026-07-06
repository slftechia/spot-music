import { Download, ListMusic, Play, Trash2, X } from 'lucide-react';
import type { MediaItem } from '../types';
import { TYPE_LABELS } from '../types';
import { formatTime } from '../hooks/usePlayer';
import { prefetchStream, canDownload, DOWNLOADS_ENABLED, MAX_DOWNLOAD_SECONDS } from '../services/api';

interface Props {
  items: MediaItem[];
  currentId?: string;
  isPlaying?: boolean;
  downloadedIds: Set<string>;
  downloadingId?: string | null;
  downloadProgress?: number;
  showRemove?: boolean;
  onPlay: (item: MediaItem) => void;
  onOpenPlaylist: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onCancelDownload?: () => void;
  onRemove?: (item: MediaItem) => void;
}

function durationLabel(item: MediaItem) {
  if (item.durationText) return item.durationText;
  if (item.duration > 0) return formatTime(item.duration, true);
  if (item.videoCount) return `${item.videoCount} vídeos`;
  return '';
}

export default function SearchResults({
  items,
  currentId,
  isPlaying,
  downloadedIds,
  downloadingId,
  downloadProgress,
  showRemove,
  onPlay,
  onOpenPlaylist,
  onDownload,
  onCancelDownload,
  onRemove,
}: Props) {
  if (items.length === 0) {
    return (
      <p className="text-spotify-light text-center py-12">
        Nenhum resultado encontrado.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => {
        const active = currentId === item.id;
        const downloaded = downloadedIds.has(item.id);
        const downloading = downloadingId === item.id;
        const isCollection = item.type === 'playlist' || item.type === 'album';
        const badge = TYPE_LABELS[item.type];

        return (
          <div
            key={`${item.type}-${item.id}`}
            className={`group flex gap-4 p-2 rounded-lg transition-colors hover:bg-white/5 ${
              active ? 'bg-white/10' : ''
            }`}
          >
            <button
              onMouseEnter={() => !isCollection && prefetchStream(item)}
              onClick={() => (isCollection ? onOpenPlaylist(item) : onPlay(item))}
              className="relative shrink-0 w-40 sm:w-56 aspect-video rounded-lg overflow-hidden bg-spotify-gray"
            >
              {item.artwork ? (
                <img
                  src={item.artwork}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-spotify-light">
                  <ListMusic size={32} />
                </div>
              )}

              {durationLabel(item) && (
                <span className="absolute bottom-1.5 right-1.5 bg-black/85 text-white text-[11px] font-medium px-1.5 py-0.5 rounded z-10">
                  {durationLabel(item)}
                </span>
              )}

              {active && isPlaying && !isCollection && (
                <span className="absolute bottom-1.5 left-1.5 flex gap-0.5 items-end h-4 z-10 bg-black/75 rounded px-1.5 py-0.5">
                  {[0, 1, 2].map((n) => (
                    <span
                      key={n}
                      className="w-0.5 bg-spotify-green animate-bar"
                      style={{ animationDelay: `${n * 0.15}s`, height: '100%' }}
                    />
                  ))}
                </span>
              )}

              {isCollection && (
                <span className="absolute top-1.5 left-1.5 bg-black/75 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                  <ListMusic size={10} />
                  {badge}
                </span>
              )}

              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Play size={28} className="fill-white text-white" />
              </div>
            </button>

            <div className="flex-1 min-w-0 flex flex-col justify-start py-1">
              <button
                onClick={() => (isCollection ? onOpenPlaylist(item) : onPlay(item))}
                className="text-left"
              >
                <h4
                  className={`text-sm sm:text-base font-semibold line-clamp-2 leading-snug ${
                    active ? 'text-spotify-green' : 'text-white'
                  }`}
                >
                  {item.title}
                </h4>
              </button>

              <p className="text-xs sm:text-sm text-spotify-light mt-1 truncate">
                {item.artist}
              </p>

              <div className="flex items-center gap-2 mt-1.5 text-xs text-spotify-light">
                {!isCollection && (
                  <span className="text-spotify-green/80 font-medium">{badge}</span>
                )}
                {item.viewCount && <span>{item.viewCount}</span>}
              </div>

              {item.description && (
                <p className="text-xs text-spotify-light/70 mt-1 line-clamp-2 hidden sm:block">
                  {item.description}
                </p>
              )}
            </div>

            <div className="flex flex-col items-center shrink-0 pt-1 min-w-[44px]">
              {!isCollection && DOWNLOADS_ENABLED && (
                <>
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
                        onClick={() => onRemove?.(item)}
                        className="p-2.5 text-spotify-light hover:text-red-400 transition-colors"
                        title="Remover download"
                        aria-label="Remover download"
                      >
                        <Trash2 size={18} />
                      </button>
                    ) : (
                      <span className="text-xs text-spotify-green px-2 py-2">✓ Offline</span>
                    )
                  ) : (
                    <button
                      onClick={() => onDownload(item)}
                      disabled={!canDownload(item)}
                      className="flex flex-col items-center gap-0.5 p-2 text-spotify-light hover:text-white transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={canDownload(item) ? 'Baixar para offline' : `Máx. ${Math.round(MAX_DOWNLOAD_SECONDS / 3600)}h`}
                      aria-label="Baixar música"
                    >
                      <Download size={18} />
                      <span className="text-[9px] font-medium sm:hidden">Baixar</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
