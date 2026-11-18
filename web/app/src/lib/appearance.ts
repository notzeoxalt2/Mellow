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
  playerBarGlow: boolean;
  playerBarGlowStrength: number;
  sidebarGlow: boolean;
  sidebarGlowStrength: number;
  musicBeatSync: boolean;
  musicBeatStrength: number;
  appleMusicRpc: boolean;
  dualSync: boolean;
  videoPreference: 'spotify' | 'youtube' | 'auto';
  smartMemorySaving: boolean;
  audioQualityFormat: 'lossless-hires' | 'lossless-cd' | 'opus-256' | 'aac-256' | 'saver-96';
  soundCheck: boolean;
  preloadUpcoming: boolean;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  glassEnabled: true,
  glassOpacity: 82,
  glassBlur: 22,
  artworkBackdrop: true,
  artworkGlow: 65,
  playerArtworkAmbient: true,
  fullScreenPlayerAmbient: true,
  fullScreenArtworkGlow: 68,
  fullScreenAmbientBlur: 82,
  ambientSpread: 85,
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
  playAnimatedArtwork: true,
  lowResourceMode: false,
  windowsAccentSync: false,
  playerBarGlow: true,
  playerBarGlowStrength: 70,
  sidebarGlow: true,
  sidebarGlowStrength: 60,
  musicBeatSync: false,
  musicBeatStrength: 75,
  appleMusicRpc: true,
  dualSync: true,
  videoPreference: 'spotify',
  smartMemorySaving: true,
  audioQualityFormat: 'lossless-hires',
  soundCheck: true,
  preloadUpcoming: true,
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
      ambientSpread: clamp(value.ambientSpread, 20, 300, DEFAULT_APPEARANCE.ambientSpread),
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
      playerBarGlow: typeof value.playerBarGlow === 'boolean' ? value.playerBarGlow : DEFAULT_APPEARANCE.playerBarGlow,
      playerBarGlowStrength: clamp(value.playerBarGlowStrength, 0, 100, DEFAULT_APPEARANCE.playerBarGlowStrength),
      sidebarGlow: typeof value.sidebarGlow === 'boolean' ? value.sidebarGlow : DEFAULT_APPEARANCE.sidebarGlow,
      sidebarGlowStrength: clamp(value.sidebarGlowStrength, 0, 100, DEFAULT_APPEARANCE.sidebarGlowStrength),
      musicBeatSync: typeof value.musicBeatSync === 'boolean' ? value.musicBeatSync : DEFAULT_APPEARANCE.musicBeatSync,
      musicBeatStrength: clamp(value.musicBeatStrength, 0, 100, DEFAULT_APPEARANCE.musicBeatStrength),
      appleMusicRpc: typeof value.appleMusicRpc === 'boolean' ? value.appleMusicRpc : DEFAULT_APPEARANCE.appleMusicRpc,
      dualSync: typeof value.dualSync === 'boolean' ? value.dualSync : DEFAULT_APPEARANCE.dualSync,
      videoPreference: value.videoPreference === 'youtube' || value.videoPreference === 'auto' ? value.videoPreference : DEFAULT_APPEARANCE.videoPreference,
      smartMemorySaving: typeof value.smartMemorySaving === 'boolean' ? value.smartMemorySaving : DEFAULT_APPEARANCE.smartMemorySaving,
      audioQualityFormat: value.audioQualityFormat === 'lossless-cd' || value.audioQualityFormat === 'opus-256' || value.audioQualityFormat === 'aac-256' || value.audioQualityFormat === 'saver-96' ? value.audioQualityFormat : DEFAULT_APPEARANCE.audioQualityFormat,
      soundCheck: typeof value.soundCheck === 'boolean' ? value.soundCheck : DEFAULT_APPEARANCE.soundCheck,
      preloadUpcoming: typeof value.preloadUpcoming === 'boolean' ? value.preloadUpcoming : DEFAULT_APPEARANCE.preloadUpcoming,
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
  root.style.setProperty('--artwork-glow-art-opacity', String(Math.min(1, glow * 1.12)));
  root.style.setProperty('--artwork-glow-bloom-opacity', String(Math.min(1, glow * 1.2)));
  root.style.setProperty('--fullscreen-artwork-glow-opacity', String(Math.min(0.95, (preferences.fullScreenArtworkGlow / 100) * 0.85)));
  root.style.setProperty('--fullscreen-ambient-blur', `${preferences.lowResourceMode ? Math.min(preferences.fullScreenAmbientBlur, 26) : preferences.fullScreenAmbientBlur}px`);
  root.style.setProperty('--ambient-spread', `${preferences.ambientSpread}%`);
  root.style.setProperty('--now-playing-glow-opacity', String(preferences.nowPlayingPanelGlow / 100));
  root.style.setProperty('--now-playing-glow-inset', `${-preferences.nowPlayingPanelGlowSpread * 0.36}%`);
  root.style.setProperty('--now-playing-glow-extra', `${preferences.nowPlayingPanelGlowSpread * 0.72}%`);
  root.style.setProperty('--now-playing-glow-blur', `${preferences.lowResourceMode ? Math.min(preferences.nowPlayingPanelGlowBlur, 20) : preferences.nowPlayingPanelGlowBlur}px`);
  root.dataset.sidebarGlow = preferences.sidebarGlow ? 'on' : 'off';
  root.dataset.musicBeat = preferences.musicBeatSync ? 'on' : 'off';
  root.style.setProperty('--sidebar-edge-glow-opacity', preferences.sidebarGlow ? String(((preferences.sidebarGlowStrength ?? 60) / 100) * (preferences.edgeGlow / 100)) : '0');
  root.style.setProperty('--sidebar-edge-glow-spread', `${preferences.edgeGlowSpread}px`);
  root.style.setProperty('--player-bar-glow-opacity', preferences.playerBarGlow ? String(preferences.playerBarGlowStrength / 100) : '0');
  root.style.setProperty('--music-beat-sync', preferences.musicBeatSync ? '1' : '0');
  root.style.setProperty('--music-beat-strength', `${preferences.musicBeatStrength ?? 75}%`);
  const movement = preferences.ambientGlowMotion ? preferences.ambientGlowAmount : 0;
  root.style.setProperty('--ambient-motion-low', String(Math.max(0.68, 0.88 - movement / 100 * 0.2)));
  root.style.setProperty('--ambient-motion-high', String(Math.min(1, 0.88 + movement / 100 * 0.14)));
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
    if (patch.appleMusicRpc !== undefined) {
      import('@/extension/bridge').then(({ getBridge }) => {
        getBridge()?.call('discordRpc.setEnabled', { enabled: patch.appleMusicRpc! });
      }).catch(() => undefined);
    }
  }
  applyAppearancePreferences(next);
  return next;
}
