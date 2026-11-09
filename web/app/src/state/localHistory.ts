import type { Track } from '@/data/music/types';

const STORAGE_KEY = 'mellow:local_history';
const MAX_HISTORY = 100;

export function getLocalHistory(): Track[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Track[];
  } catch {
    return [];
  }
}

export function recordLocalPlay(track: Track): void {
  if (typeof window === 'undefined' || !track || !track.title) return;
  try {
    const current = getLocalHistory();
    // Deduplicate: remove if existing with same videoId or same title + artist
    const filtered = current.filter((t) => {
      if (t.videoId && track.videoId && t.videoId === track.videoId) return false;
      const tArt = t.artists.map((a) => a.name).join(', ').toLowerCase();
      const newArt = track.artists.map((a) => a.name).join(', ').toLowerCase();
      return !(t.title.toLowerCase() === track.title.toLowerCase() && tArt === newArt);
    });

    const updated = [track, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('mellow:history-updated'));
  } catch (err) {
    console.warn('Failed to record local play:', err);
  }
}

export function clearLocalHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('mellow:history-updated'));
  } catch {}
}
