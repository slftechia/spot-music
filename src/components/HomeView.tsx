import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import SearchBar from './SearchBar';
import SearchResults from './SearchResults';
import PlaylistView from './PlaylistView';
import { getTrending } from '../services/api';
import type { MediaItem } from '../types';

interface Props {
  downloadedIds: Set<string>;
  downloadingId: string | null;
  downloadProgress: number;
  currentId?: string;
  isPlaying?: boolean;
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onSearchNavigate: (query: string) => void;
}

export default function HomeView({
  downloadedIds,
  downloadingId,
  downloadProgress,
  currentId,
  isPlaying,
  onPlay,
  onDownload,
  onSearchNavigate,
}: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openPlaylist, setOpenPlaylist] = useState<MediaItem | null>(null);

  const loadTrending = () => {
    setLoading(true);
    setLoadError(false);
    getTrending()
      .then(setItems)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTrending();
  }, []);

  if (openPlaylist) {
    return (
      <PlaylistView
        playlist={openPlaylist}
        currentId={currentId}
        isPlaying={isPlaying}
        downloadedIds={downloadedIds}
        downloadingId={downloadingId}
        downloadProgress={downloadProgress}
        onClose={() => setOpenPlaylist(null)}
        onPlay={onPlay}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-3xl font-bold mb-6">Bem-vindo de volta</h2>
        <SearchBar onSearch={onSearchNavigate} placeholder="O que você quer ouvir?" />
      </section>

      <section>
        <h3 className="text-xl font-bold mb-4">Músicas para ouvir agora</h3>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-spotify-green" size={32} />
          </div>
        ) : loadError ? (
          <div className="text-center py-12">
            <p className="text-spotify-light mb-4">Não foi possível carregar as músicas.</p>
            <button
              onClick={loadTrending}
              className="px-4 py-2 rounded-full bg-spotify-green text-black font-medium text-sm"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <SearchResults
            items={items}
            currentId={currentId}
            isPlaying={isPlaying}
            downloadedIds={downloadedIds}
            downloadingId={downloadingId}
            downloadProgress={downloadProgress}
            onPlay={onPlay}
            onOpenPlaylist={setOpenPlaylist}
            onDownload={onDownload}
          />
        )}
      </section>
    </div>
  );
}
