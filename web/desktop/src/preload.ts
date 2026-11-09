import { contextBridge, ipcRenderer } from 'electron';

// Expose Desktop API for window controls, authentication, and direct bridge calls
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_: unknown, state: boolean) => callback(state);
    ipcRenderer.on('window-maximize-changed', handler);
    return () => ipcRenderer.removeListener('window-maximize-changed', handler);
  },
  openSpotifyLogin: () => ipcRenderer.invoke('auth-spotify-login'),
  openGoogleLogin: () => ipcRenderer.invoke('auth-google-login'),
  openChromeSync: () => ipcRenderer.invoke('open-chrome-sync'),
  toggleMiniPlayer: () => ipcRenderer.invoke('toggle-mini-player'),
  updateNowPlaying: (track: any) => ipcRenderer.send('update-now-playing', track),
  setWindowsAccentSync: (enabled: boolean, color?: string) =>
    ipcRenderer.invoke('windows-accent-sync', enabled, color),
  updatePlaybackStatus: (status: string) => ipcRenderer.send('update-playback-status', status),
  updatePlaybackPosition: (positionSec: number, durationSec: number) =>
    ipcRenderer.send('update-playback-position', positionSec, durationSec),
  onPlayerAction: (callback: (action: string) => void) => {
    const handler = (_: unknown, action: string) => callback(action);
    ipcRenderer.on('player-action', handler);
    return () => ipcRenderer.removeListener('player-action', handler);
  },
  // Direct IPC bridge calls bypassing window.postMessage origin restrictions
  bridgeCall: (method: string, params: any) =>
    ipcRenderer.invoke('bitchord-bridge-call', {
      channel: 'bitchord-bridge',
      protocol: 1,
      direction: 'to-extension',
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      params,
    }),
  onBridgeEvent: (callback: (event: any) => void) => {
    const handler = (_: unknown, payload: any) => callback(payload);
    ipcRenderer.on('bitchord-bridge-event', handler);
    return () => ipcRenderer.removeListener('bitchord-bridge-event', handler);
  },
  // Desktop Auto-Updater
  checkForUpdates: () => ipcRenderer.invoke('app-check-for-updates'),
  downloadUpdate: (assetUrl: string) => ipcRenderer.invoke('app-download-update', assetUrl),
  quitAndInstallUpdate: () => ipcRenderer.invoke('app-quit-and-install'),
  openReleaseUrl: (url: string) => ipcRenderer.invoke('app-open-release-url', url),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const handler = (_: unknown, info: any) => callback(info);
    ipcRenderer.on('app-update-available', handler);
    return () => ipcRenderer.removeListener('app-update-available', handler);
  },
  onUpdateProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => {
    const handler = (_: unknown, progress: any) => callback(progress);
    ipcRenderer.on('app-update-progress', handler);
    return () => ipcRenderer.removeListener('app-update-progress', handler);
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const handler = (_: unknown, info: any) => callback(info);
    ipcRenderer.on('app-update-downloaded', handler);
    return () => ipcRenderer.removeListener('app-update-downloaded', handler);
  },
});

/** The floating player gets only the four controls it needs, not Node access. */
contextBridge.exposeInMainWorld('mellowMiniPlayer', {
  action: (action: 'prev' | 'togglePlay' | 'next') => ipcRenderer.send('mini-player-action', action),
  seek: (ratio: number) => ipcRenderer.send('mini-player-seek', ratio),
  restore: () => ipcRenderer.send('mini-player-restore'),
  close: () => ipcRenderer.send('mini-player-close'),
  onUpdate: (callback: (state: unknown) => void) => {
    const handler = (_: unknown, state: unknown) => callback(state);
    ipcRenderer.on('mini-player-update', handler);
    return () => ipcRenderer.removeListener('mini-player-update', handler);
  },
});

// Bridge message relay: Intercepts bitchord-bridge messages from window.postMessage as well
window.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data || data.channel !== 'bitchord-bridge' || data.direction !== 'to-extension') {
    return;
  }

  try {
    const response = await ipcRenderer.invoke('bitchord-bridge-call', data);
    window.postMessage(response, '*');
  } catch (error: any) {
    window.postMessage(
      {
        channel: 'bitchord-bridge',
        protocol: 1,
        direction: 'to-page',
        id: data.id,
        ok: false,
        error: { code: 'internal', message: error?.message || 'Bridge request failed' },
      },
      '*',
    );
  }
});

// Forward bridge events from main process to webapp window
ipcRenderer.on('bitchord-bridge-event', (_, payload) => {
  window.postMessage(
    {
      channel: 'bitchord-bridge',
      direction: 'event',
      payload,
    },
    '*',
  );
});
