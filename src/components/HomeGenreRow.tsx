import { Download, Play, X } from 'lucide-react';
import type { MediaItem } from '../types';
import { canDownload, DOWNLOADS_ENABLED, getMaxDownloadSeconds } from '../services/api';

interface Props {
  title: string;
  items: MediaItem[];
  currentId?: string;
  isPlaying?: boolean;
  downloadedIds: Set<string>;
  downloadingId?: string | null;
  downloadProgress?: number;
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onCancelDownload?: () => void;
}

export default function HomeGenreRow({
  title,
  items,
  currentId,
  isPlaying,
  downloadedIds,
  downloadingId,
  downloadProgress,
  onPlay,
  onDownload,
  onCancelDownload,
}: Props) {
  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="text-lg font-bold mb-3">{title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
        {items.map((item) => {
          const active = currentId === item.id;
          const downloaded = downloadedIds.has(item.id);
          const downloading = downloadingId === item.id;

          return (
            <div
              key={item.id}
              className={`shrink-0 w-36 sm:w-40 rounded-lg overflow-hidden bg-spotify-gray/50 ${
                active ? 'ring-2 ring-spotify-green' : ''
              }`}
            >
              <button
                onClick={() => onPlay(item)}
                className="relative w-full aspect-square block"
              >
                {item.artwork ? (
                  <img src={item.artwork} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full bg-spotify-gray" />
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity">
                  {active && isPlaying ? (
                    <span className="flex gap-0.5 items-end h-5">
                      {[0, 1, 2].map((n) => (
                        <span
                          key={n}
                          className="w-0.5 bg-spotify-green animate-bar"
                          style={{ animationDelay: `${n * 0.15}s`, height: '100%' }}
                        />
                      ))}
                    </span>
                  ) : (
                    <Play size={28} className="fill-white text-white" />
                  )}
                </div>
                {item.durationText && (
                  <span className="absolute bottom-1 right-1 bg-black/85 text-white text-[10px] px-1 rounded">
                    {item.durationText}
                  </span>
                )}
              </button>

              <div className="p-2">
                <p className={`text-xs font-semibold line-clamp-2 leading-tight ${active ? 'text-spotify-green' : ''}`}>
                  {item.title}
                </p>
                <p className="text-[10px] text-spotify-light truncate mt-0.5">{item.artist}</p>

                {DOWNLOADS_ENABLED && (
                  <div className="mt-2 flex justify-end">
                    {downloading ? (
                      <button
                        type="button"
                        onClick={() => onCancelDownload?.()}
                        className="flex items-center gap-1 text-red-400 text-[10px]"
                        aria-label="Cancelar download"
                      >
                        <X size={14} />
                        {downloadProgress}%
                      </button>
                    ) : downloaded ? (
                      <span className="text-[10px] text-spotify-green">✓ Offline</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDownload(item)}
                        disabled={!canDownload(item)}
                        className="flex items-center gap-1 text-spotify-light hover:text-white disabled:opacity-30 text-[10px]"
                        title={
                          canDownload(item)
                            ? 'Baixar'
                            : (() => {
                                const max = getMaxDownloadSeconds();
                                return max < 3600 ? `Máx. ${Math.round(max / 60)} min` : `Máx. ${Math.round(max / 3600)}h`;
                              })()
                        }
                      >
                        <Download size={14} />
                        Baixar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
