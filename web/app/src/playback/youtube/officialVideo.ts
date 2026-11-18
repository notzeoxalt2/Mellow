import { getInnertube, getMusicClient } from './innertube';

/** Words indicating bootlegs, fan reuploads, karaoke, covers, reactions, or bad quality */
const BOOTLEG_PATTERNS = [
  /\b(?:lyrics?|sub español|sub espanol|subtitulad[oa]|traducid[oa]|letra)\b/i,
  /\b(?:1\s*hour|loop|karaoke|cover|dance|reaction|remix|parody|slowed|reverb|nightcore|8d audio|bass boosted)\b/i,
  /\b(?:instrumental|backing track|audios|unofficial|leak|snippet)\b/i,
];

/** Clean artist name for comparison */
function cleanName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(?:vevo|official|music|records|channel|topic)\b/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/** Check if channel looks like an official artist channel or VEVO */
function isOfficialChannel(channelName: string, targetArtist: string): boolean {
  const cn = cleanName(channelName);
  const ta = cleanName(targetArtist);
  if (!cn || !ta) return false;
  return cn.includes(ta) || ta.includes(cn);
}

/**
 * Searches YouTube for the legitimate official music video of a song.
 * Uses strict heuristic scoring to prevent selecting fan bootlegs, lyric videos, or reuploads.
 */
export async function findOfficialMusicVideo(
  title: string,
  artist: string,
  durationSec?: number | null,
): Promise<string | null> {
  const cleanTitle = title.replace(/\s*[([](?:official|music|video|audio)[^)\]]*[)\]]/gi, '').trim();
  const queries = [
    `${cleanTitle} ${artist} official music video`,
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

          // 1. Author scoring
          if (isOfficialChannel(author, artist)) {
            score += 55;
          } else {
            // Unrelated author name (e.g. "Marco Antonio", "Swift Leaks Backup")
            score -= 60;
          }

          if (isOfficialArtist) {
            score += 35;
          }

          // 2. Title scoring
          const lowerTitle = vTitle.toLowerCase();
          if (lowerTitle.includes('official video') || lowerTitle.includes('official music video')) {
            score += 40;
          } else if (lowerTitle.includes('official audio') || lowerTitle.includes('audio')) {
            score -= 10;
          }

          // Penalize bootlegs and fan subtitles
          for (const pattern of BOOTLEG_PATTERNS) {
            if (pattern.test(lowerTitle)) {
              score -= 80;
            }
          }

          // 3. Duration match (official music videos are typically close to the song length, ±45s for video intros)
          if (durationSec && durSec) {
            const diff = Math.abs(durSec - durationSec);
            if (diff <= 30) score += 25;
            else if (diff <= 60) score += 10;
            else if (diff > 120) score -= 50; // wildly different length (e.g. 1 hour loop or 30s clip)
          }

          candidates.push({ id, title: vTitle, author, score });
        }
      } catch {}
      if (candidates.some((c) => c.score >= 50)) break;
    }

    // Sort by highest score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best && best.score >= 35) {
      return best.id;
    }
  } catch (err) {
    console.warn('[Mellow] Failed to search official video:', err);
  }

  return null;
}
