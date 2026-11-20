import { useEffect, useMemo, useRef, useState } from 'react';
import type { MusicItem, Track } from '@/data/music/types';
import { getLocalHistory } from '@/state/localHistory';
import { Navigate, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { CircleLockup, SquareLockup, VideoLockup } from '@/components/music/Lockups';
import { EmptyState, LoadError, LoadMoreError, NeedsExtension, YouTubeAuthPrompt } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import { isLibrarySection, LIBRARY_SECTIONS } from '@/data/music/library';
import { useLibrary, useSignedIn, useYouTubeReady } from '@/data/music/queries';
import { useSpotifyFollowedArtists, useSpotifyHomeSections, useSpotifyPlaylists } from '@/data/spotify/queries';
import { useSpotifySignedIn } from '@/extension/useSpotifyAuth';
import { useYtAuth } from '@/extension/useYtAuth';
import { PlainSkeleton } from '@/skeletons/PageSkeletons';
import { seeAllGrid, seeAllTracks } from './pageStyles';

/** Asks for the next page when [target] scrolls into view. */
function useLoadMore(onVisible: (() => void) | null) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = target.current;
    if (!node || !onVisible) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), {
      rootMargin: '600px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible]);
  return target;
}

/** A library section: Recently Played, Artists, Albums, Songs, Made for You, All Playlists. */
export default function LibraryPage() {
  const params = useParams();
  const section = params.section ?? '';
  const validSection = isLibrarySection(section);
  const title = validSection ? LIBRARY_SECTIONS[section].title : 'Library';

  const { missing } = useYouTubeReady();
  const auth = useYtAuth();
  const signedIn = useSignedIn();
  const library = useLibrary(validSection ? section : 'playlists');
  const spotifyArtists = useSpotifyFollowedArtists();
  const spotifyPlaylists = useSpotifyPlaylists();
  const spotifyHome = useSpotifyHomeSections();
  const spotifySignedIn = useSpotifySignedIn();

  const [localHistory, setLocalHistory] = useState<Track[]>(() => (section === 'recent' ? getLocalHistory() : []));
  useEffect(() => {
    if (section !== 'recent') return;
    setLocalHistory(getLocalHistory());
    const onUpdate = () => setLocalHistory(getLocalHistory());
    window.addEventListener('mellow:history-updated', onUpdate);
    return () => window.removeEventListener('mellow:history-updated', onUpdate);
  }, [section]);

  const loadMore = useLoadMore(
    library.hasNextPage && !library.isFetchingNextPage && !library.isFetchNextPageError
      ? () => void library.fetchNextPage()
      : null,
  );

  const grid = useMemo(() => {
    const rawGrid = library.data?.pages.flatMap((page) => page.data.grid) ?? [];
    const extra: MusicItem[] = [];

    if (section === 'artists' && spotifyArtists.data?.length) {
      const seenNames = new Set(rawGrid.map((i) => i.title.toLowerCase().trim()));
      for (const a of spotifyArtists.data) {
        const norm = a.name.toLowerCase().trim();
        if (!seenNames.has(norm)) {
          seenNames.add(norm);
          extra.push({
            id: `artist:${a.name}`,
            title: a.name,
            subtitle: a.followers > 0
              ? `${a.followers >= 1_000_000 ? (a.followers / 1_000_000).toFixed(1) + 'M' : (a.followers / 1_000).toFixed(0) + 'K'} followers • Spotify`
              : 'Spotify Artist',
            kind: 'artist',
            artists: [{ name: a.name, id: null }],
            album: null,
            thumbnail: a.imageUrl,
            explicit: false,
            wide: false,
            durationSec: null,
          });
        }
      }
    } else if (section === 'playlists' && spotifyPlaylists.data?.length) {
      const seenTitles = new Set(rawGrid.map((i) => i.title.toLowerCase().trim()));
      for (const p of spotifyPlaylists.data) {
        const norm = p.name.toLowerCase().trim();
        if (!seenTitles.has(norm)) {
          seenTitles.add(norm);
          extra.push({
            id: p.id,
            title: p.name,
            subtitle: p.owner ? `${p.owner} • Spotify` : 'Spotify Playlist',
            kind: 'spotify-playlist',
            artists: [],
            album: null,
            thumbnail: p.imageUrl,
            explicit: false,
            wide: false,
            durationSec: null,
          });
        }
      }
    } else if (section === 'recent' && spotifyHome.data?.recents?.length) {
      const seenTitles = new Set(rawGrid.map((i) => i.title.toLowerCase().trim()));
      for (const p of spotifyHome.data.recents) {
        const norm = p.name.toLowerCase().trim();
        if (!seenTitles.has(norm)) {
          seenTitles.add(norm);
          extra.push({
            id: p.id,
            title: p.name,
            subtitle: p.owner ? `${p.owner} • Spotify` : 'Spotify Playlist',
            kind: 'spotify-playlist',
            artists: [],
            album: null,
            thumbnail: p.imageUrl,
            explicit: false,
            wide: false,
            durationSec: null,
          });
        }
      }
    } else if (section === 'made-for-you' && spotifyHome.data?.madeForYou?.length) {
      const seenTitles = new Set(rawGrid.map((i) => i.title.toLowerCase().trim()));
      for (const p of spotifyHome.data.madeForYou) {
        const norm = p.name.toLowerCase().trim();
        if (!seenTitles.has(norm)) {
          seenTitles.add(norm);
          extra.push({
            id: p.id,
            title: p.name,
            subtitle: p.owner ? `${p.owner} • Spotify` : 'Spotify Mix',
            kind: 'spotify-playlist',
            artists: [],
            album: null,
            thumbnail: p.imageUrl,
            explicit: false,
            wide: false,
            durationSec: null,
          });
        }
      }
    }

    return [...rawGrid, ...extra];
  }, [library.data, section, spotifyArtists.data, spotifyPlaylists.data, spotifyHome.data]);

  const cloudTracks = library.data?.pages.flatMap((page) => page.data.tracks) ?? [];
  const tracks = useMemo(() => {
    if (section !== 'recent') return cloudTracks;
    const seen = new Set<string>();
    const res: Track[] = [];
    for (const t of [...localHistory, ...cloudTracks]) {
      const key = t.videoId || `${t.title}-${t.artists.map((a) => a.name).join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        res.push(t);
      }
    }
    return res;
  }, [section, localHistory, cloudTracks]);

  // ALL HOOKS ARE CALLED ABOVE. NOW CONDITIONAL RETURNS ARE SAFE:
  if (!validSection) return <Navigate to="/home" replace />;
  if (missing && !spotifySignedIn) return <NeedsExtension what="your library" />;

  const hasSpotifyContent =
    (section === 'artists' && (spotifyArtists.data?.length ?? 0) > 0) ||
    (section === 'playlists' && (spotifyPlaylists.data?.length ?? 0) > 0) ||
    (section === 'recent' && (spotifyHome.data?.recents?.length ?? 0) > 0) ||
    (section === 'made-for-you' && (spotifyHome.data?.madeForYou?.length ?? 0) > 0);

  if (auth.state === 'ready' && !signedIn && (section !== 'recent' || !localHistory.length) && !hasSpotifyContent) {
    return (
      <>
        <PageHeader title={title} />
        <YouTubeAuthPrompt
          auth={auth.auth}
          title={auth.auth.reauthRequired ? 'Reconnect YouTube Music' : 'Sign in to see your library'}
        />
      </>
    );
  }

  if (library.isError && !library.data && (section !== 'recent' || !localHistory.length) && !hasSpotifyContent) {
    const message = library.error instanceof Error ? library.error.message : String(library.error);
    const expiredSession = /\b401\b|unauthori[sz]ed|session.*reject/i.test(message);
    return (
      <LoadError
        error={expiredSession ? new Error('YouTube Music rejected the saved sign-in. Reconnect YouTube Music from the account menu, then try again.') : library.error}
        onRetry={() => void library.refetch()}
      />
    );
  }

  if (!library.data && (section !== 'recent' || !localHistory.length) && !hasSpotifyContent) {
    return <PlainSkeleton />;
  }

  return (
    <>
      <PageHeader title={title} />
      {!grid.length && !tracks.length && <EmptyState title="Nothing here yet" />}
      {grid.length > 0 && (
        <ul className={seeAllGrid} data-wide={grid.every((i) => i.wide) || undefined}>
          {grid.map((item, i) => (
            <li key={`${item.id}-${i}`}>
              {item.kind === 'artist' ? (
                <CircleLockup item={item} />
              ) : item.wide ? (
                <VideoLockup item={item} />
              ) : (
                <SquareLockup item={item} />
              )}
            </li>
          ))}
        </ul>
      )}
      {tracks.length > 0 && (
        <div className={seeAllTracks}>
          <TrackList
            tracks={tracks}
            variant="playlist"
            source={{ title, type: 'library', id: section }}
            onNearEnd={
              library.hasNextPage && !library.isFetchingNextPage && !library.isFetchNextPageError
                ? () => void library.fetchNextPage()
                : undefined
            }
          />
        </div>
      )}
      {grid.length > 0 && <div ref={loadMore} aria-hidden="true" />}
      {library.isFetchNextPageError && <LoadMoreError onRetry={() => void library.fetchNextPage()} />}
    </>
  );
}
