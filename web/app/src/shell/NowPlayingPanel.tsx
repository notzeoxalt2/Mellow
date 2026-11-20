import { Disc3, Check, ExternalLink, Loader2, PanelRightClose, Play, UsersRound, Video, X } from 'lucide-react';
import { Link } from 'react-router';
import { Artwork } from '@/components/music/Artwork';
import { CanvasArtwork } from '@/components/music/CanvasArtwork';
import { FavoriteButton } from '@/components/music/FavoriteButton';
import { TrackMenu } from '@/components/music/TrackMenu';
import { VideoSurface } from '@/components/music/VideoSurface';
import { albumHref, artistHref, formatDuration } from '@/components/music/links';
import { playList } from '@/components/music/play';
import { useCanvas } from '@/data/spotify/canvas';
import { useArtist, useSearch } from '@/data/music/queries';
import { sizedArtwork } from '@/lib/artwork';
import { useArtworkColor } from '@/lib/artworkColor';
import { useLyrics } from '@/lyrics/useLyrics';
import { getAudio, usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { useHasVideo, useVideo } from '@/state/video';
import { useEffect, useState } from 'react';

/**
 * 1:1 Spotify authentic Now Playing rail:
 * - Dynamic tall media card (Spotify Canvas MP4 or high-res artwork)
 * - "Switch to video" button for official YouTube music video stream
 * - Crisp Spotify-style typography (Track title, artist link, album link, favorite & track menu)
 * - Synced lyrics preview card with "Open lyrics" action
 * - Related music videos horizontal carousel
 * - Rich "About the artist" banner card with Verified badge and full bio pop-up dialog
 * - "Next in queue" card with instant playback
 */
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
  const [resolvingVideo, setResolvingVideo] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  const videoActive = useHasVideo(nowPlaying?.videoId);
  const primaryArtist = current?.artists.find((artist) => artist.id) ?? (nowPlaying ? { id: '', name: nowPlaying.artist } : null);
  const nextTrack = queue[index + 1]?.track;
  const accent = color?.accent ?? 'var(--theme-accent)';

  useEffect(() => {
    const audio = getAudio();
    const refresh = () => setPlayhead(audio?.currentTime ?? 0);
    refresh();
    audio?.addEventListener('seeked', refresh);
    const timer = playing ? window.setInterval(refresh, 500) : undefined;
    return () => {
      audio?.removeEventListener('seeked', refresh);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [nowPlaying?.videoId, playing]);

  const handleSwitchToVideo = async () => {
    if (videoActive) {
      try {
        const { stopVideo } = await import('@/playback/youtube/videoDeck');
        stopVideo();
      } catch {}
      useVideo.setState({ videoId: null, surfaces: 0 });
      return;
    }
    if (!nowPlaying) return;
    setResolvingVideo(true);
    try {
      const { findOfficialMusicVideo } = await import('@/playback/youtube/officialVideo');
      const { loadOfficialVideo } = await import('@/playback/youtube/videoDeck');
      const matchedId = await findOfficialMusicVideo(nowPlaying.title, nowPlaying.artist, nowPlaying.durationSec);
      if (matchedId) {
        const ok = await loadOfficialVideo(matchedId);
        if (ok) {
          const { updateAppearancePreferences } = await import('@/lib/appearance');
          updateAppearancePreferences({ playMusicVideos: true });
        }
      }
    } catch (e) {
      console.warn('Failed to resolve video in side panel:', e);
    } finally {
      setResolvingVideo(false);
    }
  };

  const lyricLines = lyrics.data?.lines.filter((line) => line.text.trim()) ?? [];
  const currentLine = lyricLines.findIndex((line) => line.timeMs / 1000 > playhead);
  const activeLine = currentLine < 0 ? Math.max(0, lyricLines.length - 1) : Math.max(0, currentLine - 1);
  const lyricPreview = lyricLines.slice(Math.max(0, activeLine - 1), activeLine + 4);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ '--now-playing-accent': accent } as React.CSSProperties}>
      {/* Spotify Top Header */}
      <header className="flex h-14 flex-none items-center justify-between border-b border-white/[0.07] px-4">
        <div className="min-w-0 flex-1">
          <p className="type-caption text-secondary/80">Now Playing</p>
          <p className="truncate type-callout-emphasized text-white">{queue[index]?.source?.title ?? 'Your music'}</p>
        </div>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-[8px] text-secondary hover:bg-white/[0.08] hover:text-primary active:scale-95 transition-all cursor-pointer"
          aria-label="Close Now Playing"
          onClick={closeSidePanel}
        >
          <PanelRightClose size={17} />
        </button>
      </header>

      {/* Panel Scroll Body */}
      <div className="mellow-panel-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-12">
        {/* 1. Media Artwork / Canvas / Video Card */}
        <div
          className="relative mb-3 aspect-[4/5] w-full overflow-hidden rounded-[10px] bg-black shadow-[0_12px_28px_-16px_rgba(0,0,0,0.5)] isolate"
          style={{
            transform: 'translateZ(0)',
          }}
        >
          {videoActive ? (
            <VideoSurface fit="cover" className="size-full bg-black rounded-[10px]" />
          ) : artwork ? (
            <>
              <img
                src={sizedArtwork(artwork, 720)}
                alt=""
                className="absolute inset-0 size-full rounded-[10px] object-cover"
                referrerPolicy="no-referrer"
                decoding="async"
              />
              {canvas && <CanvasArtwork url={canvas} playing={playing} className="absolute inset-0 size-full rounded-[10px] object-cover" />}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 rounded-b-[10px] bg-gradient-to-t from-black/70 to-transparent" />
            </>
          ) : (
            <div className="grid size-full place-items-center text-secondary">
              <Disc3 size={44} />
            </div>
          )}
          {/* Subtle clean inner highlight */}
          <div className="pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/10" />

          {/* Spotify "Switch to video" Pill Button */}
          {nowPlaying && (
            <div className="absolute bottom-3 left-3 z-10">
              <button
                type="button"
                onClick={handleSwitchToVideo}
                disabled={resolvingVideo}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] backdrop-blur-md text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer ${
                  videoActive
                    ? 'bg-(--theme-accent)/40 text-white border border-(--theme-accent)/60 shadow-[0_0_12px_color-mix(in_srgb,var(--theme-accent)_40%,transparent)]'
                    : 'bg-black/60 hover:bg-black/80 text-white/90 hover:text-white border border-white/20'
                }`}
                aria-label={videoActive ? 'Stop video' : 'Switch to video'}
              >
                {resolvingVideo ? (
                  <Loader2 size={13} className="animate-spin text-white" />
                ) : (
                  <Video size={13} />
                )}
                <span>{resolvingVideo ? 'Finding video…' : videoActive ? 'Switch to audio' : 'Switch to video'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. Track Title, Artist, Actions (Spotify 1:1 Typography) */}
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-bold text-white tracking-tight leading-snug line-clamp-2 hover:underline cursor-pointer">
                {nowPlaying?.title ?? 'Nothing playing'}
              </h2>
              {playing && (
                <span
                  className="inline-block size-2 shrink-0 rounded-full bg-(--theme-accent) shadow-[0_0_8px_var(--theme-accent)] animate-pulse"
                  title="Now playing"
                  aria-label="Playing"
                />
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] text-[#b3b3b3]">
              {current?.artists?.length ? (
                current.artists.map((artist, i) => (
                  <span key={artist.id || artist.name}>
                    {artist.id ? (
                      <Link to={artistHref(artist.id) ?? ''} className="hover:text-white hover:underline transition-colors">
                        {artist.name}
                      </Link>
                    ) : (
                      <span>{artist.name}</span>
                    )}
                    {i < current.artists.length - 1 && ', '}
                  </span>
                ))
              ) : (
                <span>{nowPlaying?.artist ?? 'Choose a song to start listening'}</span>
              )}
            </div>
            {current?.album?.name && (
              <div className="mt-0.5 text-[13px] text-[#777] truncate">
                {current.album.id ? (
                  <Link to={albumHref(current.album.id) ?? ''} className="hover:text-white/80 hover:underline transition-colors">
                    {current.album.name}
                  </Link>
                ) : (
                  <span>{current.album.name}</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-none pt-0.5">
            {nowPlaying?.videoId && (
              <FavoriteButton
                videoId={nowPlaying.videoId}
                track={{ title: nowPlaying.title, artist: nowPlaying.artist }}
                className="grid size-8 place-items-center rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white active:scale-95 transition-all cursor-pointer"
                size={17}
              />
            )}
            {current && (
              <TrackMenu
                track={current}
                className="grid size-8 place-items-center rounded-[8px] bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white active:scale-95 transition-all cursor-pointer"
                placement="below-end"
              />
            )}
          </div>
        </div>

        {/* 3. Spotify Synced Lyrics Preview Card */}
        <section
          className="mt-5 overflow-hidden rounded-[10px] border border-white/[0.08] cursor-pointer transition-all hover:border-white/[0.16] active:scale-[0.99]"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--now-playing-accent) 18%, #14161f)',
          }}
          onClick={() => toggleSidePanel('lyrics')}
          aria-label="Lyrics preview"
        >
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-white tracking-tight">Lyrics preview</h3>
              <button
                type="button"
                className="text-xs font-semibold text-white/80 hover:text-white hover:underline transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSidePanel('lyrics');
                }}
              >
                Open lyrics
              </button>
            </div>
            {lyrics.isPending ? (
              <p className="text-sm text-white/60">Finding synced lyrics…</p>
            ) : lyricPreview.length ? (
              <div className="flex flex-col gap-2.5" aria-live="off">
                {lyricPreview.map((line, offset) => {
                  const at = Math.max(0, activeLine - 1) + offset;
                  const isActive = at === activeLine;
                  return (
                    <p
                      key={`${line.timeMs}-${at}`}
                      className={`line-clamp-2 text-[15px] font-bold leading-relaxed transition-all ${
                        isActive ? 'text-white' : 'text-white/40'
                      }`}
                    >
                      {line.text}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-white/60">Lyrics aren’t available for this track yet.</p>
            )}
          </div>
        </section>

        {/* 4. Related Music Videos Carousel */}
        {nowPlaying && <RelatedVideosSection artist={nowPlaying.artist} title={nowPlaying.title} />}

        {/* 5. Spotify "About the artist" Card with Verified Badge & Pop-up Modal */}
        {primaryArtist?.name && (
          <ArtistContextCard
            artistId={primaryArtist.id ?? ''}
            artistName={primaryArtist.name}
            onOpenModal={() => setAboutModalOpen(true)}
          />
        )}

        {/* 6. Next In Queue */}
        {nextTrack && (
          <section className="mt-6">
            <div className="mb-2.5 flex items-baseline justify-between px-1">
              <h3 className="text-[14px] font-bold text-white tracking-tight">Next in queue</h3>
              <button
                type="button"
                className="text-xs font-semibold text-white/60 hover:text-white hover:underline transition-colors"
                onClick={() => toggleSidePanel('up-next')}
              >
                Open queue
              </button>
            </div>
            <button
              type="button"
              className="group/next grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-left transition-colors hover:bg-white/[0.08] active:scale-[0.99] cursor-pointer"
              onClick={() => usePlayer.getState().next()}
              aria-label={`Play next: ${nextTrack.title}`}
            >
              <div className="relative size-12 flex-none overflow-hidden rounded-[6px]">
                <Artwork src={nextTrack.thumbnail ?? null} displayWidth={48} radius="6px" />
                <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover/next:opacity-100 transition-opacity">
                  <Play size={16} className="fill-white text-white ml-0.5" />
                </div>
              </div>
              <div className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-white">{nextTrack.title}</span>
                <span className="mt-0.5 block truncate text-xs text-white/60">
                  {nextTrack.artists.map((a) => a.name).join(', ')}
                </span>
              </div>
              <span className="text-xs tabular-nums text-white/40">{formatDuration(nextTrack.durationSec)}</span>
            </button>
          </section>
        )}
      </div>

      {/* Full "About the artist" Pop-up Dialog (Matching Screenshot 8) */}
      {aboutModalOpen && primaryArtist?.name && (
        <AboutArtistModal
          artistId={primaryArtist.id ?? ''}
          artistName={primaryArtist.name}
          onClose={() => setAboutModalOpen(false)}
        />
      )}
    </div>
  );
}

/** Related Music Videos horizontal carousel */
function RelatedVideosSection({ artist, title }: { artist: string; title: string }) {
  const query = `${artist} music video`;
  const search = useSearch(query);
  const items = search.data?.videos ?? search.data?.songs ?? [];
  const videos = items.filter((s) => s.durationSec && s.durationSec > 60).slice(0, 8);

  if (!videos.length) return null;

  return (
    <section className="mt-6" aria-label="Related music videos">
      <div className="mb-2.5 flex items-baseline justify-between px-1">
        <h3 className="text-[14px] font-bold text-white tracking-tight">Related music videos</h3>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
        {videos.map((vid, idx) => {
          const trackItem: any = {
            videoId: vid.id,
            title: vid.title,
            artists: vid.artists,
            album: vid.album,
            durationSec: vid.durationSec,
            thumbnail: vid.thumbnail,
            explicit: vid.explicit,
            index: idx,
            plays: null,
          };
          return (
            <div
              key={vid.id}
              className="w-[180px] flex-none group/video cursor-pointer rounded-[8px] overflow-hidden bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] transition-all active:scale-[0.98]"
              onClick={() => playList([trackItem], 0, { source: { title: `Videos by ${artist}`, type: 'other' } })}
            >
              <div className="relative aspect-video w-full overflow-hidden bg-black/60">
                <img
                  src={sizedArtwork(vid.thumbnail ?? '', 400)}
                  alt=""
                  className="size-full object-cover transition-transform duration-300 group-hover/video:scale-[1.04]"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover/video:opacity-100 transition-opacity">
                  <div className="grid size-9 place-items-center rounded-[10px] bg-white text-black shadow-lg">
                    <Play size={16} className="fill-black ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="p-2">
                <p className="line-clamp-1 text-[13px] font-semibold text-white">{vid.title}</p>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-white/60">{vid.artists.map((a) => a.name).join(', ')}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Spotify "About the artist" banner card */
function ArtistContextCard({
  artistId,
  artistName,
  onOpenModal,
}: {
  artistId: string | null;
  artistName: string;
  onOpenModal: () => void;
}) {
  const artist = useArtist(artistId ?? '');
  const heroImage = artist.data?.heroImage;
  const description = artist.data?.description?.trim();
  const audience = artist.data?.audience;

  return (
    <section className="mt-6 overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.035]" aria-label={`About ${artistName}`}>
      {/* Banner with photo */}
      <div
        className="group relative h-40 w-full overflow-hidden cursor-pointer"
        onClick={onOpenModal}
        role="button"
        tabIndex={0}
      >
        {heroImage ? (
          <img
            src={sizedArtwork(heroImage, 720)}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        {/* Top badge */}
        <span className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-black/50 backdrop-blur-md text-xs font-semibold text-white">
          <UsersRound size={13} /> About the artist
        </span>

        {/* Bottom banner details */}
        <div className="absolute inset-x-3.5 bottom-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[17px] font-bold text-white tracking-tight truncate">{artist.data?.name ?? artistName}</span>
              {/* Spotify Verified Badge */}
              <span className="inline-grid size-4 place-items-center rounded-full bg-blue-500 text-white shrink-0 shadow-xs" title="Verified Artist">
                <Check size={11} strokeWidth={3} />
              </span>
            </div>
            {audience && <p className="text-xs text-white/70 mt-0.5">{audience}</p>}
          </div>

          {artistId && (
            <Link
              to={artistHref(artistId) ?? ''}
              onClick={(e) => e.stopPropagation()}
              className="flex-none rounded-[6px] border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md transition-all active:scale-95"
            >
              Open artist
            </Link>
          )}
        </div>
      </div>

      {description && (
        <div className="p-3.5 pt-3">
          <p className="line-clamp-3 text-xs text-secondary leading-relaxed whitespace-pre-line">{description}</p>
        </div>
      )}
    </section>
  );
}

/** Full Pop-up Modal for Artist details (Matching Screenshot 8) */
function AboutArtistModal({
  artistId,
  artistName,
  onClose,
}: {
  artistId: string;
  artistName: string;
  onClose: () => void;
}) {
  const artist = useArtist(artistId);
  const heroImage = artist.data?.heroImage;
  const description = artist.data?.description?.trim();
  const audience = artist.data?.audience;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-6 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-h-[88vh] w-full max-w-[680px] overflow-hidden rounded-[14px] border border-white/[0.12] bg-[#12131a] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 grid size-8 place-items-center rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-all cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Portrait Photo */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
          {heroImage ? (
            <img src={sizedArtwork(heroImage, 1200)} alt="" className="size-full object-cover" />
          ) : (
            <div className="size-full bg-neutral-900 grid place-items-center text-secondary">
              <UsersRound size={64} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#12131a] via-transparent to-black/30" />
        </div>

        {/* Modal Content */}
        <div className="p-6 pt-3 overflow-y-auto max-h-[40vh]">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">{artist.data?.name ?? artistName}</h2>
            <span className="inline-grid size-5 place-items-center rounded-full bg-blue-500 text-white shrink-0" title="Verified">
              <Check size={13} strokeWidth={3} />
            </span>
          </div>

          {audience && (
            <p className="mt-1 text-sm font-semibold text-white/80">{audience}</p>
          )}

          {description && (
            <p className="mt-4 text-sm text-secondary leading-relaxed whitespace-pre-line">{description}</p>
          )}

          {artistId && (
            <div className="mt-6 flex justify-end">
              <Link
                to={artistHref(artistId) ?? ''}
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-[8px] bg-(--theme-accent) px-4 py-2 text-xs font-semibold text-white shadow-md hover:brightness-110 active:scale-95 transition-all"
              >
                <span>View Full Artist Profile</span>
                <ExternalLink size={14} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
