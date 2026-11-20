import { Check, ChevronLeft, ChevronRight, Download, EyeOff, Film, ListEnd, ListPlus, ListStart, Loader2, MoreHorizontal, Plus, Star } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Menu, MenuHeader, MenuItem, MenuSeparator, type MenuPlacement } from '@/components/Menu';
import { useDownloads } from '@/lib/download';
import {
  useAddToPlaylist,
  useLikeStatus,
  usePlaylistOptions,
  useSetLiked,
  useSignedIn,
} from '@/data/music/queries';
import { useSpotifyPlaylists } from '@/data/spotify/queries';
import { useSpotifySignedIn } from '@/extension/useSpotifyAuth';
import { addTracksToSpotifyPlaylist, createSpotifyPlaylist, LIKED_ID } from '@/data/spotify/api';
import { createPlaylist as createYtPlaylist } from '@/data/music/api';
import { queryClient } from '@/lib/queryClient';
import type { Track } from '@/data/music/types';
import { usePlayer } from '@/state/player';

class MenuErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[TrackMenu] Error caught by boundary:', error, info);
  }
  override render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 text-xs text-secondary">
          <p>Options currently unavailable</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function PlaylistChoices({ track, onDone, onBack }: { track: Track; onDone: () => void; onBack: () => void }) {
  const isSpotifyTrack = track?.videoId?.startsWith('spotify:') ?? false;
  const options = usePlaylistOptions(track?.videoId ?? '', !isSpotifyTrack && !!track?.videoId);
  const spotifyPlaylists = useSpotifyPlaylists();
  const add = useAddToPlaylist();
  const [creating, setCreating] = useState(false);
  const [playlistName, setPlaylistName] = useState('');

  const handleCreateNew = async () => {
    const title = playlistName.trim();
    if (!title || !track) return;
    try {
      if (!isSpotifyTrack && track.videoId) {
        await createYtPlaylist(title, [track.videoId]);
      }
      await createSpotifyPlaylist(title, 'Created with Mellow', [`spotify:track:${track.videoId.replace(/^spotify:/, '')}`]).catch(() => null);
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
          Loading YouTube playlists…
        </MenuItem>
      )}
      {options.isError && (
        <MenuItem disabled onSelect={() => {}}>
          Couldn’t load YouTube playlists
        </MenuItem>
      )}
      {options.data && options.data.length > 0 && options.data.map((option, idx) => (
        <MenuItem
          key={`yt-${option.playlistId || idx}`}
          onSelect={() => {
            if (track?.videoId) {
              add.mutate({ playlistId: option.playlistId, videoId: track.videoId });
              void queryClient.invalidateQueries({ queryKey: ['music', 'library'] });
              void queryClient.invalidateQueries({ queryKey: ['music', 'playlist'] });
            }
            onDone();
          }}
        >
          {option.title}
        </MenuItem>
      ))}

      {spotifyPlaylists.isPending && (
        <MenuItem disabled onSelect={() => {}}>
          Loading Spotify playlists…
        </MenuItem>
      )}

      {spotifyPlaylists.data && spotifyPlaylists.data.length > 0 && (
        <>
          <MenuSeparator />
          <MenuHeader>Spotify Playlists</MenuHeader>
          {spotifyPlaylists.data
            .filter((sp) => sp.id !== 'liked' && sp.id !== LIKED_ID)
            .map((sp, idx) => (
              <MenuItem
                key={`sp-${sp.id || idx}-${idx}`}
                onSelect={async () => {
                  if (track) {
                    const artistName = track.artists?.map((a) => a.name).join(' ') || '';
                    await addTracksToSpotifyPlaylist(sp.id, [track.videoId], { title: track.title, artist: artistName });
                    void queryClient.invalidateQueries({ queryKey: ['spotify', 'data'] });
                  }
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
  const status = useLikeStatus(track?.videoId ?? '');
  const setLiked = useSetLiked();
  const liked = status.data === 'LIKE';
  const effectiveTrack = {
    title: track.title,
    artist: track.artists?.map((a) => a.name).join(', ') ?? '',
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
  const ytSignedIn = useSignedIn();
  const spotifySignedIn = useSpotifySignedIn();
  const signedIn = ytSignedIn || spotifySignedIn;
  const isDownloaded = useDownloads((s) => s.isDownloaded(track?.videoId ?? ''));
  const progress = useDownloads((s) => s.getProgress(track?.videoId ?? ''));
  const downloadTrack = useDownloads((s) => s.downloadTrack);
  const openDownloadsFolder = useDownloads((s) => s.openDownloadsFolder);

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
        icon={
          progress?.status === 'downloading' || progress?.status === 'resolving' ? (
            <Loader2 size={15} className="animate-spin text-(--theme-accent)" />
          ) : isDownloaded ? (
            <Check size={15} className="text-green-400" />
          ) : (
            <Download size={15} />
          )
        }
        onSelect={() => {
          if (isDownloaded) {
            openDownloadsFolder();
          } else {
            void downloadTrack(track);
          }
          onClose();
        }}
      >
        {progress?.status === 'downloading'
          ? `Downloading (${progress.percent}%)`
          : progress?.status === 'resolving'
          ? 'Preparing download…'
          : isDownloaded
          ? 'Downloaded (Open in Folder)'
          : 'Download Song'}
      </MenuItem>
      <MenuItem
        icon={<Film size={15} />}
        onSelect={async () => {
          onClose();
          try {
            const { findOfficialMusicVideo } = await import('@/playback/youtube/officialVideo');
            const { playTrack } = await import('@/components/music/play');
            const artistName = track.artists?.map((a) => a.name).join(' ') || '';
            const matchedId = await findOfficialMusicVideo(track.title, artistName, track.durationSec);
            if (matchedId) {
              playTrack({
                id: matchedId,
                title: track.title,
                kind: 'video',
                subtitle: artistName,
                artists: track.artists,
                album: track.album,
                thumbnail: track.thumbnail,
                durationSec: track.durationSec,
                explicit: track.explicit,
                wide: true,
              });
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
          <MenuErrorBoundary>
            <TrackMenuItems track={track} onClose={close} onNotInterested={onNotInterested} />
          </MenuErrorBoundary>
        </Menu>
      )}
    </>
  );
}
