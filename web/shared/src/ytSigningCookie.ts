/** Cookie shape used by the YouTube Music and YouTube origin snapshots. */
export interface YouTubeSigningCookie {
  name: string;
  value: string;
}

const SIGNING_COOKIE_PRIORITY = ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID'] as const;

/**
 * Select the same non-empty YouTube signing cookie the extension auth flow
 * prefers. Cookie API arrays are not ordered, and an empty cookie value must
 * never shadow a usable credential later in the list.
 */
export function selectYouTubeSigningCookie(
  musicCookies: readonly YouTubeSigningCookie[],
  youtubeCookies: readonly YouTubeSigningCookie[],
): YouTubeSigningCookie | null {
  for (const name of SIGNING_COOKIE_PRIORITY) {
    const cookie = musicCookies.find((candidate) => candidate.name === name && candidate.value.trim());
    if (cookie) return cookie;
    const youtubeCookie = youtubeCookies.find((candidate) => candidate.name === name && candidate.value.trim());
    if (youtubeCookie) return youtubeCookie;
  }
  return null;
}
