import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Shelves } from '@/components/music/ShelfView';
import { LoadError, NeedsExtension } from '@/components/music/States';
import { DeferredSpotifyShelf } from '@/components/music/SpotifyShelf';
import { useExplore, useYouTubeReady } from '@/data/music/queries';
import { useSpotifyHomeSections } from '@/data/spotify/queries';
import { useSpotifySignedIn } from '@/extension/useSpotifyAuth';
import { NewSkeleton } from '@/skeletons/PageSkeletons';

/** New: A rich mashup of Spotify's new releases (New Music Friday, trending radar, charts) and YouTube Music's Explore (new albums, singles, trending music videos). */
export default function NewPage() {
  const [filter, setFilter] = useState<'all' | 'spotify' | 'yt'>('all');
  const { missing } = useYouTubeReady();
  const explore = useExplore();
  const spotifySignedIn = useSpotifySignedIn();
  const spotifyHome = useSpotifyHomeSections();
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;

  if (missing && !isDesktop) {
    return (
      <>
        <PageHeader title="New" />
        <NeedsExtension />
      </>
    );
  }
  if (explore.isError && !spotifyHome.data?.sections?.length) {
    return (
      <>
        <PageHeader title="New" />
        <LoadError error={explore.error} onRetry={() => void explore.refetch()} />
      </>
    );
  }
  if (!explore.data && !spotifyHome.data) return <NewSkeleton />;

  // Filter Spotify sections for new music, Friday drops, fresh releases, and charts
  const spotifyNewSections = (spotifyHome.data?.sections ?? []).filter((sec) => {
    const t = sec.title.toLowerCase();
    return (
      t.includes('new') ||
      t.includes('friday') ||
      t.includes('release') ||
      t.includes('fresh') ||
      t.includes('radar') ||
      t.includes('chart') ||
      t.includes('popular') ||
      t.includes('top')
    );
  });

  const ytShelves = explore.data ?? [];

  return (
    <>
      <PageHeader title="New" />

      {/* Filter Tabs: All (Mashup), Spotify, YouTube Music */}
      <div className="mb-6 flex w-fit max-w-[calc(100%-2.5rem)] items-center gap-1.5 overflow-x-auto sm:mx-8">
        <button
          onClick={() => setFilter('all')}
          className={`shrink-0 rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
            filter === 'all'
              ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]'
              : 'text-secondary hover:bg-white/[0.06] hover:text-primary'
          }`}
          aria-pressed={filter === 'all'}
        >
          All (Mashup)
        </button>
        <button
          onClick={() => setFilter('spotify')}
          className={`shrink-0 rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
            filter === 'spotify'
              ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]'
              : 'text-secondary hover:bg-white/[0.06] hover:text-primary'
          }`}
          aria-pressed={filter === 'spotify'}
        >
          Spotify
        </button>
        <button
          onClick={() => setFilter('yt')}
          className={`shrink-0 rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
            filter === 'yt'
              ? 'bg-white/[0.12] text-primary shadow-sm ring-1 ring-white/[0.08]'
              : 'text-secondary hover:bg-white/[0.06] hover:text-primary'
          }`}
          aria-pressed={filter === 'yt'}
        >
          YouTube Music
        </button>
      </div>

      {filter === 'all' && (
        <>
          {/* Top Spotify New Music Friday / New Releases */}
          {(spotifyNewSections.length > 0 ? spotifyNewSections.slice(0, 1) : (spotifyHome.data?.sections ?? []).slice(0, 1)).map((sec) => (
            <DeferredSpotifyShelf key={`spotify-${sec.title}`} title={sec.title} playlists={sec.playlists} />
          ))}

          {/* YouTube Music Primary Explore Shelf (e.g., New albums & singles) */}
          {ytShelves.length > 0 && <Shelves shelves={ytShelves.slice(0, 2)} />}

          {/* Next Spotify New releases */}
          {(spotifyNewSections.length > 0 ? spotifyNewSections.slice(1) : (spotifyHome.data?.sections ?? []).slice(1, 3)).map((sec) => (
            <DeferredSpotifyShelf key={`spotify-${sec.title}`} title={sec.title} playlists={sec.playlists} />
          ))}

          {/* Remaining YouTube Music Shelves (trending music videos, etc.) */}
          {ytShelves.length > 2 && <Shelves shelves={ytShelves.slice(2)} />}
        </>
      )}

      {filter === 'spotify' && (
        <>
          {spotifyNewSections.length > 0 ? (
            spotifyNewSections.map((sec) => (
              <DeferredSpotifyShelf key={`spotify-${sec.title}`} title={sec.title} playlists={sec.playlists} />
            ))
          ) : (
            (spotifyHome.data?.sections ?? []).map((sec) => (
              <DeferredSpotifyShelf key={`spotify-${sec.title}`} title={sec.title} playlists={sec.playlists} />
            ))
          )}
        </>
      )}

      {filter === 'yt' && ytShelves.length > 0 && <Shelves shelves={ytShelves} />}
    </>
  );
}
