import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { PrefetchLink } from '@/components/PrefetchLink';
import { useCategories, useBrowse } from '@/data/music/queries';
import { firstBrowseArtwork } from '@/data/music/mappers';
import { useSpotifyCategories } from '@/data/spotify/queries';
import catalog from '@/data/appleCategories.json';

type AppleCategory = { title: string; artwork: string; appleUrl: string; searchTerm: string };
type AppleGroup = { title: string; source: string; categories: AppleCategory[] };
type Source = 'apple' | 'youtube' | 'spotify';
const appleGroups = (catalog.groups as AppleGroup[]);

const targetFor = (title: string, source: Exclude<Source, 'apple'>, categoryId?: string) =>
  `/search?q=${encodeURIComponent(title)}&source=${source}${categoryId ? `&category=${encodeURIComponent(categoryId)}` : ''}`;

function ArtworkTile({ title, image, color, to, index, externalUrl }: { title: string; image?: string | null; color?: string; to: string; index: number; externalUrl?: string }) {
  return (
    <li className="group/tile relative min-w-0">
      <PrefetchLink
        to={to}
        aria-label={`Browse ${title}`}
        className="mellow-category group relative isolate block aspect-square overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#18191f] shadow-[0_8px_24px_rgb(0_0_0/14%)] transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-white/[0.2] hover:shadow-[0_14px_34px_rgb(0_0_0/24%)] focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        style={color ? { backgroundColor: color } : undefined}
      >
        {image && <img
          src={image}
          alt=""
          loading={index < 12 ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]"
          onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
        />}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/10" />
        <span className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4">
          <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.02em] text-white drop-shadow-[0_1px_8px_rgb(0_0_0/70%)] sm:text-[15px]">{title}</span>
          <Search size={15} aria-hidden="true" className="mb-0.5 shrink-0 text-white/75 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </span>
      </PrefetchLink>
      {externalUrl && <a
        href={externalUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${title} on Apple Music`}
        title="Open this Apple Music catalog page"
        className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-[8px] border border-white/20 bg-black/55 text-white/90 opacity-0 shadow-sm backdrop-blur-md transition-opacity duration-150 group-hover/tile:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
      ><ExternalLink size={15} aria-hidden="true" /></a>}
    </li>
  );
}

function AppleTile({ category, index }: { category: AppleCategory; index: number }) {
  const artwork = category.artwork.replace(/\/1200x1200bf\.webp$/, '/600x600bf.webp');
  // Keep Apple's editorial art, but search the category name itself across
  // the connected Spotify and YouTube Music catalogs. Adding "playlist"
  // narrowed broad genres (Pop, Dance, Hip-Hop) into noisy playlist matches.
  return <ArtworkTile title={category.title} image={artwork} to={`/search?q=${encodeURIComponent(category.searchTerm)}`} index={index} externalUrl={category.appleUrl} />;
}

/** YouTube does not publish category images in its genre chip list. Borrow the first real cover from that exact category's browse page, on demand as the card enters view. */
function YouTubeTile({ category, index }: { category: { title: string; color: string; link: { browseId: string; params: string | null } }; index: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || nearViewport) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearViewport]);
  const browse = useBrowse(nearViewport ? category.link : { browseId: '', params: null });
  const cover = browse.data ? firstBrowseArtwork(browse.data)?.thumbnail : null;
  return (
    <li ref={ref} className="min-w-0">
      <PrefetchLink
        to={`/browse/${encodeURIComponent(category.link.browseId)}${category.link.params ? `?params=${encodeURIComponent(category.link.params)}` : ''}`}
        aria-label={`Browse YouTube Music ${category.title}`}
        className="mellow-category group relative isolate block aspect-square overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#18191f] shadow-[0_8px_24px_rgb(0_0_0/14%)] transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:border-white/[0.2] focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        style={{ backgroundColor: category.color }}
      >
        {cover && <img src={cover} alt="" loading={index < 12 ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]" />}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/5" />
        <span className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4">
          <span className="min-w-0 truncate text-[13px] font-semibold text-white drop-shadow-[0_1px_8px_rgb(0_0_0/70%)] sm:text-[15px]">{category.title}</span>
          <Search size={15} aria-hidden="true" className="shrink-0 text-white/75 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </PrefetchLink>
    </li>
  );
}

function SourceTabs({ source, onChange }: { source: Source; onChange: (source: Source) => void }) {
  const choices: [Source, string][] = [['apple', 'Apple Music'], ['spotify', 'Spotify'], ['youtube', 'YouTube Music']];
  return <div className="mx-(--body-gutter) mt-4 mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Category source">
    {choices.map(([id, label]) => <button key={id} role="tab" aria-selected={source === id} onClick={() => onChange(id)} className={`rounded-[8px] px-3.5 py-2 type-callout-emphasized transition-colors ${source === id ? 'bg-white text-black' : 'bg-white/[0.07] text-secondary hover:bg-white/[0.12] hover:text-primary'}`}>{label}</button>)}
  </div>;
}

/** Browse editorial categories by provider; every provider tile uses its own catalog and artwork. */
export function CategoryTiles() {
  const [source, setSource] = useState<Source>('apple');
  const youtube = useCategories();
  const spotify = useSpotifyCategories(source === 'spotify');
  let appleOffset = 0;
  return (
    <div className="pb-8">
      <header className="mx-(--body-gutter) pt-2 pb-2">
        <p className="type-caption-1 text-secondary">Browse the catalog</p>
        <h1 className="mt-1 type-large-title">Categories</h1>
        <p className="mt-1 type-callout text-secondary">Explore the real genre, mood and editorial catalogs for each service.</p>
      </header>
      <SourceTabs source={source} onChange={setSource} />
      {source === 'apple' && appleGroups.map((group) => {
        const start = appleOffset;
        appleOffset += group.categories.length;
        return <section key={group.title} className="pt-3" aria-label={group.title}>
          <h2 className="mx-(--body-gutter) type-title-2-emphasized">{group.title}</h2>
          <ul className="mx-(--body-gutter) mt-3 mb-8 grid grid-cols-6 gap-4 max-2xl:grid-cols-5 max-xl:grid-cols-4 max-lg:grid-cols-3 max-[607px]:grid-cols-2 max-[607px]:gap-2.5">
            {group.categories.map((category, i) => <AppleTile key={`${group.title}-${category.title}`} category={category} index={start + i} />)}
          </ul>
        </section>;
      })}
      {source === 'youtube' && (youtube.data?.length ? youtube.data.map((group) => <section key={group.title} className="pt-3" aria-label={group.title}>
        <h2 className="mx-(--body-gutter) type-title-2-emphasized">{group.title}</h2>
        <ul className="mx-(--body-gutter) mt-3 mb-8 grid grid-cols-6 gap-4 max-2xl:grid-cols-5 max-xl:grid-cols-4 max-lg:grid-cols-3 max-[607px]:grid-cols-2 max-[607px]:gap-2.5">
          {group.categories.map((category, i) => <YouTubeTile key={`${group.title}-${category.link.browseId}`} category={category} index={i} />)}
        </ul>
      </section>) : <div className="mx-(--body-gutter) mt-8 flex flex-wrap items-center gap-3" aria-live="polite">
        <p className="type-callout text-secondary">{youtube.isFetching ? 'Loading YouTube Music categories…' : 'YouTube Music’s genre feed did not load. Check its connection, then retry.'}</p>
        {!youtube.isFetching && <button type="button" onClick={() => void youtube.refetch()} className="rounded-[8px] border border-white/10 bg-white/[0.06] px-3 py-1.5 type-callout-emphasized text-primary transition-colors hover:bg-white/[0.12]">Retry</button>}
      </div>)}
      {source === 'spotify' && <>
        {spotify.data?.length ? <section className="pt-3" aria-label="Spotify Browse categories">
          <h2 className="mx-(--body-gutter) type-title-2-emphasized">Browse all</h2>
          <ul className="mx-(--body-gutter) mt-3 mb-8 grid grid-cols-6 gap-4 max-2xl:grid-cols-5 max-xl:grid-cols-4 max-lg:grid-cols-3 max-[607px]:grid-cols-2 max-[607px]:gap-2.5">
            {spotify.data.map((category, i) => <ArtworkTile key={category.id} title={category.name} image={category.imageUrl} to={targetFor(category.name, 'spotify', category.id)} index={i} />)}
          </ul>
        </section> : <p className="mx-(--body-gutter) mt-8 type-callout text-secondary">{spotify.isLoading ? 'Loading Spotify Browse categories…' : 'Spotify’s Browse category feed is unavailable for this account or API session.'}</p>}
      </>}
      <p className="mx-(--body-gutter) type-caption-1 text-tertiary">Spotify category data and images come from Spotify. YouTube Music genre tiles open their own genre browse pages; Apple artwork is used only in the Apple Music tab.</p>
    </div>
  );
}
