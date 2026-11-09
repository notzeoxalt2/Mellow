import { useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '@/data/music/types';
import { getLocalHistory } from '@/state/localHistory';
import { Navigate, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { CircleLockup, SquareLockup, VideoLockup } from '@/components/music/Lockups';
import { EmptyState, LoadError, LoadMoreError, NeedsExtension, YouTubeAuthPrompt } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import { isLibrarySection, LIBRARY_SECTIONS } from '@/data/music/library';
import { useLibrary, useSignedIn, useYouTubeReady } from '@/data/music/queries';
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

  const grid = library.data?.pages.flatMap((page) => page.data.grid) ?? [];
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
  if (missing) return <NeedsExtension what="your library" />;

  if (auth.state === 'ready' && !signedIn && (section !== 'recent' || !localHistory.length)) {
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

  if (library.isError && !library.data && (section !== 'recent' || !localHistory.length)) {
    const message = library.error instanceof Error ? library.error.message : String(library.error);
    const expiredSession = /\b401\b|unauthori[sz]ed|session.*reject/i.test(message);
    return (
      <LoadError
        error={expiredSession ? new Error('YouTube Music rejected the saved sign-in. Reconnect YouTube Music from the account menu, then try again.') : library.error}
        onRetry={() => void library.refetch()}
      />
    );
  }

  if (!library.data && (section !== 'recent' || !localHistory.length)) {
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
