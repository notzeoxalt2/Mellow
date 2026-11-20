import { useEffect, useState } from 'react';
import { Download, FolderOpen, Shuffle } from 'lucide-react';
import { PlayIcon } from '@/components/icons/Transport';
import { playList, shuffleList } from '@/components/music/play';
import { TrackList } from '@/components/music/TrackList';
import type { Track } from '@/data/music/types';
import { useDownloads } from '@/lib/download';

export default function DownloadsPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
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
            durationSec: item.durationSec || 0,
            thumbnail: item.artworkUrl || item.thumbnail || (item.videoId ? `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` : null),
            explicit: false,
            index: i,
            plays: null,
          }));
          setTracks(mapped);
        }
      } catch {}
    }
  };

  useEffect(() => {
    void fetchDownloaded();
  }, [downloadedIds]);

  const context = { source: { title: 'Downloads', type: 'playlist' as const } };

  return (
    <div className="flex flex-col gap-6 p-8 max-md:p-4">
      {/* Full Playlist Layout matching Liked Songs design */}
      <div className="mx-(--body-gutter) mb-2 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_1fr_auto] gap-x-[34px] pt-4 [grid-template-areas:'artwork_headings'_'artwork_description'_'artwork_actions'] max-md:grid-cols-[1fr] max-md:grid-rows-[auto] max-md:justify-items-center max-md:text-center max-md:[grid-template-areas:'artwork'_'headings'_'actions'_'description']">
        <div className="relative size-[230px] self-start rounded-[12px] shadow-2xl overflow-hidden [grid-area:artwork] max-md:size-[180px] bg-gradient-to-br from-indigo-600 via-purple-600 to-emerald-500 flex items-center justify-center">
          <Download size={76} className="text-white drop-shadow-md" />
        </div>
        <div className="flex flex-col justify-center [grid-area:headings] max-md:items-center max-md:pt-4">
          <h1 className="type-large-title-emphasized text-white text-3xl font-bold">Downloads</h1>
          <p className="type-callout-emphasized text-white/70 mt-1 font-medium">Mellow Offline Storage</p>
          <div className="mt-1 type-callout text-secondary">
            {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} • Available offline
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3.5 self-end [grid-area:actions]">
          <button
            className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all cursor-pointer disabled:opacity-40"
            aria-label="Shuffle"
            onClick={() => shuffleList(tracks, context)}
            disabled={tracks.length === 0}
          >
            <Shuffle size={18} />
          </button>
          <button
            className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-full bg-white px-5 font-semibold text-black hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-40"
            onClick={() => playList(tracks, 0, context)}
            disabled={tracks.length === 0}
          >
            <PlayIcon size={18} fill="currentColor" />
            <span>Play</span>
          </button>
          <button
            type="button"
            onClick={openDownloadsFolder}
            className="flex items-center gap-2 px-3.5 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-medium text-white transition-all cursor-pointer border border-white/10"
            title="Open Downloads Folder in File Explorer"
          >
            <FolderOpen size={16} />
            <span>Open Folder</span>
          </button>
        </div>
      </div>

      {tracks.length > 0 ? (
        <section className="flex flex-col gap-2">
          <TrackList tracks={tracks} variant="playlist" source={context.source} />
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-secondary">
          <div className="size-14 grid place-items-center rounded-[12px] bg-white/[0.05] border border-white/10 text-white/50">
            <Download size={26} />
          </div>
          <h3 className="type-title-3 text-primary mt-1">No Offline Songs Yet</h3>
          <p className="type-body text-secondary max-w-sm">
            Save any song for offline listening by clicking the Download button in the player or right-clicking any track.
          </p>
        </div>
      )}
    </div>
  );
}
