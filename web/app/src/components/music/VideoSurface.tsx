import { useLayoutEffect, useRef } from 'react';
import { useMusicVideosEnabled } from '@/lib/appearance';
import { claimVideoSurface, type VideoFit } from '@/state/video';

/**
 * Where the playing music video shows (state/video.ts). While mounted it
 * holds the one <video> element, unless a surface mounted after it took it;
 * it also tells the player the picture is wanted: with no surface mounted, a
 * music video's picture isn't streamed at all.
 */
export function VideoSurface({ fit = 'cover', className, priority = 0 }: { fit?: VideoFit; className?: string; priority?: number }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    return claimVideoSurface(node, fit, priority);
  }, [fit, priority]);
  return <div ref={host} className={`pointer-events-none ${className ?? ''}`} aria-hidden="true" />;
}
