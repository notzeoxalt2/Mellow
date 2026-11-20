import { useEffect, useState } from 'react';
import { Download, FolderOpen, Monitor, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { TrackList } from '@/components/music/TrackList';
import type { Track } from '@/data/music/types';
import { useDownloads } from '@/lib/download';
import { config } from '@/config';

export default function DownloadsPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const openDownloadsFolder = useDownloads((s) => s.openDownloadsFolder);
  const downloadedIds = useDownloads((s) => s.downloadedIds);

  const fetchDownloaded = async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.getDownloadedTracks) {
      try {
        const items = await window.electronAPI.getDownloadedTracks();
        if (Array.isArray(items)) {
          const mapped: Track[] = items.map((item: any, i: number) => ({
            videoId: item.videoId,
            title: item.title,
            artists: item.artist ? [{ name: item.artist, id: null, channelId: null }] : [],
            album: item.album ? { name: item.album, id: null } : null,
            durationSec: 0,
            thumbnail: item.thumbnail || null,
            explicit: false,
            index: i,
            plays: null,
          }));
          setTracks(mapped);
        }
      } catch {}
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchDownloaded();
  }, [downloadedIds]);

  return (
    <div className="flex flex-col gap-6 p-8 max-md:p-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Downloads" />
        <button
          type="button"
          onClick={openDownloadsFolder}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-medium text-white transition-all cursor-pointer backdrop-blur-md shadow-sm border border-white/10"
        >
          <FolderOpen size={15} />
          <span>Open Folder</span>
        </button>
      </div>

      {/* Download the full application card */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-[10px] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-[8px] bg-(--theme-accent)/20 text-(--theme-accent) border border-(--theme-accent)/30">
            <Download size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Get Mellow App</h3>
            <p className="text-xs text-secondary">Listen without limits on PC or Android with full offline support & lossless audio.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/kushagrasinghx/BitChord/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-medium text-white transition-all cursor-pointer border border-white/10"
          >
            <Monitor size={14} />
            <span>Windows App</span>
          </a>
          <a
            href={config.androidAppUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-(--theme-accent) hover:opacity-90 active:scale-95 text-xs font-medium text-white transition-all cursor-pointer shadow-sm"
          >
            <Smartphone size={14} />
            <span>Android APK</span>
          </a>
        </div>
      </div>

      {tracks.length > 0 ? (
        <section className="flex flex-col gap-2">
          <span className="text-xs text-secondary font-medium px-1">
            {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} saved offline in %USERPROFILE%\Music\Mellow
          </span>
          <TrackList tracks={tracks} variant="playlist" />
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-secondary">
          <div className="size-14 grid place-items-center rounded-[12px] bg-white/[0.05] border border-white/10 text-white/50">
            <Download size={26} />
          </div>
          <h3 className="type-title-3 text-primary mt-1">No Offline Songs Yet</h3>
          <p className="type-body text-secondary max-w-sm">
            Save any song for offline listening by clicking the Download button in the player or contextual track menus.
          </p>
        </div>
      )}
    </div>
  );
}
