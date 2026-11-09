import { activeIdentity, authState } from './ytAuth';
import * as spotify from './spotify';
import { selectYouTubeSigningCookie } from '@bitchord/shared';

/** Send the complete, origin-scoped provider session snapshot to Mellow Desktop. */
export async function syncToMellowDesktop(): Promise<boolean> {
  try {
    const spCookie = await browser.cookies.get({ url: 'https://open.spotify.com/', name: 'sp_dc' }).catch(() => null);
    const [musicCookies, youtubeCookies] = await Promise.all([
      browser.cookies.getAll({ url: 'https://music.youtube.com/' }).catch(() => null),
      browser.cookies.getAll({ url: 'https://www.youtube.com/' }).catch(() => null),
    ]);
    const ytCookies = musicCookies ?? [];
    const ytYoutubeCookies = youtubeCookies ?? [];
    const signingCookie = selectYouTubeSigningCookie(ytCookies, ytYoutubeCookies);
    const hasYtSession = !!signingCookie?.value;
    const [ytIdentity, ytState, spotifyState] = await Promise.all([
      hasYtSession ? activeIdentity().catch(() => null) : Promise.resolve(null),
      hasYtSession ? authState().catch(() => null) : Promise.resolve(null),
      spotify.authState().catch(() => null),
    ]);

    const response = await fetch('http://127.0.0.1:41838/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spDc: spCookie?.value,
        spotifyUser: spotifyState?.user,
        sapisid: signingCookie?.value,
        sapisidName: signingCookie?.name,
        ytCookies: ytCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
        ytYoutubeCookies: ytYoutubeCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
        ytSessionPresent: hasYtSession,
        ytAuthUser: ytIdentity?.authUser ?? '0',
        ytPageId: ytIdentity?.pageId ?? null,
        ytActive: ytState?.active ?? null,
      }),
    });
    return response.ok;
  } catch {
    // The desktop app may be closed. The caller can report that without ever
    // exposing cookie values or response bodies in logs/UI.
    return false;
  }
}
