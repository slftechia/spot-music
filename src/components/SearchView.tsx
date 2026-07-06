import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import SearchBar from './SearchBar';
import SearchResults from './SearchResults';
import PlaylistView from './PlaylistView';
import { searchMedia } from '../services/api';
import type { MediaItem, SearchFilter } from '../types';
import { FILTER_LABELS } from '../types';

interface Props {
  downloadedIds: Set<string>;
  downloadingId: string | null;
  downloadProgress: number;
  currentId?: string;
  isPlaying?: boolean;
  initialQuery?: string;
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
}

const FILTERS: SearchFilter[] = ['all', 'videos', 'compilations', 'playlists', 'albums'];

export default function SearchView({
  downloadedIds,
  downloadingId,
  downloadProgress,
  currentId,
  isPlaying,
  initialQuery,
  onPlay,
  onDownload,
}: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [openPlaylist, setOpenPlaylist] = useState<MediaItem | null>(null);

  const handleSearch = async (query: string, activeFilter = filter) => {
    setLoading(true);
    setSearched(true);
    setLastQuery(query);
    setOpenPlaylist(null);
    try {
      const results = await searchMedia(query, activeFilter);
      setItems(results);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery) handleSearch(initialQuery);
  }, [initialQuery]);

  const handleFilterChange = (f: SearchFilter) => {
    setFilter(f);
    if (lastQuery) handleSearch(lastQuery, f);
  };

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
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold">Buscar</h2>
      <SearchBar
        onSearch={(q) => handleSearch(q)}
        placeholder="Sertanejo 2026, mix, playlist..."
        initialQuery={initialQuery}
      />

      {(searched || loading) && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-spotify-green" size={32} />
        </div>
      )}

      {!loading && searched && (
        <>
          <p className="text-spotify-light text-sm">
            Resultados para &quot;{lastQuery}&quot;
          </p>
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
        </>
      )}

      {!loading && !searched && (
        <p className="text-spotify-light text-center py-12">
          Busque compilações, playlists, álbuns ou músicas — como no YouTube.
        </p>
      )}
    </div>
  );
}
