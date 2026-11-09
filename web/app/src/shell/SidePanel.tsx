import { lazy, Suspense } from 'react';
import { usePlayer } from '@/state/player';
import { sizedArtwork } from '@/lib/artwork';
import { useLowResourceMode, usePlayerArtworkAmbient } from '@/lib/appearance';
import { useUi } from '@/state/ui';
import { UpNext } from './UpNext';

// am-lyrics is large; it loads the first time the panel opens (prompt §3).
const LyricsPanel = lazy(() => import('./LyricsPanel').then((m) => ({ default: m.LyricsPanel })));
const NowPlayingPanel = lazy(() => import('./NowPlayingPanel').then((m) => ({ default: m.NowPlayingPanel })));

/** Up Next / Lyrics glass panel (report §7). */
export function SidePanel() {
  const panel = useUi((s) => s.sidePanel);
  const artworkUrl = usePlayer((s) => s.nowPlaying?.artworkUrl ?? null);
  const artworkAmbient = usePlayerArtworkAmbient();
  const lowResourceMode = useLowResourceMode();
  // Hidden under the full-screen player, which has its own lyrics: one am-lyrics at a time.
  const fullScreen = useUi((s) => s.fullScreen);
  if (!panel || fullScreen) return null;

  return (
    <aside
      className={`absolute inset-y-0 right-0 z-(--z-web-chrome) isolate flex w-(--side-panel-width) animate-slide-in flex-col border-l border-white/[0.07] shadow-none max-sm:w-full ${panel === 'now-playing' && artworkAmbient ? 'bg-[#0d0e13]/76 backdrop-blur-2xl' : 'glass-material'}`}
      aria-label={panel === 'up-next' ? 'Up Next' : panel === 'lyrics' ? 'Lyrics' : 'Now Playing'}
    >
      {panel === 'now-playing' && artworkAmbient && artworkUrl && (
        <div className="pointer-events-none absolute inset-0 -z-1 overflow-hidden" aria-hidden="true">
          {!lowResourceMode && (
            <img
              src={sizedArtwork(artworkUrl, 480)}
              alt=""
              className="mellow-now-playing-ambient absolute object-cover"
              referrerPolicy="no-referrer"
              decoding="async"
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,13,18,.24),rgba(12,13,18,.56)_46%,rgba(12,13,18,.72))]" />
        </div>
      )}
      {panel === 'up-next' ? (
        <UpNext />
      ) : panel === 'lyrics' ? (
        <Suspense fallback={null}>
          <LyricsPanel />
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <NowPlayingPanel />
        </Suspense>
      )}
    </aside>
  );
}
