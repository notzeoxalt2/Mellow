import { ArrowLeftRight, ExternalLink, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { PrefetchLink } from '@/components/PrefetchLink';
import { useSpotifyAuth } from '@/extension/useSpotifyAuth';
import { listPlaylistSyncs, unlinkPlaylistSync, type PlaylistSyncRecord } from '@/data/spotify/playlistSync';

const dateLabel = (value: number) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);

export default function PlaylistSyncPage() {
  const auth = useSpotifyAuth();
  const account = auth.state === 'ready' ? auth.auth.user?.name ?? '?' : '?';
  const [records, setRecords] = useState<PlaylistSyncRecord[]>(() => listPlaylistSyncs(account));

  useEffect(() => {
    const refresh = () => setRecords(listPlaylistSyncs(account));
    refresh();
    window.addEventListener('mellow:playlist-syncs-changed', refresh);
    return () => window.removeEventListener('mellow:playlist-syncs-changed', refresh);
  }, [account]);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-32 sm:px-8">
      <PageHeader title="Playlist Sync" />
      <p className="mb-6 max-w-2xl type-body text-secondary">
        Create a private YouTube Music copy from a Spotify playlist, then sync new matched songs from its Spotify page.
        Sync is append-only: removing songs from Spotify does not remove them from YouTube Music.
      </p>
      {records.length ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
          {records.map((record) => (
            <section key={record.spotifyPlaylistId} className="flex flex-wrap items-center gap-4 border-b border-white/[0.07] px-4 py-4 last:border-b-0 sm:px-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-(--theme-accent)"><ArrowLeftRight size={18} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate type-body-emphasized">{record.spotifyTitle}</h2>
                <p className="mt-1 type-callout text-secondary">
                  Last synced {dateLabel(record.lastSyncedAt)} · {record.lastAdded} added
                  {record.lastUnmatched ? ` · ${record.lastUnmatched} unmatched` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PrefetchLink to={`/spotify/playlist/${encodeURIComponent(record.spotifyPlaylistId)}`} className="rounded-full border border-white/10 px-3 py-2 type-callout-emphasized hover:bg-white/[0.07]">
                  <span className="inline-flex items-center gap-1.5">Open Spotify <ExternalLink size={13} /></span>
                </PrefetchLink>
                <PrefetchLink to={`/playlist/${encodeURIComponent(`VL${record.youtubePlaylistId}`)}`} className="rounded-full border border-white/10 px-3 py-2 type-callout-emphasized hover:bg-white/[0.07]">
                  Open YouTube
                </PrefetchLink>
                <button
                  className="grid size-9 place-items-center rounded-full text-secondary hover:bg-white/[0.07] hover:text-primary"
                  aria-label={`Unlink ${record.spotifyTitle}`}
                  title="Unlink sync (keeps the YouTube playlist)"
                  onClick={() => unlinkPlaylistSync(account, record.spotifyPlaylistId)}
                >
                  <Unlink size={16} />
                </button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="mellow-glass rounded-2xl border border-white/10 p-5">
          <h2 className="type-title-3-emphasized">No synced playlists yet</h2>
          <p className="mt-1 type-body text-secondary">Open a Spotify playlist and choose “Create synced YouTube playlist” to start.</p>
          <PrefetchLink to="/spotify" className="mt-4 inline-flex rounded-full bg-white/[0.09] px-4 py-2 type-callout-emphasized hover:bg-white/[0.14]">Browse Spotify playlists</PrefetchLink>
        </section>
      )}
    </div>
  );
}
