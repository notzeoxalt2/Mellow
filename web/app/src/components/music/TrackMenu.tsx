import { ChevronLeft, ChevronRight, EyeOff, Film, ListEnd, ListPlus, ListStart, MoreHorizontal, Plus, Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Menu, MenuHeader, MenuItem, MenuSeparator, type MenuPlacement } from '@/components/Menu';
import {
  useAddToPlaylist,
  useLikeStatus,
  usePlaylistOptions,
  useSetLiked,
  useSignedIn,
} from '@/data/music/queries';
import { useSpotifyPlaylists } from '@/data/spotify/queries';
import { addTracksToSpotifyPlaylist, createSpotifyPlaylist } from '@/data/spotify/api';
import { createPlaylist as createYtPlaylist } from '@/data/music/api';
import { queryClient } from '@/lib/queryClient';
import type { Track } from '@/data/music/types';
import { usePlayer } from '@/state/player';

function PlaylistChoices({ track, onDone, onBack }: { track: Track; onDone: () => void; onBack: () => void }) {
  const options = usePlaylistOptions(track.videoId, true);
  const spotifyPlaylists = useSpotifyPlaylists();
  const add = useAddToPlaylist();
  const [creating, setCreating] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

  const handleCreateNew = async () => {
    const title = playlistName.trim();
    if (!title) return;
    try {
      await createYtPlaylist(title, [track.videoId]);
      await createSpotifyPlaylist(title, 'Created with Mellow', [`spotify:track:${track.videoId}`]).catch(() => null);
    } catch {}
    void queryClient.invalidateQueries({ queryKey: ['music', 'library'] });
    void queryClient.invalidateQueries({ queryKey: ['music', 'playlist'] });
    void queryClient.invalidateQueries({ queryKey: ['spotify', 'data'] });
    onDone();
  };

  if (creating) {
    return (
      <div className="p-3 flex flex-col gap-2 min-w-[220px]">
        <span className="text-xs font-semibold text-secondary">New Playlist</span>
        <input
          type="text"
          autoFocus
          placeholder="Playlist title"
          value={playlistName}
          onChange={(e) => setPlaylistName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreateNew();
            if (e.key === 'Escape') setCreating(false);
          }}
          className="w-full rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-(--theme-accent)"
        />
        <div className="flex justify-end gap-1.5 mt-1">
          <button
            type="button"
            className="px-2.5 py-1 text-xs rounded-md text-secondary hover:text-primary hover:bg-white/10 cursor-pointer"
            onClick={() => setCreating(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-2.5 py-1 text-xs rounded-md bg-(--theme-accent) text-white font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
            disabled={!playlistName.trim()}
            onClick={() => void handleCreateNew()}
          >
            Create & Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <MenuItem icon={<ChevronLeft size={14} />} onSelect={onBack}>
        Back
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Plus size={14} />} onSelect={() => setCreating(true)}>
        + New Playlist
      </MenuItem>
      <MenuSeparator />
      <MenuHeader>Add to Playlist</MenuHeader>
      {options.isPending && (
        <MenuItem disabled onSelect={() => {}}>
          Loading…
        </MenuItem>
      )}
      {options.isError && (
        <MenuItem disabled onSelect={() => {}}>
          Couldn’t load your playlists
        </MenuItem>
      )}
      {options.data?.map((option) => (
        <MenuItem
          key={option.playlistId}
          onSelect={() => {
            add.mutate({ playlistId: option.playlistId, videoId: track.videoId });
            void queryClient.invalidateQueries({ queryKey: ['music', 'library'] });
            void queryClient.invalidateQueries({ queryKey: ['music', 'playlist'] });
            onDone();
          }}
        >
          {option.title}
        </MenuItem>
      ))}
      {spotifyPlaylists.data && spotifyPlaylists.data.length > 0 && (
        <>
          <MenuSeparator />
          <MenuHeader>Spotify Playlists</MenuHeader>
          {spotifyPlaylists.data.map((sp) => (
            <MenuItem
              key={sp.id}
              onSelect={async () => {
                await addTracksToSpotifyPlaylist(sp.id, [track.videoId]);
                void queryClient.invalidateQueries({ queryKey: ['spotify', 'data'] });
                onDone();
              }}
            >
              {sp.name}
            </MenuItem>
          ))}
        </>
      )}
    </>
  );
}

/** Favorite and Add to Playlist: the account's actions, signed in only. */
function AccountItems({ track, onClose, onPlaylists }: { track: Track; onClose: () => void; onPlaylists: () => void }) {
  const status = useLikeStatus(track.videoId);
  const setLiked = useSetLiked();
  const liked = status.data === 'LIKE';
  const effectiveTrack = {
    title: track.title,
    artist: track.artists.map((a) => a.name).join(', '),
    durationSec: track.durationSec ?? undefined,
  };
  return (
    <>
      <MenuSeparator />
      <MenuItem
        icon={<Star size={15} fill={liked ? 'currentColor' : 'none'} />}
        disabled={status.isPending}
        onSelect={() => {
          setLiked.mutate({ videoId: track.videoId, liked: !liked, track: effectiveTrack });
          onClose();
        }}
      >
        {liked ? 'Unfavorite' : 'Favorite'}
      </MenuItem>
      <MenuItem icon={<ListPlus size={15} />} trailing={<ChevronRight size={14} />} onSelect={onPlaylists}>
        Add to Playlist
      </MenuItem>
    </>
  );
}

function TrackMenuItems({ track, onClose, onNotInterested }: { track: Track; onClose: () => void; onNotInterested?: () => void }) {
  const [view, setView] = useState<'main' | 'playlists'>('main');
  const signedIn = useSignedIn();
  if (view === 'playlists') {
    return <PlaylistChoices track={track} onDone={onClose} onBack={() => setView('main')} />;
  }
  const { playNext, addToQueue } = usePlayer.getState();
  return (
    <>
      <MenuItem icon={<ListStart size={15} />} onSelect={() => (onClose(), playNext([track]))}>
        Play Next
      </MenuItem>
      <MenuItem icon={<ListEnd size={15} />} onSelect={() => (onClose(), addToQueue([track]))}>
        Add to Queue
      </MenuItem>
      <MenuItem
        icon={<Film size={15} />}
        onSelect={async () => {
          onClose();
          try {
            const { fetchSearch } = await import('@/data/music/api');
            const { playTrack } = await import('@/components/music/play');
            const artistName = track.artists.map((a) => a.name).join(' ');
            const query = `${track.title} ${artistName} official video`;
            const search = await fetchSearch(query);
            const videoHit = search.videos?.[0] || search.top.find((item) => item.kind === 'video');
            if (videoHit && videoHit.id) {
              playTrack(videoHit);
            }
          } catch (e) {
            console.warn('Failed to find official video:', e);
          }
        }}
      >
        Play Official Video
      </MenuItem>
      {onNotInterested && (
        <>
          <MenuSeparator />
          <MenuItem icon={<EyeOff size={15} />} onSelect={() => { onClose(); onNotInterested(); }}>
            Not interested
          </MenuItem>
        </>
      )}
      {signedIn && <AccountItems track={track} onClose={onClose} onPlaylists={() => setView('playlists')} />}
    </>
  );
}

/**
 * The ⋯ button at the end of a track row (report §14): Play Next and Add to
 * Queue for everyone; Favorite and Add to Playlist signed in.
 */
export function TrackMenu({
  track,
  className,
  placement,
  onOpenChange,
  onNotInterested,
}: {
  track: Track;
  className?: string;
  /** Where the menu opens from the button; the player's sit at the bottom of the window. */
  placement?: MenuPlacement;
  /** Told when the menu opens and closes; most mounts don't need to know. */
  onOpenChange?: (open: boolean) => void;
  /** Local recommendation dismissal; this does not send feedback to a music service. */
  onNotInterested?: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  useEffect(() => {
    onOpenChange?.(anchor !== null);
  }, [anchor, onOpenChange]);
  return (
    <>
      <button
        className={className}
        aria-label={`More options for ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-open={anchor !== null || undefined}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={18} strokeWidth={2} />
      </button>
      {anchor && (
        <Menu anchor={anchor} placement={placement} onClose={close} label={track.title}>
          <TrackMenuItems track={track} onClose={close} onNotInterested={onNotInterested} />
        </Menu>
      )}
    </>
  );
}
