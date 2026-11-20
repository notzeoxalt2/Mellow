import { app, shell, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface DownloadedItem {
  videoId: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  filePath: string;
  filename: string;
  sizeBytes: number;
  downloadedAt: number;
}

const STORE_PATH = path.join(app.getPath('userData'), 'mellow_downloads.json');

function getStore(): Record<string, DownloadedItem> {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    }
  } catch {}
  return {};
}

function saveStore(data: Record<string, DownloadedItem>) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

export function getMellowMusicDir(): string {
  const musicBase = app.getPath('music') || app.getPath('downloads');
  const dir = path.join(musicBase, 'Mellow');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

export function getDownloadedTracks(): DownloadedItem[] {
  const store = getStore();
  const list = Object.values(store);
  // Verify that files still exist on disk
  return list.filter((item) => {
    try {
      return fs.existsSync(item.filePath);
    } catch {
      return false;
    }
  });
}

export function isTrackDownloaded(videoId: string): boolean {
  const store = getStore();
  const item = store[videoId];
  if (!item) return false;
  try {
    return fs.existsSync(item.filePath);
  } catch {
    return false;
  }
}

export function openDownloadsFolder() {
  const dir = getMellowMusicDir();
  void shell.openPath(dir);
}

export function deleteDownloadedTrack(videoId: string): boolean {
  const store = getStore();
  const item = store[videoId];
  if (!item) return false;
  try {
    if (fs.existsSync(item.filePath)) {
      fs.unlinkSync(item.filePath);
    }
    delete store[videoId];
    saveStore(store);
    return true;
  } catch {
    return false;
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '').trim().slice(0, 120);
}

export async function downloadTrackStream(
  track: { videoId: string; title: string; artist: string; album?: string | null; artworkUrl?: string | null },
  streamUrl: string,
  ext = 'opus',
  lrcContent?: string,
  onProgress?: (progress: { percent: number; bytesReceived: number; totalBytes: number }) => void,
): Promise<{ success: boolean; filePath?: string; filename?: string; error?: string }> {
  try {
    const dir = getMellowMusicDir();
    const cleanArtist = sanitizeFilename(track.artist || 'Unknown Artist');
    const cleanTitle = sanitizeFilename(track.title || 'Unknown Title');
    const filename = `${cleanArtist} - ${cleanTitle}.${ext}`;
    const filePath = path.join(dir, filename);

    const response = await fetch(streamUrl);
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: Failed to fetch stream`);
    }

    const totalBytes = Number(response.headers.get('content-length') || 0);
    let bytesReceived = 0;

    const fileStream = fs.createWriteStream(filePath);
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        fileStream.write(Buffer.from(value));
        bytesReceived += value.length;
        if (onProgress) {
          const percent = totalBytes > 0 ? Math.round((bytesReceived / totalBytes) * 100) : 0;
          onProgress({ percent, bytesReceived, totalBytes });
        }
      }
    }

    await new Promise((resolve) => fileStream.end(resolve));

    // Save accompanying synchronized .lrc lyrics file if provided (LastWave style)
    if (lrcContent && lrcContent.trim().length > 0) {
      try {
        const lrcFilename = `${cleanArtist} - ${cleanTitle}.lrc`;
        const lrcPath = path.join(dir, lrcFilename);
        fs.writeFileSync(lrcPath, lrcContent, 'utf8');
      } catch (lrcErr) {
        console.warn('[Mellow] Could not save .lrc lyrics file:', lrcErr);
      }
    }

    // Save record to local store
    const store = getStore();
    const item: DownloadedItem = {
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      album: track.album ?? null,
      artworkUrl: track.artworkUrl ?? null,
      filePath,
      filename,
      sizeBytes: bytesReceived,
      downloadedAt: Date.now(),
    };
    store[track.videoId] = item;
    saveStore(store);

    // Show native Windows notification if supported
    if (Notification.isSupported()) {
      new Notification({
        title: 'Download Complete',
        body: `${track.title} by ${track.artist} saved to Music/Mellow`,
        silent: true,
      }).show();
    }

    return { success: true, filePath, filename };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}
