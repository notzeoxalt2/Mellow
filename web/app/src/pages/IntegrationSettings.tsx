import { APPLE_ORIGINS, useAppleAccess } from '@/data/apple/artistArt';
import { useAppleSettings } from '@/data/apple/motionArt';
import { useHostAccess } from '@/extension/useHostAccess';
import { LYRIC_EXTENSION_ORIGINS } from '@/lyrics/http';
import { useSpotifySettings } from '@/data/spotify/canvas';
import {
  openSpotifySignIn,
  useRefreshSpotifyAuth,
  useSetSpotifyConnected,
  useSpotifyAuth,
  type SpotifyAuthStatus,
} from '@/extension/useSpotifyAuth';
import { openYtSignIn, useSetConnected, useYtAuth } from '@/extension/useYtAuth';
import { settingsUi } from './settingsStyles';

/** Allowed, or an Allow button that opens the extension's permission page. */
function HostAccessValue({ access, request }: ReturnType<typeof useHostAccess>) {
  const text = { checking: 'Checking…', unavailable: 'Needs the extension', granted: 'Allowed', needed: 'Not allowed' }[access];
  return (
    <span className={settingsUi.value}>
      <span>{text}</span>
      {access === 'needed' && (
        <button className={settingsUi.inlineButton} onClick={request}>
          Allow
        </button>
      )}
    </span>
  );
}

/** The Apple Music section's access row: one grant covers artist art and animated artwork. */
export function AppleMusicIntegration() {
  return <HostAccessValue {...useAppleAccess()} />;
}

/** The Apple Music section's switches. Neither needs an Apple Music account. */
export function AppleMusicToggles() {
  const { artistArt, motion, setArtistArt, setMotion } = useAppleSettings();
  return (
    <>
      <Toggle
        label="Artist Art"
        detail="Artist pages take Apple Music’s photo, logo and colour."
        checked={artistArt}
        onChange={setArtistArt}
      />
      <Toggle
        label="Animated Artwork"
        detail="Apple Music’s moving covers in the full-screen player and on album pages. Not on metered connections or with reduced motion."
        checked={motion}
        onChange={setMotion}
      />
    </>
  );
}

/**
 * The lyric sources a page can't ask itself (KuGou, Musixmatch, Genius,
 * PaxSenix…), as in the Lyrics dialog. Apple's hosts are granted under Apple
 * Music, so they aren't asked for twice.
 */
const LYRIC_ONLY_ORIGINS = LYRIC_EXTENSION_ORIGINS.filter((o) => !APPLE_ORIGINS.includes(o));
export function LyricSourcesAccess() {
  return <HostAccessValue {...useHostAccess(LYRIC_ONLY_ORIGINS)} />;
}

/** The Spotify row's words and button (SpotifyLibraryScreen's states). */
export function SpotifyIntegration() {
  const auth = useSpotifyAuth();
  const connect = useSetSpotifyConnected();
  const retry = useRefreshSpotifyAuth();
  if (auth.state !== 'ready') return <span className={settingsUi.value}>{spotifyText(auth)}</span>;
  const { browserSignedIn, connected, signedIn } = auth.auth;
  const action = !browserSignedIn
    ? { label: 'Sign In', run: openSpotifySignIn }
    : !connected
      ? { label: 'Connect', run: () => connect.mutate(true) }
      : !signedIn
        ? { label: 'Retry', run: () => retry.mutate() }
        : { label: 'Disconnect', run: () => connect.mutate(false) };
  return (
    <span className={settingsUi.value}>
      <span title={auth.auth.problem ?? undefined}>{spotifyText(auth)}</span>
      <button className={settingsUi.inlineButton} onClick={action.run} disabled={connect.isPending || retry.isPending}>
        {action.label}
      </button>
    </span>
  );
}

function spotifyText(auth: SpotifyAuthStatus): string {
  if (auth.state === 'checking') return 'Checking…';
  if (auth.state === 'unavailable') return 'Not available in this version yet';
  const { browserSignedIn, connected, signedIn, user } = auth.auth;
  if (!browserSignedIn) return 'Not signed in in this browser';
  if (!connected) return 'Disconnected';
  return signedIn ? `Signed in as ${user?.name ?? 'your account'}` : 'Couldn’t read your account';
}

export function Toggle({ label, detail, checked, onChange, disabled = false }: { label: string; detail?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className={settingsUi.controlRow}>
      <span className={settingsUi.rowText}>
        <span>{label}</span>
        {detail && <span className={settingsUi.rowDetail}>{detail}</span>}
      </span>
      <input type="checkbox" className={settingsUi.switch} checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

/** Keep both sources available, or pause one without signing out of its account. */
export function MusicServiceToggles() {
  const yt = useYtAuth();
  const ytConnection = useSetConnected();
  const spotify = useSpotifyAuth();
  const spotifyConnection = useSetSpotifyConnected();
  return (
    <>
      <Toggle
        label="Use YouTube Music"
        detail={
          yt.state === 'ready' && yt.auth.reauthRequired
            ? 'On, but the saved sign-in needs repair. Use Reconnect above to restore your library.'
            : 'Use it for recommendations and library results. Turning this off pauses new reads; current audio keeps playing.'
        }
        // The switch is the user's service preference, not a claim that the
        // credentials are valid. Keep an enabled-but-expired account visibly on.
        checked={yt.state === 'ready' && yt.auth.connected}
        disabled={yt.state !== 'ready' || !yt.auth.browserSignedIn || ytConnection.isPending}
        onChange={(enabled) => {
          if (enabled && yt.state === 'ready' && !yt.auth.signedIn) openYtSignIn();
          ytConnection.mutate(enabled);
        }}
      />
      <Toggle
        label="Use Spotify"
        detail="Use it for playlists, recommendations and search. Turning this off pauses new reads; current audio keeps playing."
        checked={spotify.state === 'ready' && spotify.auth.connected && spotify.auth.signedIn}
        disabled={spotify.state !== 'ready' || !spotify.auth.browserSignedIn || spotifyConnection.isPending}
        onChange={(enabled) => spotifyConnection.mutate(enabled)}
      />
    </>
  );
}

/** Spotify Canvas behind the lyrics; only offered once signed in to Spotify. */
export function CanvasToggle() {
  const auth = useSpotifyAuth();
  const canvas = useSpotifySettings((s) => s.canvas);
  const setCanvas = useSpotifySettings((s) => s.setCanvas);
  if (auth.state !== 'ready' || !auth.auth.signedIn) return null;
  return (
    <Toggle
      label="Spotify Canvas"
      detail="Loop a track’s Spotify Canvas when one is returned. Availability follows Spotify’s country and track rules; off on metered connections or with reduced motion."
      checked={canvas}
      onChange={setCanvas}
    />
  );
}
