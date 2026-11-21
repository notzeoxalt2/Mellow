import type { SpotifyArtist, SpotifyPlaylist, SpotifyTrack } from '@bitchord/shared/bridge';
import { best, type MatchCandidate } from '@/data/match/trackMatcher';
import { searchSongs } from '@/data/music/api';
import type { Track } from '@/data/music/types';
import { getBridge } from '@/extension/bridge';
import { queryClient } from '@/lib/queryClient';

/**
 * Spotify through the extension (prompt §7.1): the library, a playlist's
 * tracks, and matching each one to its YouTube Music song. Ports
 * SpotifyLibrary.kt's paging and SpotifyImporter.matchTrack.
 */

export const LIKED_ID = 'liked';

function bridge() {
  const b = getBridge();
  if (!b) throw new Error('The BitChord extension is not installed');
  return b;
}

/** Every playlist in the library, Liked Songs first, however many pages it takes. */
export async function fetchSpotifyPlaylists(): Promise<SpotifyPlaylist[]> {
  const out: SpotifyPlaylist[] = [];
  for (let offset = 0; ; ) {
    const page = await bridge().call('spotify.playlists', { offset }, { timeoutMs: 30_000 });
    out.push(...page.items);
    offset += page.raw;
    if (page.raw === 0 || offset >= page.total) break;
  }
  return out;
}

export function fetchSpotifyPlaylistInfo(playlistId: string) {
  return bridge().call('spotify.playlist', { playlistId }, { timeoutMs: 30_000 });
}

export async function fetchSpotifyFollowedArtists(): Promise<SpotifyArtist[]> {
  try {
    return await bridge().call('spotify.followedArtists', {}, { timeoutMs: 25_000 });
  } catch {
    return [];
  }
}

export async function fetchSpotifyHomeSections(): Promise<{
  madeForYou: SpotifyPlaylist[];
  recents: SpotifyPlaylist[];
  topMixes: SpotifyPlaylist[];
  sections: { title: string; playlists: SpotifyPlaylist[] }[];
}> {
  try {
    return await bridge().call('spotify.homeSections', {}, { timeoutMs: 15_000 });
  } catch {
    return { madeForYou: [], recents: [], topMixes: [], sections: [] };
  }
}

/** Every track of a playlist; [onPage] gets the running list after each page, so a long one fills in. */
export async function fetchSpotifyTracks(playlistId: string, onPage: (soFar: SpotifyTrack[], total: number) => void): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  for (let offset = 0; ; ) {
    const page = await bridge().call('spotify.tracks', { playlistId, offset }, { timeoutMs: 30_000 });
    out.push(...page.items);
    offset += page.raw;
    onPage([...out], page.total);
    if (page.raw === 0 || offset >= page.total) break;
  }
  return out;
}

/** Read only the first page for lightweight Home blends; never crawl a full library just to build a shelf. */
export async function fetchSpotifyTrackPage(playlistId: string, offset = 0): Promise<SpotifyTrack[]> {
  const page = await bridge().call('spotify.tracks', { playlistId, offset }, { timeoutMs: 20_000 });
  return page.items;
}

/** A Spotify row as a list row, before its YouTube Music version is known. */
export function pendingTrack(track: SpotifyTrack, unavailable: 'matching' | 'missing' = 'matching'): Track {
  return {
    videoId: `spotify:${track.id}`,
    title: track.title,
    artists: track.artist ? track.artist.split(', ').map((name) => ({ name, id: null })) : [],
    album: track.album ? { name: track.album, id: null } : null,
    durationSec: track.durationMs > 0 ? Math.round(track.durationMs / 1000) : null,
    explicit: false,
    thumbnail: track.imageUrl,
    index: null,
    plays: null,
    unavailable,
  };
}

export function candidateOf(track: Track): MatchCandidate {
  return {
    title: track.title,
    artist: track.artists.map((a) => a.name).join(', '),
    durationSec: track.durationSec,
    album: track.album?.name ?? null,
    explicit: track.explicit,
  };
}

const matched = new Map<string, Track | null>();
const MATCH_CACHE_LIMIT = 256;

/**
 * The YouTube Music song that is [track], or null if there is none:
 * the best candidate by title, artist, length and album, and failing that
 * the search's first hit (SpotifyImporter.matchTrack).
 */
export async function matchToYouTube(track: SpotifyTrack): Promise<Track | null> {
  if (matched.has(track.id)) return matched.get(track.id)!;
  const query = [track.title, track.artist].filter((s) => s.trim()).join(' ');
  const candidates = await searchSongs(query);
  const target = {
    title: track.title,
    artist: track.artist,
    durationSec: track.durationMs > 0 ? Math.round(track.durationMs / 1000) : null,
    album: track.album,
  };
  const scored = best(candidates.map((c) => ({ ...candidateOf(c), track: c })), target);
  const found = scored?.track ?? candidates[0] ?? null;
  const result = found && { ...found, thumbnail: found.thumbnail ?? track.imageUrl };
  matched.delete(track.id);
  matched.set(track.id, result);
  if (matched.size > MATCH_CACHE_LIMIT) matched.delete(matched.keys().next().value!);
  return result;
}

// ---- Canvas (SpotifyCanvas / DesktopSpotifyCanvas) ---------------------------------

const canvases = new Map<string, string | null>();

/**
 * The looping clip Spotify shows behind [track], or null. The Spotify
 * counterpart is found with the same matcher, so a cover or a remix never
 * lends its canvas to the original.
 */
export async function fetchCanvas(track: { videoId: string; title: string; artist: string; durationSec: number }): Promise<string | null> {
  if (canvases.has(track.videoId)) return canvases.get(track.videoId)!;
  const hits = await bridge().call('spotify.searchTracks', { query: `${track.title} ${track.artist}` }, { timeoutMs: 20_000 });
  const pick = best(
    hits.map((h) => ({
      title: h.title,
      artist: h.artist,
      durationSec: h.durationMs > 0 ? Math.round(h.durationMs / 1000) : null,
      album: h.album,
      id: h.id,
    })),
    { title: track.title, artist: track.artist, durationSec: track.durationSec > 0 ? Math.round(track.durationSec) : null },
  );
  const url = pick ? (await bridge().call('spotify.canvas', { trackId: pick.id }, { timeoutMs: 20_000 })).url : null;
  canvases.set(track.videoId, url);
  if (canvases.size > 200) canvases.delete(canvases.keys().next().value!);
  return url;
}

export async function syncFavoriteToSpotify(
  track: { videoId?: string; title: string; artist: string; durationSec?: number },
  liked: boolean,
): Promise<boolean> {
  try {
    const b = bridge();
    const cleanTitle = track.title.replace(/\s*[([](?:official|music|video|audio|lyrics?|sub\s*español|hd|4k)[^)\]]*[)\]]/gi, '').trim();
    const cleanArtist = track.artist.replace(/\b(?:vevo|official|topic)\b/gi, '').trim();
    let hits = await b.call('spotify.searchTracks', { query: `${cleanTitle} ${cleanArtist}` }, { timeoutMs: 15_000 }).catch(() => []);
    if (!hits || !hits.length) {
      hits = await b.call('spotify.searchTracks', { query: cleanTitle }, { timeoutMs: 15_000 }).catch(() => []);
    }
    if (!hits || !hits.length) return false;
    const pick = best(
      hits.map((h) => ({
        title: h.title,
        artist: h.artist,
        durationSec: h.durationMs > 0 ? Math.round(h.durationMs / 1000) : null,
        album: h.album,
        id: h.id,
      })),
      { title: track.title, artist: track.artist, durationSec: track.durationSec && track.durationSec > 0 ? Math.round(track.durationSec) : null },
    );
    const targetId = pick?.id ?? hits[0]?.id;
    if (!targetId) return false;
    const ok = await b.call('spotify.likeTrack', { trackId: targetId, liked }, { timeoutMs: 15_000 });
    // Instantly invalidate Spotify liked songs cache so the app updates immediately
    void queryClient.invalidateQueries({ queryKey: ['spotify', 'data', 'playlist', 'liked'] });
    void queryClient.invalidateQueries({ queryKey: ['spotify', 'data', 'playlists'] });
    return ok;
  } catch {
    return false;
  }
}

export async function createSpotifyPlaylist(
  title: string,
  description?: string,
  trackUris?: string[],
): Promise<{ id: string; url: string } | null> {
  try {
    const b = bridge();
    const res = await b.call('spotify.createPlaylist', { title, description, trackUris }, { timeoutMs: 20_000 });
    // Instantly invalidate Spotify playlists queries
    void queryClient.invalidateQueries({ queryKey: ['spotify', 'data', 'playlists'] });
    return res;
  } catch {
    return null;
  }
}

export async function addTracksToSpotifyPlaylist(
  playlistId: string,
  trackUrisOrIds: string[],
  trackMeta?: { title: string; artist: string },
): Promise<boolean> {
  try {
    const b = bridge();
    let uris: string[] = [];
    for (const item of trackUrisOrIds) {
      if (item.startsWith('spotify:track:')) {
        uris.push(item);
      } else if (item.startsWith('spotify:')) {
        uris.push(`spotify:track:${item.replace(/^spotify:/, '')}`);
      } else if (/^[a-zA-Z0-9]{22}$/.test(item)) {
        uris.push(`spotify:track:${item}`);
      } else if (trackMeta?.title && trackMeta?.artist) {
        // Resolve YouTube / generic track to Spotify track ID with clean query fallback
        const cleanTitle = trackMeta.title.replace(/\s*[([](?:official|music|video|audio|lyrics?|sub\s*español|hd|4k)[^)\]]*[)\]]/gi, '').trim();
        const cleanArtist = trackMeta.artist.replace(/\b(?:vevo|official|topic)\b/gi, '').trim();
        let hits = await b.call('spotify.searchTracks', { query: `${cleanTitle} ${cleanArtist}` }, { timeoutMs: 15_000 }).catch(() => []);
        if (!hits || !hits.length) {
          hits = await b.call('spotify.searchTracks', { query: cleanTitle }, { timeoutMs: 15_000 }).catch(() => []);
        }
        if (hits && hits[0]?.id) {
          uris.push(`spotify:track:${hits[0].id}`);
        }
      }
    }
    if (!uris.length) return false;
    const ok = await b.call('spotify.addTracksToPlaylist', { playlistId, trackUris: uris }, { timeoutMs: 20_000 });
    // Invalidate TanStack query cache and in-memory row cache
    void queryClient.invalidateQueries({ queryKey: ['spotify', 'data', 'playlist', playlistId] });
    void queryClient.invalidateQueries({ queryKey: ['spotify', 'data', 'playlists'] });
    const { invalidateSpotifyPlaylistRows } = await import('./queries');
    invalidateSpotifyPlaylistRows(playlistId);
    return ok;
  } catch {
    return false;
  }
}

export async function followSpotifyPlaylist(playlist: SpotifyPlaylist): Promise<boolean> {
  try {
    const b = bridge();
    await b.call('spotify.followPlaylist', { playlist, playlistId: playlist.id }, { timeoutMs: 15_000 });
    void queryClient.invalidateQueries({ queryKey: ['spotify'] });
    return true;
  } catch {
    return false;
  }
}

export async function unfollowSpotifyPlaylist(playlistId: string): Promise<boolean> {
  try {
    const b = bridge();
    await b.call('spotify.unfollowPlaylist', { playlistId }, { timeoutMs: 15_000 });
    void queryClient.invalidateQueries({ queryKey: ['spotify'] });
    return true;
  } catch {
    return false;
  }
}
