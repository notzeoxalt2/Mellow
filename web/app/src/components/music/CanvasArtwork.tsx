import { useEffect, useRef, useState } from 'react';

/**
 * Spotify's looping Canvas MP4 video over the artwork.
 * Muted, looping, seamlessly fades in over the cover once ready.
 */
export function CanvasArtwork({
  url,
  className = 'absolute inset-0 size-full rounded-[inherit] object-cover opacity-0 transition-opacity duration-600 ease-in data-ready:opacity-100',
  playing = true,
}: {
  url: string;
  className?: string;
  playing?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [url]);

  useEffect(() => {
    const el = video.current;
    if (!el || !ready) return;
    if (playing) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [playing, ready]);

  return (
    <video
      ref={video}
      key={url}
      className={className}
      data-ready={ready || undefined}
      src={url}
      muted
      loop
      playsInline
      preload={playing ? 'auto' : 'none'}
      onCanPlay={() => setReady(true)}
    />
  );
}
