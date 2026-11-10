import { app, BrowserWindow, ipcMain, session, Menu, shell, nativeImage, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { selectYouTubeSigningCookie } from '@bitchord/shared';
import { restoreWindowsAccent, restoreWindowsAccentAsync, setWindowsAccent, windowsAccentBackupPath } from './windowsAccent.js';
import {
  fetchPlaylists,
  fetchPlaylistInfo,
  fetchPlaylistTracks,
  fetchCanvas,
  fetchHomeSections,
  searchTracks,
  fetchSpotifyCategories,
  fetchSpotifyCategoryPlaylists,
  fetchSpotifyProfile,
  LIKED_ID,
} from './spotify.js';
import { mergeYouTubeCookies, prioritizeYouTubeSigningCookie, resetYouTubeChannelForSessionChange } from './ytCookies.js';
import { isDesktopYouTubeSignedIn, shouldVerifyDesktopYouTubeAtStartup, validateYouTubeAccountMenu } from './ytAuthValidation.js';
import { setupAutoUpdater } from './updater.js';

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('renderer-process-limit', '2');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

function sapisidHash(secret: string, origin: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1').update(`${timestamp} ${secret} ${origin}`).digest('hex');
  return `SAPISIDHASH ${timestamp}_${hash}`;
}


// Clean standard User-Agents
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
const YTM_CLIENT_VERSION_FALLBACK = '1.20261027.10.00';
const FIREFOX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0';

// Global fallback user agent
app.userAgentFallback = CHROME_USER_AGENT;

// Single-instance lock to prevent multiple instances and EADDRINUSE port errors
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Remove Electron's default application menu to keep the app clean and seamless
Menu.setApplicationMenu(null);

// Set AppUserModelId so Windows taskbar groups and shows the custom Mellow icon
app.setAppUserModelId('com.mellow.music');
app.setName('Mellow');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAppIcon(): string {
  const candidates = [
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '../icon.ico'),
    path.join(__dirname, '../icon.png'),
    path.join(app.getAppPath(), 'dist/icon.ico'),
    path.join(app.getAppPath(), 'dist/icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? '';
}

interface AuthStore {
  spDc?: string;
  spotifyConnected?: boolean;
  spotifyUser?: { name: string; avatarUrl: string | null } | null;
  sapisid?: string;
  sapisidName?: string;
  /** Cookie snapshots scoped to each YouTube origin; host-only cookies must not cross hosts. */
  ytCookies?: string;
  ytYoutubeCookies?: string;
  ytConnected?: boolean;
  ytAuthUser?: string;
  ytPageId?: string | null;
  /** Current WEB_REMIX version read from YouTube Music's own sign-in page. */
  ytClientVersion?: string;
  /** When this WEB_REMIX version was last confirmed from YouTube Music's live page. */
  ytClientVersionFetchedAt?: number;
  ytAuthRejected?: boolean;
  /** Set only after YouTube's private account endpoint or the browser extension verified this session. */
  ytAuthVerified?: boolean;
  ytAuthProblem?: string;
  ytSessionPresent?: boolean;
  ytActive?: { id: string; name: string; handle: string | null; avatarUrl: string | null; brand: boolean; authUser: string } | null;
}

const mellowConfigPath = path.join(app.getPath('userData'), 'mellow_auth.json');
const legacyConfigPath = path.join(app.getPath('userData'), 'bitchord_auth.json');
const windowsAccentBackup = windowsAccentBackupPath(app.getPath('userData'));

function readAuthStore(): AuthStore {
  try {
    if (fs.existsSync(mellowConfigPath)) {
      return JSON.parse(fs.readFileSync(mellowConfigPath, 'utf8'));
    }
    if (fs.existsSync(legacyConfigPath)) {
      return JSON.parse(fs.readFileSync(legacyConfigPath, 'utf8'));
    }
  } catch {}
  return { spotifyConnected: true, ytConnected: true };
}

function writeAuthStore(store: AuthStore): void {
  try {
    fs.writeFileSync(mellowConfigPath, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save Mellow auth store:', err);
  }
}

let mainWindow: BrowserWindow | null = null;
let syncServer: http.Server | null = null;

let shutdownInProgress = false;
async function shutdownApp() {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  if (fs.existsSync(windowsAccentBackup)) await restoreWindowsAccentAsync(app.getPath('userData'));
  try {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      miniPlayerWindow.destroy();
      miniPlayerWindow = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
      mainWindow = null;
    }
    if (syncServer) {
      (syncServer as any).closeIdleConnections?.();
      (syncServer as any).closeAllConnections?.();
      syncServer.close();
      syncServer = null;
    }
  } catch {}
  app.quit();
  setTimeout(() => {
    process.exit(0);
  }, 150);
}
let currentAuth = readAuthStore();
let ytAuthPending = false;
let ytAuthStartupVerificationAttempted = false;

function desktopYtAuthState() {
  const connected = currentAuth.ytConnected !== false;
  const signedIn = isDesktopYouTubeSignedIn({
    hasCookie: !!currentAuth.sapisid,
    connected,
    verified: currentAuth.ytAuthVerified === true,
    rejected: !!currentAuth.ytAuthRejected,
    pending: ytAuthPending,
  });
  const active = signedIn
    ? currentAuth.ytActive ?? {
        id: `${currentAuth.ytAuthUser ?? '0'}:${currentAuth.ytPageId ?? 'own'}`,
        name: 'YouTube Music',
        handle: null,
        avatarUrl: null,
        brand: false,
        authUser: currentAuth.ytAuthUser ?? '0',
      }
    : null;
  return {
    browserSignedIn: !!currentAuth.sapisid,
    connected,
    signedIn,
    accounts: [],
    active,
    problem: ytAuthPending
      ? 'Verifying the YouTube Music sign-in…'
      : currentAuth.ytAuthRejected
      ? 'YouTube Music rejected the saved sign-in. Reconnect YouTube Music from the account menu.'
      : currentAuth.ytAuthProblem ?? null,
    reauthRequired: !!currentAuth.ytAuthRejected,
  };
}

/** Use the browser's exact cookie scope, then overlay newer cookies from Mellow's own jar. */
async function desktopYtCookies(origin: string) {
  let live: Electron.Cookie[] = [];
  try {
    live = await session.defaultSession.cookies.get({ url: `${origin}/` });
  } catch {}
  const merged = mergeYouTubeCookies(origin, currentAuth.ytCookies, currentAuth.ytYoutubeCookies, live);
  if (!currentAuth.sapisid) return merged;
  return prioritizeYouTubeSigningCookie(merged.header, currentAuth.sapisidName ?? 'SAPISID', currentAuth.sapisid);
}

async function currentYtmClientVersion(origin: string, cookieHeader: string): Promise<string> {
  const storedVersion = currentAuth.ytClientVersion;
  const fetchedAt = currentAuth.ytClientVersionFetchedAt ?? 0;
  if (
    storedVersion &&
    /^1\.\d{8}\.\d{2}\.\d{2}$/.test(storedVersion) &&
    Date.now() - fetchedAt < 6 * 60 * 60 * 1000
  ) {
    return storedVersion;
  }

  try {
    const response = await fetch(`${origin}/`, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': CHROME_USER_AGENT,
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
    });
    if (response.ok) {
      const html = await response.text();
      const version = /"INNERTUBE_CLIENT_VERSION"\s*:\s*"(1\.\d{8}\.\d{2}\.\d{2})"/.exec(html)?.[1];
      if (version) {
        currentAuth.ytClientVersion = version;
        currentAuth.ytClientVersionFetchedAt = Date.now();
        return version;
      }
    }
  } catch {}

  return storedVersion && /^1\.\d{8}\.\d{2}\.\d{2}$/.test(storedVersion)
    ? storedVersion
    : YTM_CLIENT_VERSION_FALLBACK;
}

/** A desktop refresh must validate a real private YouTube Music response, not just a saved cookie string. */
async function refreshDesktopYtAuth(): Promise<boolean> {
  if (!currentAuth.sapisid || currentAuth.ytConnected === false) return false;
  const origin = 'https://music.youtube.com';
  try {
    const { header, signingCookie } = await desktopYtCookies(origin);
    if (!signingCookie) throw new Error('YouTube Music session is missing.');
    const clientVersion = await currentYtmClientVersion(origin, header);
    const response = await fetch(`${origin}/youtubei/v1/account/account_menu?prettyPrint=false`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin,
        'Referer': `${origin}/`,
        'X-Origin': origin,
        'X-Goog-AuthUser': currentAuth.ytAuthUser ?? '0',
        ...(currentAuth.ytPageId ? { 'X-Goog-PageId': currentAuth.ytPageId } : {}),
        'X-Youtube-Client-Name': '67',
        'X-Youtube-Client-Version': clientVersion,
        'Authorization': sapisidHash(signingCookie, origin),
        'User-Agent': CHROME_USER_AGENT,
        ...(header ? { 'Cookie': header } : {}),
      },
      body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion, hl: 'en', gl: 'US' }, user: {} } }),
    });
    const body = await response.json().catch(() => null);
    const validation = validateYouTubeAccountMenu(response.status, body);
    if (!validation.verified) {
      if (validation.rejected) {
        currentAuth.ytAuthRejected = true;
        currentAuth.ytAuthVerified = false;
      }
      if (validation.problem) currentAuth.ytAuthProblem = validation.problem;
      else delete currentAuth.ytAuthProblem;
      return false;
    }
    currentAuth.sapisid = signingCookie;
    currentAuth.ytAuthRejected = false;
    currentAuth.ytAuthVerified = true;
    delete currentAuth.ytAuthProblem;
    return true;
  } catch {
    currentAuth.ytAuthProblem = 'Could not reach YouTube Music to verify the saved sign-in. Your saved sign-in was kept.';
    return false;
  } finally {
    writeAuthStore(currentAuth);
  }
}

// Setup local loopback server for Chrome Extension sync & quick-connect
function startSyncServer() {
  const server = http.createServer((req, res) => {
    syncServer = server;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          app: 'Mellow',
          version: '1.0.0',
          spotifyConnected: !!currentAuth.spDc,
          ytConnected: desktopYtAuthState().connected && desktopYtAuthState().signedIn,
          ytBrowserSignedIn: desktopYtAuthState().browserSignedIn,
          ytAuthRejected: !!currentAuth.ytAuthRejected,
          ytAuthProblem: currentAuth.ytAuthProblem ?? null,
        })
      );
      return;
    }

    if (req.url === '/connect') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mellow Chrome Sync</title>
  <style>
    body {
      background: #0c0d12;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #16171f;
      border: 1px solid rgba(128, 0, 250, 0.3);
      padding: 32px;
      border-radius: 20px;
      text-align: center;
      max-width: 440px;
      box-shadow: 0 10px 40px rgba(128, 0, 250, 0.2);
    }
    h1 { color: #c084fc; font-size: 24px; margin-top: 0; }
    p { color: #a1a1aa; line-height: 1.5; font-size: 14px; }
    .status {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 999px;
      background: rgba(128, 0, 250, 0.15);
      color: #c084fc;
      font-weight: 600;
      margin: 16px 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Mellow Desktop Sync</h1>
    <div class="status" id="status">Connecting to Chrome Extension...</div>
    <p>Your Mellow Desktop app is active. If the BitChord extension is installed in Chrome, it will automatically sync your Spotify and YouTube logins.</p>
  </div>
  <script>
    // Trigger extension sync if available
    window.addEventListener('load', () => {
      document.getElementById('status').textContent = 'Mellow Desktop is Ready & Listening';
    });
  </script>
</body>
</html>`);
      return;
    }

    if (req.url === '/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          if (payload.spDc) {
            currentAuth.spDc = payload.spDc.trim();
            if (currentAuth.spotifyConnected !== false) currentAuth.spotifyConnected = true;
          }
          if (payload.spotifyUser && typeof payload.spotifyUser.name === 'string') currentAuth.spotifyUser = payload.spotifyUser;
          if (payload.ytSessionPresent === false) {
            // A browser sign-out must invalidate the copied session too. The
            // old sync returned early on empty cookies, leaving stale SAPISID
            // behind and making the UI look connected while requests failed.
            delete currentAuth.sapisid;
            delete currentAuth.sapisidName;
            delete currentAuth.ytCookies;
            delete currentAuth.ytYoutubeCookies;
            delete currentAuth.ytActive;
            currentAuth.ytAuthVerified = false;
            currentAuth.ytAuthUser = '0';
            currentAuth.ytPageId = null;
            currentAuth.ytAuthRejected = false;
            delete currentAuth.ytAuthProblem;
          } else {
            if (payload.sapisid) {
              const nextSapisidName = typeof payload.sapisidName === 'string' ? payload.sapisidName : 'SAPISID';
              const rotated = currentAuth.sapisid !== payload.sapisid.trim() || currentAuth.sapisidName !== nextSapisidName;
              resetYouTubeChannelForSessionChange(currentAuth, payload.sapisid.trim(), nextSapisidName, String(payload.ytAuthUser ?? currentAuth.ytAuthUser ?? '0'));
              currentAuth.sapisid = payload.sapisid.trim();
              currentAuth.sapisidName = nextSapisidName;
              if (currentAuth.ytConnected !== false) {
                currentAuth.ytConnected = true;
                if (rotated) {
                  currentAuth.ytAuthRejected = false;
                  delete currentAuth.ytAuthProblem;
                }
              }
            }
            if (typeof payload.ytCookies === 'string') currentAuth.ytCookies = payload.ytCookies || undefined;
            if (typeof payload.ytYoutubeCookies === 'string') currentAuth.ytYoutubeCookies = payload.ytYoutubeCookies || undefined;
            if (payload.ytAuthUser !== undefined) currentAuth.ytAuthUser = String(payload.ytAuthUser);
            if (payload.ytPageId !== undefined) currentAuth.ytPageId = payload.ytPageId ? String(payload.ytPageId) : null;
            if ('ytActive' in payload) {
              currentAuth.ytActive = payload.ytActive;
              // The extension only sends an active account after YouTube
              // returned account details successfully. That is stronger
              // evidence than a stale desktop retry result.
              if (payload.ytActive && payload.sapisid) {
                currentAuth.ytAuthVerified = true;
                currentAuth.ytAuthRejected = false;
                delete currentAuth.ytAuthProblem;
              }
            }
          }
          writeAuthStore(currentAuth);

          // Broadcast to renderer
          if (payload.spDc) {
            mainWindow?.webContents.send('bitchord-bridge-event', {
              event: 'spotify.authState',
              data: {
                browserSignedIn: true,
                connected: true,
                signedIn: true,
                user: currentAuth.spotifyUser ?? { name: 'Spotify', avatarUrl: null },
                problem: null,
              },
            });
          }
          if (payload.sapisid || payload.ytSessionPresent === false) {
            mainWindow?.webContents.send('bitchord-bridge-event', {
              event: 'yt.authState',
              data: desktopYtAuthState(),
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, message: 'Synced successfully with Mellow!' }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn('[Mellow] Port 41838 already in use; continuing without error.');
    } else {
      console.error('[Mellow] Sync server error:', err);
    }
  });

  server.listen(41838, '127.0.0.1', () => {
    console.log('[Mellow] Chrome Sync Server listening on http://127.0.0.1:41838');
  });
}

function openSpotifyAuthWindow() {
  const appIcon = getAppIcon();
  const authWin = new BrowserWindow({
    width: 520,
    height: 720,
    title: 'Sign in to Spotify',
    icon: appIcon || undefined,
    backgroundColor: '#121212',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      session: session.defaultSession,
    },
  });

  authWin.webContents.setUserAgent(CHROME_USER_AGENT);
  authWin.setMenu(null);

  // Allow child popups so "Continue with Google" opens the Google OAuth popup correctly
  authWin.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 680,
        title: 'Sign in with Google',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      },
    };
  });

  authWin.loadURL('https://accounts.spotify.com/en/login');

  const checkCookie = async () => {
    try {
      const cookies = await authWin.webContents.session.cookies.get({ domain: '.spotify.com', name: 'sp_dc' });
      if (cookies.length > 0 && cookies[0]?.value) {
        currentAuth.spDc = cookies[0].value;
        currentAuth.spotifyConnected = true;
        currentAuth.spotifyUser = await fetchSpotifyProfile(currentAuth.spDc).catch(() => currentAuth.spotifyUser ?? null);
        writeAuthStore(currentAuth);

        clearInterval(interval);
        authWin.close();

        mainWindow?.webContents.send('bitchord-bridge-event', {
          event: 'spotify.authState',
          data: {
            browserSignedIn: true,
            connected: true,
            signedIn: true,
            user: currentAuth.spotifyUser,
            problem: null,
          },
        });
      }
    } catch {}
  };

  const interval = setInterval(checkCookie, 1000);
  authWin.on('closed', () => clearInterval(interval));
}

function openGoogleAuthWindow() {
  const appIcon = getAppIcon();
  const authWin = new BrowserWindow({
    width: 520,
    height: 720,
    title: 'Sign in to Google / YouTube Music',
    icon: appIcon || undefined,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      session: session.defaultSession,
    },
  });

  authWin.setMenu(null);

  authWin.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 680,
        autoHideMenuBar: true,
      },
    };
  });

  authWin.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https://music.youtube.com/');

  let musicPageReady = false;
  const markMusicPage = (_event: unknown, url: string) => {
    try {
      musicPageReady = new URL(url).hostname === 'music.youtube.com';
    } catch {
      musicPageReady = false;
    }
  };
  authWin.webContents.on('did-navigate', markMusicPage);
  authWin.webContents.on('did-navigate-in-page', markMusicPage);

  let validationPending = false;
  let lastCandidate = '';
  let lastValidationAt = 0;
  const checkCookie = async () => {
    try {
      if (!musicPageReady || authWin.isDestroyed() || validationPending) return;
      const identity = await authWin.webContents.executeJavaScript(
        `(() => { const cfg = window.ytcfg; return cfg ? { loggedIn: !!cfg.get('LOGGED_IN'), authUser: String(cfg.get('SESSION_INDEX') ?? '0'), clientVersion: String(cfg.get('INNERTUBE_CLIENT_VERSION') ?? '') } : null; })()`,
      ) as { loggedIn?: boolean; authUser?: string; clientVersion?: string } | null;
      if (!identity?.loggedIn) return;
      const [musicCookies, youtubeCookies] = await Promise.all([
        authWin.webContents.session.cookies.get({ url: 'https://music.youtube.com/' }),
        authWin.webContents.session.cookies.get({ url: 'https://www.youtube.com/' }),
      ]);
      const signingCookie = selectYouTubeSigningCookie(musicCookies, youtubeCookies);
      const cookieVal = signingCookie?.value;

      if (cookieVal) {
        const authUser = identity.authUser ?? '0';
        const cookieName = signingCookie?.name ?? 'SAPISID';
        const candidate = `${cookieName}:${cookieVal}:${authUser}`;
        // The window checks once per second. Avoid revalidating the same cookie
        // on every tick, but retry after ten seconds if YouTube was transiently
        // unavailable while the user signed in.
        if (candidate === lastCandidate && Date.now() - lastValidationAt < 10_000) return;
        lastCandidate = candidate;
        lastValidationAt = Date.now();
        validationPending = true;

        resetYouTubeChannelForSessionChange(currentAuth, cookieVal, cookieName, authUser);
        currentAuth.sapisid = cookieVal;
        currentAuth.sapisidName = cookieName;
        currentAuth.ytConnected = true;
        // A browser cookie alone does not prove YouTube Music accepted the
        // private session. Keep this pending until account_menu confirms it.
        currentAuth.ytAuthRejected = false;
        currentAuth.ytAuthVerified = false;
        delete currentAuth.ytAuthProblem;
        currentAuth.ytAuthUser = authUser;
        if (identity.clientVersion && /^\d[\d.]+$/.test(identity.clientVersion)) {
          currentAuth.ytClientVersion = identity.clientVersion;
          currentAuth.ytClientVersionFetchedAt = Date.now();
        }
        currentAuth.ytActive = {
          id: `${currentAuth.ytAuthUser}:${currentAuth.ytPageId ?? 'own'}`,
          name: 'YouTube Music',
          handle: null,
          avatarUrl: null,
          brand: false,
          authUser: currentAuth.ytAuthUser,
        };
        currentAuth.ytCookies = musicCookies.map((c) => `${c.name}=${c.value}`).join('; ') || undefined;
        currentAuth.ytYoutubeCookies = youtubeCookies.map((c) => `${c.name}=${c.value}`).join('; ') || undefined;
        ytAuthPending = true;
        writeAuthStore(currentAuth);

        try {
          const verified = await refreshDesktopYtAuth();
          ytAuthPending = false;
          mainWindow?.webContents.send('bitchord-bridge-event', {
            event: 'yt.authState',
            data: desktopYtAuthState(),
          });
          if (verified && !authWin.isDestroyed()) {
            clearInterval(interval);
            authWin.close();
          }
        } finally {
          ytAuthPending = false;
          validationPending = false;
        }
      }
    } catch {
      validationPending = false;
    }
  };

  const interval = setInterval(checkCookie, 1000);
  authWin.on('closed', () => clearInterval(interval));
}

function getThumbarIcon(name: string): any {
  const candidates = [
    path.join(__dirname, name),
    path.join(__dirname, '../dist', name),
    path.join(__dirname, '../src', name),
    path.join(app.getAppPath(), 'dist', name),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  return found ? nativeImage.createFromPath(found) : undefined;
}

function updateThumbarButtons(isPlaying: boolean) {
  if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return;
  try {
    const prevIcon = getThumbarIcon('thumbar-prev.png');
    const playIcon = getThumbarIcon('thumbar-play.png');
    const pauseIcon = getThumbarIcon('thumbar-pause.png');
    const nextIcon = getThumbarIcon('thumbar-next.png');

    if (!prevIcon || !nextIcon || (!playIcon && !pauseIcon)) return;

    mainWindow.setThumbarButtons([
      {
        tooltip: 'Previous Track',
        icon: prevIcon,
        click: () => {
          mainWindow?.webContents.send('player-action', 'previous');
        },
      },
      {
        tooltip: isPlaying ? 'Pause' : 'Play',
        icon: isPlaying ? pauseIcon : playIcon,
        click: () => {
          mainWindow?.webContents.send('player-action', 'togglePlay');
        },
      },
      {
        tooltip: 'Next Track',
        icon: nextIcon,
        click: () => {
          mainWindow?.webContents.send('player-action', 'next');
        },
      },
    ]);
  } catch (err) {
    console.warn('[Mellow] Failed to set thumbar buttons:', err);
  }
}

function createMainWindow() {
  const appIcon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    title: 'Mellow',
    icon: appIcon || undefined,
    backgroundColor: '#0c0d12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  mainWindow.setMenu(null);

  // Track maximize state and notify renderer
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window-maximize-changed', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-maximize-changed', false));
  let miniPlayerAutoOpened = false;
  mainWindow.on('minimize', () => {
    if (currentTrackState.title) {
      miniPlayerAutoOpened = true;
      createOrShowMiniPlayer();
    }
  });
  mainWindow.on('restore', () => {
    if (miniPlayerAutoOpened) {
      destroyMiniPlayer();
      miniPlayerAutoOpened = false;
    }
  });
  mainWindow.on('close', () => {
    shutdownApp();
  });

  // Configure CORS & Header modifications
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url;
    const headers = { ...details.requestHeaders };

    if (url.includes('accounts.google.com') || url.includes('accounts.youtube.com')) {
      // Use Firefox User-Agent so Google never triggers Chromium BotGuard webview detection
      headers['User-Agent'] = FIREFOX_USER_AGENT;
      delete headers['Sec-Ch-Ua'];
      delete headers['Sec-Ch-Ua-Mobile'];
      delete headers['Sec-Ch-Ua-Platform'];
      delete headers['Sec-Ch-Ua-Full-Version-List'];
    } else {
      headers['User-Agent'] = CHROME_USER_AGENT;
    }

    // 1. YouTube Music InnerTube
    if (url.includes('music.youtube.com/youtubei/')) {
      headers['Origin'] = 'https://music.youtube.com';
      headers['Referer'] = 'https://music.youtube.com/';
      headers['X-Origin'] = 'https://music.youtube.com';
    } 
    // 2. YouTube Web InnerTube
    else if (url.includes('youtube.com/youtubei/')) {
      headers['Origin'] = 'https://www.youtube.com';
      headers['Referer'] = 'https://www.youtube.com/';
      headers['X-Origin'] = 'https://www.youtube.com';
    }
    // 3. BotGuard endpoints (api/jnn): must NOT have YouTube origin
    else if (url.includes('youtube.com/api/jnn/')) {
      delete headers['Origin'];
      delete headers['X-Origin'];
    }
    // 4. googlevideo: VISIONOS direct URLs must have NO Origin or Referer!
    else if (url.includes('googlevideo.com')) {
      if (url.includes('c=VISIONOS')) {
        delete headers['Origin'];
        delete headers['Referer'];
        delete headers['X-Origin'];
      } else {
        headers['Origin'] = 'https://www.youtube.com';
        headers['Referer'] = 'https://www.youtube.com/';
      }
    }

    callback({ requestHeaders: headers });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url;
    // CRITICAL: NEVER tamper with CORS headers on Google or Spotify authentication endpoints!
    // Adding wildcard Access-Control-Allow-Origin: * breaks credentialed requests.
    if (
      url.includes('music.youtube.com') ||
      url.includes('/youtubei/') ||
      url.includes('googlevideo.com') ||
      url.includes('ytimg.com') ||
      url.includes('ggpht.com') ||
      url.includes('spotifycdn.com') ||
      url.includes('scdn.co')
    ) {
      const responseHeaders = { ...details.responseHeaders };
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase().startsWith('access-control-')) {
          delete responseHeaders[key];
        }
      }
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, HEAD, POST, OPTIONS'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      responseHeaders['Access-Control-Expose-Headers'] = ['*'];
      return callback({ responseHeaders });
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  // Intercept window open calls to use appropriate browser window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('spotify.com/login') || url.includes('accounts.spotify.com')) {
      openSpotifyAuthWindow();
      return { action: 'deny' };
    }
    if (url.includes('accounts.google.com') || url.includes('accounts.youtube.com')) {
      openGoogleAuthWindow();
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load app from dist (production) or Vite dev server (if running)
  const candidatePaths = [
    path.join(app.getAppPath(), 'app/dist/index.html'),
    path.join(__dirname, '../app/dist/index.html'),
    path.join(__dirname, '../../app/dist/index.html'),
  ];
  const distPath = candidatePaths.find((p) => fs.existsSync(p));

  if (distPath) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    updateThumbarButtons(false);
  });

  if (mainWindow) {
    setupAutoUpdater(mainWindow);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window controls IPC
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => shutdownApp());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);
let windowsAccentSyncEnabled = false;
ipcMain.handle('windows-accent-sync', async (_, enabled: unknown, color: unknown) => {
  const wantsSync = enabled === true;
  if (process.platform !== 'win32') return { ok: false, message: 'Windows accent sync is only available on Windows.' };
  if (!wantsSync) {
    if (!windowsAccentSyncEnabled && !fs.existsSync(windowsAccentBackup)) return { ok: true };
    windowsAccentSyncEnabled = false;
    try {
      await setWindowsAccent(app.getPath('userData'), false);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Windows did not accept the accent change. Your saved colors will be restored when Mellow closes.' };
    }
  }

  windowsAccentSyncEnabled = true;
  const safeColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
  if (!safeColor) return { ok: true };
  try {
    await setWindowsAccent(app.getPath('userData'), true, safeColor);
    return { ok: true };
  } catch {
    windowsAccentSyncEnabled = false;
    return { ok: false, message: 'Windows accent sync could not be applied. Check Windows permissions and try again.' };
  }
});

let miniPlayerWindow: BrowserWindow | null = null;
let currentTrackState = {
  videoId: '',
  title: '',
  artist: '',
  album: '',
  artworkUrl: '',
  status: 'paused',
  positionSec: 0,
  durationSec: 0,
};

function getMiniPlayerBounds() {
  const anchorBounds = mainWindow && !mainWindow.isDestroyed()
    ? mainWindow.getBounds()
    : screen.getPrimaryDisplay().workArea;
  const { workArea } = screen.getDisplayMatching(anchorBounds);
  const width = 488;
  const height = 142;
  const margin = 20;

  return {
    x: Math.max(workArea.x + margin, workArea.x + workArea.width - width - margin),
    y: Math.max(workArea.y + margin, workArea.y + workArea.height - height - margin),
    width,
    height,
  };
}

function createOrShowMiniPlayer() {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.setBounds(getMiniPlayerBounds());
    miniPlayerWindow.showInactive();
    miniPlayerWindow.webContents.send('mini-player-update', currentTrackState);
    return;
  }

  const appIcon = getAppIcon();
  miniPlayerWindow = new BrowserWindow({
    ...getMiniPlayerBounds(),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    title: 'Mellow Mini Player',
    icon: appIcon || undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const miniHtmlCandidates = [
    path.join(app.getAppPath(), 'dist/mini-player.html'),
    path.join(__dirname, 'mini-player.html'),
    path.join(__dirname, '../src/mini-player.html'),
  ];
  const miniHtml = miniHtmlCandidates.find((p) => fs.existsSync(p));
  if (miniHtml) {
    miniPlayerWindow.loadFile(miniHtml);
  }

  miniPlayerWindow.once('ready-to-show', () => {
    miniPlayerWindow?.showInactive();
    miniPlayerWindow?.webContents.send('mini-player-update', currentTrackState);
  });

  miniPlayerWindow.on('closed', () => {
    miniPlayerWindow = null;
  });
}

/** Release Chromium's extra renderer when the floating player is not in use. */
function destroyMiniPlayer() {
  if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow = null;
    return;
  }
  const windowToDestroy = miniPlayerWindow;
  miniPlayerWindow = null;
  windowToDestroy.destroy();
}

// Mini Player & Playback Sync IPC
ipcMain.on('update-now-playing', (_, track) => {
  if (track?.videoId && track.videoId !== currentTrackState.videoId) currentTrackState.positionSec = 0;
  currentTrackState = { ...currentTrackState, ...track };
  miniPlayerWindow?.webContents.send('mini-player-update', currentTrackState);
});

ipcMain.on('update-playback-status', (_, status) => {
  currentTrackState.status = status;
  miniPlayerWindow?.webContents.send('mini-player-update', currentTrackState);
  updateThumbarButtons(status === 'playing' || status === 'buffering');
});

ipcMain.on('update-playback-position', (_, positionSec, durationSec) => {
  if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) return;
  currentTrackState.positionSec = Math.max(0, Number(positionSec) || 0);
  currentTrackState.durationSec = Math.max(0, Number(durationSec) || 0);
  miniPlayerWindow.webContents.send('mini-player-update', currentTrackState);
});

ipcMain.handle('toggle-mini-player', () => {
  if (miniPlayerWindow && miniPlayerWindow.isVisible()) {
    destroyMiniPlayer();
  } else {
    createOrShowMiniPlayer();
  }
});

ipcMain.on('mini-player-action', (_, action) => {
  mainWindow?.webContents.send('player-action', action);
});

ipcMain.on('mini-player-seek', (_, ratio) => {
  const value = Number(ratio);
  if (Number.isFinite(value)) mainWindow?.webContents.send('player-action', `seek:${Math.max(0, Math.min(1, value))}`);
});

ipcMain.on('mini-player-restore', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  destroyMiniPlayer();
});

ipcMain.on('mini-player-close', () => {
  destroyMiniPlayer();
});

// Open external URL in user's default Chrome browser
ipcMain.handle('open-chrome-sync', () => {
  shell.openExternal('http://127.0.0.1:41838/connect');
});

// Authentication modals
ipcMain.handle('auth-spotify-login', async () => {
  openSpotifyAuthWindow();
});

ipcMain.handle('auth-google-login', async () => {
  openGoogleAuthWindow();
});

// Bridge request dispatcher - CRITICAL: direction MUST be 'to-page' for isBridgeResponse!
ipcMain.handle('bitchord-bridge-call', async (_, request) => {
  const { id, method, params } = request;

  const success = (result: any) => ({
    channel: 'bitchord-bridge',
    protocol: 1,
    direction: 'to-page',
    id,
    ok: true,
    result,
  });

  const failure = (code: string, message: string) => ({
    channel: 'bitchord-bridge',
    protocol: 1,
    direction: 'to-page',
    id,
    ok: false,
    error: { code, message },
  });

  try {
    switch (method) {
      case 'ping':
        return success({
          version: '1.0.0-mellow',
          protocol: 1,
          browser: 'mellow-desktop',
          capabilities: ['yt', 'yt.auth', 'yt.stats', 'addon', 'lyrics', 'spotify'],
        });

      case 'spotify.authState': {
        const hasSpDc = !!currentAuth.spDc;
        if (hasSpDc && !currentAuth.spotifyUser && currentAuth.spotifyConnected !== false) {
          currentAuth.spotifyUser = await fetchSpotifyProfile(currentAuth.spDc!).catch(() => null);
          writeAuthStore(currentAuth);
        }
        return success({
          browserSignedIn: hasSpDc,
          connected: currentAuth.spotifyConnected ?? hasSpDc,
          signedIn: hasSpDc && (currentAuth.spotifyConnected ?? true),
          user: hasSpDc ? currentAuth.spotifyUser ?? { name: 'Spotify', avatarUrl: null } : null,
          problem: null,
        });
      }

      case 'spotify.setConnected':
        currentAuth.spotifyConnected = !!params.connected;
        if (currentAuth.spDc && !currentAuth.spotifyUser && currentAuth.spotifyConnected) {
          currentAuth.spotifyUser = await fetchSpotifyProfile(currentAuth.spDc).catch(() => null);
        }
        writeAuthStore(currentAuth);
        return success({
          browserSignedIn: !!currentAuth.spDc,
          connected: currentAuth.spotifyConnected,
          signedIn: !!currentAuth.spDc && currentAuth.spotifyConnected,
          user: currentAuth.spDc ? currentAuth.spotifyUser ?? { name: 'Spotify', avatarUrl: null } : null,
          problem: null,
        });

      case 'spotify.signIn':
        openSpotifyAuthWindow();
        return success({});

      case 'spotify.playlists': {
        if (!currentAuth.spDc || currentAuth.spotifyConnected === false) return failure('unauthenticated', 'Spotify is paused in Settings or not signed in');
        const page = await fetchPlaylists(currentAuth.spDc, params?.offset ?? 0);
        return success(page);
      }

      case 'spotify.tracks': {
        if (!currentAuth.spDc || currentAuth.spotifyConnected === false) return failure('unauthenticated', 'Spotify is paused in Settings or not signed in');
        const page = await fetchPlaylistTracks(currentAuth.spDc, params.playlistId, params?.offset ?? 0);
        return success(page);
      }

      case 'spotify.playlist': {
        if (!currentAuth.spDc || currentAuth.spotifyConnected === false) return failure('unauthenticated', 'Spotify is paused in Settings or not signed in');
        const info = await fetchPlaylistInfo(currentAuth.spDc, params.playlistId);
        return success(info);
      }

      case 'spotify.searchTracks': {
        if (!currentAuth.spDc || currentAuth.spotifyConnected === false) return success([]);
        const hits = await searchTracks(currentAuth.spDc, params.query, params.offset ?? 0);
        return success(hits);
      }

      case 'spotify.categories': {
        if (!currentAuth.spDc || currentAuth.spotifyConnected === false) return success([]);
        return success(await fetchSpotifyCategories(currentAuth.spDc));
      }

      case 'spotify.categoryPlaylists': {
        if (!currentAuth.spDc || currentAuth.spotifyConnected === false) return success([]);
        return success(await fetchSpotifyCategoryPlaylists(currentAuth.spDc, params.categoryId));
      }

      case 'spotify.canvas': {
        if (!currentAuth.spDc || currentAuth.spotifyConnected === false) return success({ url: null });
        const canvas = await fetchCanvas(currentAuth.spDc, params.trackId);
        return success(canvas);
      }

      case 'spotify.homeSections': {
        if (!currentAuth.spDc || currentAuth.spotifyConnected === false) return success({ madeForYou: [], recents: [], topMixes: [], sections: [] });
        const sections = await fetchHomeSections(currentAuth.spDc);
        return success(sections);
      }

      case 'yt.authState':
        if (params.refresh) {
          ytAuthPending = true;
          try {
            await refreshDesktopYtAuth();
          } finally {
            ytAuthPending = false;
          }
        } else if (shouldVerifyDesktopYouTubeAtStartup({
          hasCookie: !!currentAuth.sapisid,
          connected: currentAuth.ytConnected !== false,
          verified: currentAuth.ytAuthVerified === true,
          rejected: !!currentAuth.ytAuthRejected,
          pending: ytAuthPending,
          attempted: ytAuthStartupVerificationAttempted,
        })) {
          // Verify any unverified saved session once per launch. Previously a
          // stored `false` was treated as already checked forever, leaving the
          // integration in a connected-but-unusable state across restarts.
          ytAuthStartupVerificationAttempted = true;
          currentAuth.ytAuthVerified = false;
          ytAuthPending = true;
          void refreshDesktopYtAuth().finally(() => {
            ytAuthPending = false;
            mainWindow?.webContents.send('bitchord-bridge-event', {
              event: 'yt.authState',
              data: desktopYtAuthState(),
            });
          });
        }
        return success(desktopYtAuthState());

      case 'yt.setConnected':
        currentAuth.ytConnected = !!params.connected;
        if (currentAuth.ytConnected) {
          ytAuthPending = true;
          try {
            await refreshDesktopYtAuth();
          } finally {
            ytAuthPending = false;
          }
        }
        writeAuthStore(currentAuth);
        return success(desktopYtAuthState());

      case 'yt.selectChannel':
        if (currentAuth.ytActive && params.channelId) currentAuth.ytActive.id = params.channelId;
        writeAuthStore(currentAuth);
        return success(desktopYtAuthState());

      case 'yt.fetch': {
        if (params.auth && currentAuth.ytConnected === false) return failure('unauthenticated', 'YouTube Music is paused in Settings or needs sign-in');
        const headers = { ...(params.headers ?? {}) };
        const urlStr = params.url ?? '';
        const origin = urlStr.includes('music.youtube.com') ? 'https://music.youtube.com' : 'https://www.youtube.com';

        headers['Origin'] = origin;
        headers['Referer'] = origin + '/';
        headers['X-Origin'] = origin;
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

        const { header: cookieHeader, signingCookie } = await desktopYtCookies(origin);

        if (params.auth && !signingCookie) return failure('unauthenticated', 'YouTube Music session is missing. Reconnect the account.');
        if (params.auth && signingCookie) {
          headers['Authorization'] = sapisidHash(signingCookie, origin);
          headers['X-Goog-AuthUser'] = currentAuth.ytAuthUser ?? '0';
          if (currentAuth.ytPageId) headers['X-Goog-PageId'] = currentAuth.ytPageId;
          else delete headers['X-Goog-PageId'];
          // Never invent aliases for secure cookies: the duplicate names can
          // make a real session look invalid. A complete jar is synced from
          // the extension; if unavailable, send only the signed request.
          headers['Cookie'] = cookieHeader || `SAPISID=${signingCookie}`;
        }

        const body =
          params.body === undefined
            ? undefined
            : params.bodyEncoding === 'base64'
              ? Buffer.from(params.body, 'base64')
              : params.body;

        const resp = await fetch(params.url, {
          method: params.method ?? 'GET',
          headers,
          body,
        });
        if (params.auth && resp.status === 401) {
          // Keep the user's Connect/Disconnect preference separate from a
          // rejected cookie, so a later browser sync can repair the session.
          currentAuth.ytAuthRejected = true;
          currentAuth.ytAuthVerified = false;
          delete currentAuth.ytAuthProblem;
          writeAuthStore(currentAuth);
          mainWindow?.webContents.send('bitchord-bridge-event', { event: 'yt.authState', data: desktopYtAuthState() });
        }
        const contentType = resp.headers.get('content-type') ?? '';
        const textual = /json|text|javascript|xml/.test(contentType);
        return success({
          status: resp.status,
          headers: Object.fromEntries(resp.headers.entries()),
          url: resp.url,
          bodyEncoding: textual ? 'text' : 'base64',
          body: textual ? await resp.text() : Buffer.from(await resp.arrayBuffer()).toString('base64'),
        });
      }

      case 'lyrics.fetch':
      case 'addon.fetch':
      case 'http.fetch': {
        const resp = await fetch(params.url, {
          method: params.method ?? 'GET',
          headers: params.headers,
          body: params.body,
        });
        const text = await resp.text();
        return success({
          status: resp.status,
          headers: Object.fromEntries(resp.headers.entries()),
          body: text,
          bodyEncoding: 'text',
          url: resp.url,
        });
      }

      default:
        return failure('unsupported', `Method ${method} not implemented`);
    }
  } catch (err: any) {
    return failure('internal', err?.message || 'Error handling bridge call');
  }
});

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});

app.whenReady().then(() => {
  // Recover the user's original accent if the previous run ended unexpectedly.
  if (fs.existsSync(windowsAccentBackup)) restoreWindowsAccent(app.getPath('userData'));
  createMainWindow();
  startSyncServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  shutdownApp();
});
