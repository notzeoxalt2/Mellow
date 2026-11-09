import { app, ipcMain, BrowserWindow, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawn } from 'node:child_process';

export interface UpdateInfo {
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
}

const GITHUB_OWNER = 'notzeoxalt2';
const GITHUB_REPO = 'Mellow';
const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

let downloadedInstallerPath: string | null = null;
let isDownloading = false;

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function compareVersions(latest: string, current: string): number {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  const len = Math.max(l.length, c.length);
  for (let i = 0; i < len; i++) {
    const lPart = l[i] ?? 0;
    const cPart = c[i] ?? 0;
    if (lPart > cPart) return 1;
    if (lPart < cPart) return -1;
  }
  return 0;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion() || '1.0.0';
  try {
    const response = await fetch(API_URL, {
      headers: {
        'User-Agent': `Mellow-Desktop-Updater/${currentVersion}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          available: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseName: 'No releases found',
          releaseNotes: '',
          releaseUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
        };
      }
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const data: any = await response.json();
    const tagName = data.tag_name || '';
    const latestVersion = tagName.replace(/^v/i, '');
    const isNewer = compareVersions(latestVersion, currentVersion) > 0;

    let targetAsset: any = null;
    if (Array.isArray(data.assets)) {
      targetAsset =
        data.assets.find((a: any) => a.name.endsWith('-Setup.exe') || a.name.endsWith('.exe')) ||
        data.assets.find((a: any) => a.name.endsWith('.zip'));
    }

    return {
      available: isNewer,
      currentVersion,
      latestVersion,
      releaseName: data.name || tagName,
      releaseNotes: data.body || '',
      releaseUrl: data.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
      assetUrl: targetAsset?.browser_download_url,
      assetName: targetAsset?.name,
      assetSize: targetAsset?.size,
      publishedAt: data.published_at,
    };
  } catch (err: any) {
    console.warn('[Updater] Failed to check for updates:', err.message);
    return {
      available: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseName: '',
      releaseNotes: '',
      releaseUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
    };
  }
}

export function downloadUpdate(
  assetUrl: string,
  onProgress?: (percent: number, transferred: number, total: number) => void,
): Promise<string> {
  if (isDownloading) {
    return Promise.reject(new Error('Download already in progress'));
  }
  isDownloading = true;

  const tempDir = path.join(app.getPath('temp'), 'Mellow-Update');
  fs.mkdirSync(tempDir, { recursive: true });

  const fileName = path.basename(new URL(assetUrl).pathname) || 'Mellow-Setup-update.exe';
  const destPath = path.join(tempDir, fileName);

  return new Promise((resolve, reject) => {
    function getWithRedirect(url: string) {
      https
        .get(url, { headers: { 'User-Agent': 'Mellow-Desktop-Updater' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            getWithRedirect(res.headers.location);
            return;
          }

          if (res.statusCode !== 200) {
            isDownloading = false;
            reject(new Error(`Download failed with status ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let transferred = 0;
          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk) => {
            transferred += chunk.length;
            if (totalBytes > 0 && onProgress) {
              const percent = Math.min(100, Math.round((transferred / totalBytes) * 100));
              onProgress(percent, transferred, totalBytes);
            }
          });

          fileStream.on('finish', () => {
            fileStream.close(() => {
              isDownloading = false;
              downloadedInstallerPath = destPath;
              resolve(destPath);
            });
          });

          fileStream.on('error', (err) => {
            isDownloading = false;
            fs.unlink(destPath, () => {});
            reject(err);
          });

          res.pipe(fileStream);
        })
        .on('error', (err) => {
          isDownloading = false;
          reject(err);
        });
    }

    getWithRedirect(assetUrl);
  });
}

export function installUpdate(installerPath?: string): void {
  const target = installerPath || downloadedInstallerPath;
  if (!target || !fs.existsSync(target)) {
    throw new Error('No installer available to run');
  }

  // Launch installer detached and quit Mellow
  spawn(target, [], {
    detached: true,
    stdio: 'ignore',
  }).unref();

  app.quit();
}

let activeWindow: BrowserWindow | null = null;
let handlersRegistered = false;

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  activeWindow = mainWindow;

  if (!handlersRegistered) {
    handlersRegistered = true;

    // Check for updates IPC
    ipcMain.handle('app-check-for-updates', async () => {
      return await checkForUpdates();
    });

    // Download update IPC
    ipcMain.handle('app-download-update', async (_, assetUrl: string) => {
      try {
        const dest = await downloadUpdate(assetUrl, (percent, transferred, total) => {
          if (activeWindow && !activeWindow.isDestroyed()) {
            activeWindow.webContents.send('app-update-progress', { percent, transferred, total });
          }
        });
        if (activeWindow && !activeWindow.isDestroyed()) {
          activeWindow.webContents.send('app-update-downloaded', { installerPath: dest });
        }
        return { ok: true, installerPath: dest };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    });

    // Quit and install IPC
    ipcMain.handle('app-quit-and-install', () => {
      installUpdate();
    });

    // Open release page IPC
    ipcMain.handle('app-open-release-url', (_, url: string) => {
      shell.openExternal(url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`);
    });
  }

  // Automatic silent check 8 seconds after app launch
  setTimeout(async () => {
    if (!activeWindow || activeWindow.isDestroyed()) return;
    const info = await checkForUpdates();
    if (info.available && activeWindow && !activeWindow.isDestroyed()) {
      activeWindow.webContents.send('app-update-available', info);
    }
  }, 8000);
}
