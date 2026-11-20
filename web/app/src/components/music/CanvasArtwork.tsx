import { useEffect, useRef, useState } from 'react';
import { readAppearancePreferences } from '@/lib/appearance';

interface CanvasArtworkProps {
  url: string;
  className?: string;
  playing?: boolean;
  minPosterMs?: number;
}

let masterCanvasElement: HTMLVideoElement | null = null;
export function getMasterCanvasElement(): HTMLVideoElement | null {
  return masterCanvasElement;
}

/**
 * Spotify's looping Canvas MP4 video over the artwork.
 * Preloads silently in the background while the static artwork remains crisp.
 * Only cross-fades into view once the video is fully buffered and actively playing,
 * preventing any lag, black frames, or reload flicker.
 */
export function CanvasArtwork({
  url,
  className = 'absolute inset-0 size-full rounded-[inherit] object-cover',
  playing = true,
  minPosterMs = 0,
}: CanvasArtworkProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [posterElapsed, setPosterElapsed] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      masterCanvasElement = videoRef.current;
    }
    return () => {
      if (masterCanvasElement === videoRef.current) {
        masterCanvasElement = null;
      }
    };
  }, []);

  // When URL changes, reset ready until first frame of new video decodes
  useEffect(() => {
    setReady(false);
    if (minPosterMs > 0) {
      setPosterElapsed(false);
      const timer = setTimeout(() => setPosterElapsed(true), minPosterMs);
      return () => clearTimeout(timer);
    } else {
      setPosterElapsed(true);
    }
  }, [url, minPosterMs]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (playing && !document.hidden) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [playing]);

  // Pause only when window/app is fully hidden (minimized).
  // Never pause on window blur or multi-monitor focus loss so Spotify Canvas plays smoothly.
  useEffect(() => {
    const handleVisibility = () => {
      const el = videoRef.current;
      if (!el) return;
      if (document.hidden) {
        el.pause();
      } else if (playing) {
        void el.play().catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [playing]);

  const isVisible = ready && posterElapsed;

  return (
    <video
      ref={videoRef}
      key={url}
      src={url}
      muted
      loop
      playsInline
      preload="auto"
      style={{
        transform: 'translateZ(0)',
        borderRadius: 'inherit',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
        imageRendering: 'high-quality' as any,
      }}
      className={`${className} transition-opacity duration-700 ease-in-out will-change-[opacity] ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onCanPlay={() => {
        setReady(true);
        if (playing) void videoRef.current?.play().catch(() => undefined);
      }}
      onLoadedData={() => {
        setReady(true);
        if (playing) void videoRef.current?.play().catch(() => undefined);
      }}
    />
  );
}
