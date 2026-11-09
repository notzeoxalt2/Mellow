import { useState, type CSSProperties } from 'react';
import { useParams } from 'react-router';
import { PlayIcon } from '@/components/icons/Transport';
import { Artwork } from '@/components/music/Artwork';
import { browseHref } from '@/components/music/links';
import { playList } from '@/components/music/play';
import { Shelves } from '@/components/music/ShelfView';
import { SquareLockup } from '@/components/music/Lockups';
import { TrackMenu } from '@/components/music/TrackMenu';
import { LoadError, NeedsExtension } from '@/components/music/States';
import { requestAppleAccess, useAppleArtistArt, useUngrantedAppleOrigins, type AppleArtistArt } from '@/data/apple/artistArt';
import { useArtist, useYouTubeReady } from '@/data/music/queries';
import { useArtworkColor } from '@/lib/artworkColor';
import { usePageTint } from '@/lib/usePageTint';
import { usePlayer } from '@/state/player';
import { ArtistSkeleton } from '@/skeletons/PageSkeletons';

/**
 * The name, or Apple's title logo in its place (AppleArtistArt.kt). Until the
 * logo has drawn, the name stands in, so the header is never left empty; a
 * logo that fails to load leaves the name.
 */
function ArtistName({ name, apple }: { name: string; apple: AppleArtistArt | null }) {
  const logo = apple?.logoUrl ?? null;
  const [shown, setShown] = useState<string | null>(null);
  const logoShown = !!logo && shown === logo;
  return (
    <h1
      className="type-header-emphasized text-[clamp(34px,5vw,64px)] leading-[1.05] [text-shadow:0_2px_20px_#00000059] data-logo:w-full data-logo:[text-shadow:none]"
      data-logo={logoShown || undefined}
    >
      {!logoShown && name}
      {logo && (
        <img
          key={logo}
          // Apple's title logo in place of the name: at most 82% of the page's width and 30% of the
          // photo's height (the photo is the column's width over 1.93, and never taller than 70vh).
          className="mt-0 mb-1.5 block h-auto max-h-[min(calc((100vw-var(--web-navigation-width))/1.93*0.3),21vh)] w-auto max-w-[min(82%,640px)] [filter:drop-shadow(0_2px_16px_#00000040)]"
          src={logo}
          alt={logoShown ? name : ''}
          hidden={!logoShown}
          // Its proportions are known before it decodes; the CSS caps its size.
          style={{ aspectRatio: String(apple!.logoAspect) }}
          decoding="async"
          onLoad={() => setShown(logo)}
        />
      )}
    </h1>
  );
}

/**
 * An artist (report §4): full-bleed hero with the name and Play, Top Songs,
 * then shelves. Where Apple Music has the artist, the page takes Apple's
 * header as the phone does: its photograph, its title logo over it, its
 * colour behind the whole page, and its colour on the Play button.
 */
export default function ArtistPage() {
  const id = decodeURIComponent(useParams().id ?? '');
  const { missing } = useYouTubeReady();
  const artist = useArtist(id);
  const apple = useAppleArtistArt(artist.data?.name);
  const artistColor = useArtworkColor(artist.data?.heroImage);
  const currentVideoId = usePlayer((s) => s.nowPlaying?.videoId ?? null);
  const togglePlay = usePlayer((s) => s.togglePlay);
  usePageTint(apple ?? artistColor);
  const appleUngranted = useUngrantedAppleOrigins();
  if (missing) return <NeedsExtension />;
  if (artist.isError) return <LoadError error={artist.error} onRetry={() => void artist.refetch()} />;
  if (!artist.data) return <ArtistSkeleton />;

  const data = artist.data;
  const topSongs = { title: `${data.name}: Top Songs`, type: 'artist' as const, id: data.id };
  const featuredShelves = data.shelves.filter((shelf) => /latest|album|release|single/i.test(shelf.title)).slice(0, 2);
  const featuredTitles = new Set(featuredShelves.map((shelf) => shelf.title));
  const latestItem = featuredShelves[0]?.items[0];
  const essentialItems = [
    ...(featuredShelves[0]?.items.slice(1) ?? []),
    ...featuredShelves.slice(1).flatMap((shelf) => shelf.items),
  ].slice(0, 8);
  const supportingShelves = data.shelves.filter((shelf) => !featuredTitles.has(shelf.title));
  return (
    <>
      {/* Keep the artist image atmospheric without letting it consume the page. */}
      <header className="relative h-[clamp(320px,29vw,480px)] overflow-hidden">
        <div className="absolute inset-0">
          <Artwork src={data.heroImage} displayWidth={1600} aspect={16 / 9} className="size-full" eager />
          {/* Apple's photograph fades in over YouTube's once it arrives. */}
          {apple && (
            <img
              key={apple.heroUrl}
              className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-400 ease-in data-loaded:opacity-100"
              src={apple.heroUrl}
              alt=""
              decoding="async"
              onLoad={(e) => e.currentTarget.setAttribute('data-loaded', '')}
            />
          )}
        </div>
        {/* The image melts into the page at the bottom (Apple's masked blur frame), into Apple's colour when the page is tinted with it. */}
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#08090a00_12%,#08090a12_38%,#08090a9c_78%,#08090af2_100%)]"
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1.5 px-(--body-gutter) pb-7 text-left">
          <ArtistName name={data.name} apple={apple} />
          {data.audience && <p className="type-callout-emphasized text-secondary">{data.audience}</p>}
          <div className="mt-2.5 flex items-center gap-2.5">
          <button
            className="grid size-12 place-items-center rounded-[10px] bg-(--play-fill,var(--keyColorBG)) text-(--play-glyph,#fff) shadow-[0_2px_6px_-4px_#0006,inset_0_0_2px_#ffffff1a] disabled:opacity-40 enabled:hover:scale-[1.04]"
            // Apple's fill for the Play circle, with the triangle in the page's colour,
            // as the phone cuts it out of the circle; white without a key colour.
            style={
              apple
                ? ({ '--play-fill': apple.keyColor ?? '#ffffff', '--play-glyph': apple.background } as CSSProperties)
                : undefined
            }
            aria-label={`Play ${data.name}`}
            disabled={!data.topSongs.length}
            onClick={() => {
              if (currentVideoId === data.topSongs[0]?.videoId) togglePlay();
              else playList(data.topSongs, 0, { source: topSongs });
            }}
          >
            <PlayIcon size={23} />
          </button>
          </div>
          {!apple && appleUngranted.length > 0 && (
            // The lyrics panel's permission notice, as a pill over the photograph.
            <div className="mt-3 flex items-center gap-2.5 rounded-[999px] bg-[#0000004d] py-1.5 pr-2 pl-3.5 type-callout text-[#ffffffcc] [backdrop-filter:blur(20px)_saturate(1.6)]">
              <span>Apple Music artist art needs the extension’s permission.</span>
              <button
                className="flex-none rounded-[999px] bg-[#ffffff26] px-2.5 py-1 type-callout-emphasized text-white hover:bg-[#ffffff40]"
                // Stays until the extension confirms the grant (checked when this tab comes back).
                onClick={requestAppleAccess}
              >
                Allow
              </button>
            </div>
          )}
        </div>
      </header>

      {(data.topSongs.length > 0 || featuredShelves.length > 0) && (
        <div className="mx-(--body-gutter) mt-6 grid grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] gap-9 max-lg:grid-cols-1">
          {data.topSongs.length > 0 && (
            <section aria-label="Top Songs">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="type-title-2-emphasized">Top Songs</h2>
                {data.topSongsSeeAll && <a className="type-callout-emphasized text-secondary hover:text-primary" href={browseHref(data.topSongsSeeAll)}>See all</a>}
              </div>
              <div className="overflow-hidden border-y border-white/[0.09]">
                {data.topSongs.slice(0, 8).map((track, index) => (
                  <div key={`${track.videoId}-${index}`} className="group/artist-row grid h-[64px] grid-cols-[24px_44px_minmax(0,1fr)_32px] items-center gap-3 border-b border-white/[0.07] px-2 transition-colors hover:bg-white/[0.055] last:border-b-0">
                    <span className="text-center type-callout tabular-nums text-tertiary group-hover/artist-row:hidden">{index + 1}</span>
                    <button className="hidden size-[30px] place-items-center rounded-[6px] bg-white/10 text-primary group-hover/artist-row:grid" aria-label={`Play ${track.title}`} onClick={() => {
                      if (currentVideoId === track.videoId) togglePlay();
                      else playList(data.topSongs, index, { source: topSongs });
                    }}>
                      <PlayIcon size={15} />
                    </button>
                    <Artwork src={track.thumbnail} displayWidth={44} radius="var(--radius-artwork-small)" />
                    <button className="min-w-0 text-left" onClick={() => {
                      if (currentVideoId === track.videoId) togglePlay();
                      else playList(data.topSongs, index, { source: topSongs });
                    }}>
                      <span className="block truncate type-body-emphasized">{track.title}</span>
                      <span className="block truncate type-callout text-secondary">{track.artists.map((artist) => artist.name).join(', ') || data.name}{track.album?.name ? ` · ${track.album.name}` : ''}</span>
                    </button>
                    <TrackMenu track={track} className="grid size-8 place-items-center rounded-[6px] text-secondary opacity-0 transition-opacity hover:bg-white/10 hover:text-primary group-hover/artist-row:opacity-100 focus-visible:opacity-100" />
                  </div>
                ))}
              </div>
            </section>
          )}
          {featuredShelves.length > 0 && (
            <div className="min-w-0 space-y-7">
              {latestItem && (
                <section aria-label="Latest Release">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="type-title-2-emphasized">Latest Release</h2>
                    {featuredShelves[0]?.seeAll && <a className="type-callout-emphasized text-secondary hover:text-primary" href={browseHref(featuredShelves[0].seeAll!)}>See all</a>}
                  </div>
                  <div className="max-w-[360px]">
                    <SquareLockup item={latestItem} width={148} />
                  </div>
                </section>
              )}
              {essentialItems.length > 0 && (
                <section aria-label="Essential Albums">
                  <h2 className="mb-3 type-title-2-emphasized">Essential Albums</h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-x-4 gap-y-5">
                    {essentialItems.map((item, itemIndex) => (
                      <div className="min-w-0" key={`${item.id}-${itemIndex}`}>
                        <SquareLockup item={item} width={128} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      <Shelves shelves={supportingShelves} />

      {data.description && (
        <section className="mx-(--body-gutter) mt-3 mb-10" aria-label={`About ${data.name}`}>
          <h2 className="type-title-2-emphasized">About {data.name}</h2>
          <p className="mt-2 max-w-[720px] type-body-tall whitespace-pre-line text-secondary">{data.description}</p>
        </section>
      )}
    </>
  );
}
