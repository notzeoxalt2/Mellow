/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXTENSION_ID_CHROMIUM?: string;
  readonly VITE_ANDROID_APP_URL?: string;
  readonly VITE_EXTENSION_CHROME_URL?: string;
  readonly VITE_EXTENSION_FIREFOX_URL?: string;
  readonly VITE_EXTENSION_MANIFEST_URL?: string;
  readonly VITE_PARTY_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts from web/extension/dev-key/extension-id.txt. */
declare const DEV_EXTENSION_ID: string;

interface ElectronAPI {
  isDesktop: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange?: (cb: (maximized: boolean) => void) => () => void;
  openSpotifyLogin?: () => void;
  openGoogleLogin?: () => void;
  openChromeSync?: () => void;
  toggleMiniPlayer?: () => void;
  updateNowPlaying?: (track: any) => void;
  setWindowsAccentSync?: (enabled: boolean, color?: string) => Promise<{ ok: boolean; message?: string }>;
  updatePlaybackStatus?: (status: string) => void;
  updatePlaybackPosition?: (positionSec: number, durationSec: number) => void;
  onPlayerAction?: (callback: (action: string) => void) => () => void;
  checkForUpdates?: () => Promise<{
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseName: string;
    releaseNotes: string;
    releaseUrl: string;
    assetUrl?: string;
    assetName?: string;
    assetSize?: number;
    publishedAt?: string;
  }>;
  downloadUpdate?: (assetUrl: string) => Promise<{ ok: boolean; installerPath?: string; error?: string }>;
  quitAndInstallUpdate?: () => void;
  openReleaseUrl?: (url: string) => void;
  onUpdateAvailable?: (callback: (info: any) => void) => () => void;
  onUpdateProgress?: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
  onUpdateDownloaded?: (callback: (info: any) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
