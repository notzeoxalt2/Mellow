import type { SpotifyAuthState, SpotifyCategory, SpotifyPage, SpotifyPlaylist, SpotifyTrack } from '@bitchord/shared/bridge';
import crypto from 'node:crypto';

const WEB_PLAYER = 'https://open.spotify.com';
const PATHFINDER = 'https://api-partner.spotify.com/pathfinder/v2/query';
export const LIKED_ID = 'liked';

type Operation = 'libraryV3' | 'fetchPlaylist' | 'fetchLibraryTracks' | 'canvas' | 'searchTracks' | 'home' | 'profileAttributes';

const KNOWN_HASHES: Record<Operation, string> = {
  libraryV3: '390c78e5b951029bad359785e69b07b536a509c581cbcd0aded5e5067f187455',
  fetchPlaylist: '21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  canvas: '575138ab27cd5c1b3e54da54d0a7cc8d85485402de26340c2145f0f6bb5e7a9f',
  searchTracks: 'b02683192a98dde7966b5e6655a79eeb62713eab703eda9902c932818dd52751',
  home: '5fb7da7a03ee2776c0670856609cb85a189a3cecc36cc160b91cde79063b9cf1',
  profileAttributes: '08ffb4730af3746e04a8301396f20875dbbce10c75243803091a9274eacc8ac0',
};

let CURRENT_SECRET = {
  version: 61,
  codes: [
    44, 55, 47, 42, 70, 40, 34, 114,
    76, 74, 50, 111, 120, 97, 75, 76,
    94, 102, 43, 69, 49, 120, 118, 80,
    64, 78
  ]
};

async function refreshLiveSecret(): Promise<void> {
  try {
    const html = await (await fetch('https://open.spotify.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      }
    })).text();
    const bundleUrl = html.match(/https:\/\/open\.spotifycdn\.com\/cdn\/build\/web-player\/web-player\.[0-9a-f]+\.js/)?.[0];
    if (!bundleUrl) return;

    const bundle = await (await fetch(bundleUrl)).text();
    const secrets = [...bundle.matchAll(/\{secret:(['"])((?:\\.|(?!\1).)*)\1,version:(\d+)\}/g)]
      .map((m) => ({ version: Number(m[3]), codes: [...m[2]].map(c => c.charCodeAt(0)) }))
      .sort((a, b) => b.version - a.version);

    if (secrets[0] && secrets[0].version >= CURRENT_SECRET.version) {
      CURRENT_SECRET = secrets[0];
    }
  } catch (e: any) {
    console.warn('[Mellow] Could not refresh live Spotify secret:', e?.message);
  }
}

export function generateTotp(codes: number[], epochMs: number): string {
  const key = Buffer.from(codes.map((code, i) => code ^ ((i % 33) + 9)).join(''), 'utf8');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(epochMs / 1000 / 30)));
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counter);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1]! & 0x0f;
  const binary =
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

interface MintedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: MintedToken | null = null;

export async function mintAccessToken(spDc: string, retry = true): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const code = generateTotp(CURRENT_SECRET.codes, Date.now());
  const query = new URLSearchParams({
    reason: 'init',
    productType: 'web-player',
    totp: code,
    totpServer: code,
    totpVer: String(CURRENT_SECRET.version),
  });

  const response = await fetch(`${WEB_PLAYER}/api/token?${query.toString()}`, {
    headers: {
      Accept: 'application/json',
      Cookie: `sp_dc=${spDc}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    if (retry) {
      await refreshLiveSecret();
      return mintAccessToken(spDc, false);
    }
    throw new Error(`Failed to mint Spotify token: ${response.status}`);
  }

  const data = (await response.json()) as { accessToken?: string; accessTokenExpirationTimestampMs?: number; totpVerExpired?: boolean };
  if (data.totpVerExpired && retry) {
    await refreshLiveSecret();
    return mintAccessToken(spDc, false);
  }

  if (!data.accessToken) {
    throw new Error('Spotify did not return an access token');
  }

  cachedToken = {
    token: data.accessToken,
    expiresAt: data.accessTokenExpirationTimestampMs ?? Date.now() + 3600_000,
  };

  return cachedToken.token;
}

async function queryGraphQL(spDc: string, operation: Operation, variables: Record<string, unknown>): Promise<any> {
  const token = await mintAccessToken(spDc);
  const response = await fetch(PATHFINDER, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json;charset=UTF-8',
      'App-Platform': 'WebPlayer',
    },
    body: JSON.stringify({
      variables,
      operationName: operation,
      extensions: { persistedQuery: { version: 1, sha256Hash: KNOWN_HASHES[operation] } },
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify ${operation} request failed: ${response.status}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0 && !json.data) {
    throw new Error(`Spotify ${operation} error: ${json.errors[0]?.message ?? 'Unknown'}`);
  }

  return json;
}

export async function fetchSpotifyProfile(spDc: string): Promise<{ name: string; avatarUrl: string | null }> {
  const response = await queryGraphQL(spDc, 'profileAttributes', {});
  const profile = response?.data?.me?.profile;
  const image = profile?.avatar?.sources?.find((source: any) => typeof source?.url === 'string')?.url ?? null;
  return {
    name: typeof profile?.name === 'string' ? profile.name : typeof profile?.username === 'string' ? profile.username : 'Spotify',
    avatarUrl: image,
  };
}

export async function fetchPlaylists(spDc: string, offset = 0): Promise<SpotifyPage<SpotifyPlaylist>> {
  const data = await queryGraphQL(spDc, 'libraryV3', {
    filters: ['Playlists'],
    order: 'Alphabetical',
    textFilter: '',
    features: ['LIKED_SONGS'],
    limit: 50,
    offset,
    flatten: false,
  });

  const rawItems = data?.data?.me?.libraryV3?.items ?? [];
  const total = data?.data?.me?.libraryV3?.totalCount ?? rawItems.length;

  const items: SpotifyPlaylist[] = rawItems
    .map((wrapper: any) => {
      const item = wrapper?.item?.data;
      if (!item) return null;

      if (item.__typename === 'LikedTracksSection') {
        return {
          id: LIKED_ID,
          name: 'Liked Songs',
          owner: 'Spotify',
          imageUrl: 'https://misc.scdn.co/liked-songs/liked-songs-640.png',
        };
      }

      if (item.__typename === 'Playlist') {
        const uri = item.uri ?? '';
        const id = uri.split(':').pop() ?? '';
        const image = item.images?.items?.[0]?.sources?.[0]?.url ?? null;
        return {
          id,
          name: item.name ?? 'Untitled Playlist',
          owner: item.ownerV2?.data?.name ?? 'Spotify',
          imageUrl: image,
        };
      }

      return null;
    })
    .filter((p: any): p is SpotifyPlaylist => p !== null);

  // If offset === 0 and Liked Songs wasn't in library items, prepend Liked Songs
  if (offset === 0 && !items.some(p => p.id === LIKED_ID)) {
    items.unshift({
      id: LIKED_ID,
      name: 'Liked Songs',
      owner: 'Spotify',
      imageUrl: 'https://misc.scdn.co/liked-songs/liked-songs-640.png',
    });
  }

  return { items, total, raw: rawItems.length };
}

export async function fetchPlaylistInfo(spDc: string, playlistId: string): Promise<{ name: string; owner: string | null; imageUrl: string | null; total: number }> {
  if (playlistId === LIKED_ID) {
    const page = await fetchPlaylistTracks(spDc, LIKED_ID, 0);
    return {
      name: 'Liked Songs',
      owner: 'Spotify',
      imageUrl: 'https://misc.scdn.co/liked-songs/liked-songs-640.png',
      total: page.total,
    };
  }

  const data = await queryGraphQL(spDc, 'fetchPlaylist', {
    uri: `spotify:playlist:${playlistId}`,
    offset: 0,
    limit: 1,
    enableWatchFeedEntrypoint: false,
  });

  const playlist = data?.data?.playlistV2;
  const image = playlist?.images?.items?.[0]?.sources?.[0]?.url ?? null;

  return {
    name: playlist?.name ?? 'Spotify Playlist',
    owner: playlist?.ownerV2?.data?.name ?? 'Spotify',
    imageUrl: image,
    total: playlist?.content?.totalCount ?? 0,
  };
}

export async function fetchPlaylistTracks(spDc: string, playlistId: string, offset = 0): Promise<SpotifyPage<SpotifyTrack>> {
  if (playlistId === LIKED_ID) {
    const data = await queryGraphQL(spDc, 'fetchLibraryTracks', { offset, limit: 100 });
    const rawItems = data?.data?.me?.library?.tracks?.items ?? [];
    const total = data?.data?.me?.library?.tracks?.totalCount ?? rawItems.length;

    const items: SpotifyTrack[] = rawItems
      .map((entry: any) => {
        const track = entry?.track?.data;
        if (!track) return null;
        const uri = entry?.track?._uri ?? track.uri ?? '';
        const id = uri ? uri.split(':').pop()! : (track.id ?? '');
        return {
          id,
          title: track.name,
          artist: track.artists?.items?.map((a: any) => a.profile?.name).filter(Boolean).join(', ') ?? 'Unknown',
          album: track.albumOfTrack?.name ?? null,
          durationMs: track.duration?.totalMilliseconds ?? 0,
          imageUrl: track.albumOfTrack?.coverArt?.sources?.[0]?.url ?? null,
        };
      })
      .filter((t: any): t is SpotifyTrack => t !== null);

    return { items, total, raw: rawItems.length };
  }

  const data = await queryGraphQL(spDc, 'fetchPlaylist', {
    uri: `spotify:playlist:${playlistId}`,
    offset,
    limit: 100,
    enableWatchFeedEntrypoint: false,
  });

  const playlist = data?.data?.playlistV2;
  const rawItems = playlist?.content?.items ?? [];
  const total = playlist?.content?.totalCount ?? rawItems.length;

  const items: SpotifyTrack[] = rawItems
    .map((wrapper: any) => {
      const track = wrapper?.itemV2?.data;
      if (!track || track.__typename !== 'Track') return null;
      const uri = track.uri ?? '';
      const id = uri ? uri.split(':').pop()! : (track.id ?? '');
      return {
        id,
        title: track.name,
        artist: track.artists?.items?.map((a: any) => a.profile?.name).filter(Boolean).join(', ') ?? 'Unknown',
        album: track.albumOfTrack?.name ?? null,
        durationMs: track.trackDuration?.totalMilliseconds ?? track.duration?.totalMilliseconds ?? 0,
        imageUrl: track.albumOfTrack?.coverArt?.sources?.[0]?.url ?? null,
      };
    })
    .filter((t: any): t is SpotifyTrack => t !== null);

  return { items, total, raw: rawItems.length };
}

export async function searchTracks(spDc: string, query: string, offset = 0): Promise<SpotifyTrack[]> {
  try {
    const data = await queryGraphQL(spDc, 'searchTracks', {
      searchTerm: query,
      offset: Math.max(0, offset),
      limit: 10,
      numberOfTopResults: 8,
      includeAudiobooks: false,
      includePreReleases: false,
      includeAuthors: false,
    });
    const items = data?.data?.searchV2?.tracksV2?.items ?? [];
    return items
      .map((entry: any) => {
        const track = entry?.item?.data;
        if (!track || track.__typename !== 'Track') return null;
        const uri = track.uri ?? '';
        const id = uri ? uri.split(':').pop()! : (track.id ?? '');
        return {
          id,
          title: track.name,
          artist: track.artists?.items?.map((a: any) => a.profile?.name).filter(Boolean).join(', ') ?? 'Unknown',
          album: track.albumOfTrack?.name ?? null,
          durationMs: track.duration?.totalMilliseconds ?? track.trackDuration?.totalMilliseconds ?? 0,
          imageUrl: track.albumOfTrack?.coverArt?.sources?.[0]?.url ?? null,
        };
      })
      .filter((t: any): t is SpotifyTrack => t !== null);
  } catch (err) {
    console.warn('[Mellow] searchTracks failed:', err);
    return [];
  }
}

/** Spotify Browse taxonomy and its own category images (the Web API currently marks this legacy endpoint deprecated). */
export async function fetchSpotifyCategories(spDc: string): Promise<SpotifyCategory[]> {
  try {
    const token = await mintAccessToken(spDc);
    const response = await fetch('https://api.spotify.com/v1/browse/categories?limit=50&country=US&locale=en_US', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const data = await response.json() as { categories?: { items?: { id?: string; name?: string; icons?: { url?: string }[] }[] } };
    return (data.categories?.items ?? [])
      .filter((item): item is { id: string; name: string; icons?: { url?: string }[] } => !!item.id && !!item.name)
      .map((item) => ({ id: item.id, name: item.name, imageUrl: item.icons?.find((icon) => !!icon.url)?.url ?? null }));
  } catch (error) {
    console.warn('[Mellow] Spotify categories unavailable:', error instanceof Error ? error.message : 'request failed');
    return [];
  }
}

export async function fetchSpotifyCategoryPlaylists(spDc: string, categoryId: string): Promise<SpotifyPlaylist[]> {
  try {
    const token = await mintAccessToken(spDc);
    const response = await fetch(`https://api.spotify.com/v1/browse/categories/${encodeURIComponent(categoryId)}/playlists?limit=50&country=US`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const data = await response.json() as { playlists?: { items?: { id?: string; name?: string; owner?: { display_name?: string }; images?: { url?: string }[] }[] } };
    return (data.playlists?.items ?? [])
      .filter((item): item is { id: string; name: string; owner?: { display_name?: string }; images?: { url?: string }[] } => !!item.id && !!item.name)
      .map((item) => ({ id: item.id, name: item.name, owner: item.owner?.display_name ?? 'Spotify', imageUrl: item.images?.find((image) => !!image.url)?.url ?? null }));
  } catch (error) {
    console.warn('[Mellow] Spotify category playlists unavailable:', error instanceof Error ? error.message : 'request failed');
    return [];
  }
}

export async function fetchCanvas(spDc: string, trackId: string): Promise<{ url: string | null }> {
  try {
    const trackUri = trackId.startsWith('spotify:track:') ? trackId : `spotify:track:${trackId}`;
    
    // 1. Try Pathfinder GraphQL query
    try {
      const data = await queryGraphQL(spDc, 'canvas', {
        trackUri,
      });
      const url = data?.data?.trackUnion?.canvas?.url ?? null;
      if (url && /\.mp4(?:[?#]|$)/i.test(url)) {
        return { url };
      }
    } catch {}

    // 2. Fallback to canvaz-cache protobuf endpoint
    const token = await mintAccessToken(spDc);
    const uriBytes = Buffer.from(trackUri, 'utf8');
    const trackMsg = Buffer.concat([Buffer.from([0x0a, uriBytes.length]), uriBytes]);
    const rootMsg = Buffer.concat([Buffer.from([0x0a, trackMsg.length]), trackMsg]);

    const resp = await fetch('https://spclient.wg.spotify.com/canvaz-cache/v0/canvases', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Spotify/9.0.34.593 iOS/18.4 (iPhone15,3)',
        'Content-Type': 'application/protobuf',
        'Accept': 'application/protobuf',
      },
      body: rootMsg,
    });

    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      const text = buf.toString('latin1');
      const match = text.match(/https:\/\/[^"'\s\x00-\x1F]+\.cnvs\.mp4/);
      if (match) {
        return { url: match[0] };
      }
    }

    return { url: null };
  } catch {
    return { url: null };
  }
}

export async function fetchHomeSections(spDc: string): Promise<{
  madeForYou: SpotifyPlaylist[];
  recents: SpotifyPlaylist[];
  topMixes: SpotifyPlaylist[];
  sections: { title: string; playlists: SpotifyPlaylist[] }[];
}> {
  try {
    const data = await queryGraphQL(spDc, 'home', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      facet: null,
      sectionExternalId: null,
      homeEndUserIntegration: 'INTEGRATION_WEB_PLAYER',
      includeHomeChapterVideoCards: false,
      sectionItemsLimit: 12,
      includeEpisodeContentRatingsV2: false,
      sp_t: '',
    });

    const sections = data?.data?.home?.sectionContainer?.sections?.items || [];

    const parseSectionItems = (sec: any): SpotifyPlaylist[] => {
      if (!sec) return [];
      return (sec.sectionItems?.items || [])
        .map((i: any) => {
          const d = i.content?.data;
          if (!d) return null;
          const uri = d.uri || '';
          // Home also contains artist, album, podcast and video cards. The
          // playlist shelf can only open Spotify playlist URIs.
          if (!uri.startsWith('spotify:playlist:')) return null;
          const id = uri.split(':').pop() || d.id || '';
          if (!id) return null;
          const image =
            d.images?.items?.[0]?.sources?.[0]?.url ||
            d.coverArt?.sources?.[0]?.url ||
            d.attributes?.find((a: any) => a.key === 'image_url')?.value ||
            null;
          return {
            id,
            name: d.name || 'Spotify Playlist',
            owner: d.ownerV2?.data?.name || d.artists?.items?.[0]?.profile?.name || 'Spotify',
            imageUrl: image,
          };
        })
        .filter((p: any): p is SpotifyPlaylist => p !== null);
    };

    const getTitle = (s: any): string => {
      return (
        s.data?.title?.transformedLabel ||
        s.data?.title?.text ||
        (typeof s.data?.title === 'string' ? s.data?.title : '') ||
        ''
      ).toLowerCase();
    };

    const personalizedSections = sections
      .map((section: any) => ({
        title: String(section.data?.title?.transformedLabel || section.data?.title?.text || section.data?.title || '').trim(),
        playlists: parseSectionItems(section),
      }))
      .filter((section: { title: string; playlists: SpotifyPlaylist[] }) => section.title && section.playlists.length > 0);

    const s0 = sections[0];
    const madeFor = sections.find((s: any) => /made for/i.test(getTitle(s)));
    const recents = sections.find((s: any) => /recent|jump back|keep listening|replay/i.test(getTitle(s))) || s0;
    const topMixes = sections.find((s: any) => /mix|heavy rotation|for you/i.test(getTitle(s)));

    return {
      madeForYou: parseSectionItems(madeFor),
      recents: parseSectionItems(recents),
      topMixes: parseSectionItems(topMixes),
      sections: personalizedSections,
    };
  } catch (err: any) {
    console.warn('[Mellow] Failed to fetch Spotify home sections:', err?.message);
    return { madeForYou: [], recents: [], topMixes: [], sections: [] };
  }
}
