import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getPlaylistItems } from '../services/api';
import type { MediaItem } from '../types';
import TrackList from './TrackList';

interface Props {
  playlist: MediaItem;
  currentId?: string;
  isPlaying?: boolean;
  downloadedIds: Set<string>;
  downloadingId: string | null;
  downloadProgress: number;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
}

export default function PlaylistView({
  playlist,
  currentId,
  isPlaying,
  downloadedIds,
  downloadingId,
  downloadProgress,
  onClose,
  onPlay,
  onDownload,
}: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = playlist.playlistId || playlist.id;
    setLoading(true);
    getPlaylistItems(id)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [playlist]);

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-spotify-light hover:text-white text-sm w-fit"
      >
        <ArrowLeft size={18} />
        Voltar aos resultados
      </button>

      <div className="flex gap-4 items-end">
        {playlist.artwork ? (
          <img
            src={playlist.artwork}
            alt=""
            className="w-36 h-36 sm:w-48 sm:h-48 rounded object-cover shadow-xl shrink-0"
          />
        ) : (
          <div className="w-36 h-36 rounded bg-spotify-gray shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-spotify-light mb-1">Playlist</p>
          <h2 className="text-xl sm:text-3xl font-bold line-clamp-3">{playlist.title}</h2>
          <p className="text-sm text-spotify-light mt-2">{playlist.artist}</p>
          {items.length > 0 && (
            <p className="text-xs text-spotify-light mt-1">{items.length} faixas</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-spotify-green" size={32} />
        </div>
      ) : (
        <TrackList
          tracks={items}
          currentId={currentId}
          isPlaying={isPlaying}
          downloadedIds={downloadedIds}
          downloadingId={downloadingId}
          downloadProgress={downloadProgress}
          onPlay={onPlay}
          onDownload={onDownload}
        />
      )}
    </div>
  );
}
