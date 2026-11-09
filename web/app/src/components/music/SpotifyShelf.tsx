import { ChevronRight, Sparkles, ExternalLink } from 'lucide-react';
import { PrefetchLink } from '@/components/PrefetchLink';
import { shelfHeader, shelfSection } from '@/components/shelf';
import type { MusicItem } from '@/data/music/types';
import type { SpotifyPlaylist } from '@bitchord/shared/bridge';
import { ShelfScroller } from './ShelfView';
import { SquareLockup } from './Lockups';
import { DeferredMount } from './DeferredMount';

export function playlistToMusicItem(p: SpotifyPlaylist): MusicItem {
  return {
    kind: 'spotify-playlist',
    id: p.id,
    title: p.name,
    subtitle: p.owner ? `By ${p.owner}` : 'Spotify',
    artists: [],
    album: null,
    thumbnail: p.imageUrl,
    wide: false,
    durationSec: null,
    explicit: false,
  };
}

interface SpotifyShelfProps {
  title: string;
  subtitle?: string;
  to?: string;
  playlists: SpotifyPlaylist[];
  icon?: React.ReactNode;
}

export function SpotifyShelf({ title, subtitle, to = '/spotify', playlists, icon }: SpotifyShelfProps) {
  if (!playlists.length) return null;

  return (
    <section className={shelfSection}>
      <div className={shelfHeader}>
        <div className="flex flex-col">
          <h2 className="type-title-2-emphasized flex items-center gap-2">
            {icon}
            {to ? (
              <PrefetchLink to={to} className="group/title inline-flex items-center gap-0.5">
                {title}
                <ChevronRight size={18} strokeWidth={2.6} className="text-secondary group-hover/title:text-primary" />
              </PrefetchLink>
            ) : (
              title
            )}
          </h2>
          {subtitle && <p className="type-callout text-secondary mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <ShelfScroller kind="square">
        {playlists.map((playlist) => {
          const item = playlistToMusicItem(playlist);
          return (
            <li key={playlist.id}>
              <SquareLockup item={item} />
            </li>
          );
        })}
      </ShelfScroller>
    </section>
  );
}

/** Keep long home feeds cheap by mounting playlist cards shortly before scrolling to them. */
export function DeferredSpotifyShelf(props: SpotifyShelfProps) {
  const { title, subtitle, playlists } = props;
  if (!playlists.length) return null;

  return (
    <DeferredMount
      placeholder={(
        <section className={shelfSection} aria-hidden="true" style={{ minHeight: 330 }}>
          <div className={shelfHeader}>
            <div>
              <h2 className="type-title-2-emphasized text-primary/80">{title}</h2>
              {subtitle && <p className="type-callout text-secondary mt-0.5">{subtitle}</p>}
            </div>
          </div>
        </section>
      )}
    >
      <SpotifyShelf {...props} />
    </DeferredMount>
  );
}

export function SpotifyConnectPrompt({ onConnect }: { onConnect: () => void }) {
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;

  const handleChromeSync = () => {
    if (window.electronAPI?.openChromeSync) {
      window.electronAPI.openChromeSync();
    }
  };

  return (
    <section className="mellow-glass mb-6 mx-5 sm:mx-8 rounded-2xl border border-white/10 p-5 shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-xl bg-white/[0.07] text-(--theme-accent) ring-1 ring-white/[0.08] flex-shrink-0">
            <Sparkles size={24} />
          </div>
          <div>
            <h3 className="type-title-3 font-bold text-primary">Your Spotify Playlists & Daily Mixes</h3>
            <p className="type-callout text-secondary mt-0.5">
              Connect Spotify to see your personal playlists, Liked Songs, Canvas animations, and mixes right here.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
          <button
            onClick={onConnect}
            className="rounded-full border border-white/10 bg-white/[0.08] px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-white/[0.13] active:scale-95"
            style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 8%)' }}
          >
            Connect Spotify
          </button>
          {isDesktop && (
            <button
              onClick={handleChromeSync}
              className="flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-medium text-primary transition-all border border-white/10 hover:border-white/20"
              title="Sync session from Google Chrome"
            >
              <ExternalLink size={15} className="text-(--theme-accent)" />
              <span>Sync with Chrome</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
