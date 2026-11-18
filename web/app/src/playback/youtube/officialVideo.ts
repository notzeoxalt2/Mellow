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
    .replace(/\b(?:vevo|official|music|records|recordings|channel|topic)\b/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/** Check if channel looks like an official artist channel, label, or VEVO */
function isOfficialChannel(channelName: string, targetArtist: string): boolean {
  const cn = clean(channelName);
  const ta = clean(targetArtist);
  if (!cn || !ta) return false;

  // Major record labels that host official music videos
  const MAJOR_LABELS = ['atlanticrecords', 'columbiarecords', 'warnermusic', 'universalmusic', 'republicrecords', 'interscope', 'rcarecords', 'defjam'];
  if (MAJOR_LABELS.some((l) => cn.includes(l))) return true;

  return cn.includes(ta) || ta.includes(cn);
}

const videoCache = new Map<string, string | null>();

/**
 * Searches YouTube for the legitimate official music video of a song.
 * Uses strict heuristic scoring to prevent selecting fan bootlegs, TikTok edits, lyric videos, or reuploads.
 * If no authentic official video exists, returns null rather than displaying poor-quality reuploads.
 */
export async function findOfficialMusicVideo(
  title: string,
  artist: string,
  durationSec?: number | null,
): Promise<string | null> {
  const cacheKey = `${title.toLowerCase()}:::${artist.toLowerCase()}`;
  if (videoCache.has(cacheKey)) {
    return videoCache.get(cacheKey)!;
  }

  const cleanTitle = title
    .replace(/\s*[([](?:official|music|video|audio|lyrics?|sub\s*español|hd|4k)[^)\]]*[)\]]/gi, '')
    .replace(/\s*-\s*.*$/, '') // Remove secondary hyphens
    .trim();

  const queries = [
    `"${cleanTitle}" "${artist}" official music video`,
    `${cleanTitle} ${artist} official video`,
  ];

  try {
    const yt = await getInnertube();
    const candidates: { id: string; title: string; author: string; score: number }[] = [];

    for (const q of queries) {
      try {
        const search = await yt.search(q);
        const videos = search.videos ?? [];
        for (const v of videos.slice(0, 10)) {
          const vid = v as any;
          const id = vid.id;
          if (!id) continue;
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
          const channelOfficial = isOfficialChannel(author, artist);
          if (channelOfficial) {
            score += 65;
          } else if (isOfficialArtist) {
            score += 45;
          } else {
            // Unrelated author (e.g. "Marco Antonio", "AnimeEdits") -> strictly penalize
            score -= 60;
          }

          // 2. Title matching
          const cleanVTitle = clean(vTitle);
          const cleanTarget = clean(cleanTitle);
          if (cleanVTitle.includes(cleanTarget)) {
            score += 35;
          } else {
            // Title doesn't even contain the track name -> skip
            continue;
          }

          if (lowerTitle.includes('official music video') || lowerTitle.includes('official video')) {
            score += 30;
          } else if (lowerTitle.includes('official audio') || lowerTitle.includes('audio')) {
            score -= 15;
          }

          // 3. Duration match (official videos are close to track length, ±45s)
          if (durationSec && durSec) {
            const diff = Math.abs(durSec - durationSec);
            if (diff <= 25) score += 20;
            else if (diff <= 60) score += 10;
            else if (diff > 100) score -= 40;
          }

          candidates.push({ id, title: vTitle, author, score });
        }
      } catch {}

      if (candidates.some((c) => c.score >= 70)) break;
    }

    // Sort by highest score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // High threshold ensures only authentic official releases are selected
    if (best && best.score >= 50) {
      videoCache.set(cacheKey, best.id);
      return best.id;
    }
  } catch (err) {
    console.warn('[Mellow] Failed to search official video:', err);
  }

  videoCache.set(cacheKey, null);
  return null;
}
