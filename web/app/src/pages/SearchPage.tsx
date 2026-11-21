import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PrefetchLink } from '@/components/PrefetchLink';
import { Artwork } from '@/components/music/Artwork';
import { CategoryTiles } from '@/components/music/CategoryTiles';
import { hrefFor } from '@/components/music/links';
import { playTrack, toTrack } from '@/components/music/play';
import { SearchField } from '@/components/music/SearchField';
import { Shelves, TrackShelf } from '@/components/music/ShelfView';
import { useSpotifyCategoryPlaylists, useSpotifySearch, useSpotifySearchAll } from '@/data/spotify/queries';
import { TrackMenu } from '@/components/music/TrackMenu';
import { EmptyState, LoadError } from '@/components/music/States';
import { useSearch, useSearchSongs, useYouTubeReady } from '@/data/music/queries';
import type { MusicItem, SearchResults, Shelf } from '@/data/music/types';
import { SkeletonBlock, SkeletonLine } from '@/components/Skeleton';
import { ShelfSkeleton } from '@/skeletons/ShelfSkeleton';

const KIND_LABEL: Record<MusicItem['kind'], string> = {
  song: 'Song',
  video: 'Video',
  album: 'Album',
  playlist: 'Playlist',
  'spotify-playlist': 'Spotify Playlist',
  artist: 'Artist',
  episode: 'Episode',
  podcast: 'Podcast',
  unknown: '',
};

/** Apple's result shelves, in its order, from results grouped by kind. */
function shelvesFor(results: SearchResults): Shelf[] {
  const shelf = (title: string, items: MusicItem[], layout: Shelf['layout']): Shelf | null =>
    items.length ? { title, strapline: null, layout, items, seeAll: null } : null;
  return [
    shelf('Artists', results.artists, 'circle'),
    shelf('Albums', results.albums, 'square'),
    shelf('Playlists', results.playlists, 'square'),
    shelf('Videos', results.videos, 'video'),
  ].filter((s): s is Shelf => !!s);
}

const sectionTitle = 'mx-(--body-gutter) mt-3 type-title-2-emphasized';
// Top Results: 3 columns, gap 20px; 118px cards with 90px artwork.
const topGrid =
  'mx-(--body-gutter) mt-3 mb-8 grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-[607px]:grid-cols-[minmax(0,1fr)] max-[607px]:gap-1';
// The card is a relative box and the play/link layer fills it: a playable
// item's track menu is a sibling over the card's bottom-right corner, because a
// button can't be nested inside the card's own link or button.
const topCard = 'group/top relative rounded-[8px] bg-quinary hover:bg-quaternary';
const top =
  'grid min-h-[118px] w-full grid-cols-[90px_minmax(0,1fr)] items-center gap-x-3.5 px-3 py-3.5 text-left';
const topMenu =
  'absolute right-2 bottom-2 z-3 grid size-7 place-items-center rounded-full text-key opacity-0 transition-opacity duration-100 ease-in group-hover/top:opacity-100 focus-visible:opacity-100 hover:bg-quinary data-open:opacity-100';
const topText = 'flex min-w-0 flex-col gap-0.5';

function TopResult({ item }: { item: MusicItem }) {
  const href = hrefFor(item);
  const playable = item.kind === 'song' || item.kind === 'video';
  const isSpotifyPlaylist = item.kind === 'spotify-playlist';
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const { followSpotifyPlaylist } = await import('@/data/spotify/api');
      await followSpotifyPlaylist({
        id: item.id,
        name: item.title,
        imageUrl: item.thumbnail,
        owner: item.subtitle,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
  };

  const body = (
    <>
      <div className="w-[90px]">
        <Artwork src={item.thumbnail} displayWidth={90} radius={item.kind === 'artist' ? '50%' : 'var(--radius-artwork-small)'} />
      </div>
      <div className={playable || isSpotifyPlaylist ? `${topText} pr-9` : topText}>
        <span className="line-clamp-2 type-title-3">{item.title}</span>
        <span className="truncate type-callout text-secondary">
          {[KIND_LABEL[item.kind], item.kind === 'artist' ? null : item.artists.map((a) => a.name).join(', ')].filter(Boolean).join(' · ')}
        </span>
      </div>
    </>
  );
  return (
    <div className={topCard}>
      {href ? (
        <PrefetchLink to={href} className={top}>
          {body}
        </PrefetchLink>
      ) : (
        <button className={top} onClick={() => playTrack(item)}>
          {body}
        </button>
      )}
      {playable && <TrackMenu track={toTrack(item)} className={topMenu} />}
      {isSpotifyPlaylist && (
        <button
          type="button"
          title={saved ? 'Saved to Sidebar!' : 'Save to Sidebar'}
          onClick={handleSave}
          className="absolute right-2 bottom-2 z-3 grid size-7 place-items-center rounded-full text-key bg-white/[0.08] hover:bg-white/[0.18] text-white transition-opacity duration-100 ease-in group-hover/top:opacity-100 focus-visible:opacity-100"
        >
          {saved ? <BookmarkCheck size={16} className="text-(--theme-accent)" /> : <BookmarkPlus size={16} />}
        </button>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true">
      <div className={sectionTitle}>
        <SkeletonLine lineHeight={22} fontSize={17} width={130} />
      </div>
      <div className={topGrid} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${topCard} ${top}`}>
            <SkeletonBlock width={90} height={90} radius="var(--radius-artwork-small)" />
            <div className={topText}>
              <SkeletonLine lineHeight={20} fontSize={15} width="70%" />
              <SkeletonLine lineHeight={15} fontSize={12} width="40%" />
            </div>
          </div>
        ))}
      </div>
      <ShelfSkeleton kind="circle" />
      <ShelfSkeleton kind="square" />
    </div>
  );
}

function Results({ query, initialSource, categoryId }: { query: string; initialSource: 'all' | 'yt' | 'spotify'; categoryId: string | null }) {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'yt' | 'spotify'>(initialSource);
  const { missing, ready } = useYouTubeReady();
  const search = useSearch(query);
  const youtubeSongs = useSearchSongs(query);
  const spotifySearch = useSpotifySearch(query);
  const spotifyAll = useSpotifySearchAll(query);
  const spotifyCategory = useSpotifyCategoryPlaylists(categoryId ?? '', !!categoryId);

  const spotifyTracks = spotifySearch.data?.pages.flat() ?? [];
  const youtubeTrackPages = youtubeSongs.data?.pages.flatMap((page) => page.data) ?? [];
  const results = search.data;
  const shelves = results ? shelvesFor(results) : [];
  const spotifyCategoryItems: MusicItem[] = (spotifyCategory.data ?? []).map((playlist) => ({
    kind: 'spotify-playlist', id: playlist.id, title: playlist.name, subtitle: playlist.owner ?? 'Spotify',
    artists: [], album: null, thumbnail: playlist.imageUrl, wide: false, durationSec: null, explicit: false,
  }));
  const spotifyPlaylistItems: MusicItem[] = (spotifyAll.data?.playlists ?? []).map((playlist) => ({
    kind: 'spotify-playlist', id: playlist.id, title: playlist.name, subtitle: playlist.owner ? `Playlist • ${playlist.owner}` : 'Spotify Playlist',
    artists: [], album: null, thumbnail: playlist.imageUrl, wide: false, durationSec: null, explicit: false,
  }));
  const spotifyUsers = spotifyAll.data?.users ?? [];
  const normalized = (value: string) => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
  const seenSongs = new Set<string>();
  const youtubeResultSongs = [
    ...youtubeTrackPages,
    ...(results?.songs ?? []).map((item) => toTrack(item)),
  ].filter((track) => {
    const key = `${normalized(track.title)}|${normalized(track.artists.map((artist) => artist.name).join(' '))}`;
    if (seenSongs.has(key)) return false;
    seenSongs.add(key);
    return true;
  });
  const allSeenSongs = new Set<string>();
  const allResultSongs = [...youtubeResultSongs, ...spotifyTracks].filter((track) => {
    const key = `${normalized(track.title)}|${normalized(track.artists.map((artist) => artist.name).join(' '))}`;
    if (allSeenSongs.has(key)) return false;
    allSeenSongs.add(key);
    return true;
  });

  const hasAny = (results && (results.top.length > 0 || shelves.length > 0)) || allResultSongs.length > 0 || spotifyCategoryItems.length > 0 || spotifyPlaylistItems.length > 0 || spotifyUsers.length > 0;

  const isSearchLoading = search.isLoading || youtubeSongs.isLoading || spotifySearch.isLoading || spotifyAll.isLoading || (!!categoryId && spotifyCategory.isLoading);

  if (isSearchLoading && !hasAny) return <ResultsSkeleton />;
  if (search.isError && !spotifyTracks.length && !spotifyPlaylistItems.length && !allResultSongs.length) return <LoadError error={search.error} onRetry={() => void search.refetch()} />;

  if (!isSearchLoading && !hasAny) {
    return <EmptyState title="No Results" detail={`Try a new search for something other than “${query}”.`} />;
  }

  return (
    <>
      {/* Modern Filter Pills */}
      <div className="flex items-center gap-2 px-5 sm:px-8 mb-3 mt-1">
        <button
          onClick={() => setFilter('all')}
          className={`px-3.5 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold transition-colors duration-150 cursor-pointer ${
            filter === 'all'
              ? 'bg-white text-black shadow-sm shadow-white/10'
              : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/80'
          }`}
        >
          All
        </button>
        {!missing && ready && <button
          onClick={() => setFilter('yt')}
          className={`px-3.5 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold transition-colors duration-150 cursor-pointer ${
            filter === 'yt'
              ? 'bg-white text-black shadow-sm shadow-white/10'
              : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/80'
          }`}
        >
          YouTube Music
        </button>}
        <button
          onClick={() => setFilter('spotify')}
          className={`px-3.5 py-1.5 rounded-[8px] text-xs sm:text-sm font-semibold transition-colors duration-150 cursor-pointer ${
            filter === 'spotify'
              ? 'bg-white text-black shadow-sm shadow-white/10'
              : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/80'
          }`}
        >
          Spotify
        </button>
      </div>

      {/* FILTER: ALL */}
      {filter === 'all' && (
        <>
          {spotifyCategoryItems.length > 0 && <section aria-label="Spotify category playlists">
            <h2 className={sectionTitle}>{query} on Spotify</h2>
            <div className={topGrid}>{spotifyCategoryItems.map((item) => <TopResult key={item.id} item={item} />)}</div>
          </section>}
          {spotifyPlaylistItems.length > 0 && (
            <section aria-label="Spotify Playlists">
              <h2 className={sectionTitle}>Playlists from Spotify</h2>
              <div className={topGrid}>{spotifyPlaylistItems.slice(0, 6).map((item) => <TopResult key={item.id} item={item} />)}</div>
            </section>
          )}
          {spotifyUsers.length > 0 && (
            <section aria-label="Spotify Curators & Profiles" className="mb-6">
              <h2 className={sectionTitle}>Spotify Curators & Profiles</h2>
              <div className="mx-(--body-gutter) mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {spotifyUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setFilter('spotify');
                      setParams({ q: u.name, source: 'spotify' });
                    }}
                    className="group flex flex-col items-center text-center p-3 rounded-[12px] bg-white/[0.04] hover:bg-white/[0.09] transition-all cursor-pointer border border-white/[0.06] hover:border-white/[0.14]"
                  >
                    <div className="relative size-20 sm:size-24 rounded-full overflow-hidden mb-2.5 bg-white/[0.06] shadow-md group-hover:scale-105 transition-transform duration-200">
                      {u.imageUrl ? (
                        <img src={u.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="size-full grid place-items-center text-secondary text-2xl font-bold bg-white/10">
                          {u.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="type-body-emphasized text-primary truncate max-w-full font-medium text-sm group-hover:text-white">
                      {u.name}
                    </span>
                    <span className="type-caption text-secondary text-xs truncate max-w-full mt-0.5">
                      Curator • Spotify
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {results && results.top.length > 0 && (
            <section aria-label="Top Results">
              <h2 className={sectionTitle}>Top Results</h2>
              <div className={topGrid}>
                {results.top.map((item) => (
                  <TopResult key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* One deduplicated shelf keeps both providers together without rendering YouTube hits again below. */}
          {allResultSongs.length > 0 && (
            <TrackShelf
              title="Songs"
              tracks={allResultSongs}
              source={{ title: query, type: 'other' }}
            />
          )}
          {youtubeSongs.hasNextPage && <div className="mx-(--body-gutter) -mt-5 mb-7 flex justify-end">
            <button className="rounded-[8px] border border-white/10 bg-white/[0.05] px-3.5 py-2 type-callout-emphasized text-secondary transition-colors hover:bg-white/10 hover:text-primary disabled:opacity-50" disabled={youtubeSongs.isFetchingNextPage} onClick={() => void youtubeSongs.fetchNextPage()}>
              {youtubeSongs.isFetchingNextPage ? 'Loading more…' : 'More YouTube Music songs'}
            </button>
          </div>}
          {spotifySearch.hasNextPage && (
            <div className="mx-(--body-gutter) -mt-5 mb-7 flex justify-end">
              <button className="rounded-[8px] border border-white/10 bg-white/[0.05] px-3.5 py-2 type-callout-emphasized text-secondary transition-colors hover:bg-white/10 hover:text-primary disabled:opacity-50" disabled={spotifySearch.isFetchingNextPage} onClick={() => void spotifySearch.fetchNextPage()}>
                {spotifySearch.isFetchingNextPage ? 'Loading more…' : 'More Spotify results'}
              </button>
            </div>
          )}

          {shelves.length > 0 && <Shelves shelves={shelves} />}
        </>
      )}

      {/* FILTER: YOUTUBE MUSIC ONLY */}
      {filter === 'yt' && (
        <>
          {results && results.top.length > 0 && (
            <section aria-label="Top Results">
              <h2 className={sectionTitle}>Top Results</h2>
              <div className={topGrid}>
                {results.top.map((item) => (
                  <TopResult key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
          {youtubeResultSongs.length > 0 && <TrackShelf
            title="YouTube Music Songs"
            tracks={youtubeResultSongs}
            source={{ title: `YouTube Music: ${query}`, type: 'other' }}
          />}
          {youtubeSongs.hasNextPage && <div className="mx-(--body-gutter) -mt-5 mb-7 flex justify-end">
            <button className="rounded-[8px] border border-white/10 bg-white/[0.05] px-3.5 py-2 type-callout-emphasized text-secondary transition-colors hover:bg-white/10 hover:text-primary disabled:opacity-50" disabled={youtubeSongs.isFetchingNextPage} onClick={() => void youtubeSongs.fetchNextPage()}>
              {youtubeSongs.isFetchingNextPage ? 'Loading more…' : 'More YouTube Music songs'}
            </button>
          </div>}
          {shelves.length > 0 && <Shelves shelves={shelves} />}
          {!youtubeResultSongs.length && !results?.top.length && !shelves.length && <EmptyState title="No YouTube Music Results" detail="This category or search has no visible YouTube Music matches yet." />}
        </>
      )}

      {/* FILTER: SPOTIFY ONLY */}
      {filter === 'spotify' && (
        <>
          {spotifyCategoryItems.length > 0 && <section aria-label="Spotify category playlists">
            <h2 className={sectionTitle}>{query}</h2>
            <div className={topGrid}>{spotifyCategoryItems.map((item) => <TopResult key={item.id} item={item} />)}</div>
          </section>}
          {spotifyPlaylistItems.length > 0 && (
            <section aria-label="Spotify Playlists">
              <h2 className={sectionTitle}>Spotify Playlists</h2>
              <div className={topGrid}>{spotifyPlaylistItems.map((item) => <TopResult key={item.id} item={item} />)}</div>
            </section>
          )}
          {spotifyUsers.length > 0 && (
            <section aria-label="Spotify Curators & Profiles" className="mb-6">
              <h2 className={sectionTitle}>Spotify Curators & Profiles</h2>
              <div className="mx-(--body-gutter) mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {spotifyUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setFilter('spotify');
                      setParams({ q: u.name, source: 'spotify' });
                    }}
                    className="group flex flex-col items-center text-center p-3 rounded-[12px] bg-white/[0.04] hover:bg-white/[0.09] transition-all cursor-pointer border border-white/[0.06] hover:border-white/[0.14]"
                  >
                    <div className="relative size-20 sm:size-24 rounded-full overflow-hidden mb-2.5 bg-white/[0.06] shadow-md group-hover:scale-105 transition-transform duration-200">
                      {u.imageUrl ? (
                        <img src={u.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="size-full grid place-items-center text-secondary text-2xl font-bold bg-white/10">
                          {u.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="type-body-emphasized text-primary truncate max-w-full font-medium text-sm group-hover:text-white">
                      {u.name}
                    </span>
                    <span className="type-caption text-secondary text-xs truncate max-w-full mt-0.5">
                      Curator • Spotify
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {spotifyTracks.length > 0 && (
            <>
              <TrackShelf
                title="Songs"
                tracks={spotifyTracks}
                source={{ title: `Spotify: ${query}`, type: 'other' }}
              />
              {spotifySearch.hasNextPage && (
                <div className="mx-(--body-gutter) -mt-5 mb-7 flex justify-end">
                  <button className="rounded-[8px] border border-white/10 bg-white/[0.05] px-3.5 py-2 type-callout-emphasized text-secondary transition-colors hover:bg-white/10 hover:text-primary disabled:opacity-50" disabled={spotifySearch.isFetchingNextPage} onClick={() => void spotifySearch.fetchNextPage()}>
                    {spotifySearch.isFetchingNextPage ? 'Loading more…' : 'More Spotify results'}
                  </button>
                </div>
              )}
            </>
          )}
          {spotifyTracks.length === 0 && spotifyPlaylistItems.length === 0 && spotifyCategoryItems.length === 0 && spotifyUsers.length === 0 && !isSearchLoading && !spotifySearch.isFetchingNextPage && (
            <EmptyState title="No Spotify Results" detail="Try a different song or artist title." />
          )}
        </>
      )}
    </>
  );
}

function Landing() {
  return <CategoryTiles />;
}

/** Search (report §6): a sticky bar with the field, then categories or grouped results. */
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const requestedSource = params.get('source');
  const categoryId = params.get('category');
  const initialSource: 'all' | 'yt' | 'spotify' = requestedSource === 'spotify' ? 'spotify' : requestedSource === 'youtube' ? 'yt' : 'all';

  return (
    <>
      {/*
        The sticky scope bar holding the field (report §6: 62px, padding 12px 0). Its glass sits on
        a layer behind it, not on the bar: an element with a backdrop-filter is a backdrop root, so
        the suggestions inside it could only blur the bar itself and showed the page underneath unblurred.
      */}
      <div className="mellow-search-header sticky top-0 z-[calc(var(--z-default)+5)] flex justify-center px-(--body-gutter) py-3 before:absolute before:inset-0 before:-z-1">
        <SearchField initial={query} onSearch={(q) => setParams(q ? { q } : {})} />
      </div>
      {query ? <Results key={`${query}:${initialSource}:${categoryId ?? ''}`} query={query} initialSource={initialSource} categoryId={categoryId} /> : <Landing />}
    </>
  );
}
