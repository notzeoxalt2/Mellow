import { create } from 'zustand';
import type { Track } from '@/data/music/types';

export interface DownloadProgress {
  percent: number;
  status: 'idle' | 'resolving' | 'downloading' | 'completed' | 'error';
  error?: string;
  filePath?: string;
}

interface DownloadState {
  downloadedIds: Set<string>;
  activeProgress: Record<string, DownloadProgress>;
  downloadTrack: (track: Track | { videoId: string; title: string; artist: string; album?: any; thumbnail?: string | null }) => Promise<void>;
  deleteDownload: (videoId: string) => Promise<void>;
  openDownloadsFolder: () => void;
  isDownloaded: (videoId: string) => boolean;
  getProgress: (videoId: string) => DownloadProgress | null;
}

export async function resolveDownloadStreamUrl(videoId: string): Promise<{ url: string; ext: string }> {
  let playId = videoId;
  if (playId.startsWith('spotify:')) {
    try {
      const { matchToYouTube } = await import('@/data/spotify/api');
      const matched = await matchToYouTube({
        id: playId.replace(/^spotify:/, ''),
        title: '',
        artist: '',
        album: null,
        durationMs: 0,
        imageUrl: null,
      });
      if (matched?.videoId) playId = matched.videoId;
    } catch {}
  }

  const { getInnertube } = await import('@/playback/youtube/innertube');
  const { resolvePlayer, usesWebPo } = await import('@/playback/youtube/resolver');
  const { botguard } = await import('@/playback/youtube/botguard');

  const yt = await getInnertube();
  const resolved = await resolvePlayer(yt, playId);
  const info = resolved.info;

  const audioFormats = (info.streaming_data?.adaptive_formats ?? []).filter(
    (f) => f.has_audio && !f.has_video,
  );
  if (!audioFormats.length) {
    throw new Error('No audio format available for this track');
  }

  // Pick highest bitrate stream
  audioFormats.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  const best = audioFormats[0]!;

  let rawUrl = best.url;
  if (!rawUrl && (best.signature_cipher || best.cipher)) {
    rawUrl = await yt.session.player!.decipher(best.signature_cipher || best.cipher);
  }
  if (!rawUrl) {
    throw new Error('Failed to decipher audio stream URL');
  }

  const pot = usesWebPo(resolved.client) ? await botguard.mint(playId) : undefined;
  const parsed = new URL(rawUrl);
  if (pot) parsed.searchParams.set('pot', pot);

  const ext = best.mime_type?.includes('webm') ? 'opus' : best.mime_type?.includes('mp4') ? 'm4a' : 'opus';
  return { url: parsed.toString(), ext };
}

export const useDownloads = create<DownloadState>((set, get) => {
  // Initialize from electron main process if available
  if (typeof window !== 'undefined' && window.electronAPI?.getDownloadedTracks) {
    window.electronAPI.getDownloadedTracks().then((items: any[]) => {
      if (Array.isArray(items)) {
        set({ downloadedIds: new Set(items.map((i) => i.videoId)) });
      }
    }).catch(() => {});

    window.electronAPI.onDownloadProgress?.((data) => {
      set((state) => {
        const next = { ...state.activeProgress };
        if (data.status === 'completed') {
          delete next[data.videoId];
          const nextDownloaded = new Set(state.downloadedIds);
          nextDownloaded.add(data.videoId);
          return { activeProgress: next, downloadedIds: nextDownloaded };
        } else if (data.status === 'error') {
          next[data.videoId] = { percent: 0, status: 'error', error: data.error };
          return { activeProgress: next };
        } else {
          next[data.videoId] = { percent: data.percent, status: 'downloading', filePath: data.filePath };
          return { activeProgress: next };
        }
      });
    });
  }

  return {
    downloadedIds: new Set<string>(),
    activeProgress: {},

    isDownloaded: (videoId: string) => {
      return get().downloadedIds.has(videoId);
    },

    getProgress: (videoId: string) => {
      return get().activeProgress[videoId] ?? null;
    },

    openDownloadsFolder: () => {
      if (window.electronAPI?.openDownloadsFolder) {
        window.electronAPI.openDownloadsFolder();
      }
    },

    deleteDownload: async (videoId: string) => {
      if (window.electronAPI?.deleteDownloadedTrack) {
        await window.electronAPI.deleteDownloadedTrack(videoId);
        set((state) => {
          const next = new Set(state.downloadedIds);
          next.delete(videoId);
          return { downloadedIds: next };
        });
      }
    },

    downloadTrack: async (track) => {
      const videoId = track.videoId;
      if (!videoId) return;

      const artistName =
        typeof (track as any).artist === 'string'
          ? (track as any).artist
          : Array.isArray((track as any).artists)
          ? (track as any).artists.map((a: any) => a.name).join(', ')
          : 'Unknown Artist';

      set((state) => ({
        activeProgress: {
          ...state.activeProgress,
          [videoId]: { percent: 0, status: 'resolving' },
        },
      }));

      try {
        const { url, ext } = await resolveDownloadStreamUrl(videoId);

        // Fetch synchronized lyrics if available to save alongside audio (LastWave style)
        let lrcContent: string | undefined = undefined;
        try {
          const { lookupLyrics } = await import('@/lyrics/repository');
          const lrcRes = await lookupLyrics({
            videoId,
            title: track.title,
            artist: artistName,
            durationMs: 0,
            album: (track as any).album?.name ?? null,
          });
          if (lrcRes?.lines && lrcRes.lines.length > 0) {
            lrcContent = lrcRes.lines
              .map((l) => {
                const ms = l.timeMs;
                const m = Math.floor(ms / 60000);
                const s = Math.floor((ms % 60000) / 1000);
                const cs = Math.floor((ms % 1000) / 10);
                return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${l.text}`;
              })
              .join('\n');
          }
        } catch {}

        if (window.electronAPI?.downloadTrack) {
          set((state) => ({
            activeProgress: {
              ...state.activeProgress,
              [videoId]: { percent: 1, status: 'downloading' },
            },
          }));

          const res = await window.electronAPI.downloadTrack(
            {
              videoId,
              title: track.title,
              artist: artistName,
              album: (track as any).album?.name ?? null,
              artworkUrl: (track as any).thumbnail ?? null,
            },
            url,
            ext,
            lrcContent,
          );

          if (!res.success) {
            throw new Error(res.error || 'Download failed');
          }

          set((state) => {
            const nextProgress = { ...state.activeProgress };
            delete nextProgress[videoId];
            const nextDownloaded = new Set(state.downloadedIds);
            nextDownloaded.add(videoId);
            return { activeProgress: nextProgress, downloadedIds: nextDownloaded };
          });
        } else {
          // Browser Web Fallback: Direct stream blob download
          set((state) => ({
            activeProgress: {
              ...state.activeProgress,
              [videoId]: { percent: 10, status: 'downloading' },
            },
          }));

          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: Could not fetch stream`);
          const blob = await resp.blob();

          set((state) => ({
            activeProgress: {
              ...state.activeProgress,
              [videoId]: { percent: 95, status: 'downloading' },
            },
          }));

          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          const cleanName = (s: string) => s.replace(/[/\\?%*:|"<>]/g, '').trim();
          a.download = `${cleanName(artistName)} - ${cleanName(track.title)}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);

          if (lrcContent) {
            const lrcBlob = new Blob([lrcContent], { type: 'text/plain;charset=utf-8' });
            const lrcBlobUrl = URL.createObjectURL(lrcBlob);
            const lrcLink = document.createElement('a');
            lrcLink.href = lrcBlobUrl;
            lrcLink.download = `${cleanName(artistName)} - ${cleanName(track.title)}.lrc`;
            document.body.appendChild(lrcLink);
            lrcLink.click();
            document.body.removeChild(lrcLink);
            URL.revokeObjectURL(lrcBlobUrl);
          }

          set((state) => {
            const nextProgress = { ...state.activeProgress };
            delete nextProgress[videoId];
            const nextDownloaded = new Set(state.downloadedIds);
            nextDownloaded.add(videoId);
            return { activeProgress: nextProgress, downloadedIds: nextDownloaded };
          });
        }
      } catch (err: any) {
        console.warn('Download error:', err);
        set((state) => ({
          activeProgress: {
            ...state.activeProgress,
            [videoId]: { percent: 0, status: 'error', error: err?.message || 'Download failed' },
          },
        }));
        setTimeout(() => {
          set((state) => {
            const nextProgress = { ...state.activeProgress };
            delete nextProgress[videoId];
            return { activeProgress: nextProgress };
          });
        }, 4000);
      }
    },
  };
});
