import { useEffect, useRef, useState } from 'react';
import { MeshBackdrop } from './MeshBackdrop';
import { getVideoElement } from '@/state/video';
import { getMasterCanvasElement } from '@/components/music/CanvasArtwork';

interface AmbientBackdropProps {
  artworkUrl?: string | null;
  canvasUrl?: string | null;
  canvasDisabled?: boolean;
  videoActive?: boolean;
  playing?: boolean;
}

/**
 * Dedicated real-time video frame mirror.
 * Copies the currently playing YouTube music video frames onto a canvas at 30fps
 * and blurs it across the screen, ensuring 100% color and motion sync with the video on the card.
 */
function VideoBackdrop({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) return;

    let lastDraw = 0;
    const FPS_INTERVAL = 1000 / 30; // 30 FPS is plenty for blurred ambient glow

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      if (!playing) return;
      if (now - lastDraw < FPS_INTERVAL) return;
      lastDraw = now;

      try {
        const video = getVideoElement();
        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !video.paused) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      } catch {}
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [playing]);

  return (
    <canvas
      ref={canvasRef}
      width={96}
      height={54}
      style={{ transform: 'scale(var(--fullscreen-ambient-spread, 1.7))' }}
      className="pointer-events-none absolute inset-0 size-full object-cover blur-[60px] saturate-[200%] brightness-110 opacity-80 transition-opacity duration-700 will-change-transform"
    />
  );
}

/**
 * Real-time Spotify Canvas ambient backdrop.
 * Mirrors the active playing Canvas video onto a low-cost canvas without allocating
 * a second video decoder or streaming twice, ensuring 100% frame sync and zero lag.
 */
function CanvasBackdrop({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) return;

    let lastDraw = 0;
    const FPS_INTERVAL = 1000 / 30;

    const render = (now: number) => {
      animId = requestAnimationFrame(render);
      if (!playing) return;
      if (now - lastDraw < FPS_INTERVAL) return;
      lastDraw = now;

      try {
        const master = getMasterCanvasElement();
        if (master && master.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !master.paused) {
          ctx.drawImage(master, 0, 0, canvas.width, canvas.height);
        }
      } catch {}
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [playing]);

  return (
    <div className="pointer-events-none absolute inset-0 size-full overflow-hidden">
      <canvas
        ref={canvasRef}
        width={96}
        height={96}
        style={{ transform: 'scale(var(--fullscreen-ambient-spread, 1.7))' }}
        className="pointer-events-none absolute inset-0 size-full object-cover blur-[55px] saturate-[195%] brightness-110 opacity-85 transition-opacity duration-700 will-change-transform"
      />
      <div className="absolute inset-0 bg-black/15 pointer-events-none" />
    </div>
  );
}

/**
 * Unified ambient background for FullScreenPlayer.
 * Guarantees that the ambient background ALWAYS matches whatever is playing on the card:
 * 1. If Official Video is playing -> VideoBackdrop (real-time 30fps blurred frame mirror)
 * 2. If Canvas is playing -> CanvasBackdrop (blurred looping canvas video)
 * 3. Static album art -> MeshBackdrop (Apple Music fluid mesh palette)
 * Underneath all of them, MeshBackdrop acts as a vibrant foundation to prevent black flashes.
 */
export function AmbientBackdrop({
  artworkUrl,
  canvasUrl,
  canvasDisabled,
  videoActive,
  playing = true,
}: AmbientBackdropProps) {
  const hasCanvas = !canvasDisabled && !!canvasUrl;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden isolate" aria-hidden="true">
      {/* Dynamic colorful foundation based on cover art palette */}
      <MeshBackdrop artworkUrl={artworkUrl ?? null} playing={playing} />

      {/* When Official Music Video is active, mirror its frames in real time */}
      {videoActive && <VideoBackdrop playing={playing} />}

      {/* When Spotify Canvas is active and video is not playing, mirror the Canvas video */}
      {!videoActive && hasCanvas && <CanvasBackdrop playing={playing} />}

      {/* Subtle vignette overlay so lyrics and transport controls stay readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35 pointer-events-none" />
    </div>
  );
}
