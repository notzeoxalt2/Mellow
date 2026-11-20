import { ListMusic, Settings, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { readAppearancePreferences } from '@/lib/appearance';
import { PrefetchLink, PrefetchNavLink } from '@/components/PrefetchLink';
import { LogoMark } from '@/components/icons/LogoMark';
import { Menu, MenuItem } from '@/components/Menu';
import { queryClient } from '@/lib/queryClient';
import {
  AlbumsIcon,
  AllPlaylistsIcon,
  ArtistsIcon,
  DownloadsIcon,
  HomeIcon,
  MadeForYouIcon,
  NewIcon,
  RecentlyAddedIcon,
  SearchIcon,
  SongsIcon,
  type NavIconProps,
} from '@/components/icons/NavIcons';
import { hrefFor } from '@/components/music/links';
import { LIBRARY_SECTIONS, type LibrarySection } from '@/data/music/library';
import { useLibraryPlaylists, useSignedIn } from '@/data/music/queries';
import { useSpotifyPlaylists } from '@/data/spotify/queries';
import { useExtensionUpdate } from '@/extension/useExtensionUpdate';
import { openSpotifySignIn, useSpotifySignedIn } from '@/extension/useSpotifyAuth';
import { useUi } from '@/state/ui';
import { AccountButton } from './AccountButton';
import { usePlayer } from '@/state/player';
import { EqualizerBars } from '@/components/music/EqualizerBars';
import { sizedArtwork } from '@/lib/artwork';

interface NavItem {
  to: string;
  label: string;
  Icon: (props: NavIconProps) => React.ReactNode;
}

const PRIMARY: NavItem[] = [
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/new', label: 'New', Icon: NewIcon },
];

const LIBRARY_ICONS: Record<Exclude<LibrarySection, 'playlists'>, NavItem['Icon']> = {
  recent: RecentlyAddedIcon,
  artists: ArtistsIcon,
  albums: AlbumsIcon,
  songs: SongsIcon,
  'made-for-you': MadeForYouIcon,
};

const LIBRARY: NavItem[] = [
  ...(Object.keys(LIBRARY_ICONS) as (keyof typeof LIBRARY_ICONS)[]).map((section) => ({
    to: `/library/${section}`,
    label: LIBRARY_SECTIONS[section].title,
    Icon: LIBRARY_ICONS[section],
  })),
  { to: '/downloads', label: 'Downloads', Icon: DownloadsIcon },
];

// A sidebar row; NavLink sets aria-current on the page's own row.
const item =
  'group flex h-9 items-center gap-2.5 mb-0.5 px-2.5 py-1.5 rounded-[8px] type-body-reduced text-secondary hover:text-white hover:bg-white/[0.06] aria-[current=page]:bg-white/[0.12] aria-[current=page]:text-white transition-all duration-200';
// Smooth animated color transition on hover and active page, with subtle scale animation
const icon =
  'inline-grid size-5 flex-none place-items-center text-secondary transition-all duration-300 ease-out group-hover:text-(--theme-accent) group-hover:scale-110 group-aria-[current=page]:text-(--theme-accent) group-aria-[current=page]:scale-110';
const navLabel = 'min-w-0 truncate';
// "Library", "Playlists" (report §1: 12px/15px 600, secondary, padding 4px 8px).
const sectionHeader = 'mt-4 px-2 py-1 type-callout-emphasized text-secondary flex items-center justify-between';
const list = 'flex flex-col';

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <ul className={list}>
      {items.map(({ to, label, Icon }) => (
        <li key={to}>
          <PrefetchNavLink to={to} className={item} onClick={onNavigate}>
            <Icon size={24} className={icon} />
            <span className={navLabel}>{label}</span>
          </PrefetchNavLink>
        </li>
      ))}
    </ul>
  );
}

/** Spotify's playlists, elevated for fast access */
function SpotifyNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useSpotifyPlaylists();
  const currentSourceId = usePlayer((s) => s.queue[s.index]?.source?.id);
  const status = usePlayer((s) => s.status);
  const isPlaying = status === 'playing' || status === 'buffering';
  const [contextItem, setContextItem] = useState<{ id: string; name: string; anchor: HTMLElement } | null>(null);

  const handleUnfollow = async () => {
    if (!contextItem) return;
    const { id, name } = contextItem;
    if (!window.confirm(`Unfollow Spotify playlist "${name}"?`)) {
      setContextItem(null);
      return;
    }
    try {
      const { getBridge } = await import('@/extension/bridge');
      const b = getBridge() as any;
      await b?.call('spotify.unfollowPlaylist', { playlistId: id }).catch(() => null);
      void queryClient.invalidateQueries({ queryKey: ['spotify'] });
    } catch {}
    setContextItem(null);
  };

  return (
    <>
      <h2 className={sectionHeader}>Spotify</h2>
      <ul className={list}>
        <li>
          <PrefetchNavLink to="/spotify" end className={item} onClick={onNavigate}>
            <AllPlaylistsIcon size={24} className={icon} />
            <span className={navLabel}>All Spotify Playlists</span>
          </PrefetchNavLink>
        </li>
        {playlists.data?.map((playlist) => {
          const isActive = currentSourceId === playlist.id || currentSourceId === `spotify:${playlist.id}`;
          return (
            <li key={playlist.id}>
              <PrefetchNavLink
                to={`/spotify/playlist/${encodeURIComponent(playlist.id)}`}
                className={item}
                style={isActive ? { backgroundColor: 'color-mix(in srgb, var(--theme-accent) 16%, transparent)' } : undefined}
                onClick={onNavigate}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextItem({ id: playlist.id, name: playlist.name, anchor: e.currentTarget });
                }}
              >
                <span className={icon}>
                  {isActive ? (
                    <EqualizerBars size={16} playing={isPlaying} />
                  ) : (
                    <ListMusic size={17} strokeWidth={1.8} />
                  )}
                </span>
                <span className={`${navLabel} ${isActive ? 'font-semibold text-(--theme-accent)' : ''}`}>{playlist.name}</span>
              </PrefetchNavLink>
            </li>
          );
        })}
      </ul>
      {contextItem && (
        <Menu anchor={contextItem.anchor} onClose={() => setContextItem(null)} label={contextItem.name}>
          <MenuItem icon={<Trash2 size={16} className="text-red-400" />} destructive onSelect={handleUnfollow}>
            Unfollow Playlist
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

/** Library and Playlists from YouTube Music */
function LibraryNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useLibraryPlaylists();
  const currentSourceId = usePlayer((s) => s.queue[s.index]?.source?.id);
  const status = usePlayer((s) => s.status);
  const isPlaying = status === 'playing' || status === 'buffering';
  const [contextItem, setContextItem] = useState<{ id: string; title: string; anchor: HTMLElement } | null>(null);

  const handleDelete = async () => {
    if (!contextItem) return;
    const { id, title } = contextItem;
    if (!window.confirm(`Delete YouTube playlist "${title}"?`)) {
      setContextItem(null);
      return;
    }
    try {
      const { deletePlaylist } = await import('@/data/music/api');
      await deletePlaylist(id);
      void queryClient.invalidateQueries({ queryKey: ['music'] });
    } catch {}
    setContextItem(null);
  };

  return (
    <>
      <h2 className={sectionHeader}>Library</h2>
      <NavList items={LIBRARY} onNavigate={onNavigate} />
      <h2 className={sectionHeader}>Playlists</h2>
      <ul className={list}>
        <li>
          <PrefetchNavLink to="/library/playlists" className={item} onClick={onNavigate}>
            <AllPlaylistsIcon size={24} className={icon} />
            <span className={navLabel}>{LIBRARY_SECTIONS.playlists.title}</span>
          </PrefetchNavLink>
        </li>
        {playlists.data?.map((playlist) => {
          const isActive = currentSourceId === playlist.id;
          return (
            <li key={playlist.id}>
              <PrefetchNavLink
                to={hrefFor(playlist) ?? '/library/playlists'}
                className={item}
                style={isActive ? { backgroundColor: 'color-mix(in srgb, var(--theme-accent) 16%, transparent)' } : undefined}
                onClick={onNavigate}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextItem({ id: playlist.id, title: playlist.title, anchor: e.currentTarget });
                }}
              >
                <span className={icon}>
                  {isActive ? (
                    <EqualizerBars size={16} playing={isPlaying} />
                  ) : (
                    <ListMusic size={17} strokeWidth={1.8} />
                  )}
                </span>
                <span className={`${navLabel} ${isActive ? 'font-semibold text-(--theme-accent)' : ''}`}>{playlist.title}</span>
              </PrefetchNavLink>
            </li>
          );
        })}
      </ul>
      {contextItem && (
        <Menu anchor={contextItem.anchor} onClose={() => setContextItem(null)} label={contextItem.title}>
          <MenuItem icon={<Trash2 size={16} className="text-red-400" />} destructive onSelect={handleDelete}>
            Delete Playlist
          </MenuItem>
        </Menu>
      )}
    </>
  );
}

/** The left glass sidebar (report §1). */
export function Sidebar() {
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const update = useExtensionUpdate();
  const signedIn = useSignedIn();
  const spotifySignedIn = useSpotifySignedIn();
  const artworkUrl = usePlayer((s) => s.nowPlaying?.artworkUrl ?? null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const [appearance, setAppearance] = useState(readAppearancePreferences);
  const close = () => setDrawerOpen(false);

  useEffect(() => {
    const onAppChange = () => setAppearance(readAppearancePreferences());
    window.addEventListener('mellow:appearance-changed', onAppChange);
    return () => window.removeEventListener('mellow:appearance-changed', onAppChange);
  }, []);

  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;

  const handleConnectSpotify = () => {
    if (window.electronAPI?.openSpotifyLogin) {
      window.electronAPI.openSpotifyLogin();
    } else {
      openSpotifySignIn();
    }
    close();
  };

  const showSidebarGlow = appearance.sidebarGlow && appearance.sidebarGlowStrength > 0;

  return (
    <>
      {/* Below 484px the sidebar is a drawer opened from the top bar's menu button. */}
      <nav
        className="absolute inset-y-0 left-0 z-(--z-web-chrome) isolate flex w-(--web-navigation-width) flex-col bg-[#0c0d12]/75 backdrop-blur-2xl max-sm:w-[min(300px,82vw)] max-sm:-translate-x-full max-sm:shadow-glass max-sm:transition-transform max-sm:duration-(--duration-panel) max-sm:ease-panel max-sm:data-[open=true]:translate-none"
        data-open={drawerOpen}
        aria-label="Main"
      >
        {/* Ambient top-left lighting aura behind navigation */}
        {showSidebarGlow && (
          <div
            className="pointer-events-none absolute inset-0 -z-1 will-change-transform"
            style={{
              background:
                'radial-gradient(ellipse 95% 65% at 15% 8%, color-mix(in srgb, var(--ambient-glow-tint, var(--theme-accent)) 42%, transparent) 0%, transparent 72%)',
              opacity: `clamp(0, calc(${(appearance.sidebarGlowStrength / 100).toFixed(3)} * var(--music-beat-opacity, 1)), 1)`,
              transform: 'scale(var(--music-beat-scale, 1))',
              transformOrigin: 'top left',
            }}
            aria-hidden="true"
          />
        )}
        {artworkUrl && showSidebarGlow && (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
            <img
              src={sizedArtwork(artworkUrl, 500)}
              alt=""
              className="absolute -inset-20 size-[calc(100%+160px)] object-cover blur-[40px] saturate-[1.4] brightness-115 will-change-transform"
              style={{
                opacity: `clamp(0, calc(${((appearance.sidebarGlowStrength / 100) * 0.44).toFixed(3)} * var(--music-beat-opacity, 1)), 0.9)`,
                transform: 'scale(var(--music-beat-scale, 1))',
                transformOrigin: 'top left',
              }}
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(12_13_18/0.24),rgb(12_13_18/0.76)_46%,rgb(12_13_18/0.95))]" />
          </div>
        )}
        <div className="relative z-1 flex h-9 flex-none items-center px-5 pt-1" aria-label="Mellow">
          <PrefetchLink to="/home" className="inline-flex items-center rounded-[6px]" aria-label="Mellow, Home" onClick={close}>
            <LogoMark size={17} playing={playing} />
          </PrefetchLink>
        </div>
        {showSidebarGlow && <div className="mellow-sidebar-edge-glow pointer-events-none absolute inset-0 z-0" aria-hidden="true" />}
        <div className="mellow-sidebar-scroll relative z-1 min-h-0 flex-1 overflow-y-auto pr-3 pl-5 pt-1">
          <NavList items={PRIMARY} onNavigate={close} />

          {(signedIn || isDesktop) && <LibraryNav onNavigate={close} />}

          {spotifySignedIn ? (
            <SpotifyNav onNavigate={close} />
          ) : (
            <div className="mt-4 px-1">
              <button
                onClick={handleConnectSpotify}
                className="flex items-center gap-2.5 rounded-nav px-2.5 py-2 text-xs font-medium text-(--theme-accent) bg-white/[0.06] hover:bg-white/[0.11] border border-(--theme-accent)/20 transition-all w-full text-left"
              >
                <Sparkles size={16} className="text-(--theme-accent)" />
                <span>Connect Spotify</span>
              </button>
            </div>
          )}
        </div>
        <div className="relative z-1 flex flex-col gap-2 border-t border-white/[0.06] bg-transparent pt-3 pr-3 pb-4 pl-5">
          {!isDesktop && (
            <PrefetchNavLink to="/extension" className={item} onClick={close}>
              <span className={icon}>
                <LogoMark size={19} />
              </span>
              <span className={navLabel}>Mellow Extension</span>
              {update.state === 'available' && (
                <span className="ml-auto rounded-[10px] bg-key px-[7px] py-0.5 type-subhead-emphasized text-white" title={`Version ${update.latest.version} is available`}>
                  Update
                </span>
              )}
            </PrefetchNavLink>
          )}
          <div className="flex min-w-0 items-center gap-2 pt-1">
            <div className="min-w-0 flex-1"><AccountButton /></div>
            <PrefetchNavLink to="/settings" className="grid size-9 flex-none place-items-center rounded-[8px] text-secondary hover:bg-white/[0.08] hover:text-primary aria-[current=page]:text-primary transition-colors cursor-pointer" aria-label="Settings" title="Settings" onClick={close}>
              <Settings size={18} strokeWidth={1.9} />
            </PrefetchNavLink>
          </div>
        </div>
      </nav>
      {drawerOpen && <div className="absolute inset-0 z-[calc(var(--z-web-chrome)-1)] hidden bg-scrim max-sm:block" onClick={close} aria-hidden="true" />}
    </>
  );
}
