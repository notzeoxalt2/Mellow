import type { ArtistRef, MusicItem, Track } from '@/data/music/types';
import type { QueueSource } from '@/playback/queue/timeline';
import { usePlayer } from '@/state/player';

/** A shelf or search item as a queue track. */
export function toTrack(item: Track | MusicItem, fallbackArtwork?: string | null): Track {
  if ('videoId' in item) return item.thumbnail || !fallbackArtwork ? item : { ...item, thumbnail: fallbackArtwork };
  return {
    videoId: item.id,
    title: item.title,
    artists: item.artists,
    album: item.album,
    durationSec: item.durationSec,
    explicit: item.explicit,
    thumbnail: item.thumbnail ?? fallbackArtwork ?? null,
    index: null,
    plays: null,
  };
}

/** One song on its own (Search, Home, a shelf): the queue is that song, then AutoPlay. */
export function playTrack(item: Track | MusicItem, fallbackArtwork?: string | null, source?: QueueSource) {
  const track = toTrack(item, fallbackArtwork);
  usePlayer.getState().playTrack(track, source ?? { title: track.title, type: 'other' });
}

export interface ListContext {
  source: QueueSource;
  /** Album artwork, for tracks that have none of their own. */
  fallbackArtwork?: string | null | undefined;
  /** The album's artists, for tracks credited to nobody. */
  fallbackArtists?: ArtistRef[] | undefined;
}

function prepared(tracks: Track[], { fallbackArtwork, fallbackArtists }: ListContext): Track[] {
  return tracks.map((t) => {
    const withArt = toTrack(t, fallbackArtwork);
    return withArt.artists.length || !fallbackArtists ? withArt : { ...withArt, artists: fallbackArtists };
  });
}

/** An album, playlist or list of songs, from [startIndex]: the list becomes the queue's context. */
export function playList(tracks: Track[], startIndex: number, context: ListContext) {
  usePlayer.getState().playTracks(prepared(tracks, context), startIndex, context.source);
}

/** The header's Shuffle: shuffle on, and the list from a random track. */
export function shuffleList(tracks: Track[], context: ListContext) {
  if (!tracks.length) return;
  const player = usePlayer.getState();
  if (!player.shuffle) player.toggleShuffle();
  player.playTracks(prepared(tracks, context), Math.floor(Math.random() * tracks.length), context.source);
}

/** Quick-play an entire playlist, album, or track directly from a card/shelf without opening it. */
export async function playItem(item: MusicItem) {
  if (item.kind === 'song' || item.kind === 'video') {
    playTrack(item);
    return;
  }

  if (item.kind === 'spotify-playlist') {
    try {
      const { fetchSpotifyTracks, matchToYouTube, pendingTrack } = await import('@/data/spotify/api');
      const tracks = await fetchSpotifyTracks(item.id, () => {});
      if (!tracks.length) return;

      let firstMatch = null;
      try {
        firstMatch = await matchToYouTube(tracks[0]!);
      } catch {}

      const context: ListContext = {
        source: { title: item.title, type: 'playlist', id: `spotify:${item.id}` },
        fallbackArtwork: item.thumbnail,
      };
      const allTracks = tracks.map((t, idx) => (idx === 0 && firstMatch ? firstMatch : pendingTrack(t)));
      playList(allTracks, 0, context);
      if (true) {

        void (async () => {
          for (let i = 1; i < Math.min(tracks.length, 50); i++) {
            const track = tracks[i];
            if (!track) continue;
            try {
              const matched = await matchToYouTube(track);
              if (matched) {
                const q = usePlayer.getState().queue;
                const entry = q[i];
                if (entry && entry.track.title === track.title) {
                  entry.track = matched;
                  usePlayer.setState({ queue: [...q] });
                }
              }
            } catch {}
          }
        })();
      }
    } catch (err) {
      console.warn('Failed to quick-play Spotify playlist:', err);
    }
    return;
  }

  if (item.kind === 'album') {
    try {
      const { fetchAlbum } = await import('@/data/music/api');
      const album = await fetchAlbum(item.id);
      if (album?.tracks?.length) {
        playList(album.tracks, 0, {
          source: { title: album.title, type: 'album', id: item.id },
          fallbackArtwork: album.thumbnail ?? item.thumbnail,
        });
      }
    } catch (err) {
      console.warn('Failed to quick-play album:', err);
    }
    return;
  }

  if (item.kind === 'playlist') {
    try {
      const { fetchPlaylist } = await import('@/data/music/api');
      const res = await fetchPlaylist(item.id);
      if (res?.page?.tracks?.length) {
        playList(res.page.tracks, 0, {
          source: { title: res.page.title, type: 'playlist', id: item.id },
          fallbackArtwork: res.page.thumbnail ?? item.thumbnail,
        });
      }
    } catch (err) {
      console.warn('Failed to quick-play playlist:', err);
    }
    return;
  }
}
