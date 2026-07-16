import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import SearchBar from './SearchBar';
import HomeGenreRow from './HomeGenreRow';
import { getTrending } from '../services/api';
import { getPersonalizedSections } from '../services/homeSuggestions';
import { loadRecentSearches } from '../services/searchHistory';
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
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches());
  const [personalSections, setPersonalSections] = useState<HomeGenreSection[]>([]);
  const [trendingSections, setTrendingSections] = useState<HomeGenreSection[]>([]);
  const [loadingPersonal, setLoadingPersonal] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [trendingError, setTrendingError] = useState(false);

  const refresh = useCallback(() => {
    setRecentSearches(loadRecentSearches());
    setLoadingPersonal(true);
    setLoadingTrending(true);
    setTrendingError(false);

    void getPersonalizedSections()
      .then(setPersonalSections)
      .finally(() => setLoadingPersonal(false));

    getTrending()
      .then(setTrendingSections)
      .catch(() => setTrendingError(true))
      .finally(() => setLoadingTrending(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasPersonal = personalSections.length > 0;
  const hasTrending = trendingSections.length > 0;
  const showEmpty =
    !loadingPersonal && !loadingTrending && !hasPersonal && !hasTrending && recentSearches.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center gap-3">
        <img
          src="/icon.svg"
          alt=""
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl shadow-lg shadow-spotify-green/20 shrink-0"
        />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-none">Spot Music</h1>
          <p className="text-xs text-spotify-light mt-1">Ouça, baixe e leve na viagem</p>
        </div>
      </header>

      <SearchBar onSearch={onSearchNavigate} placeholder="O que você quer ouvir?" />

      {recentSearches.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-spotify-light uppercase tracking-wide mb-3">
            Suas buscas recentes
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {recentSearches.map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => onSearchNavigate(query)}
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm font-medium transition-colors"
              >
                <Clock size={14} className="text-spotify-light" />
                <span className="max-w-[160px] truncate">{query}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {loadingPersonal && recentSearches.length > 0 && (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-spotify-green" size={28} />
        </div>
      )}

      {hasPersonal && (
        <section className="flex flex-col gap-6">
          <h2 className="text-xl font-bold">Para você</h2>
          {personalSections.map((section) => (
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
          ))}
        </section>
      )}

      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-bold">
          {hasPersonal ? 'Explorar mais' : 'Músicas para ouvir agora'}
        </h2>
        {loadingTrending ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-spotify-green" size={32} />
          </div>
        ) : trendingError ? (
          <div className="text-center py-10">
            <p className="text-spotify-light mb-4 text-sm">
              Não foi possível carregar sugestões agora.
            </p>
            <button
              type="button"
              onClick={refresh}
              className="px-4 py-2 rounded-full bg-spotify-green text-black font-medium text-sm"
            >
              Tentar novamente
            </button>
          </div>
        ) : hasTrending ? (
          trendingSections.map((section) => (
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
        ) : null}
      </section>

      {showEmpty && (
        <p className="text-spotify-light text-center py-8 text-sm">
          Busque uma música ou artista para começar — suas sugestões aparecerão aqui.
        </p>
      )}
    </div>
  );
}
