import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import Player from './components/Player';
import HomeView from './components/HomeView';
import SearchView from './components/SearchView';
import LibraryView from './components/LibraryView';
import { usePlayer } from './hooks/usePlayer';
import {
  downloadTrack,
  getAllDownloads,
} from './services/offlineStorage';
import type { MediaItem, View } from './types';
import { needsPlaylistOpen, downloadBlockedReason } from './services/api';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [libraryKey, setLibraryKey] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  const player = usePlayer();

  const refreshDownloads = useCallback(async () => {
    const downloads = await getAllDownloads();
    setDownloadedIds(new Set(downloads.map((d) => d.id)));
    setLibraryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    refreshDownloads();
  }, [refreshDownloads]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handlePlay = (item: MediaItem) => {
    if (needsPlaylistOpen(item)) return;

    const offline = downloadedIds.has(item.id);
    if (!offline && !online) {
      alert('Sem conexão. Baixe a música primeiro para ouvir offline.');
      return;
    }
    player.play(item, offline);
  };

  const handlePlayOffline = (item: MediaItem) => {
    player.play(item, true);
  };

  const handleDownload = async (item: MediaItem) => {
    if (!online) {
      alert('Conecte-se à internet para baixar músicas.');
      return;
    }
    const blocked = downloadBlockedReason(item);
    if (blocked) {
      alert(blocked);
      return;
    }
    if (downloadedIds.has(item.id)) return;

    setDownloadingId(item.id);
    setDownloadProgress(0);
    try {
      await downloadTrack(item, setDownloadProgress);
      await refreshDownloads();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error && err.message === 'DOWNLOAD_TOO_LONG'
        ? downloadBlockedReason(item)
        : 'Erro ao baixar. Tente uma música mais curta (até 20 min).';
      alert(msg);
    } finally {
      setDownloadingId(null);
      setDownloadProgress(0);
    }
  };

  const [pendingSearch, setPendingSearch] = useState<string | undefined>();

  const handleSearchNavigate = (query: string) => {
    setPendingSearch(query);
    setView('search');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <div
        id="yt-embed-host"
        className="fixed bottom-[76px] left-3 w-16 h-10 z-40 overflow-hidden rounded opacity-[0.02] pointer-events-none md:hidden"
        aria-hidden
      />
      <div
        id="yt-player-host"
        className="hidden md:block fixed -left-[9999px] top-0 w-[300px] h-[200px] opacity-0 pointer-events-none"
        aria-hidden
      />
      <Sidebar current={view} onChange={setView} />

      <main className="flex-1 overflow-y-auto pb-36 md:pb-24">
        {!online && (
          <div className="sticky top-0 z-30 bg-amber-900/90 text-amber-100 text-center text-sm py-2 px-4">
            Modo offline — apenas músicas baixadas podem ser reproduzidas
          </div>
        )}

        <div className="p-6 md:p-8 max-w-5xl mx-auto">
          {view === 'home' && (
            <HomeView
              downloadedIds={downloadedIds}
              downloadingId={downloadingId}
              downloadProgress={downloadProgress}
              currentId={player.currentTrack?.id}
              isPlaying={player.isPlaying}
              onPlay={handlePlay}
              onDownload={handleDownload}
              onSearchNavigate={handleSearchNavigate}
            />
          )}
          {view === 'search' && (
            <SearchView
              downloadedIds={downloadedIds}
              downloadingId={downloadingId}
              downloadProgress={downloadProgress}
              currentId={player.currentTrack?.id}
              isPlaying={player.isPlaying}
              initialQuery={pendingSearch}
              onPlay={handlePlay}
              onDownload={handleDownload}
            />
          )}
          {view === 'library' && (
            <LibraryView
              currentId={player.currentTrack?.id}
              isPlaying={player.isPlaying}
              onPlayOffline={handlePlayOffline}
              refreshKey={libraryKey}
              onRefresh={refreshDownloads}
            />
          )}
        </div>
      </main>

      <MobileNav current={view} onChange={setView} />

      <Player
        track={player.currentTrack}
        isPlaying={player.isPlaying}
        isBuffering={player.isBuffering}
        error={player.error}
        progress={player.progress}
        duration={player.duration}
        volume={player.volume}
        isMobile={player.isMobile}
        onToggle={player.toggle}
        onSeek={player.seek}
        onVolumeChange={player.setVolume}
        onOpenYoutube={player.openInYoutube}
      />
    </div>
  );
}
