import { useSyncExternalStore } from 'react';

export interface AppearancePreferences {
  glassEnabled: boolean;
  glassOpacity: number;
  glassBlur: number;
  artworkBackdrop: boolean;
  artworkGlow: number;
  /** Use current-cover ambience in the right-side Now Playing panel. */
  playerArtworkAmbient: boolean;
  /** Use the artwork wash in the full-screen player; dark original is the default. */
  fullScreenPlayerAmbient: boolean;
  /** Strength of the cover bloom in the full-screen player. */
  fullScreenArtworkGlow: number;
  /** Blur radius of the full-screen player's optional ambient artwork wash. */
  fullScreenAmbientBlur: number;
  /** Spread of the shared artwork color wash across app surfaces. */
  ambientSpread: number;
  /** Opacity of the artwork wash inside the Now Playing rail. */
  nowPlayingPanelGlow: number;
  /** Width of the artwork wash inside the Now Playing rail. */
  nowPlayingPanelGlowSpread: number;
  /** Blur radius of the artwork wash inside the Now Playing rail. */
  nowPlayingPanelGlowBlur: number;
  /** Strength of the music-tinted rim around navigation chrome. */
  edgeGlow: number;
  /** Width of the music-tinted rim around navigation chrome. */
  edgeGlowSpread: number;
  /** Amount of very slow opacity-only movement in the ambient wash; 0 disables it. */
  ambientGlowAmount: number;
  /** Color source for the ambient wash and edge glow. */
  glowColorMode: 'music' | 'gray' | 'glass' | 'custom';
  /** User-selected ambient tint, used only when glowColorMode is custom. */
  customGlowColor: string;
  ambientGlowMotion: boolean;
  /** Independent ambient pulse speed, in percent. */
  ambientMotionSpeed: number;
  /** Stream a YouTube Music video alongside its audio in the player. */
  playMusicVideos: boolean;
  /** Allow looping Canvas and Apple motion artwork in the full-screen player. */
  playAnimatedArtwork: boolean;
  /** Prefer lower GPU and memory use while gaming or on a smaller machine. */
  lowResourceMode: boolean;
  /** Temporarily match the Windows shell accent to the current cover. */
  windowsAccentSync: boolean;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  glassEnabled: true,
  glassOpacity: 82,
  glassBlur: 22,
  artworkBackdrop: true,
  artworkGlow: 42,
  playerArtworkAmbient: true,
  fullScreenPlayerAmbient: false,
  fullScreenArtworkGlow: 42,
  fullScreenAmbientBlur: 82,
  ambientSpread: 78,
  nowPlayingPanelGlow: 22,
  nowPlayingPanelGlowSpread: 55,
  nowPlayingPanelGlowBlur: 44,
  edgeGlow: 42,
  edgeGlowSpread: 42,
  ambientGlowAmount: 24,
  ambientMotionSpeed: 62,
  glowColorMode: 'music',
  customGlowColor: '#9b55f5',
  ambientGlowMotion: true,
  playMusicVideos: false,
  playAnimatedArtwork: false,
  lowResourceMode: false,
  windowsAccentSync: false,
};

const STORAGE_KEY = 'mellow:appearance';

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function readAppearancePreferences(): AppearancePreferences {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return DEFAULT_APPEARANCE;
    const value = parsed as Partial<AppearancePreferences>;
    return {
      glassEnabled: typeof value.glassEnabled === 'boolean' ? value.glassEnabled : DEFAULT_APPEARANCE.glassEnabled,
      glassOpacity: clamp(value.glassOpacity, 55, 94, DEFAULT_APPEARANCE.glassOpacity),
      glassBlur: clamp(value.glassBlur, 0, 36, DEFAULT_APPEARANCE.glassBlur),
      artworkBackdrop: typeof value.artworkBackdrop === 'boolean' ? value.artworkBackdrop : DEFAULT_APPEARANCE.artworkBackdrop,
      artworkGlow: clamp(value.artworkGlow, 0, 100, DEFAULT_APPEARANCE.artworkGlow),
      playerArtworkAmbient: typeof value.playerArtworkAmbient === 'boolean' ? value.playerArtworkAmbient : DEFAULT_APPEARANCE.playerArtworkAmbient,
      fullScreenPlayerAmbient: typeof value.fullScreenPlayerAmbient === 'boolean' ? value.fullScreenPlayerAmbient : DEFAULT_APPEARANCE.fullScreenPlayerAmbient,
      fullScreenArtworkGlow: clamp(value.fullScreenArtworkGlow, 0, 100, DEFAULT_APPEARANCE.fullScreenArtworkGlow),
      fullScreenAmbientBlur: clamp(value.fullScreenAmbientBlur, 16, 140, DEFAULT_APPEARANCE.fullScreenAmbientBlur),
      ambientSpread: clamp(value.ambientSpread, 40, 120, DEFAULT_APPEARANCE.ambientSpread),
      nowPlayingPanelGlow: clamp(value.nowPlayingPanelGlow, 0, 60, DEFAULT_APPEARANCE.nowPlayingPanelGlow),
      nowPlayingPanelGlowSpread: clamp(value.nowPlayingPanelGlowSpread, 24, 100, DEFAULT_APPEARANCE.nowPlayingPanelGlowSpread),
      nowPlayingPanelGlowBlur: clamp(value.nowPlayingPanelGlowBlur, 8, 96, DEFAULT_APPEARANCE.nowPlayingPanelGlowBlur),
      edgeGlow: clamp(value.edgeGlow, 0, 100, DEFAULT_APPEARANCE.edgeGlow),
      edgeGlowSpread: clamp(value.edgeGlowSpread, 12, 80, DEFAULT_APPEARANCE.edgeGlowSpread),
      ambientGlowAmount: clamp(value.ambientGlowAmount, 0, 100, value.ambientGlowMotion === false ? 0 : DEFAULT_APPEARANCE.ambientGlowAmount),
      glowColorMode: value.glowColorMode === 'gray' || value.glowColorMode === 'glass' || value.glowColorMode === 'custom' ? value.glowColorMode : 'music',
      customGlowColor: typeof value.customGlowColor === 'string' && /^#[\da-f]{6}$/i.test(value.customGlowColor) ? value.customGlowColor : DEFAULT_APPEARANCE.customGlowColor,
      ambientGlowMotion: typeof value.ambientGlowMotion === 'boolean' ? value.ambientGlowMotion : DEFAULT_APPEARANCE.ambientGlowMotion,
      ambientMotionSpeed: clamp(value.ambientMotionSpeed, 10, 100, DEFAULT_APPEARANCE.ambientMotionSpeed),
      playMusicVideos: typeof value.playMusicVideos === 'boolean' ? value.playMusicVideos : DEFAULT_APPEARANCE.playMusicVideos,
      playAnimatedArtwork: typeof value.playAnimatedArtwork === 'boolean' ? value.playAnimatedArtwork : DEFAULT_APPEARANCE.playAnimatedArtwork,
      lowResourceMode: typeof value.lowResourceMode === 'boolean' ? value.lowResourceMode : DEFAULT_APPEARANCE.lowResourceMode,
      windowsAccentSync: typeof value.windowsAccentSync === 'boolean' ? value.windowsAccentSync : DEFAULT_APPEARANCE.windowsAccentSync,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function applyAppearancePreferences(preferences: AppearancePreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.glass = preferences.glassEnabled ? 'on' : 'off';
  root.dataset.artworkBackdrop = preferences.artworkBackdrop ? 'on' : 'off';
  root.dataset.lowResource = preferences.lowResourceMode ? 'on' : 'off';
  root.style.setProperty('--glass-opacity', `${preferences.glassOpacity}%`);
  root.style.setProperty('--glass-blur', `${preferences.lowResourceMode ? Math.min(preferences.glassBlur, 8) : preferences.glassBlur}px`);
  const glow = preferences.artworkBackdrop ? preferences.artworkGlow / 100 : 0;
  root.style.setProperty('--artwork-glow-strength', String(glow));
  root.style.setProperty('--artwork-glow-art-opacity', String(glow * 0.48));
  root.style.setProperty('--artwork-glow-bloom-opacity', String(glow * 0.54));
  root.style.setProperty('--fullscreen-artwork-glow-opacity', String(preferences.fullScreenArtworkGlow / 100 * 0.42));
  root.style.setProperty('--fullscreen-ambient-blur', `${preferences.lowResourceMode ? Math.min(preferences.fullScreenAmbientBlur, 26) : preferences.fullScreenAmbientBlur}px`);
  root.style.setProperty('--ambient-spread', `${preferences.ambientSpread}%`);
  root.style.setProperty('--now-playing-glow-opacity', String(preferences.nowPlayingPanelGlow / 100));
  root.style.setProperty('--now-playing-glow-inset', `${-preferences.nowPlayingPanelGlowSpread * 0.36}%`);
  root.style.setProperty('--now-playing-glow-extra', `${preferences.nowPlayingPanelGlowSpread * 0.72}%`);
  root.style.setProperty('--now-playing-glow-blur', `${preferences.lowResourceMode ? Math.min(preferences.nowPlayingPanelGlowBlur, 20) : preferences.nowPlayingPanelGlowBlur}px`);
  root.style.setProperty('--sidebar-edge-glow-opacity', String(preferences.edgeGlow / 100));
  root.style.setProperty('--sidebar-edge-glow-spread', `${preferences.edgeGlowSpread}px`);
  const movement = preferences.ambientGlowMotion ? preferences.ambientGlowAmount : 0;
  root.style.setProperty('--ambient-motion-low', String(0.62 - movement / 100 * 0.25));
  root.style.setProperty('--ambient-motion-high', String(0.62 + movement / 100 * 0.25));
  root.style.setProperty('--ambient-motion-duration', `${Math.round(60 - preferences.ambientMotionSpeed * 0.48)}s`);
  root.dataset.ambientMotion = movement > 0 ? 'on' : 'off';
}

function subscribeAppearance(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('mellow:appearance-changed', listener);
  return () => window.removeEventListener('mellow:appearance-changed', listener);
}

function readMusicVideosEnabled(): boolean {
  const preferences = readAppearancePreferences();
  return preferences.playMusicVideos && !preferences.lowResourceMode;
}

function readAnimatedArtworkEnabled(): boolean {
  const preferences = readAppearancePreferences();
  return preferences.playAnimatedArtwork && !preferences.lowResourceMode;
}

function readLowResourceMode(): boolean {
  return readAppearancePreferences().lowResourceMode;
}

/** Subscribes to the same persisted appearance preferences used by Settings. */
export function useMusicVideosEnabled(): boolean {
  return useSyncExternalStore(subscribeAppearance, readMusicVideosEnabled, () => DEFAULT_APPEARANCE.playMusicVideos);
}

export function useAnimatedArtworkEnabled(): boolean {
  return useSyncExternalStore(subscribeAppearance, readAnimatedArtworkEnabled, () => DEFAULT_APPEARANCE.playAnimatedArtwork);
}

export function useLowResourceMode(): boolean {
  return useSyncExternalStore(subscribeAppearance, readLowResourceMode, () => DEFAULT_APPEARANCE.lowResourceMode);
}

/** Shared appearance subscription for player surfaces that follow the active track. */
export function usePlayerArtworkAmbient(): boolean {
  return useSyncExternalStore(
    subscribeAppearance,
    () => readAppearancePreferences().playerArtworkAmbient,
    () => DEFAULT_APPEARANCE.playerArtworkAmbient,
  );
}

/** Full-screen ambience is independent from the compact Now Playing panel. */
export function useFullScreenPlayerAmbient(): boolean {
  return useSyncExternalStore(
    subscribeAppearance,
    () => readAppearancePreferences().fullScreenPlayerAmbient,
    () => DEFAULT_APPEARANCE.fullScreenPlayerAmbient,
  );
}

export function updateAppearancePreferences(patch: Partial<AppearancePreferences>): AppearancePreferences {
  const next = { ...readAppearancePreferences(), ...patch };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('mellow:appearance-changed'));
  }
  applyAppearancePreferences(next);
  return next;
}
