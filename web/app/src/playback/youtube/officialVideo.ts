import { getInnertube } from './innertube';

/** Words indicating bootlegs, fan reuploads, tiktok versions, karaoke, covers, reactions, or bad quality */
const BOOTLEG_PATTERNS = [
  /\b(?:lyrics?|lyric\s*video|sub\s*español|sub\s*espanol|subtitulad[oa]|traducid[oa]|letra|tradução)\b/i,
  /\b(?:tiktok|tik\s*tok|1\s*hour|loop|karaoke|cover|dance|reaction|remix|parody|slowed|reverb|nightcore|8d|bass\s*boosted)\b/i,
  /\b(?:instrumental|backing\s*track|unofficial|leak|snippet|sped\s*up|speed\s*up|speedup|amv|edit|shorts?)\b/i,
];

/** Clean string for comparison */
function clean(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(?:vevo|official|music|records|recordings|channel|topic|visualizer|video)\b/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/** Check if channel looks like an official artist channel, label, or VEVO */
function isOfficialChannel(channelName: string, artists: string[]): boolean {
  const cn = clean(channelName);
  if (!cn) return false;

  // Major record labels and authentic video directors/distributors
  const MAJOR_LABELS = [
    'atlanticrecords', 'columbiarecords', 'warnermusic', 'universalmusic', 'republicrecords',
    'interscope', 'rcarecords', 'defjam', 'lyricallemonade', 'worldstarhiphop', 'spinninrecords',
    'fueledbyramen', 'epitaphrecords', 'sumerian', 'sonymusic', 'vevo'
  ];
  if (MAJOR_LABELS.some((l) => cn.includes(l))) return true;

  return artists.some((a) => {
    const ca = clean(a);
    return ca && (cn.includes(ca) || ca.includes(cn));
  });
}

const memoryCache = new Map<string, string | null>();

function getCachedVideo(key: string): string | null | undefined {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = localStorage.getItem(`mellow:video:${key}`);
    if (raw !== null) {
      memoryCache.set(key, raw || null);
      return raw || null;
    }
  } catch {}
  return undefined;
}

function setCachedVideo(key: string, id: string | null) {
  memoryCache.set(key, id);
  try {
    localStorage.setItem(`mellow:video:${key}`, id || '');
  } catch {}
}

/**
 * Searches YouTube for the legitimate official music video of a song.
 * Uses smart heuristic scoring to select authentic music videos and avoid fan edits.
 */
export async function findOfficialMusicVideo(
  title: string,
  artist: string,
  durationSec?: number | null,
): Promise<string | null> {
  const cacheKey = `${title.toLowerCase()}:::${artist.toLowerCase()}`;
  const cached = getCachedVideo(cacheKey);
  if (cached !== undefined) return cached;

  const cleanTitle = title
    .replace(/\s*[([](?:official|music|video|audio|lyrics?|sub\s*español|hd|4k)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([](?:feat\.?|ft\.?|with)\s+[^)\]]+[)\]]/gi, '')
    .replace(/\s*-\s*.*$/, '') // Remove secondary hyphens
    .trim();

  // Split artist names (e.g. "IDK, Eminem, J Dilla" -> ["IDK", "Eminem", "J Dilla"])
  const artistParts = artist
    .split(/[,&/]|(?:\s+(?:feat\.?|ft\.?|with|and|x)\s+)/i)
    .map((a) => a.trim())
    .filter(Boolean);

  const primaryArtist = artistParts[0] || artist;

  const queries = [
    `${cleanTitle} ${primaryArtist} official music video`,
    `${cleanTitle} ${artist} official music video`,
    `${cleanTitle} ${primaryArtist} official video`,
    `${title} official video`,
  ];

  try {
    const yt = await getInnertube();
    const candidates: { id: string; title: string; author: string; score: number }[] = [];
    const seenIds = new Set<string>();

    for (const q of queries) {
      try {
        const search = await yt.search(q);
        const videos = search.videos ?? [];
        for (const v of videos.slice(0, 8)) {
          const vid = v as any;
          const id = vid.id;
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);

          const vTitle = vid.title?.text || vid.title?.toString() || '';
          const author = vid.author?.name || vid.author?.toString() || '';
          const isOfficialArtist = !!(vid.author?.is_official_artist || vid.author?.is_verified);
          const durSec = vid.duration?.seconds ?? null;

          let score = 0;
          const lowerTitle = vTitle.toLowerCase();

          // Reject bootlegs, lyric videos, TikTok edits immediately
          let hasBootleg = false;
          for (const pattern of BOOTLEG_PATTERNS) {
            if (pattern.test(lowerTitle)) {
              hasBootleg = true;
              break;
            }
          }
          if (hasBootleg) continue;

          // 1. Author scoring
          const channelOfficial = isOfficialChannel(author, [artist, ...artistParts]);
          if (channelOfficial) {
            score += 60;
          } else if (isOfficialArtist) {
            score += 45;
          } else {
            score -= 20;
          }

          // 2. Title matching
          const cleanVTitle = clean(vTitle);
          const cleanTarget = clean(cleanTitle);
          if (cleanVTitle.includes(cleanTarget)) {
            score += 35;
          } else {
            continue;
          }

          if (lowerTitle.includes('official music video') || lowerTitle.includes('official video')) {
            score += 30;
          } else if (lowerTitle.includes('music video') || lowerTitle.includes('m/v')) {
            score += 20;
          } else if (lowerTitle.includes('official audio') || lowerTitle.includes('audio')) {
            score -= 15;
          }

          // 3. Duration match (official videos are close to track length, ±45s)
          if (durationSec && durSec) {
            const diff = Math.abs(durSec - durationSec);
            if (diff <= 25) score += 20;
            else if (diff <= 60) score += 10;
            else if (diff > 120) score -= 30;
          }

          candidates.push({ id, title: vTitle, author, score });
          // Fast path: high confidence match returns immediately
          if (score >= 65) {
            setCachedVideo(cacheKey, id);
            return id;
          }
        }
      } catch {}

      if (candidates.some((c) => c.score >= 55)) break;
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    if (best && best.score >= 35) {
      setCachedVideo(cacheKey, best.id);
      return best.id;
    }
  } catch (err) {
    console.warn('[Mellow] Failed to search official video:', err);
  }

  setCachedVideo(cacheKey, null);
  return null;
}
