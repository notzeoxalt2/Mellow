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

/** Select the largest image by width/height from Spotify's sources for peak original artwork resolution */
export function largestImage(sources: any[] | undefined): string | null {
  if (!Array.isArray(sources) || !sources.length) return null;
  let best: { url: string; width: number } | null = null;
  for (const s of sources) {
    if (!s?.url) continue;
    const w = typeof s.width === 'number' ? s.width : (typeof s.height === 'number' ? s.height : 0);
    if (!best || w > best.width) {
      best = { url: s.url, width: w };
    }
  }
  return best?.url ?? sources[0]?.url ?? null;
}

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
  clientId?: string;
}

let cachedToken: MintedToken | null = null;
let cachedClientToken: { token: string; expiresAt: number } | null = null;

export async function mintClientToken(spDc: string): Promise<string | null> {
  if (cachedClientToken && Date.now() < cachedClientToken.expiresAt - 30_000) {
    return cachedClientToken.token;
  }
  try {
    await mintAccessToken(spDc);
    const clientId = cachedToken?.clientId || 'd8a5dc304d63477f88f4d614bd3ae76c';
    const res = await fetch('https://clienttoken.spotify.com/v1/clienttoken', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_data: {
          client_version: '1.2.56.502.ga68d2d4f',
          client_id: clientId,
          js_sdk_data: {
            device_brand: 'unknown',
            device_model: 'unknown',
            os: 'windows',
            os_version: 'unknown',
            device_id: crypto.randomUUID().replaceAll('-', ''),
            device_type: 'computer',
          },
        },
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as any;
    if (body.response_type === 'RESPONSE_GRANTED_TOKEN_RESPONSE' && body.granted_token?.token) {
      cachedClientToken = {
        token: body.granted_token.token,
        expiresAt: Date.now() + (body.granted_token.expires_after_seconds ?? 3600) * 1000,
      };
      return cachedClientToken.token;
    }
  } catch {}
  return null;
}

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

  const data = (await response.json()) as { accessToken?: string; accessTokenExpirationTimestampMs?: number; clientId?: string; totpVerExpired?: boolean };
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
    clientId: data.clientId,
  };

  return cachedToken.token;
}

async function queryGraphQL(spDc: string, operation: Operation, variables: Record<string, unknown>): Promise<any> {
  const token = await mintAccessToken(spDc);
  const clientTok = await mintClientToken(spDc).catch(() => null);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json;charset=UTF-8',
    'App-Platform': 'WebPlayer',
  };
  if (clientTok) {
    headers['Client-Token'] = clientTok;
  }
  const response = await fetch(PATHFINDER, {
    method: 'POST',
    headers,
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
        const image = largestImage(item.images?.items?.[0]?.sources);
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
  const image = largestImage(playlist?.images?.items?.[0]?.sources);

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
          imageUrl: largestImage(track.albumOfTrack?.coverArt?.sources),
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
        imageUrl: largestImage(track.albumOfTrack?.coverArt?.sources),
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
          imageUrl: largestImage(track.albumOfTrack?.coverArt?.sources),
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

    // 2. Fallback to canvaz-cache protobuf endpoint (works across all regions including Pakistan)
    const token = await mintAccessToken(spDc);
    const clientTok = await mintClientToken(spDc).catch(() => null);
    const uriBytes = Buffer.from(trackUri, 'utf8');
    const trackMsg = Buffer.concat([Buffer.from([0x0a, uriBytes.length]), uriBytes]);
    const rootMsg = Buffer.concat([Buffer.from([0x0a, trackMsg.length]), trackMsg]);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Spotify/9.0.34.593 iOS/18.4 (iPhone15,3)',
      'Content-Type': 'application/protobuf',
      Accept: 'application/protobuf',
      'Accept-Language': 'en',
    };
    if (clientTok) {
      headers['Client-Token'] = clientTok;
    }

    const resp = await fetch('https://spclient.wg.spotify.com/canvaz-cache/v0/canvases', {
      method: 'POST',
      headers,
      body: rootMsg,
    });

    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      const text = buf.toString('latin1');
      const matches = [...text.matchAll(/https:\/\/[^"'\s\x00-\x1F]+\.(?:cnvs\.mp4|mp4)/g)].map((m) => m[0]);
      if (matches.length > 0) {
        // Select the highest quality stream: prioritize 1080p, 720p, or official .cnvs.mp4 stream
        const bestUrl = matches.find((u) => u.includes('1080') || u.includes('1080p') || u.includes('hd'))
          ?? matches.find((u) => u.includes('720') || u.includes('720p'))
          ?? matches.find((u) => u.endsWith('.cnvs.mp4'))
          ?? matches[matches.length - 1];
        return { url: bestUrl };
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
          const isPlaylist = uri.startsWith('spotify:playlist:');
          const isAlbum = uri.startsWith('spotify:album:');
          if (!isPlaylist && !isAlbum) return null;
          const id = uri.split(':').pop() || d.id || '';
          if (!id) return null;
          const image =
            d.images?.items?.[0]?.sources?.[0]?.url ||
            d.coverArt?.sources?.[0]?.url ||
            d.attributes?.find((a: any) => a.key === 'image_url')?.value ||
            null;
          return {
            id,
            name: d.name || (isAlbum ? 'Spotify Album' : 'Spotify Playlist'),
            owner: d.ownerV2?.data?.name || d.artists?.items?.[0]?.profile?.name || (isAlbum ? 'Album' : 'Spotify'),
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
      .filter((section: { title: string; playlists: SpotifyPlaylist[] }) => section.title && section.playlists.length >= 3);

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

/** Like or unlike a track in the user's Spotify Liked Songs library. */
export async function likeTrack(spDc: string, trackId: string, liked: boolean): Promise<boolean> {
  try {
    const token = await mintAccessToken(spDc);
    const cleanId = trackId.replace(/^spotify:track:/, '');
    const method = liked ? 'PUT' : 'DELETE';

    // 1. Try modern /v1/me/library?uris=spotify:track:... endpoint
    try {
      const libRes = await fetch(`https://api.spotify.com/v1/me/library?uris=${encodeURIComponent(`spotify:track:${cleanId}`)}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
      if (libRes.ok) return true;
    } catch {}

    // 2. Try /v1/me/tracks with JSON body
    try {
      const bodyRes = await fetch(`https://api.spotify.com/v1/me/tracks`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ ids: [cleanId] }),
      });
      if (bodyRes.ok) return true;
    } catch {}

    // 3. Fallback to query param
    const response = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${encodeURIComponent(cleanId)}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    return response.ok;
  } catch (err: any) {
    console.warn('[Mellow] Failed to like track on Spotify:', err?.message);
    return false;
  }
}

/** Create a playlist on Spotify with optional initial tracks. */
export async function createPlaylist(
  spDc: string,
  title: string,
  description = 'Created with Mellow',
  trackUris?: string[],
): Promise<{ id: string; url: string } | null> {
  try {
    const token = await mintAccessToken(spDc);
    let userId = '';
    try {
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (meRes.ok) {
        const meData = (await meRes.json()) as { id?: string };
        userId = meData.id || '';
      }
    } catch {}

    const url = userId
      ? `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`
      : 'https://api.spotify.com/v1/me/playlists';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        name: title,
        description,
        public: false,
      }),
    });

    if (!res.ok) return null;
    const created = (await res.json()) as { id: string; external_urls?: { spotify?: string } };
    const playlistId = created.id;
    const playlistUrl = created.external_urls?.spotify || `https://open.spotify.com/playlist/${playlistId}`;

    if (trackUris && trackUris.length > 0) {
      const uris = trackUris.map((u) => (u.startsWith('spotify:track:') ? u : `spotify:track:${u}`));
      await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ uris }),
      }).catch(() => undefined);
    }

    return { id: playlistId, url: playlistUrl };
  } catch (err: any) {
    console.warn('[Mellow] Failed to create playlist on Spotify:', err?.message);
    return null;
  }
}

/** Add tracks to an existing playlist on Spotify. */
export async function addTracksToPlaylist(
  spDc: string,
  playlistId: string,
  trackUris: string[],
): Promise<boolean> {
  try {
    const token = await mintAccessToken(spDc);
    const cleanPlaylistId = playlistId.replace(/^spotify:playlist:/, '');
    const uris = trackUris.map((u) => (u.startsWith('spotify:track:') ? u : `spotify:track:${u}`));
    const res = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(cleanPlaylistId)}/tracks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ uris }),
    });
    return res.ok;
  } catch (err: any) {
    console.warn('[Mellow] Failed to add tracks to Spotify playlist:', err?.message);
    return false;
  }
}

export interface SpotifyUserResult {
  id: string;
  name: string;
  username: string;
  imageUrl: string | null;
  uri: string;
}

/** Full Spotify Search across tracks, playlists, albums, artists, and users */
export async function searchSpotifyAll(spDc: string, query: string): Promise<{
  tracks: SpotifyTrack[];
  playlists: SpotifyPlaylist[];
  albums: { id: string; name: string; artist: string; imageUrl: string | null; totalTracks: number }[];
  artists: { id: string; name: string; imageUrl: string | null; followers: number }[];
  users: SpotifyUserResult[];
}> {
  try {
    const token = await mintAccessToken(spDc);
    const hash = '0dff51c99e552b992377a2a6f40d213dc42b62db86ca0bcf16cf3934aec1aae6';
    const vars = {
      searchTerm: query,
      offset: 0,
      limit: 20,
      numberOfTopResults: 5,
      includeAudiobooks: false,
      includeArtistHasConcertsField: false,
      includePreReleases: false,
      includeLocalConcertsField: false,
    };
    const url = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=searchDesktop&variables=${encodeURIComponent(JSON.stringify(vars))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const json = await res.json();
      const s = json.data?.searchV2;
      if (s) {
        const tracks: SpotifyTrack[] = (s.tracks?.items ?? []).map((wrapper: any) => {
          const t = wrapper.data ?? wrapper;
          return {
            id: t.id ?? (t.uri ? t.uri.replace('spotify:track:', '') : ''),
            title: t.name ?? '',
            artist: t.artists?.items?.map((a: any) => a.profile?.name ?? a.name).filter(Boolean).join(', ') ?? '',
            album: t.albumOfTrack?.name ?? t.album?.name ?? '',
            durationMs: t.duration?.totalMilliseconds ?? t.duration_ms ?? 0,
            imageUrl: t.albumOfTrack?.coverArt?.sources?.[0]?.url ?? largestImage(t.album?.images),
            uri: t.uri,
          };
        });

        const playlists: SpotifyPlaylist[] = (s.playlists?.items ?? [])
          .filter(Boolean)
          .map((wrapper: any) => {
            const p = wrapper.data ?? wrapper;
            const uri = p.uri ?? '';
            return {
              id: uri.replace('spotify:playlist:', ''),
              name: p.name ?? 'Untitled Playlist',
              imageUrl: p.images?.items?.[0]?.sources?.[0]?.url ?? largestImage(p.images),
              owner: p.owner?.name ?? p.owner?.display_name ?? 'Spotify',
              total: 0,
            };
          });

        const albums = (s.albums?.items ?? []).map((wrapper: any) => {
          const a = wrapper.data ?? wrapper;
          const uri = a.uri ?? '';
          return {
            id: uri.replace('spotify:album:', ''),
            name: a.name ?? '',
            artist: a.artists?.items?.map((art: any) => art.profile?.name ?? art.name).filter(Boolean).join(', ') ?? '',
            imageUrl: a.coverArt?.sources?.[0]?.url ?? largestImage(a.images),
            totalTracks: 0,
          };
        });

        const artists = (s.artists?.items ?? []).map((wrapper: any) => {
          const a = wrapper.data ?? wrapper;
          const uri = a.uri ?? '';
          return {
            id: uri.replace('spotify:artist:', ''),
            name: a.profile?.name ?? a.name ?? '',
            imageUrl: a.visuals?.avatarImage?.sources?.[0]?.url ?? largestImage(a.images),
            followers: 0,
          };
        });

        const users: SpotifyUserResult[] = (s.users?.items ?? []).map((wrapper: any) => {
          const u = wrapper.data ?? wrapper;
          return {
            id: u.id ?? (u.uri ? u.uri.replace('spotify:user:', '') : ''),
            name: u.displayName ?? u.username ?? 'User',
            username: u.username ?? '',
            imageUrl: u.image?.largeImageUrl ?? u.image?.smallImageUrl ?? null,
            uri: u.uri ?? '',
          };
        });

        return { tracks, playlists, albums, artists, users };
      }
    }

    const v1Res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track,playlist,album,artist&limit=15`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    );
    if (!v1Res.ok) return { tracks: [], playlists: [], albums: [], artists: [], users: [] };
    const data = await v1Res.json();

    const tracks: SpotifyTrack[] = (data.tracks?.items ?? []).map((t: any) => ({
      id: t.id,
      title: t.name,
      artist: t.artists?.map((a: any) => a.name).join(', ') ?? '',
      album: t.album?.name ?? '',
      durationMs: t.duration_ms ?? 0,
      imageUrl: largestImage(t.album?.images),
    }));

    const playlists: SpotifyPlaylist[] = (data.playlists?.items ?? [])
      .filter(Boolean)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        imageUrl: largestImage(p.images),
        owner: p.owner?.display_name ?? null,
        total: p.tracks?.total ?? 0,
      }));

    const albums = (data.albums?.items ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      artist: a.artists?.map((art: any) => art.name).join(', ') ?? '',
      imageUrl: largestImage(a.images),
      totalTracks: a.total_tracks ?? 0,
    }));

    const artists = (data.artists?.items ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      imageUrl: largestImage(a.images),
      followers: a.followers?.total ?? 0,
    }));

    return { tracks, playlists, albums, artists, users: [] };
  } catch (err: any) {
    console.warn('[Mellow] Spotify searchAll failed:', err?.message);
    return { tracks: [], playlists: [], albums: [], artists: [], users: [] };
  }
}

/** Fetch followed artists from Spotify library */
export async function fetchFollowedArtists(spDc: string): Promise<{ id: string; name: string; imageUrl: string | null; followers: number }[]> {
  try {
    const token = await mintAccessToken(spDc);
    const res = await fetch('https://api.spotify.com/v1/me/following?type=artist&limit=50', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      return (data?.artists?.items ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        imageUrl: largestImage(a.images),
        followers: a.followers?.total ?? 0,
      }));
    }
  } catch (e: any) {
    console.warn('[Mellow] fetchFollowedArtists via API failed, trying libraryV3:', e?.message);
  }

  // Fallback to libraryV3
  try {
    const data = await queryGraphQL(spDc, 'libraryV3', {
      filters: ['Artists'],
      order: 'Alphabetical',
      textFilter: '',
      features: [],
      limit: 50,
      offset: 0,
      flatten: false,
    });
    const rawItems = data?.data?.me?.libraryV3?.items ?? [];
    return rawItems
      .map((w: any) => {
        const item = w?.item?.data;
        if (!item) return null;
        const uri = item.uri ?? '';
        const id = uri ? uri.split(':').pop()! : (item.id ?? '');
        const name = item.profile?.name ?? item.name ?? '';
        const sources = item.visuals?.avatarImage?.sources;
        return {
          id,
          name,
          imageUrl: largestImage(sources),
          followers: 0,
        };
      })
      .filter((a: any): a is { id: string; name: string; imageUrl: string | null; followers: number } => !!a && !!a.id && !!a.name);
  } catch (err: any) {
    console.warn('[Mellow] fetchFollowedArtists failed:', err?.message);
    return [];
  }
}

/** Follow a playlist on Spotify */
export async function followPlaylist(spDc: string, playlistId: string): Promise<boolean> {
  try {
    const cleanId = playlistId.replace(/^spotify:playlist:/, '');
    const token = await mintAccessToken(spDc);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(cleanId)}/followers`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ public: false }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Unfollow a playlist on Spotify */
export async function unfollowPlaylist(spDc: string, playlistId: string): Promise<boolean> {
  try {
    const cleanId = playlistId.replace(/^spotify:playlist:/, '');
    const token = await mintAccessToken(spDc);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(cleanId)}/followers`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Report playing track to Spotify so it registers in user history and algorithm taste profile */
export async function reportPlaybackToSpotify(
  spDc: string,
  trackId: string,
  positionSec = 0,
): Promise<boolean> {
  try {
    const cleanId = trackId.replace(/^spotify:(?:track:)?/, '');
    if (!cleanId || cleanId.length !== 22) return false;
    const token = await mintAccessToken(spDc);
    const uri = `spotify:track:${cleanId}`;

    // 1. Report to Spotify player queue / recently played endpoint
    void fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }).catch(() => null);

    // 2. Send play event packet to Spotify telemetry and session tracker
    void fetch('https://event-service.spotify.com/v1/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [
          {
            type: 'track_played',
            uri,
            position_ms: Math.round(positionSec * 1000),
            timestamp: Date.now(),
          },
        ],
      }),
    }).catch(() => null);

    return true;
  } catch {
    return false;
  }
}
