import { Check, MoreHorizontal, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PrefetchLink } from '@/components/PrefetchLink';
import { PlayIcon } from '@/components/icons/Transport';
import { Menu, MenuItem, MenuSeparator } from '@/components/Menu';
import { useSetListSaved, useSignedIn } from '@/data/music/queries';
import { queryClient } from '@/lib/queryClient';
import type { AppleMotion } from '@/data/apple/motionArt';
import type { HeaderInfo } from '@/data/music/types';
import { Artwork } from './Artwork';
import { ExplicitBadge } from './ExplicitBadge';
import { MotionArtwork } from './MotionArtwork';
import { artistHref } from './links';

interface DetailHeaderProps {
  info: HeaderInfo;
  onPlay: () => void;
  onShuffle: () => void;
  canPlay: boolean;
  /** Playlist ID for playlist pages, enabling delete / unfollow options */
  playlistId?: string;
  isSpotifyPlaylist?: boolean;
  /** More actions after the library toggle (a Spotify playlist's Import). */
  extra?: React.ReactNode;
  /** Apple's motion artwork for an album, over the cover once it plays. */
  motion?: AppleMotion | null;
}

/** Shuffle · Play squircle buttons, report §14; also the Spotify playlist's Import button. */
export const detailButton = {
  pill: 'inline-flex h-9 min-w-[150px] items-center justify-center gap-1.5 rounded-[10px] bg-pill-bg px-3 type-title-3-emphasized text-pill disabled:opacity-40 enabled:hover:opacity-90 cursor-pointer active:scale-95 transition-all',
  circle:
    'grid size-9 place-items-center rounded-[10px] border-[0.75px] border-quaternary bg-quinary text-primary disabled:opacity-40 enabled:hover:bg-quaternary cursor-pointer active:scale-95 transition-all',
};

/**
 * Album and playlist header (report §3, §14): artwork with its glow, title,
 * artist, metadata, a three-line description, then Shuffle · Play.
 */
export function DetailHeader({ info, onPlay, onShuffle, canPlay, playlistId, isSpotifyPlaylist, extra, motion }: DetailHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const setSaved = useSetListSaved();
  const library = signedIn ? info.library : null;

  const handleDeletePlaylist = async () => {
    if (!playlistId || deleting) return;
    if (!window.confirm(`Are you sure you want to ${isSpotifyPlaylist ? 'unfollow' : 'delete'} "${info.title}"?`)) {
      return;
    }
    setDeleting(true);
    try {
      if (isSpotifyPlaylist) {
        const { getBridge } = await import('@/extension/bridge');
        const b = getBridge() as any;
        await b?.call('spotify.unfollowPlaylist', { playlistId }).catch(() => null);
        void queryClient.invalidateQueries({ queryKey: ['spotify'] });
        navigate('/spotify');
      } else {
        const { deletePlaylist } = await import('@/data/music/api');
        await deletePlaylist(playlistId);
        void queryClient.invalidateQueries({ queryKey: ['music'] });
        navigate('/library/playlists');
      }
    } catch (e) {
      console.warn('Failed to delete playlist:', e);
    } finally {
      setDeleting(false);
      setMenuAnchor(null);
    }
  };
  return (
    // Artwork beside the headings, description and actions; stacked and centred below 768px.
    <div className="mx-(--body-gutter) mb-10 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_1fr_auto] gap-x-[34px] pt-11 [grid-template-areas:'artwork_headings'_'artwork_description'_'artwork_actions'] max-md:grid-cols-[1fr] max-md:grid-rows-[auto] max-md:justify-items-center max-md:pt-4 max-md:text-center max-md:[grid-template-areas:'artwork'_'headings'_'actions'_'description']">
      <div className="relative w-[270px] self-start rounded-artwork-lg shadow-[0_10px_20px_0_var(--radiosityShadowColor)] [grid-area:artwork] max-lg:w-[220px] max-md:w-[min(270px,70vw)]">
        {info.thumbnail && (
          // A blurred copy behind the artwork: Apple's radiosity glow.
          <div className="absolute inset-0 -z-1 scale-88 opacity-30 blur-[20px] saturate-200" aria-hidden="true">
            <Artwork src={info.thumbnail} displayWidth={80} radius="var(--radius-artwork-large)" />
          </div>
        )}
        <Artwork src={info.thumbnail} displayWidth={270} radius="var(--radius-artwork-large)" eager />
        {/* Apple's motion artwork, over the cover once it's playing. */}
        {motion && (
          <MotionArtwork
            key={motion.url}
            motion={motion}
            className="absolute inset-0 size-full rounded-artwork-lg object-cover opacity-0 transition-opacity duration-600 ease-in data-ready:opacity-100"
          />
        )}
      </div>
      <div className="flex flex-col pt-[37px] [grid-area:headings] max-md:items-center max-md:pt-5">
        <h1 className="flex items-center type-large-title-emphasized leading-[30px] max-md:justify-center">
          {info.title}
          {info.explicit && <ExplicitBadge size={16} />}
        </h1>
        {info.artists.length > 0 && (
          <div className="type-large-title leading-[30px] text-primary">
            {info.artists.map((artist, i) => {
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
          </div>
        )}
        <div className="mt-1 type-callout-emphasized text-secondary">{[info.subtitle, info.meta].filter(Boolean).join(' · ')}</div>
      </div>
      {info.description && (
        <div className="mt-[38px] flex max-w-[440px] items-end type-body-tall text-secondary [grid-area:description] max-md:mt-5">
          <p className={expanded ? 'min-w-0' : 'min-w-0 line-clamp-3'}>
            {info.description}
          </p>
          {!expanded && info.description.length > 180 && (
            <button className="shrink-0 ps-[5px] type-subhead-emphasized text-primary" onClick={() => setExpanded(true)}>
              MORE
            </button>
          )}
        </div>
      )}
      <div className="mt-3.5 flex items-center gap-3.5 self-end [grid-area:actions]">
        <button className={detailButton.circle} aria-label="Shuffle" onClick={onShuffle} disabled={!canPlay}>
          <Shuffle size={18} strokeWidth={2.2} />
        </button>
        <button className={detailButton.pill} onClick={onPlay} disabled={!canPlay}>
          <PlayIcon size={18} />
          <span>Play</span>
        </button>
        {library && (
          <button
            className={detailButton.circle}
            aria-label={library.saved ? 'Remove from Library' : 'Add to Library'}
            aria-pressed={library.saved}
            title={library.saved ? 'In your library' : 'Add to Library'}
            disabled={setSaved.isPending}
            onClick={() => setSaved.mutate({ playlistId: library.playlistId, saved: !library.saved })}
          >
            {library.saved ? <Check size={18} strokeWidth={2.4} /> : <Plus size={18} strokeWidth={2.4} />}
          </button>
        )}
        {playlistId && (
          <>
            <button
              className={detailButton.circle}
              aria-label="Playlist options"
              title="Playlist options"
              onClick={(e) => setMenuAnchor(menuAnchor ? null : e.currentTarget)}
            >
              <MoreHorizontal size={18} strokeWidth={2} />
            </button>
            {menuAnchor && (
              <Menu anchor={menuAnchor} onClose={() => setMenuAnchor(null)} label={info.title}>
                <MenuItem
                  icon={<Trash2 size={16} className="text-red-400" />}
                  destructive
                  disabled={deleting}
                  onSelect={handleDeletePlaylist}
                >
                  {deleting ? 'Deleting…' : isSpotifyPlaylist ? 'Unfollow Playlist' : 'Delete Playlist'}
                </MenuItem>
              </Menu>
            )}
          </>
        )}
        {extra}
      </div>
    </div>
  );
}
