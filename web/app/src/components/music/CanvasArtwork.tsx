import { useEffect, useRef, useState } from 'react';
import { readAppearancePreferences } from '@/lib/appearance';

interface CanvasArtworkProps {
  url: string;
  className?: string;
  playing?: boolean;
  minPosterMs?: number;
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
  minPosterMs = 1200,
}: CanvasArtworkProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [posterElapsed, setPosterElapsed] = useState(false);

  // Ensure minimum poster display time so the high-res cover is enjoyed before animation starts
  useEffect(() => {
    setReady(false);
    setPosterElapsed(false);
    const timer = setTimeout(() => setPosterElapsed(true), minPosterMs);
    return () => clearTimeout(timer);
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

  // Pause during system minimization or blur to conserve CPU/RAM
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
    const handleBlur = () => {
      if (readAppearancePreferences().smartMemorySaving && videoRef.current) {
        videoRef.current.pause();
      }
    };
    const handleFocus = () => {
      if (videoRef.current && playing && !document.hidden) {
        void videoRef.current.play().catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
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
