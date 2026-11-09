/** Parse and merge cookie sources for signed YouTube requests. The Chrome
 * extension snapshot is authoritative; Mellow's embedded jar only fills gaps.
 */
export interface YouTubeCookie {
  name: string;
  value: string;
}

export interface YouTubeAuthSessionIdentity {
  sapisid?: string;
  sapisidName?: string;
  ytAuthUser?: string;
  ytPageId?: string | null;
  ytActive?: unknown;
  ytAuthVerified?: boolean;
}

/**
 * A selected brand channel belongs to a particular browser login. When the
 * login cookie or account index changes, carrying its PageId into the new
 * session can make a valid sign-in fail verification. Keep an existing
 * channel selection only while the underlying login identity is unchanged.
 */
export function resetYouTubeChannelForSessionChange(
  auth: YouTubeAuthSessionIdentity,
  nextSapisid: string,
  nextSapisidName: string,
  nextAuthUser: string,
): boolean {
  const changed =
    (auth.sapisid !== undefined && auth.sapisid !== nextSapisid) ||
    (auth.sapisidName !== undefined && auth.sapisidName !== nextSapisidName) ||
    (auth.ytAuthUser !== undefined && auth.ytAuthUser !== nextAuthUser);
  if (!changed) return false;
  auth.ytPageId = null;
  auth.ytActive = null;
  auth.ytAuthVerified = false;
  return true;
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const values = new Map<string, string>();
  for (const pair of (header ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0) values.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  return values;
}

export function mergeYouTubeCookies(
  origin: string,
  syncedMusicCookies: string | undefined,
  syncedYoutubeCookies: string | undefined,
  liveCookies: YouTubeCookie[],
): { header: string; signingCookie: string } {
  const syncedHeader = origin === 'https://music.youtube.com'
    ? syncedMusicCookies
    : syncedYoutubeCookies;
  const values = new Map<string, string>();
  for (const cookie of liveCookies) values.set(cookie.name, cookie.value);
  // Do not let a different or stale Electron login replace Chrome's session.
  for (const [name, value] of parseCookieHeader(syncedHeader)) values.set(name, value);

  return {
    header: [...values].map(([name, value]) => `${name}=${value}`).join('; '),
    signingCookie: values.get('SAPISID')
      || values.get('__Secure-3PAPISID')
      || values.get('__Secure-1PAPISID')
      || '',
  };
}

/** Keep the browser-selected signing cookie authoritative even when its
 * host-only scope means it is absent from this origin's snapshot. */
export function prioritizeYouTubeSigningCookie(
  header: string,
  name: string,
  value: string,
): { header: string; signingCookie: string } {
  const values = parseCookieHeader(header);
  values.set(name, value);
  return {
    header: [...values].map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`).join('; '),
    signingCookie: value,
  };
}
