import { useEffect, useState } from 'react';
import { CheckSquare, Download, Loader2, Square, WifiOff, X } from 'lucide-react';
import TrackList from './TrackList';
import LibrarySync from './LibrarySync';
import { getAllDownloads, removeDownload } from '../services/offlineStorage';
import { isMobileDevice } from '../utils/device';
import type { MediaItem } from '../types';

interface Props {
  currentId?: string;
  isPlaying?: boolean;
  onPlayOffline: (item: MediaItem) => void;
  refreshKey: number;
  onRefresh: () => void;
}

export default function LibraryView({
  currentId,
  isPlaying,
  onPlayOffline,
  refreshKey,
  onRefresh,
}: Props) {
  const [tracks, setTracks] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    getAllDownloads()
      .then((downloads) => setTracks(downloads))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set(tracks.map((t) => t.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tracks]);

  const handleRemove = async (item: MediaItem) => {
    await removeDownload(item.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    onRefresh();
  };

  const toggleSelect = (item: MediaItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(tracks.map((t) => t.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded bg-gradient-to-br from-purple-700 to-spotify-green flex items-center justify-center">
          <Download size={22} />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Suas músicas</h2>
          <p className="text-sm text-spotify-light flex items-center gap-1">
            <WifiOff size={14} />
            Disponíveis sem internet
          </p>
        </div>
      </div>

      <LibrarySync
        trackCount={tracks.length}
        selectionMode={selectionMode}
        selectedCount={selectedIds.size}
        onImported={onRefresh}
        onEnterSelection={() => setSelectionMode(true)}
        onExitSelection={exitSelectionMode}
        selectedTrackIds={[...selectedIds]}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-spotify-green" size={32} />
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-16">
          <Download size={48} className="mx-auto text-spotify-light mb-4 opacity-50" />
          <p className="text-spotify-light">Nenhuma música baixada ainda.</p>
          <p className="text-sm text-spotify-light mt-1 max-w-sm mx-auto">
            {isMobileDevice()
              ? 'Importe a biblioteca exportada do PC acima, ou baixe músicas curtas se a conexão permitir.'
              : 'Baixe músicas aqui ou importe um .zip do outro dispositivo.'}
          </p>
        </div>
      ) : (
        <>
          {selectionMode && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="text-sm text-spotify-light mr-auto">
                {selectedIds.size} de {tracks.length} selecionada(s)
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/20 hover:border-white/40 transition-colors"
              >
                <CheckSquare size={14} />
                Todas
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/20 hover:border-white/40 transition-colors"
              >
                <Square size={14} />
                Limpar
              </button>
              <button
                type="button"
                onClick={exitSelectionMode}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/20 hover:border-white/40 transition-colors"
              >
                <X size={14} />
                Cancelar
              </button>
            </div>
          )}

          <TrackList
            tracks={tracks}
            currentId={currentId}
            isPlaying={isPlaying}
            downloadedIds={new Set(tracks.map((t) => t.id))}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            showRemove={!selectionMode}
            onPlay={onPlayOffline}
            onDownload={() => {}}
            onRemove={handleRemove}
          />
        </>
      )}
    </div>
  );
}
