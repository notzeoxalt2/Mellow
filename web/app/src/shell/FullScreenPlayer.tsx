import { Check, Download, Loader2, Maximize, Minimize, Sparkles, SunMedium, Video, VideoOff, X } from 'lucide-react';
import type { Track } from '@/data/music/types';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import { useDownloads } from '@/lib/download';
import {
  BackwardIcon,
  ForwardIcon,
  LyricsActiveIcon,
  LyricsIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  UpNextIcon,
} from '@/components/icons/Transport';
import { ExplicitBadge } from '@/components/music/ExplicitBadge';
import { FavoriteButton } from '@/components/music/FavoriteButton';
import { TrackMenu } from '@/components/music/TrackMenu';
import { albumHref } from '@/components/music/links';
import { CanvasArtwork } from '@/components/music/CanvasArtwork';
import { MotionArtwork } from '@/components/music/MotionArtwork';
import { VideoSurface } from '@/components/music/VideoSurface';
import { useTrackMotion } from '@/data/apple/motionArt';
import { useCanvas } from '@/data/spotify/canvas';
import { sizedArtwork } from '@/lib/artwork';
import { readAppearancePreferences, updateAppearancePreferences, useFullScreenPlayerAmbient, useLowResourceMode, useMusicVideosEnabled } from '@/lib/appearance';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { useHasVideo, useVideo } from '@/state/video';
import { Credits, PageLink, pageLink } from './Lcd';
import { LyricsPanel } from './LyricsPanel';
import { albumPageFor } from './nowPlayingLinks';
import { UpNext } from './UpNext';
import { MixWindowHighlight, NerdStats } from './NerdStats';
import { useScrubber } from './useScrubber';
import { VideoQuality } from './VideoQuality';
import { fadeForVolume, VolumeControl } from './VolumeControl';
import { AmbientBackdrop } from './AmbientBackdrop';

function useBrowserFullScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('fullscreenchange', onChange);
      return () => document.removeEventListener('fullscreenchange', onChange);
    },
    () => document.fullscreenElement !== null,
  );
}

/** The seek line under the track's names: thicker on hover, with the times beneath its ends. */
function Scrubber() {
  const { bar, elapsed, remaining, mixLabel, dragging, handlers } = useScrubber();
  return (
    <div className="group/scrub mt-3.5" data-dragging={dragging || undefined}>
      {/* A taller hit area than the line it carries. */}
      <div className="group/hit flex h-4 cursor-pointer touch-none items-center" {...handlers}>
        <div
          className="relative h-1 flex-1 overflow-hidden rounded-[999px] bg-quaternary transition-[height] duration-120 ease-in group-hover/hit:h-2 group-data-dragging/scrub:h-2"
          aria-hidden="true"
        >
          <MixWindowHighlight />
          <div
            ref={bar}
            className="relative size-full origin-left scale-x-(--progress) bg-secondary transition-[background-color] duration-120 ease-in [--progress:0] group-hover/hit:bg-primary group-data-dragging/scrub:bg-primary"
          />
        </div>
      </div>
      <div className="relative mt-0.5 flex justify-between type-[500_11px/14px] tabular-nums text-tertiary">
        <span ref={elapsed} />
        <span ref={mixLabel} className="pointer-events-none absolute inset-x-0 text-center text-secondary opacity-0" aria-hidden="true">
          Mixing
        </span>
        <span ref={remaining} />
      </div>
    </div>
  );
}

const transportButton =
  'grid place-items-center rounded-[10px] transition-[background-color,scale] duration-100 ease-in enabled:hover:bg-quinary enabled:active:scale-90 disabled:opacity-40';
// Shuffle and repeat, when on: full white on the mesh, where red would clash.
const toggle = `${transportButton} size-9 text-tertiary aria-pressed:text-primary`;
const skip = `${transportButton} size-12 text-primary`;

/** Shuffle, previous, play/pause, next, repeat. No volume: the pill keeps that. */
function Transport() {
  const hasTrack = usePlayer((s) => s.nowPlaying !== null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat !== 'off' || (s.autoplay && s.index >= 0));
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayer.getState();

  return (
    <div className="mx-auto mt-[clamp(8px,1.6vh,16px)] mb-0 flex h-13 w-[min(100%,315px)] items-center justify-between">
      <button className={toggle} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
        <ShuffleIcon size={30} />
      </button>
      <button className={skip} disabled={!hasTrack} aria-label="Previous" onClick={previous}>
        <BackwardIcon size={40} />
      </button>
      <button className={`${transportButton} size-14 text-primary`} disabled={!hasTrack} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
        {playing ? <PauseIcon size={48} /> : <PlayIcon size={48} />}
      </button>
      <button className={skip} disabled={!hasTrack || !hasNext} aria-label="Next" onClick={next}>
        <ForwardIcon size={40} />
      </button>
      <button
        className={toggle}
        aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat'}
        aria-pressed={repeat !== 'off'}
        onClick={cycleRepeat}
      >
        {repeat === 'one' ? <RepeatOneIcon size={30} /> : <RepeatIcon size={30} />}
      </button>
    </div>
  );
}

// Close, browser full screen, the column toggles and the speaker, in the corners.
const iconButton =
  'flex size-8 items-center justify-center bg-transparent border-0 text-white/70 transition-all duration-150 ease-out hover:text-white active:scale-90 cursor-pointer';
const chromeButton = iconButton;
const chrome = `pointer-events-auto absolute z-20 ${chromeButton}`;
const artworkLayer = 'absolute inset-0 size-full rounded-[inherit] object-cover opacity-0 transition-opacity duration-300 ease-in';

/** How long the pointer can rest before a playing music video hides its controls. */
const IDLE_MS = 3000;

/**
 * The full-screen player (report §7): the artwork on the left with the
 * track's names, the seek line and the transport under it; the lyrics, the
 * same am-lyrics panel as the side panel's, on the right; all over a mesh
 * gradient of the artwork's colours. With the lyrics closed, the artwork
 * column sits in the middle on its own, as Apple's does.
 *
 * A music video plays as Apple's do: on its own, it fills the window with
 * the names and transport over its foot, fading out while the pointer rests;
 * beside the lyrics or Up Next, it takes the artwork's place at 16:9.
 */
export function FullScreenPlayer() {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  // The queue's row for what's playing: it carries the album and each artist's channel.
  const track = usePlayer((s) => {
    const entry = s.queue[s.index]?.track;
    return entry && entry.videoId === s.nowPlaying?.videoId ? entry : null;
  });
  // Apple's animated sleeve over the cover, as the phone's now-playing shows it.
  const motion = useTrackMotion(nowPlaying?.title, nowPlaying?.artist, track?.album?.name);
  const canvas = useCanvas();
  const { pathname } = useLocation();
  const openedAt = useRef(pathname);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const setFullScreen = useUi((s) => s.setFullScreen);
  const video = useHasVideo(nowPlaying?.videoId);
  const videoPreviewEnabled = useMusicVideosEnabled();
  const lowResourceMode = useLowResourceMode();
  const fullScreenPlayerAmbient = useFullScreenPlayerAmbient();
  const isDownloaded = useDownloads((s) => (nowPlaying?.videoId ? s.isDownloaded(nowPlaying.videoId) : false));
  const downloadProgress = useDownloads((s) => (nowPlaying?.videoId ? s.getProgress(nowPlaying.videoId) : null));
  const downloadTrack = useDownloads((s) => s.downloadTrack);
  const openDownloadsFolder = useDownloads((s) => s.openDownloadsFolder);
  // The right-hand column: the lyrics, Up Next, or nothing. Lyrics toggle bottom left, Up Next bottom right.
  // A music video opens on its own, without the lyrics.
  const [panel, setPanel] = useState<'lyrics' | 'queue' | null>(() =>
    nowPlaying && videoPreviewEnabled && !lowResourceMode && useVideo.getState().videoId === nowPlaying.videoId ? null : 'lyrics',
  );
  // Once the listener picks a column, a video arriving late doesn't take it away.
  const picked = useRef(false);
  const [idle, setIdle] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [canvasDisabled, setCanvasDisabled] = useState(() => {
    try {
      return localStorage.getItem('mellow:canvas_disabled') === 'true';
    } catch {
      return false;
    }
  });
  const toggleCanvasMode = () => {
    setCanvasDisabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mellow:canvas_disabled', String(next));
      } catch {}
      return next;
    });
  };
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browserFullScreen = useBrowserFullScreen();
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;
  const [isDesktopMaximized, setIsDesktopMaximized] = useState(false);
  useEffect(() => {
    if (isDesktop && window.electronAPI?.isMaximized) {
      void window.electronAPI.isMaximized().then(setIsDesktopMaximized);
      return window.electronAPI.onMaximizeChange?.(setIsDesktopMaximized);
    }
  }, [isDesktop]);
  const [resolvingVideo, setResolvingVideo] = useState(false);
  const [videoStatusNotice, setVideoStatusNotice] = useState<string | null>(null);

  const handleToggleOrFindVideo = async () => {
    if (video) {
      // User clicked official video button again: STOP the video and revert to normal player instantly
      try {
        const { stopVideo } = await import('@/playback/youtube/videoDeck');
        stopVideo();
      } catch {}
      useVideo.setState({ videoId: null, surfaces: 0 });
      setPanel('lyrics');
      return;
    }
    if (!nowPlaying) return;
    setResolvingVideo(true);
    setVideoStatusNotice(null);
    try {
      const { findOfficialMusicVideo } = await import('@/playback/youtube/officialVideo');
      const { loadOfficialVideo } = await import('@/playback/youtube/videoDeck');
      const matchedId = await findOfficialMusicVideo(nowPlaying.title, nowPlaying.artist, nowPlaying.durationSec);
      if (matchedId) {
        const ok = await loadOfficialVideo(matchedId);
        if (ok) {
          updateAppearancePreferences({ playMusicVideos: true });
          setPanel(null);
        } else {
          setVideoStatusNotice('Video playback error');
          setTimeout(() => setVideoStatusNotice(null), 3000);
        }
      } else {
        setVideoStatusNotice('No official music video found');
        setTimeout(() => setVideoStatusNotice(null), 3000);
      }
    } catch (e) {
      console.warn('Failed to resolve official video:', e);
      setVideoStatusNotice('Video unavailable');
      setTimeout(() => setVideoStatusNotice(null), 3000);
    } finally {
      setResolvingVideo(false);
    }
  };

  const close = useRef<HTMLButtonElement>(null);
  // Whether this player put the page in the browser's full screen, so closing it leaves it again.
  const enteredBrowserFullScreen = useRef(false);

  // The column follows the toggle alone: whether this track has lyrics, and
  // from which provider, is the panel's own business to say.
  const showLyrics = panel === 'lyrics';
  const showQueue = panel === 'queue';
  const togglePanel = (p: 'lyrics' | 'queue') => {
    picked.current = true;
    setPanel((on) => (on === p ? null : p));
  };

  useEffect(() => {
    if (video && !picked.current) setPanel(null);
  }, [video]);

  const wake = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => {
      if (enteredBrowserFullScreen.current && document.fullscreenElement) void document.exitFullscreen();
      opener?.focus({ preventScroll: true });
    };
  }, []);

  // A title, artist or album link went somewhere: get out of the way so the page shows.
  useEffect(() => {
    if (pathname !== openedAt.current) setFullScreen(false);
  }, [pathname, setFullScreen]);

  // Nothing left to show once the queue ends.
  useEffect(() => {
    if (!nowPlaying) setFullScreen(false);
  }, [nowPlaying, setFullScreen]);

  const toggleBrowserFullScreen = () => {
    if (isDesktop) {
      window.electronAPI?.maximize?.();
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      // The whole page, not this overlay: menus and dialogs portal to <body> and must stay visible.
      void document.documentElement.requestFullscreen().then(
        () => (enteredBrowserFullScreen.current = true),
        () => undefined,
      );
    }
  };

  if (!nowPlaying) return null;
  const { videoId, title, artist } = nowPlaying;
  const album = track?.album ?? null;
  // With a right-hand column; on narrow windows that column fills the screen and the controls sit under it, without the artwork.
  const column = showLyrics || showQueue;
  // A music video on its own fills the window.
  const theater = video && !column;
  // ...and hides the controls and the pointer while it plays undisturbed.
  // Keep the top controls clickable while fading: their pointer movement wakes
  // the overlay, and an invisible hit target must never block the close button.
  const hidden = theater && playing && idle ? ' pointer-events-none opacity-0' : '';
const corner = `${chrome} transition-[background-color,color,opacity] duration-300${hidden}`;
// The close affordance stays visible and hit-testable while theater controls
// fade. Otherwise a playing video can leave the listener unable to dismiss it.
const closeCorner = `pointer-events-auto absolute z-30 ${chromeButton} size-10 top-3 left-4`;

  return (
    <div
      // Over everything but menus and dialogs, which portal above it. The on-dark colours come from tokens.css (data-full-screen).
      // --art, the artwork's side: Apple's 461px at 1440px wide, and never taller than the screen leaves room for.
      className={`fixed inset-0 z-[calc(var(--z-contextual-menus)-2)] isolate animate-enter overflow-hidden ${
        theater ? 'bg-black' : 'bg-[#0c0d12]'
      } text-primary [--art:min(32vw,calc(100dvh-330px),720px)] motion-reduce:[animation-name:fade-in] max-md:[--art:min(84vw,calc(100dvh-330px),420px)]`}
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
      data-full-screen
      data-paused={!playing || undefined}
      onPointerMove={wake}
      onPointerDown={wake}
      onKeyDown={wake}
      style={theater && playing && idle ? { cursor: 'none' } : undefined}
    >
      {fullScreenPlayerAmbient && (
        <AmbientBackdrop
          artworkUrl={nowPlaying.artworkUrl}
          canvasUrl={canvas}
          canvasDisabled={canvasDisabled}
          videoActive={video}
          playing={playing}
        />
      )}
      {theater && (
        <div className="pointer-events-none absolute inset-0 z-10 animate-fade-in">
          <VideoSurface fit="contain" className="size-full" priority={10} />
        </div>
      )}
      {resolvingVideo && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-sm animate-fade-in">
          <Loader2 size={32} className="animate-spin text-(--theme-accent)" />
          <p className="type-callout-emphasized text-white/90">Loading official music video…</p>
        </div>
      )}

      <button ref={close} className={closeCorner} aria-label="Close" title="Close player" onClick={(event) => { event.stopPropagation(); setFullScreen(false); }}>
        <X size={20} />
      </button>
      {/* Top right clean icon controls (frameless bare icons, matching bottom right clean icons) */}
      <div className="pointer-events-auto absolute top-4 right-5 z-30 flex items-center gap-1.5">
        {/* Button 0: Offline Download */}
        <button
          type="button"
          className={`${chromeButton} cursor-pointer active:scale-95 ${
            isDownloaded
              ? 'text-green-400 hover:text-green-300'
              : downloadProgress?.status === 'downloading' || downloadProgress?.status === 'resolving'
              ? 'text-(--theme-accent)'
              : ''
          }`}
          onClick={() => {
            if (isDownloaded) {
              openDownloadsFolder();
            } else if (nowPlaying) {
              void downloadTrack(nowPlaying as any);
            }
          }}
          title={
            isDownloaded
              ? 'Downloaded to Music/Mellow (Click to Open Folder)'
              : downloadProgress?.status === 'downloading'
              ? `Downloading (${downloadProgress.percent}%)`
              : downloadProgress?.status === 'resolving'
              ? 'Preparing download…'
              : 'Download Song for Offline Listening'
          }
          aria-label="Download Song"
        >
          {downloadProgress?.status === 'downloading' || downloadProgress?.status === 'resolving' ? (
            <Loader2 size={18} className="animate-spin text-(--theme-accent)" />
          ) : isDownloaded ? (
            <Check size={18} className="text-green-400" />
          ) : (
            <Download size={18} />
          )}
        </button>

        {/* Button 1: Official Music Video (Click to watch, click again while active to stop) */}
        <button
          type="button"
          className={`${chromeButton} cursor-pointer active:scale-95 ${
            video ? 'text-(--theme-accent)' : ''
          }`}
          onClick={handleToggleOrFindVideo}
          title={video ? 'Stop Official Video' : 'Watch Official Music Video'}
          aria-label={video ? 'Stop Official Video' : 'Watch Official Music Video'}
        >
          {resolvingVideo ? (
            <Loader2 size={18} className="animate-spin text-white" />
          ) : (
            <Video size={18} />
          )}
        </button>

        {/* Button 2: Spotify Canvas visual toggle */}
        <button
          type="button"
          className={`${chromeButton} cursor-pointer active:scale-95 ${
            !canvasDisabled && canvas ? 'text-(--theme-accent)' : ''
          }`}
          onClick={toggleCanvasMode}
          title={canvasDisabled ? 'Enable Spotify Canvas' : 'Disable Spotify Canvas'}
          aria-label={canvasDisabled ? 'Enable Spotify Canvas' : 'Disable Spotify Canvas'}
        >
          <Sparkles size={18} />
        </button>

        {/* Button 3: Ambient Mode (Apple Music radiant mesh vs Clean Dark) + Spread Slider */}
        <div className="relative flex flex-col items-center group">
          <button
            type="button"
            className={`${chromeButton} cursor-pointer active:scale-95 ${
              fullScreenPlayerAmbient ? 'text-(--theme-accent)' : ''
            }`}
            onClick={() => {
              updateAppearancePreferences({ fullScreenPlayerAmbient: !fullScreenPlayerAmbient });
            }}
            title={fullScreenPlayerAmbient ? 'Ambient Active (Hover to adjust spread)' : 'Switch to Radiant Ambient Mode'}
            aria-label="Ambient Glow"
          >
            <SunMedium size={18} />
          </button>
          {fullScreenPlayerAmbient && (
            <div className="absolute top-10 right-0 flex flex-col items-center gap-1.5 rounded-[8px] bg-[#121319]/95 backdrop-blur-xl border border-white/10 p-2.5 shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 w-40">
              <span className="text-[11px] font-medium text-white/80">Ambient Spread</span>
              <input
                type="range"
                min="40"
                max="180"
                step="5"
                defaultValue={readAppearancePreferences().ambientSpread}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateAppearancePreferences({ ambientSpread: val });
                }}
                className="h-1.5 w-full appearance-none rounded-full bg-white/20 accent-(--theme-accent) cursor-pointer"
              />
            </div>
          )}
        </div>

        {video && <VideoQuality />}
        {(document.fullscreenEnabled || isDesktop) && (
          <button
            className={`${chromeButton} cursor-pointer active:scale-95`}
            aria-label={isDesktop ? (isDesktopMaximized ? 'Restore window' : 'Maximize window') : (browserFullScreen ? 'Exit full screen' : 'Enter full screen')}
            title={isDesktop ? (isDesktopMaximized ? 'Restore' : 'Maximize') : (browserFullScreen ? 'Exit full screen' : 'Enter full screen')}
            onClick={toggleBrowserFullScreen}
          >
            {(isDesktop ? isDesktopMaximized : browserFullScreen) ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        )}
      </div>

      {videoStatusNotice && (
        <div className="pointer-events-none absolute top-16 right-5 z-30 px-3 py-1.5 rounded-[8px] bg-black/80 text-white/90 text-xs backdrop-blur-md border border-white/10 animate-fade-in shadow-lg">
          {videoStatusNotice}
        </div>
      )}

      {/* Apple's grid areas "controls lyrics": the artwork column, then the lyrics. */}
      <div
        className={
          theater
            ? `absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-black/85 via-black/40 to-transparent px-6 pt-24 pb-14 transition-opacity duration-300${hidden}`
            : `relative z-1 grid h-full items-center justify-center gap-x-[clamp(48px,7vw,144px)] px-[clamp(24px,9vw,144px)] py-16 max-md:px-6 max-md:pb-18 ${
                column
                  ? 'grid-cols-[var(--art)_minmax(0,38vw)] max-md:grid-cols-[minmax(0,1fr)] max-md:grid-rows-[minmax(0,1fr)_auto] max-md:items-stretch max-md:gap-y-4'
                  : 'grid-cols-[var(--art)]'
              }`
        }
        data-lyrics={column || undefined}
      >
        <section
          className={
            theater ? 'flex w-[min(720px,100%)] min-w-0 flex-col' : `flex w-(--art) min-w-0 flex-col${column ? ' max-md:order-2 max-md:w-full' : ''}`
          }
          aria-label="Player"
        >
          {/* Shrinks a touch while paused, as Apple's does. Beside a column, a music video plays here at 16:9. */}
          <div
            className={`relative w-(--art) transition-[scale] duration-450 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none will-change-transform${
              video ? ' aspect-video' : ' aspect-square'
            }${playing ? '' : ' scale-92'}${column ? ' max-md:hidden' : ''}${theater ? ' hidden' : ''}`}
            style={playing ? { transform: 'scale(var(--music-beat-card-scale, 1))' } : undefined}
          >
            {/* Radiosity glow behind the card: shown only for static cover art, completely hidden when animated canvas or video is active */}
            {!video && (canvasDisabled || !canvas) && !motion && nowPlaying.artworkUrl && (
              <div
                className="pointer-events-none absolute inset-0 -z-1 translate-y-2 will-change-transform"
                style={{
                  transform: 'scale(var(--music-beat-scale, 1))',
                  opacity: 'var(--music-beat-opacity, 1)',
                }}
              >
                <img
                  key={`glow-${nowPlaying.artworkUrl}`}
                  className="absolute inset-0 size-full scale-96 rounded-[10px] object-cover blur-[20px] saturate-200 opacity-[var(--fullscreen-artwork-glow-opacity,0.58)]"
                  src={sizedArtwork(nowPlaying.artworkUrl, 60)}
                  alt=""
                  referrerPolicy="no-referrer"
                  decoding="async"
                />
              </div>
            )}

            {/* The clipped card containing album cover art and looping canvas */}
            <div
              className={`relative size-full rounded-[10px] overflow-hidden isolate ${
                video ? 'bg-black' : (canvasDisabled || !canvas) && !motion ? 'shadow-[0_8px_24px_rgba(0,0,0,0.35)]' : ''
              }`}
              style={{
                transform: 'translateZ(0)',
              }}
            >
              {nowPlaying.artworkUrl && (
                <img
                  key={nowPlaying.artworkUrl}
                  className="absolute inset-0 size-full rounded-[10px] object-cover"
                  src={sizedArtwork(nowPlaying.artworkUrl, 600)}
                  alt=""
                  referrerPolicy="no-referrer"
                  decoding="async"
                />
              )}
              {/* Apple's motion artwork or Spotify's looping Canvas MP4 video - smoothly dissolves in over the cover once fully buffered */}
              {motion ? (
                <MotionArtwork
                  key={motion.url}
                  motion={motion}
                  className="absolute inset-0 size-full rounded-[10px] object-cover opacity-0 transition-opacity duration-1000 ease-in data-ready:opacity-100"
                  playing={playing}
                />
              ) : !canvasDisabled && canvas ? (
                <CanvasArtwork
                  key={canvas}
                  url={canvas}
                  playing={playing}
                  minPosterMs={1200}
                  className="absolute inset-0 size-full rounded-[10px] object-cover"
                />
              ) : null}
              {video && !theater && <VideoSurface className="absolute inset-0 overflow-hidden rounded-[10px] bg-black" priority={10} />}
            </div>
          </div>

          <div className={`flex items-center gap-3${theater ? '' : ' mt-[clamp(20px,3.2vh,32px)]'}${column ? ' max-md:mt-0' : ''}`}>
            {/* As the mini player's: the title opens the album, each credited name its artist. */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center">
                <PageLink
                  className={`min-w-0 max-w-full self-start truncate type-[600_17px/22px] ${pageLink}`}
                  href={albumHref(album?.id ?? null)}
                  resolve={() => albumPageFor(videoId, album, [title, artist].filter(Boolean).join(' '))}
                >
                  {title}
                </PageLink>
                {track?.explicit && <ExplicitBadge size={14} />}
              </div>
              <span className="truncate type-title-3 text-secondary">
                {artist && <Credits videoId={videoId} line={artist} artists={track?.artists ?? []} className={pageLink} />}
                {artist && album?.name && ' — '}
                {album?.name && (
                  <PageLink
                    className={pageLink}
                    href={albumHref(album.id ?? null)}
                    resolve={() => albumPageFor(videoId, album, [title, artist].filter(Boolean).join(' '))}
                  >
                    {album.name}
                  </PageLink>
                )}
              </span>
              <NerdStats />
            </div>
            <FavoriteButton
              videoId={nowPlaying.videoId}
              track={{ title: nowPlaying.title, artist: nowPlaying.artist }}
              className="grid size-8 flex-none place-items-center rounded-[8px] bg-quinary text-primary hover:bg-quaternary cursor-pointer"
              size={18}
            />
            {(() => {
              const effectiveTrack = track ?? (nowPlaying ? {
                videoId: nowPlaying.videoId,
                title: nowPlaying.title,
                artist: nowPlaying.artist,
                artworkUrl: nowPlaying.artworkUrl,
                durationSec: nowPlaying.durationSec ?? 0,
                album: null,
                artists: [],
              } as unknown as Track : null);
              return effectiveTrack ? (
                <TrackMenu
                  track={effectiveTrack}
                  className="grid size-8 flex-none place-items-center rounded-[8px] bg-quinary text-primary hover:bg-quaternary cursor-pointer"
                  placement="above-end"
                />
              ) : null;
            })()}
          </div>

          <Scrubber />
          <Transport />
        </section>

        {showLyrics && (
          <section className="flex min-h-0 animate-fade-in self-stretch" aria-label="Lyrics">
            <LyricsPanel variant="full" />
          </section>
        )}
        {showQueue && (
          // Up Next in the right-hand column: the side panel's list, laid out as a column.
          <section
            className="flex min-h-0 animate-fade-in flex-col self-stretch [mask-image:linear-gradient(180deg,#000_calc(100%-80px),transparent)]"
            aria-label="Up Next"
          >
            <UpNext />
          </section>
        )}
      </div>

      <button
        className={`${corner} bottom-5 left-5 z-30 pointer-events-auto cursor-pointer aria-pressed:text-primary`}
        aria-label="Lyrics"
        aria-pressed={showLyrics}
        onPointerEnter={wake}
        onClick={() => togglePanel('lyrics')}
      >
        {showLyrics ? <LyricsActiveIcon size={18} /> : <LyricsIcon size={18} />}
      </button>
      {/* Up Next, with the speaker beside it: the level slides in over Up Next, as it does in the pill. */}
      <div
        className={`group/actions absolute right-5 bottom-5 z-30 pointer-events-auto flex items-center [--volume-gap:36px] transition-opacity duration-300${hidden}`}
        data-volume-open={volumeOpen || undefined}
        onPointerEnter={wake}
        onPointerLeave={(e) => {
          // The slider is positioned to the left of this compact action row.
          // Keep it open when the pointer crosses from the speaker into it.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setVolumeOpen(false);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setVolumeOpen(false);
        }}
      >
        <button
          className={`${chromeButton} ${fadeForVolume} cursor-pointer aria-pressed:text-primary`}
          aria-label="Up Next"
          aria-pressed={showQueue}
          onClick={() => togglePanel('queue')}
        >
          <UpNextIcon size={18} />
        </button>
        <VolumeControl open={volumeOpen} onOpen={() => setVolumeOpen(true)} className={`${chromeButton} cursor-pointer`} iconSize={18} />
      </div>
    </div>
  );
}
