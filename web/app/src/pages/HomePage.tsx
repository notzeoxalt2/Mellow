import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FolderOpen, Shuffle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getLocalHistory } from '@/state/localHistory';
import { PageHeader } from '@/components/PageHeader';
import { Shelves, ShelfView, TrackShelf } from '@/components/music/ShelfView';
import { EmptyState, LoadError, LoadMoreError, NeedsExtension, YouTubeAuthPrompt } from '@/components/music/States';
import { DeferredSpotifyShelf, SpotifyConnectPrompt } from '@/components/music/SpotifyShelf';
import { TrackList } from '@/components/music/TrackList';
import { PlayIcon } from '@/components/icons/Transport';
import { playList, shuffleList } from '@/components/music/play';
import { useDownloads } from '@/lib/download';
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
  const [filter, setFilter] = useState<'all' | 'spotify' | 'yt' | 'downloads' | 'blend'>('all');
  const [hiddenRecommendations, setHiddenRecommendations] = useState(getNotInterestedIds);
  const { ready: ytReady, missing } = useYouTubeReady();
  const ytAuth = useYtAuth();
  const home = useHome();
  const recent = useRecentlyPlayed();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeNotInterested(() => setHiddenRecommendations(getNotInterestedIds())), []);

  const [downloadedTracks, setDownloadedTracks] = useState<Track[]>([]);
  const openDownloadsFolder = useDownloads((s) => s.openDownloadsFolder);
  const downloadedIds = useDownloads((s) => s.downloadedIds);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.getDownloadedTracks) {
      void window.electronAPI.getDownloadedTracks().then((items: any) => {
        if (Array.isArray(items)) {
          const mapped: Track[] = items.map((item: any, i: number) => ({
            videoId: item.videoId,
            title: item.title,
            artists: item.artist ? [{ name: item.artist, id: null, channelId: null }] : [],
            album: item.album ? { name: item.album, id: null } : null,
            durationSec: 0,
            thumbnail: item.thumbnail || null,
            explicit: false,
            index: i,
            plays: null,
          }));
          setDownloadedTracks(mapped);
        }
      });
    }
  }, [downloadedIds, filter]);

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

  const spotifyLibraryItems = useMemo(() => {
    return userPlaylists.map((p) => ({
      kind: 'spotify-playlist' as const,
      id: p.id,
      title: p.name,
      subtitle: p.owner ? `By ${p.owner}` : 'Spotify',
      artists: [],
      album: null,
      thumbnail: p.imageUrl,
      wide: false,
      durationSec: null,
      explicit: false,
    }));
  }, [userPlaylists]);

  const shelves = useMemo(() => {
    if (!home.data) return [];
    return home.data.pages
      .flatMap((page) => page.data)
      .map((shelf) => {
        let items = shelf.items.filter((item) => !hiddenRecommendations.has(item.id));
        // Inject user's Spotify playlists and recents into "From your library" shelf
        if (spotifySignedIn && spotifyLibraryItems.length > 0 && /from your library|your library/i.test(shelf.title)) {
          items = [...spotifyLibraryItems, ...items];
        }
        return { ...shelf, items };
      })
      .filter((shelf) => shelf.items.length > 0)
      .filter((shelf) => !(recent.length > 0 && shelf.title.trim().toLowerCase() === RECENT_TITLE.toLowerCase()));
  }, [home.data, hiddenRecommendations, recent.length, spotifySignedIn, spotifyLibraryItems]);

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
          className={`shrink-0 rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${filter === 'all' ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]' : 'text-secondary hover:bg-white/[0.06] hover:text-primary'}`}
          aria-pressed={filter === 'all'}
        >
          All
        </button>
        <button
          onClick={() => setFilter('spotify')}
          className={`shrink-0 rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${filter === 'spotify' ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]' : 'text-secondary hover:bg-white/[0.06] hover:text-primary'}`}
          aria-pressed={filter === 'spotify'}
        >
          Spotify
        </button>
        <button
          onClick={() => setFilter('yt')}
          className={`shrink-0 rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${filter === 'yt' ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]' : 'text-secondary hover:bg-white/[0.06] hover:text-primary'}`}
          aria-pressed={filter === 'yt'}
        >
          YouTube Music
        </button>
        <button
          onClick={() => setFilter('downloads')}
          className={`shrink-0 whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${filter === 'downloads' ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]' : 'text-secondary hover:bg-white/[0.06] hover:text-primary'}`}
          aria-pressed={filter === 'downloads'}
        >
          Downloads
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

      {/* FILTER: DOWNLOADS (Full Playlist Layout matching screenshot) */}
      {filter === 'downloads' && (
        <div className="flex flex-col gap-6 pt-2">
          <div className="mx-(--body-gutter) mb-4 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_1fr_auto] gap-x-[34px] pt-4 [grid-template-areas:'artwork_headings'_'artwork_description'_'artwork_actions'] max-md:grid-cols-[1fr] max-md:grid-rows-[auto] max-md:justify-items-center max-md:text-center max-md:[grid-template-areas:'artwork'_'headings'_'actions'_'description']">
            <div className="relative size-[230px] self-start rounded-[12px] shadow-2xl overflow-hidden [grid-area:artwork] max-md:size-[180px] bg-gradient-to-br from-indigo-600 via-purple-600 to-emerald-500 flex items-center justify-center">
              <Download size={76} className="text-white drop-shadow-md" />
            </div>
            <div className="flex flex-col justify-center [grid-area:headings] max-md:items-center max-md:pt-4">
              <h1 className="type-large-title-emphasized text-white text-3xl font-bold">Downloads</h1>
              <p className="type-callout-emphasized text-white/70 mt-1 font-medium">Mellow Offline Storage</p>
              <div className="mt-1 type-callout text-secondary">
                {downloadedTracks.length} {downloadedTracks.length === 1 ? 'song' : 'songs'} • Available offline
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3.5 self-end [grid-area:actions]">
              <button
                className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all cursor-pointer"
                aria-label="Shuffle"
                onClick={() => shuffleList(downloadedTracks, { source: { title: 'Downloads', type: 'playlist' } })}
                disabled={downloadedTracks.length === 0}
              >
                <Shuffle size={18} />
              </button>
              <button
                className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-full bg-white px-5 font-semibold text-black hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
                onClick={() => playList(downloadedTracks, 0, { source: { title: 'Downloads', type: 'playlist' } })}
                disabled={downloadedTracks.length === 0}
              >
                <PlayIcon size={18} fill="currentColor" />
                <span>Play</span>
              </button>
              <button
                type="button"
                onClick={openDownloadsFolder}
                className="flex items-center gap-2 px-3.5 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-medium text-white transition-all cursor-pointer border border-white/10"
                title="Open Downloads Folder"
              >
                <FolderOpen size={16} />
                <span>Open Folder</span>
              </button>
            </div>
          </div>

          {downloadedTracks.length > 0 ? (
            <TrackList tracks={downloadedTracks} variant="playlist" source={{ title: 'Downloads', type: 'playlist' }} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-secondary">
              <div className="size-14 grid place-items-center rounded-[12px] bg-white/[0.05] border border-white/10 text-white/50">
                <Download size={26} />
              </div>
              <h3 className="type-title-3 text-primary mt-1">No Offline Songs Yet</h3>
              <p className="type-body text-secondary max-w-sm">
                Download any song using the Download button in the player or contextual track menu to play it offline.
              </p>
            </div>
          )}
        </div>
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
          {spotifySignedIn && spotifyHome.data?.sections?.length ? spotifyHome.data.sections.filter((s) => s.playlists.length >= 2).map((section) => (
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
            className="px-4 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/20 text-xs font-medium text-secondary hover:text-primary transition-all cursor-pointer"
          >
            Load more
          </button>
        </div>
      )}
    </>
  );
}
