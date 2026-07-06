import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import SearchBar from './SearchBar';
import HomeGenreRow from './HomeGenreRow';
import { getTrending } from '../services/api';
import type { HomeGenreSection, MediaItem } from '../types';

interface Props {
  downloadedIds: Set<string>;
  downloadingId: string | null;
  downloadProgress: number;
  currentId?: string;
  isPlaying?: boolean;
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onCancelDownload?: () => void;
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
  onCancelDownload,
  onSearchNavigate,
}: Props) {
  const [sections, setSections] = useState<HomeGenreSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadTrending = () => {
    setLoading(true);
    setLoadError(false);
    getTrending()
      .then(setSections)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTrending();
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-3xl font-bold mb-6">Bem-vindo de volta</h2>
        <SearchBar onSearch={onSearchNavigate} placeholder="O que você quer ouvir?" />
      </section>

      <section className="flex flex-col gap-8">
        <h3 className="text-xl font-bold">Músicas para ouvir agora</h3>
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
          sections.map((section) => (
            <HomeGenreRow
              key={section.id}
              title={section.title}
              items={section.items}
              currentId={currentId}
              isPlaying={isPlaying}
              downloadedIds={downloadedIds}
              downloadingId={downloadingId}
              downloadProgress={downloadProgress}
              onPlay={onPlay}
              onDownload={onDownload}
              onCancelDownload={onCancelDownload}
            />
          ))
        )}
      </section>
    </div>
  );
}
