import { lazy, Suspense, useEffect, useState } from 'react';
import { resumeSession } from '@/party/listenTogether';
import { startPartySync } from '@/party/partySync';
import { startHistoryReporting } from '@/playback/historyReporting';
import { startLivePresence } from '@/playback/livePresence';
import { Outlet } from 'react-router';
import { PrefetchLink } from '@/components/PrefetchLink';
import { config } from '@/config';
import { useExtension } from '@/extension/useExtension';
import { isMobileBrowser } from '@/lib/platform';
import { useUi } from '@/state/ui';
import { usePlayer } from '@/state/player';
import { useArtworkColor } from '@/lib/artworkColor';
import { sizedArtwork } from '@/lib/artwork';
import { applyThemeAccent, getActiveThemeId, getThemeById, initTheme, isDynamicAccentSyncEnabled } from '@/lib/themeManager';
import { applyAppearancePreferences, readAppearancePreferences } from '@/lib/appearance';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { AppTitleBar } from './AppTitleBar';
import { Banner, bannerButtonClass } from './Banner';
import { MobileTopBar } from './MobileTopBar';
import { PlayerBar } from './PlayerBar';
import { SidePanel } from './SidePanel';
import { Sidebar } from './Sidebar';

const mobile = isMobileBrowser();

// It carries am-lyrics; loaded the first time it opens, as the side panel's lyrics are.
const FullScreenPlayer = lazy(() => import('./FullScreenPlayer').then((m) => ({ default: m.FullScreenPlayer })));

/**
 * The app frame (report §1): glass sidebar, the scrolling page, the floating
 * player pill, the side panel, and the bottom band when there is one.
 */
export function AppShell() {
  useKeyboardShortcuts();
  // Listen Together: pick a party back up after a reload, and keep the player in step with it.
  useEffect(() => {
    resumeSession();
    return startPartySync();
  }, []);
  // Plays into the account's YouTube Music history (Settings › Share Listening Activity).
  useEffect(() => startHistoryReporting(), []);
  // Counts this tab in the "listening now" figure beside the phone and PC apps.
  useEffect(() => startLivePresence(), []);
  // Desktop mini player and taskbar remote controls
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onPlayerAction) return;
    const unsub = window.electronAPI.onPlayerAction((action) => {
      const player = usePlayer.getState();
      if (action === 'togglePlay') player.togglePlay();
      else if (action === 'next' || action === 'nexttrack') player.next();
      else if (action === 'prev' || action === 'previous' || action === 'previoustrack') player.previous();
      else if (action.startsWith('seek:')) {
        const ratio = Number(action.slice(5));
        const durationSec = player.nowPlaying?.durationSec ?? 0;
        if (Number.isFinite(ratio) && durationSec > 0) player.seek(Math.max(0, Math.min(1, ratio)) * durationSec);
      }
    });
    return () => unsub?.();
  }, []);
  const extension = useExtension();
  const bannerDismissed = useUi((s) => s.installBannerDismissed);
  const dismissBanner = useUi((s) => s.dismissInstallBanner);
  const fullScreen = useUi((s) => s.fullScreen);
  const sidePanel = useUi((s) => s.sidePanel);

  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const playColor = useArtworkColor(nowPlaying?.artworkUrl);
  const [appearance, setAppearance] = useState(readAppearancePreferences);
  const glowColorMode = appearance.glowColorMode;

  useEffect(() => {
    initTheme();
    applyAppearancePreferences(readAppearancePreferences());
    const refreshAppearance = () => setAppearance(readAppearancePreferences());
    window.addEventListener('mellow:appearance-changed', refreshAppearance);
    return () => window.removeEventListener('mellow:appearance-changed', refreshAppearance);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const updateArtworkTheme = () => {
      if (playColor) root.style.setProperty('--playback-tint', playColor.background);
      else root.style.removeProperty('--playback-tint');

      const theme = getThemeById(getActiveThemeId());
      // Use a neutral transition while artwork analysis is pending so a
      // previous palette never flashes green over a white sleeve.
      const followsArtwork = !!nowPlaying && isDynamicAccentSyncEnabled();
      // Near-white/monochrome sleeves have no reliable saturated accent.
      // Fall back to a quiet neutral instead of a stale default green.
      const accent = followsArtwork ? playColor?.accent ?? '#aeb4bd' : theme.colors.accent;
      const accentGlow = followsArtwork ? playColor?.accentGlow ?? 'rgba(174,180,189,0.24)' : theme.colors.accentGlow;
      applyThemeAccent(accent, accentGlow);

      const glowTint = glowColorMode === 'gray'
        ? '#aeb4c2'
        : glowColorMode === 'glass'
          ? '#e4e8ef'
          : glowColorMode === 'custom'
            ? appearance.customGlowColor
          // Use the sleeve's vivid color for chrome glow. The dark ambient
          // background color is reserved for page backdrops; using it here
          // made the sidebar edge nearly invisible and tinted pale sleeves.
          : playColor?.accent ?? (nowPlaying ? '#aeb4bd' : accent);
      root.style.setProperty('--ambient-glow-tint', glowTint);

      if (isDesktop && window.electronAPI?.setWindowsAccentSync) {
        const systemAccent = nowPlaying ? playColor?.accent ?? accent : undefined;
        void window.electronAPI.setWindowsAccentSync(appearance.windowsAccentSync, systemAccent)
          .then((result) => {
            window.dispatchEvent(new CustomEvent('mellow:windows-accent-status', {
              detail: result.ok ? '' : result.message ?? 'Windows did not apply the accent color.',
            }));
          })
          .catch(() => {
            window.dispatchEvent(new CustomEvent('mellow:windows-accent-status', {
              detail: 'Windows accent sync could not be reached. Switch it off and on to retry.',
            }));
          });
      }

      // Keep the desktop mini-player's ring in step with artwork analysis and
      // appearance changes, even when the current track itself did not change.
      if (isDesktop && nowPlaying && window.electronAPI?.updateNowPlaying) {
        window.electronAPI.updateNowPlaying({
          videoId: nowPlaying.videoId,
          title: nowPlaying.title,
          artist: nowPlaying.artist,
          artworkUrl: nowPlaying.artworkUrl,
          durationSec: nowPlaying.durationSec,
          status: usePlayer.getState().status,
          accent,
          accentGlow,
        });
      }
    };
    updateArtworkTheme();
    window.addEventListener('mellow:theme-changed', updateArtworkTheme);
    return () => window.removeEventListener('mellow:theme-changed', updateArtworkTheme);
  }, [appearance.customGlowColor, appearance.windowsAccentSync, glowColorMode, isDesktop, nowPlaying, playColor]);

  let banner = null;
  if (mobile) {
    banner = (
      <Banner
        title="BitChord is better in the app."
        detail="Phone browsers can’t run the BitChord extension. The Android app has everything."
        action={
          <a className={bannerButtonClass} href={config.androidAppUrl} target="_blank" rel="noreferrer">
            Get the App
          </a>
        }
      />
    );
  } else if (!isDesktop && extension.state === 'missing' && !bannerDismissed) {
    banner = (
      <Banner
        title="Play YouTube Music with the BitChord extension."
        detail="Playback, YouTube Music sign-in and Spotify need the extension. Addons and lyrics work without it."
        action={
          <PrefetchLink className={bannerButtonClass} to="/extension">
            Get the Extension
          </PrefetchLink>
        }
        onDismiss={dismissBanner}
      />
    );
  }

  return (
    <div className="relative grid h-full grid-rows-[minmax(0,1fr)_auto]">
      {!fullScreen && <AppTitleBar />}
      {/* The side panel slides in from beyond the right edge; never let it scroll the page. */}
      <div className="relative min-h-0 overflow-hidden">
        <Sidebar />
        <MobileTopBar />
        {/* The page scrolls under the fixed sidebar and the floating player. */}
        <main
          id="scrollable-page"
          className="absolute inset-0 overflow-x-hidden overflow-y-auto pl-(--web-navigation-width) [scrollbar-gutter:stable] max-sm:pt-(--mobile-top-bar-height) max-sm:pl-0 transition-colors duration-500"
          style={{
            background: 'var(--app-bg, #0c0d12)',
          }}
        >
          {/* Clears the floating player bar with generous breathing room */}
          <div className="relative min-h-full pb-36">
            {appearance.artworkBackdrop && sidePanel !== 'now-playing' && appearance.artworkGlow > 0 && nowPlaying?.artworkUrl && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden" aria-hidden="true">
                {/* This layer is blurred by 48px; a smaller decode saves memory without visible detail loss. */}
                {!appearance.lowResourceMode && (
                  <img
                    key={nowPlaying.artworkUrl}
                    src={sizedArtwork(nowPlaying.artworkUrl, 640)}
                    alt=""
                    className="absolute inset-[-56px] size-[calc(100%+112px)] object-cover blur-[48px] saturate-[1.12] transition-opacity duration-300 ease-out"
                    style={{ opacity: 'var(--artwork-glow-art-opacity, 0.2016)' }}
                    referrerPolicy="no-referrer"
                    decoding="async"
                  />
                )}
                <div className="absolute inset-0 transition-opacity duration-300 ease-out" aria-hidden="true" style={{ opacity: 'var(--artwork-glow-bloom-opacity, 0.2268)' }}>
                  <div className="mellow-ambient-bloom absolute inset-0" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-[#0c0d12]/55 via-[#0c0d12]/65 to-[#0c0d12]" />
              </div>
            )}
            {/* Album, playlist, and artist pages softly carry their own artwork colour into the page. */}
            <div className="mellow-page-tint pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative z-1 min-h-full">
            <Outlet />
            </div>
          </div>
        </main>
        <PlayerBar />
        <SidePanel />
      </div>
      {banner}
      {fullScreen && (
        <Suspense fallback={null}>
          <FullScreenPlayer />
        </Suspense>
      )}
    </div>
  );
}
