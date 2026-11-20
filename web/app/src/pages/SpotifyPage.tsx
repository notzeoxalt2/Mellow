import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SquareLockup } from '@/components/music/Lockups';
import { EmptyState, LoadError, NeedsExtension, stateStyles } from '@/components/music/States';
import type { MusicItem } from '@/data/music/types';
import { useSpotifyHomeSections, useSpotifyPlaylists } from '@/data/spotify/queries';
import { useExtension } from '@/extension/useExtension';
import { openSpotifySignIn, useRefreshSpotifyAuth, useSetSpotifyConnected, useSpotifyAuth } from '@/extension/useSpotifyAuth';
import { PlainSkeleton } from '@/skeletons/PageSkeletons';
import { seeAllGrid } from './pageStyles';

/**
 * The signed-in Spotify account's playlists or a specific Spotify section:
 * opens as an ordinary playlist page whose songs are matched to YouTube Music.
 */
export default function SpotifyPage() {
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const extension = useExtension();
  const auth = useSpotifyAuth();
  const playlists = useSpotifyPlaylists();
  const homeSections = useSpotifyHomeSections();
  const connect = useSetSpotifyConnected();
  const retry = useRefreshSpotifyAuth();

  if (extension.state === 'missing') return <NeedsExtension what="your Spotify playlists" />;
  if (auth.state === 'checking') return <PlainSkeleton />;
  if (auth.state === 'unavailable') {
    return (
      <>
        <PageHeader title="Spotify" />
        <EmptyState title="Update the extension" detail="This version of the BitChord extension doesn’t include Spotify yet." />
      </>
    );
  }
  const state = auth.auth;
  if (!state.signedIn) {
    const [title, detail, action] = !state.browserSignedIn
      ? ['Sign in to Spotify', 'BitChord uses the Spotify account this browser is signed in to, through the extension.', 'Sign In']
      : !state.connected
        ? ['Spotify is disconnected', 'You’re signed in to Spotify in this browser. Connect to see your playlists here.', 'Connect']
        : ['Couldn’t read your Spotify account', state.problem ?? 'Spotify didn’t answer.', 'Try Again'];
    return (
      <>
        <PageHeader title="Spotify" />
        <div className={stateStyles.state}>
          <p className={stateStyles.title}>{title}</p>
          <p className={stateStyles.detail}>{detail}</p>
          <button
            className={stateStyles.button}
            disabled={connect.isPending || retry.isPending}
            onClick={() =>
              !state.browserSignedIn ? openSpotifySignIn() : !state.connected ? connect.mutate(true) : retry.mutate()
            }
          >
            {action}
          </button>
        </div>
      </>
    );
  }
  if (playlists.isError && !playlists.data) return <LoadError error={playlists.error} onRetry={() => void playlists.refetch()} />;
  if (!playlists.data) return <PlainSkeleton />;

  // If viewing a specific section (e.g. "It's New Music Friday!"), show that section's playlists 1:1 with Spotify
  const matchedSection = sectionParam
    ? homeSections.data?.sections?.find((s) => s.title.toLowerCase().trim() === sectionParam.toLowerCase().trim())
    : null;

  const displayTitle = matchedSection ? matchedSection.title : 'All Spotify Playlists';
  const targetPlaylists = matchedSection ? matchedSection.playlists : playlists.data;

  const items: MusicItem[] = targetPlaylists.map((p) => ({
    kind: 'spotify-playlist',
    id: p.id,
    title: p.name,
    subtitle: p.owner ?? 'Spotify',
    artists: [],
    album: null,
    thumbnail: p.imageUrl,
    wide: false,
    durationSec: null,
    explicit: false,
  }));
  return (
    <>
      <PageHeader title={displayTitle} />
      {!items.length && <EmptyState title="No playlists yet" />}
      <ul className={seeAllGrid}>
        {items.map((item) => (
          <li key={item.id}>
            <SquareLockup item={item} />
          </li>
        ))}
      </ul>
    </>
  );
}
