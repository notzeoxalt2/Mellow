import { Disc3, PanelRightClose, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { Artwork } from '@/components/music/Artwork';
import { CanvasArtwork } from '@/components/music/CanvasArtwork';
import { formatDuration } from '@/components/music/links';
import { useCanvas } from '@/data/spotify/canvas';
import { useArtist } from '@/data/music/queries';
import { sizedArtwork } from '@/lib/artwork';
import { useArtworkColor } from '@/lib/artworkColor';
import { useLyrics } from '@/lyrics/useLyrics';
import { getAudio, usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { useEffect, useState } from 'react';

/** A music-tinted context panel, shaped for Mellow's right-hand glass rail. */
export function NowPlayingPanel() {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const current = queue[index]?.track;
  const canvas = useCanvas();
  const artwork = current?.thumbnail ?? nowPlaying?.artworkUrl ?? null;
  const color = useArtworkColor(artwork);
  const closeSidePanel = useUi((s) => s.closeSidePanel);
  const toggleSidePanel = useUi((s) => s.toggleSidePanel);
  const lyrics = useLyrics();
  const [playhead, setPlayhead] = useState(0);
  const primaryArtist = current?.artists.find((artist) => artist.id);
  const upcoming = queue.slice(index + 1, index + 5);
  const accent = color?.accent ?? 'var(--theme-accent)';

  useEffect(() => {
    const audio = getAudio();
    const refresh = () => setPlayhead(audio?.currentTime ?? 0);
    refresh();
    audio?.addEventListener('seeked', refresh);
    const timer = playing ? window.setInterval(refresh, 1000) : undefined;
    return () => {
      audio?.removeEventListener('seeked', refresh);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [nowPlaying?.videoId, playing]);
  const lyricLines = lyrics.data?.lines.filter((line) => line.text.trim()) ?? [];
  const currentLine = lyricLines.findIndex((line) => line.timeMs / 1000 > playhead);
  const activeLine = currentLine < 0 ? Math.max(0, lyricLines.length - 1) : Math.max(0, currentLine - 1);
  const lyricPreview = lyricLines.slice(Math.max(0, activeLine - 1), activeLine + 3);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ '--now-playing-accent': accent } as React.CSSProperties}>
      <header className="flex h-14 flex-none items-center gap-2 border-b border-white/[0.07] px-4">
        <div className="min-w-0 flex-1">
          <p className="type-callout-emphasized">Now Playing</p>
          <p className="truncate type-caption text-secondary">{queue[index]?.source?.title ?? 'Your music'}</p>
        </div>
        <button className="grid size-8 place-items-center rounded-full text-secondary hover:bg-white/[0.08] hover:text-primary" aria-label="Close Now Playing" onClick={closeSidePanel}>
          <PanelRightClose size={17} />
        </button>
      </header>

      <div className="mellow-panel-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8 [scrollbar-width:thin]">
        <div className="relative mb-4 aspect-square overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.04] shadow-[0_10px_26px_-22px_rgba(0,0,0,0.42)]">
          {artwork ? (
            <>
              <img src={sizedArtwork(artwork, 600)} alt="" className="absolute inset-0 size-full object-cover" referrerPolicy="no-referrer" decoding="async" />
              {canvas && <CanvasArtwork url={canvas} playing={playing} />}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
            </>
          ) : <div className="grid size-full place-items-center text-secondary"><Disc3 size={44} /></div>}
        </div>

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate type-title-3-emphasized">{nowPlaying?.title ?? 'Nothing playing'}</h2>
            <p className="mt-1 truncate type-body text-secondary">{nowPlaying?.artist ?? 'Choose a song to start listening'}</p>
            {current?.album?.name && <p className="mt-0.5 truncate type-callout text-tertiary">{current.album.name}</p>}
          </div>
          {nowPlaying && <span className="mt-1 size-2 flex-none rounded-full bg-(--now-playing-accent) shadow-[0_0_12px_color-mix(in_srgb,var(--now-playing-accent)_60%,transparent)]" aria-label="Playing" />}
        </div>

        <section className="mt-5 overflow-hidden rounded-[10px] border border-white/[0.07] bg-black/15">
          <div className="px-3.5 pt-3 pb-3.5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="type-callout-emphasized">Lyrics preview</h3>
              <button className="type-caption text-secondary hover:text-primary" onClick={() => toggleSidePanel('lyrics')}>Open lyrics</button>
            </div>
            {lyrics.isPending ? (
              <p className="type-callout text-secondary">Finding synced lyrics…</p>
            ) : lyricPreview.length ? (
              <div className="flex flex-col gap-2" aria-live="off">
                {lyricPreview.map((line, offset) => {
                  const at = Math.max(0, activeLine - 1) + offset;
                  return <p key={`${line.timeMs}-${at}`} className={`line-clamp-2 type-[600_16px/22px] ${at === activeLine ? 'text-primary' : 'text-secondary/75'}`}>{line.text}</p>;
                })}
              </div>
            ) : (
              <p className="type-callout text-secondary">Lyrics aren’t available for this track yet.</p>
            )}
          </div>
        </section>

        {primaryArtist?.id && <ArtistContextCard artistId={primaryArtist.id} artistName={primaryArtist.name} />}

        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="type-callout-emphasized">Up Next</h3>
            <span className="type-caption text-secondary">{upcoming.length ? `${upcoming.length} queued` : 'Queue'}</span>
          </div>
          {upcoming.length ? (
            <ol className="flex flex-col gap-0.5">
              {upcoming.map((entry, offset) => {
                const at = index + offset + 1;
                return (
                  <li key={entry.entryId}>
                    <button
                      className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] p-2 text-left transition-colors hover:bg-white/[0.06]"
                      onClick={() => usePlayer.getState().jumpTo(at)}
                      aria-label={`Play ${entry.track.title}`}
                    >
                      <Artwork src={entry.track.thumbnail} displayWidth={40} radius="8px" />
                      <span className="min-w-0">
                        <span className="block truncate type-body-emphasized">{entry.track.title}</span>
                        <span className="mt-0.5 block truncate type-callout text-secondary">{entry.track.artists.map((artist) => artist.name).join(', ')}</span>
                      </span>
                      <span className="type-caption tabular-nums text-tertiary">{formatDuration(entry.track.durationSec)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-[8px] bg-white/[0.035] px-3 py-4 type-callout text-secondary">Your next songs will appear here.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Only mounted while the Now Playing rail is open and a linked artist is known. */
function ArtistContextCard({ artistId, artistName }: { artistId: string; artistName: string }) {
  const artist = useArtist(artistId);
  const description = artist.data?.description?.trim();

  return (
    <section className="mt-6 overflow-hidden rounded-[10px] border border-white/[0.07] bg-white/[0.035]" aria-label={`About ${artistName}`}>
      {artist.data?.heroImage ? (
        <Link to={`/artist/${encodeURIComponent(artistId)}`} className="group relative block h-28 overflow-hidden" aria-label={`Open ${artistName} artist page`}>
          <img src={sizedArtwork(artist.data.heroImage, 720)} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" decoding="async" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute inset-x-3 bottom-2 flex items-center gap-2 type-callout-emphasized text-white">
            <UsersRound size={15} /> About the artist
          </span>
        </Link>
      ) : (
        <div className="flex items-center gap-2 px-3 pt-3 type-callout-emphasized">
          <UsersRound size={15} className="text-secondary" /> About the artist
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/artist/${encodeURIComponent(artistId)}`} className="truncate type-body-emphasized hover:underline">{artist.data?.name ?? artistName}</Link>
            {artist.data?.audience && <p className="mt-0.5 type-caption text-secondary">{artist.data.audience}</p>}
          </div>
          <Link to={`/artist/${encodeURIComponent(artistId)}`} className="flex-none rounded-[6px] border border-white/[0.12] px-3 py-1 type-callout-emphasized hover:bg-white/[0.08]">Open artist</Link>
        </div>
        {description && <p className="mt-2 line-clamp-4 whitespace-pre-line type-callout text-secondary">{description}</p>}
        {artist.isError && <p className="mt-2 type-caption text-secondary">Artist details are unavailable right now.</p>}
      </div>
    </section>
  );
}
