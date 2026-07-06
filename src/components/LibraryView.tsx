import { useEffect, useState } from 'react';
import { Download, Loader2, WifiOff } from 'lucide-react';
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

  useEffect(() => {
    setLoading(true);
    getAllDownloads()
      .then((downloads) => setTracks(downloads))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const handleRemove = async (item: MediaItem) => {
    await removeDownload(item.id);
    onRefresh();
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

      <LibrarySync trackCount={tracks.length} onImported={onRefresh} />

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
        <TrackList
          tracks={tracks}
          currentId={currentId}
          isPlaying={isPlaying}
          downloadedIds={new Set(tracks.map((t) => t.id))}
          showRemove
          onPlay={onPlayOffline}
          onDownload={() => {}}
          onRemove={handleRemove}
        />
      )}
    </div>
  );
}
