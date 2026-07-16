export type MediaType = 'video' | 'compilation' | 'playlist' | 'album' | 'track';
export type MediaSource = 'youtube' | 'audius';
export type SearchFilter = 'all' | 'videos' | 'compilations' | 'playlists' | 'albums';

export interface MediaItem {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  durationText?: string;
  type: MediaType;
  source: MediaSource;
  viewCount?: string;
  videoCount?: number;
  playlistId?: string;
  description?: string;
}

/** @deprecated Use MediaItem */
export type Track = MediaItem;

export interface DownloadedTrack extends MediaItem {
  downloadedAt: number;
  blobUrl?: string;
}

export type View = 'home' | 'search' | 'library';

export interface HomeGenreSection {
  id: string;
  title: string;
  items: MediaItem[];
}

export const FILTER_LABELS: Record<SearchFilter, string> = {
  all: 'Tudo',
  videos: 'Vídeos',
  compilations: 'Compilações',
  playlists: 'Playlists',
  albums: 'Álbuns',
};

export const TYPE_LABELS: Record<MediaType, string> = {
  video: 'Vídeo',
  compilation: 'Compilação',
  playlist: 'Playlist',
  album: 'Álbum',
  track: 'Música',
};
