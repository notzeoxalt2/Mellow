import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PrefetchLink } from '@/components/PrefetchLink';
import { PauseIcon, PlayIcon } from '@/components/icons/Transport';
import type { MusicItem } from '@/data/music/types';
import { usePlayer } from '@/state/player';
import { Artwork } from './Artwork';
import { ExplicitBadge } from './ExplicitBadge';
import { EqualizerBars } from './EqualizerBars';
import { artistHref, hrefFor } from './links';
import { playItem, playTrack, toTrack } from './play';
import { TrackMenu } from './TrackMenu';
import { markNotInterested } from '@/lib/notInterested';

const isPlayable = (item: MusicItem) =>
  item.kind === 'song' ||
  item.kind === 'video' ||
  item.kind === 'spotify-playlist' ||
  item.kind === 'playlist' ||
  item.kind === 'album';

/* Lockups (report §2). */
const lockup = 'flex min-w-0 flex-col';
const caption = 'mt-2.5 flex min-w-0 flex-col gap-0.5';
const title = 'flex min-w-0 items-center type-callout [&>:first-child]:truncate';
const subtitle = 'truncate type-callout text-secondary';
const overlayLink = 'absolute inset-0 z-1 rounded-[inherit]';

/** Artist names as links where YouTube links them, else the given subtitle. */
function Byline({ item }: { item: MusicItem }) {
  const linked = item.artists.some((a) => a.id);
  if (!linked || item.kind === 'album' || item.kind === 'playlist') return <>{item.subtitle}</>;
  return (
    <>
      {item.artists.map((artist, i) => {
        const href = artistHref(artist.id);
        return (
          <span key={`${artist.name}-${i}`}>
            {i > 0 && ', '}
            {href ? (
              <PrefetchLink to={href} className="hover:underline">
                {artist.name}
              </PrefetchLink>
            ) : (
              artist.name
            )}
          </span>
        );
      })}
    </>
  );
}

function useItemPlaying(item: MusicItem) {
  const currentSourceId = usePlayer((s) => s.queue[s.index]?.source?.id);
  const currentTrackId = usePlayer((s) => s.nowPlaying?.videoId);
  const status = usePlayer((s) => s.status);
  const isPlaying = status === 'playing' || status === 'buffering';

  const isCurrent =
    (item.kind === 'spotify-playlist' && (currentSourceId === item.id || currentSourceId === `spotify:${item.id}`)) ||
    (item.kind === 'playlist' && (currentSourceId === item.id || currentSourceId === `spotify:${item.id}`)) ||
    (item.kind === 'album' && currentSourceId === item.id) ||
    ((item.kind === 'song' || item.kind === 'video') && currentTrackId === item.id);

  return { isCurrent, isPlaying };
}

function PlayPlatter({ item }: { item: MusicItem }) {
  const [loading, setLoading] = useState(false);
  const { isCurrent, isPlaying } = useItemPlaying(item);

  return (
    <button
      className="pointer-events-auto absolute right-2.5 bottom-2.5 grid size-10 place-items-center rounded-full bg-white text-black shadow-2xl shadow-black/80 transition-all duration-200 hover:scale-105 active:scale-95 hover:bg-neutral-100 opacity-0 translate-y-2 group-hover/card:opacity-100 group-hover/card:translate-y-0 group-focus-visible/card:opacity-100 cursor-pointer"
      aria-label={isCurrent && isPlaying ? `Pause ${item.title}` : `Play ${item.title}`}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (loading) return;
        if (isCurrent) {
          usePlayer.getState().togglePlay();
          return;
        }
        setLoading(true);
        try {
          await playItem(item);
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? (
        <Loader2 size={20} className="animate-spin text-black" />
      ) : isCurrent && isPlaying ? (
        <PauseIcon size={22} className="text-black fill-black" />
      ) : (
        <PlayIcon size={22} className="ml-0.5 text-black fill-black" />
      )}
    </button>
  );
}

/** The artwork with its hover scrim, linking to the item or playing it. */
function LockupArtwork({
  item,
  width,
  aspect,
  isCurrent,
  isPlaying,
  allowNotInterested = false,
}: {
  item: MusicItem;
  width?: number;
  aspect: number;
  isCurrent?: boolean;
  isPlaying?: boolean;
  allowNotInterested?: boolean;
}) {
  const href = hrefFor(item);

  return (
    <div
      className={`group/art relative w-full rounded-artwork-md overflow-hidden shadow-sm shadow-black/30 group-hover/card:shadow-xl group-hover/card:shadow-black/60 transition-all duration-200 ${
        isCurrent ? 'ring-2 ring-(--theme-accent) shadow-lg shadow-(--theme-accent-glow)' : ''
      }`}
    >
      <Artwork src={item.thumbnail} displayWidth={width || 250} aspect={aspect} radius="var(--radius-artwork-medium)" />
      {href ? (
        <PrefetchLink to={href} className={overlayLink} aria-label={item.title} />
      ) : (
        <button className={overlayLink} aria-label={`Play ${item.title}`} onClick={() => playTrack(item)} />
      )}

      {/* Floating active equalizer indicator when item is playing */}
      {isCurrent && (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-2 flex items-center justify-center rounded-full bg-black/75 px-2.5 py-1.5 shadow-lg backdrop-blur-md border border-white/10">
          <EqualizerBars size={12} playing={isPlaying} />
        </div>
      )}

      {/* Hover scrim and platter */}
      <div
        className={`pointer-events-none absolute inset-0 z-2 rounded-[inherit] bg-lockup-hover transition-opacity duration-150 ease-in group-focus-visible/card:opacity-100 group-hover/card:opacity-100 ${
          isCurrent && isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {isPlayable(item) && <PlayPlatter item={item} />}
      </div>
      {/* The track menu */}
      {isPlayable(item) && (
        <TrackMenu
          track={toTrack(item)}
          onNotInterested={allowNotInterested ? () => markNotInterested(item.id) : undefined}
          className="absolute top-2 right-2 z-3 grid size-7 place-items-center rounded-full bg-thin-material text-white opacity-0 transition-opacity duration-100 ease-in [backdrop-filter:saturate(180%)_blur(60px)] group-hover/card:opacity-100 focus-visible:opacity-100 hover:bg-key-bg data-open:opacity-100"
        />
      )}
    </div>
  );
}

/** Square lockup (Spotify card styling): artwork, hover scrim with play platter, title and subtitle. */
export function SquareLockup({ item, width, allowNotInterested = false }: { item: MusicItem; width?: number; allowNotInterested?: boolean }) {
  const href = hrefFor(item);
  const { isCurrent, isPlaying } = useItemPlaying(item);

  return (
    <div
      className="group/card relative flex min-w-0 flex-col w-full transition-all duration-200 ease-out"
      style={width ? { width: `${width}px` } : undefined}
    >
      <LockupArtwork item={item} width={width} aspect={1} isCurrent={isCurrent} isPlaying={isPlaying} allowNotInterested={allowNotInterested} />
      <div className={caption}>
        <div className={title}>
          {href ? (
            <PrefetchLink
              to={href}
              className={`hover:underline truncate ${isCurrent ? 'text-(--theme-accent) font-semibold' : 'text-primary'}`}
            >
              {item.title}
            </PrefetchLink>
          ) : (
            <span className={`truncate ${isCurrent ? 'text-(--theme-accent) font-semibold' : 'text-primary'}`}>{item.title}</span>
          )}
          {item.explicit && <ExplicitBadge />}
        </div>
        <div className={subtitle}>
          <Byline item={item} />
        </div>
      </div>
    </div>
  );
}

/** 16:9 video lockup. */
export function VideoLockup({ item, width, allowNotInterested = false }: { item: MusicItem; width?: number; allowNotInterested?: boolean }) {
  const { isCurrent, isPlaying } = useItemPlaying(item);
  return (
    <div
      className="group/card relative flex min-w-0 flex-col w-full transition-all duration-200 ease-out"
      style={width ? { width: `${width}px` } : undefined}
    >
      <LockupArtwork item={item} width={width} aspect={16 / 9} isCurrent={isCurrent} isPlaying={isPlaying} allowNotInterested={allowNotInterested} />
      <div className={caption}>
        <div className={title}>
          <span className={`truncate ${isCurrent ? 'text-(--theme-accent) font-semibold' : 'text-primary'}`}>{item.title}</span>
          {item.explicit && <ExplicitBadge />}
        </div>
        <div className={subtitle}>{item.subtitle}</div>
      </div>
    </div>
  );
}

/** Circular artist lockup (report §2, type H). */
export function CircleLockup({ item, width = 140 }: { item: MusicItem; width?: number }) {
  return (
    <PrefetchLink to={hrefFor(item) ?? '#'} className="group/circle flex min-w-0 flex-col items-center gap-2.5">
      <Artwork src={item.thumbnail} displayWidth={width} radius="50%" />
      <span className="max-w-full truncate text-center type-body group-hover/circle:underline">{item.title}</span>
    </PrefetchLink>
  );
}

/** A song row inside a shelf: 40px art, title, byline. */
export function TrackLockup({ item, onPlay, allowNotInterested = false }: { item: MusicItem; onPlay?: () => void; allowNotInterested?: boolean }) {
  const play = onPlay ?? (() => playTrack(item));
  const { isCurrent, isPlaying } = useItemPlaying(item);

  return (
    <div className={`group/track grid h-[55px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 py-[7.5px] px-2 rounded-xl transition-colors ${isCurrent ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
      <button className="group/art relative w-10 h-10 rounded-artwork-sm overflow-hidden" aria-label={`Play ${item.title}`} onClick={play}>
        <Artwork src={item.thumbnail} displayWidth={40} radius="var(--radius-artwork-small)" />
        <span
          className="absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition-opacity duration-100 ease-in group-hover/track:opacity-100 group-focus-visible/art:opacity-100"
          aria-hidden="true"
        >
          {isCurrent && isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-px px-1">
        <div className="flex min-w-0 items-center gap-2 type-body">
          <button className={`min-w-0 truncate text-left ${isCurrent ? 'text-(--theme-accent) font-semibold' : 'text-primary'}`} onClick={play}>
            {item.title}
          </button>
          {isCurrent && isPlaying && <EqualizerBars size={12} playing={isPlaying} />}
          {item.explicit && <ExplicitBadge />}
        </div>
        <div className="truncate type-callout text-secondary">
          <Byline item={item} />
        </div>
      </div>
      {isPlayable(item) && (
        <TrackMenu
          track={toTrack(item)}
          onNotInterested={allowNotInterested ? () => markNotInterested(item.id) : undefined}
          className="grid size-7 place-items-center rounded-full text-key opacity-0 transition-opacity duration-100 ease-in group-hover/track:opacity-100 focus-visible:opacity-100 hover:bg-quinary data-open:opacity-100"
        />
      )}
    </div>
  );
}
