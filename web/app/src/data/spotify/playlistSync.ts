import type { SpotifyTrack } from '@bitchord/shared/bridge';
import { addManyToPlaylist, createPlaylist } from '@/data/music/api';
import type { Track } from '@/data/music/types';

const STORAGE_KEY = 'mellow:spotify-playlist-syncs';

export interface PlaylistSyncRecord {
  account: string;
  spotifyPlaylistId: string;
  spotifyTitle: string;
  youtubePlaylistId: string;
  sourceTrackKeys: string[];
  createdAt: number;
  lastSyncedAt: number;
  lastAdded: number;
  lastUnmatched: number;
}

export interface PlaylistMatch {
  spotifyKey: string;
  videoId: string;
}

function readAll(): PlaylistSyncRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PlaylistSyncRecord =>
      !!item && typeof item === 'object' &&
      typeof item.account === 'string' && typeof item.spotifyPlaylistId === 'string' &&
      typeof item.youtubePlaylistId === 'string' && Array.isArray(item.sourceTrackKeys),
    );
  } catch {
    return [];
  }
}

export function listPlaylistSyncs(account: string): PlaylistSyncRecord[] {
  return readAll().filter((item) => item.account === account);
}

export function findPlaylistSync(account: string, spotifyPlaylistId: string): PlaylistSyncRecord | null {
  return listPlaylistSyncs(account).find((item) => item.spotifyPlaylistId === spotifyPlaylistId) ?? null;
}

function save(record: PlaylistSyncRecord): void {
  const records = readAll().filter((item) => !(item.account === record.account && item.spotifyPlaylistId === record.spotifyPlaylistId));
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...records, record]));
  window.dispatchEvent(new CustomEvent('mellow:playlist-syncs-changed'));
}

export function unlinkPlaylistSync(account: string, spotifyPlaylistId: string): void {
  const records = readAll().filter((item) => !(item.account === account && item.spotifyPlaylistId === spotifyPlaylistId));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent('mellow:playlist-syncs-changed'));
}

/** Stable keys preserve intentional duplicate tracks in a Spotify playlist. */
export function spotifyTrackKeys(tracks: SpotifyTrack[]): string[] {
  const occurrences = new Map<string, number>();
  return tracks.map((track) => {
    const occurrence = occurrences.get(track.id) ?? 0;
    occurrences.set(track.id, occurrence + 1);
    return `${track.id}:${occurrence}`;
  });
}

/**
 * Creates a private YouTube Music copy on first sync, then appends newly
 * matched Spotify tracks. Deletions in Spotify never remove songs from YTM.
 */
export async function syncSpotifyPlaylist(input: {
  account: string;
  spotifyPlaylistId: string;
  title: string;
  spotifyTracks: SpotifyTrack[];
  youtubeTracks: Track[];
}): Promise<PlaylistSyncRecord> {
  const prior = findPlaylistSync(input.account, input.spotifyPlaylistId);
  const keys = spotifyTrackKeys(input.spotifyTracks);
  const known = new Set(prior?.sourceTrackKeys ?? []);
  const matched: PlaylistMatch[] = [];
  let unmatched = 0;

  input.spotifyTracks.forEach((spotify, index) => {
    const youtube = input.youtubeTracks[index];
    if (!youtube || youtube.unavailable || !youtube.videoId || youtube.videoId.startsWith('spotify:')) {
      unmatched++;
      return;
    }
    if (!known.has(keys[index]!)) matched.push({ spotifyKey: keys[index]!, videoId: youtube.videoId });
  });

  if (!prior && !matched.length) throw new Error('No Spotify tracks matched on YouTube Music yet.');
  const youtubePlaylistId = prior?.youtubePlaylistId ?? await createPlaylist(input.title, matched.map((item) => item.videoId), 'Synced from Spotify with Mellow');
  if (prior && matched.length) await addManyToPlaylist(youtubePlaylistId, matched.map((item) => item.videoId));

  const record: PlaylistSyncRecord = {
    account: input.account,
    spotifyPlaylistId: input.spotifyPlaylistId,
    spotifyTitle: input.title,
    youtubePlaylistId,
    sourceTrackKeys: [...known, ...matched.map((item) => item.spotifyKey)],
    createdAt: prior?.createdAt ?? Date.now(),
    lastSyncedAt: Date.now(),
    lastAdded: matched.length,
    lastUnmatched: unmatched,
  };
  save(record);
  return record;
}
