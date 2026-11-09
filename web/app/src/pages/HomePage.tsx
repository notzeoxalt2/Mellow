import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLocalHistory } from '@/state/localHistory';
import { PageHeader } from '@/components/PageHeader';
import { Shelves, ShelfView, TrackShelf } from '@/components/music/ShelfView';
import { EmptyState, LoadError, LoadMoreError, NeedsExtension, YouTubeAuthPrompt } from '@/components/music/States';
import { DeferredSpotifyShelf, SpotifyConnectPrompt } from '@/components/music/SpotifyShelf';
import { useHome, useLibrary, useYouTubeReady } from '@/data/music/queries';
import type { Track } from '@/data/music/types';
import { fetchSpotifyTrackPage, LIKED_ID, matchToYouTube } from '@/data/spotify/api';
import { useSpotifyHomeSections, useSpotifyPlaylists } from '@/data/spotify/queries';
import { openSpotifySignIn, useSpotifySignedIn } from '@/extension/useSpotifyAuth';
import { useYtAuth } from '@/extension/useYtAuth';
import { ShelfSkeleton } from '@/skeletons/ShelfSkeleton';
import { getNotInterestedIds, subscribeNotInterested } from '@/lib/notInterested';

const RECENT_TITLE = 'Recently Played';
const RECENT_LIMIT = 20;
const RECENT_SOURCE = { title: RECENT_TITLE, type: 'home' as const };

function useRecentlyPlayed(): Track[] {
  const history = useLibrary('recent');
  const [local, setLocal] = useState<Track[]>(getLocalHistory);
  useEffect(() => {
    const onUpdate = () => setLocal(getLocalHistory());
    window.addEventListener('mellow:history-updated', onUpdate);
    return () => window.removeEventListener('mellow:history-updated', onUpdate);
  }, []);
  const first = history.data?.pages[0]?.data.tracks ?? [];
  const combined = [...local, ...first];
  const seen = new Set<string>();
  return combined.filter((t) => {
    const key = t.videoId || `${t.title}-${t.artists.map((a) => a.name).join(',')}`;
    return !seen.has(key) && seen.add(key);
  }).slice(0, RECENT_LIMIT);
}

export default function HomePage() {
  const [filter, setFilter] = useState<'all' | 'spotify' | 'yt' | 'blend'>('all');
  const [hiddenRecommendations, setHiddenRecommendations] = useState(getNotInterestedIds);
  const { ready: ytReady, missing } = useYouTubeReady();
  const ytAuth = useYtAuth();
  const home = useHome();
  const recent = useRecentlyPlayed();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeNotInterested(() => setHiddenRecommendations(getNotInterestedIds())), []);

  const spotifySignedIn = useSpotifySignedIn();
  const spotifyQuery = useSpotifyPlaylists();
  const spotifyHome = useSpotifyHomeSections();
  const blendedSpotifyTracks = useQuery({
    queryKey: ['spotify', 'data', 'blend', 'liked-first-page'],
    queryFn: async () => {
      const liked = await fetchSpotifyTrackPage(LIKED_ID, 0);
      const matches = await Promise.all(liked.slice(0, 12).map((track) => matchToYouTube(track).catch(() => null)));
      return matches.filter((track): track is Track => track !== null);
    },
    enabled: filter === 'blend' && spotifySignedIn,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;

  // Separate Spotify library into personal playlists and Spotify algorithmic/random mixes
  const { userPlaylists, spotifyMixes } = useMemo(() => {
    const all = spotifyQuery.data ?? [];
    const isMix = (name: string, owner: string | null) => {
      const lower = name.toLowerCase();
      const ownerLower = (owner ?? '').toLowerCase();
      return (
        ownerLower === 'spotify' ||
        lower.includes('mix') ||
        lower.includes('daily') ||
        lower.includes('discover') ||
        lower.includes('radio') ||
        lower.includes('radar') ||
        lower.includes('repeat') ||
        lower.includes('top')
      );
    };

    const user = all.filter((p) => p.id === LIKED_ID || !isMix(p.name, p.owner));
    const mixes = all.filter((p) => p.id !== LIKED_ID && isMix(p.name, p.owner));

    return { userPlaylists: user, spotifyMixes: mixes };
  }, [spotifyQuery.data]);

  // Infinite scroll loader for YouTube shelves
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !home.hasNextPage || home.isFetchNextPageError) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !home.isFetchingNextPage) void home.fetchNextPage();
      },
      { root: document.getElementById('scrollable-page'), rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [home.hasNextPage, home.isFetchingNextPage, home.isFetchNextPageError, home.fetchNextPage]);

  const handleConnectSpotify = () => {
    if (window.electronAPI?.openSpotifyLogin) {
      window.electronAPI.openSpotifyLogin();
    } else {
      openSpotifySignIn();
    }
  };

  const shelves = home.data
    ? home.data.pages
        .flatMap((page) => page.data)
        .map((shelf) => ({ ...shelf, items: shelf.items.filter((item) => !hiddenRecommendations.has(item.id)) }))
        .filter((shelf) => shelf.items.length > 0)
        .filter((shelf) => !(recent.length > 0 && shelf.title.trim().toLowerCase() === RECENT_TITLE.toLowerCase()))
    : [];

  const topYtShelf = shelves[0];
  const remainingYtShelves = shelves.slice(1);
  const blendedTracks = useMemo(() => {
    const spotifyTracks = blendedSpotifyTracks.data ?? [];
    const out: Track[] = [];
    for (let i = 0; i < Math.max(recent.length, spotifyTracks.length); i++) {
      if (recent[i]) out.push(recent[i]!);
      if (spotifyTracks[i]) out.push(spotifyTracks[i]!);
    }
    const seen = new Set<string>();
    return out.filter((track) => {
      const key = `${track.title.toLocaleLowerCase()}|${track.artists.map((artist) => artist.name.toLocaleLowerCase()).join(',')}`;
      return !seen.has(key) && !!seen.add(key);
    }).slice(0, 20);
  }, [recent, blendedSpotifyTracks.data]);

  if (missing && !isDesktop) {
    return (
      <>
        <PageHeader title="Home" />
        <NeedsExtension />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Home" />

      {/* A compact source selector: these filter shelves; they aren't transport controls. */}
      <div className="mb-6 flex w-fit max-w-[calc(100%-2.5rem)] items-center gap-1.5 overflow-x-auto sm:mx-8">
        <button
          onClick={() => setFilter('all')}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${filter === 'all' ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]' : 'text-secondary hover:bg-white/[0.06] hover:text-primary'}`}
          aria-pressed={filter === 'all'}
        >
          All
        </button>
        <button
          onClick={() => setFilter('spotify')}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${filter === 'spotify' ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]' : 'text-secondary hover:bg-white/[0.06] hover:text-primary'}`}
          aria-pressed={filter === 'spotify'}
        >
          Spotify
        </button>
        <button
          onClick={() => setFilter('yt')}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${filter === 'yt' ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]' : 'text-secondary hover:bg-white/[0.06] hover:text-primary'}`}
          aria-pressed={filter === 'yt'}
        >
          YouTube Music
        </button>
        <button
          onClick={() => setFilter('blend')}
          className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${filter === 'blend' ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]' : 'text-secondary hover:bg-white/[0.06] hover:text-primary'}`}
          aria-pressed={filter === 'blend'}
        >
          Your blend
        </button>
      </div>

      {/* FILTER: SPOTIFY ONLY */}
      {filter === 'spotify' && (
        <>
          {spotifySignedIn ? (
            <>
              {userPlaylists.length > 0 && (
                <DeferredSpotifyShelf
                  title="Your Spotify Playlists"
                  subtitle="Personal playlists and Liked Songs"
                  playlists={userPlaylists}
                />
              )}
              {spotifyHome.data?.sections?.length ? spotifyHome.data.sections.map((section) => (
                <DeferredSpotifyShelf key={section.title} title={section.title} playlists={section.playlists} />
              )) : ((spotifyHome.data?.madeForYou && spotifyHome.data.madeForYou.length > 0) || spotifyMixes.length > 0) && (
                <DeferredSpotifyShelf
                  title="Made For You"
                  subtitle="Daily Mixes, Discover Weekly, and Release Radar"
                  playlists={spotifyHome.data?.madeForYou?.length ? spotifyHome.data.madeForYou : spotifyMixes}
                />
              )}
              {!spotifyHome.data?.sections?.length && spotifyHome.data?.recents && spotifyHome.data.recents.length > 0 && (
                <DeferredSpotifyShelf
                  title="Recents"
                  subtitle="Recently played playlists and mixes"
                  playlists={spotifyHome.data.recents}
                />
              )}
            </>
          ) : (
            <SpotifyConnectPrompt onConnect={handleConnectSpotify} />
          )}
        </>
      )}

      {filter === 'blend' && (
        <>
          {blendedTracks.length > 0 && (
            <TrackShelf
              title="Your listening blend"
              tracks={blendedTracks}
              source={{ title: 'Your listening blend', type: 'home' }}
            />
          )}
          {blendedSpotifyTracks.isLoading && <ShelfSkeleton kind="tracks" />}
          {!spotifySignedIn && <SpotifyConnectPrompt onConnect={handleConnectSpotify} />}
          {spotifySignedIn && !blendedSpotifyTracks.isLoading && blendedTracks.length === 0 && recent.length === 0 && (
            <LoadError error={new Error('Play or like a few songs on Spotify and YouTube Music to build your blend.')} onRetry={() => void blendedSpotifyTracks.refetch()} />
          )}
        </>
      )}

      {/* FILTER: YOUTUBE MUSIC ONLY */}
      {filter === 'yt' && (
        <>
          {!ytReady && ytAuth.state === 'ready' ? (
            <YouTubeAuthPrompt auth={ytAuth.auth} title={ytAuth.auth.reauthRequired ? 'Reconnect YouTube Music' : 'YouTube Music is paused'} />
          ) : !ytReady && ytAuth.state === 'checking' ? (
            <EmptyState title="Checking YouTube Music…" />
          ) : !ytReady ? (
            <EmptyState title="YouTube Music is paused" detail="Turn it back on in Settings › Music Services to browse your YouTube Music home." />
          ) : recent.length > 0 && <TrackShelf title={RECENT_TITLE} to="/library/recent" tracks={recent} source={RECENT_SOURCE} />}
          {ytReady && (home.data ? (
            shelves.length ? <Shelves shelves={shelves} allowNotInterested /> : (
              <LoadError error={new Error('YouTube Music returned no home recommendations.')} onRetry={() => void home.refetch()} />
            )
          ) : home.isError ? (
            <LoadError error={home.error} onRetry={() => void home.refetch()} />
          ) : (
            <ShelfSkeleton kind="square" />
          ))}
        </>
      )}

      {/* FILTER: ALL (Harmonious integration of both) */}
      {filter === 'all' && (
        <>
          {/* Top YouTube recommendation shelf if available */}
          {topYtShelf && <ShelfView shelf={topYtShelf} allowNotInterested />}
          {!ytReady && ytAuth.state === 'ready' && (
            <YouTubeAuthPrompt auth={ytAuth.auth} title={ytAuth.auth.reauthRequired ? 'Reconnect YouTube Music' : 'YouTube Music is paused'} />
          )}
          {!ytReady && ytAuth.state !== 'ready' && <EmptyState title="Checking YouTube Music…" detail="Your Spotify shelves remain available while Mellow checks the session." />}

          {/* Recently Played tracks */}
          {recent.length > 0 && (
            <TrackShelf title={RECENT_TITLE} to="/library/recent" tracks={recent} source={RECENT_SOURCE} />
          )}

          {/* Spotify Playlists */}
          {spotifySignedIn && userPlaylists.length > 0 && (
            <DeferredSpotifyShelf
              title="Your Spotify Playlists"
              subtitle="Personal playlists and Liked Songs"
              playlists={userPlaylists}
            />
          )}

          {/* Spotify Made For You */}
          {spotifySignedIn && spotifyHome.data?.sections?.length ? spotifyHome.data.sections.map((section) => (
            <DeferredSpotifyShelf key={section.title} title={section.title} playlists={section.playlists} />
          )) : spotifySignedIn && ((spotifyHome.data?.madeForYou && spotifyHome.data.madeForYou.length > 0) || spotifyMixes.length > 0) && (
            <DeferredSpotifyShelf
              title="Made For You"
              subtitle="Daily Mixes, Discover Weekly, and Release Radar"
              playlists={spotifyHome.data?.madeForYou?.length ? spotifyHome.data.madeForYou : spotifyMixes}
            />
          )}

          {/* Connect prompt if not connected */}
          {!spotifySignedIn && !isDesktop && (
            <SpotifyConnectPrompt onConnect={handleConnectSpotify} />
          )}

          {/* Remaining YouTube Shelves (New Releases, Fresh Drops, etc.) */}
          {remainingYtShelves.length > 0 && <Shelves shelves={remainingYtShelves} allowNotInterested />}

          {/* If YouTube shelves still loading or empty */}
          {ytReady && !home.data && !home.isError && <ShelfSkeleton kind="square" />}
          {ytReady && home.isError && <LoadError error={home.error} onRetry={() => void home.refetch()} />}
          {ytReady && home.data && shelves.length === 0 && !home.isError && (
            <LoadError error={new Error('YouTube Music returned no home recommendations.')} onRetry={() => void home.refetch()} />
          )}

          {/* Spotify Recents */}
          {spotifySignedIn && !spotifyHome.data?.sections?.length && spotifyHome.data?.recents && spotifyHome.data.recents.length > 0 && (
            <DeferredSpotifyShelf
              title="Spotify Recents"
              subtitle="Recently played playlists and mixes"
              playlists={spotifyHome.data.recents}
            />
          )}

        </>
      )}

      {/* Sentinel for infinite scrolling YouTube shelves */}
      <div ref={sentinel} />
      {home.isFetchingNextPage && <ShelfSkeleton kind="square" />}
      {home.isFetchNextPageError && (
        <div className="py-6 text-center">
          <button
            onClick={() => void home.fetchNextPage()}
            className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-medium text-secondary hover:text-primary transition-all cursor-pointer"
          >
            Load more
          </button>
        </div>
      )}
    </>
  );
}
