import { useLayoutEffect, useRef } from 'react';
import { useMusicVideosEnabled } from '@/lib/appearance';
import { claimVideoSurface, type VideoFit } from '@/state/video';

/**
 * Where the playing music video shows (state/video.ts). While mounted it
 * holds the one <video> element, unless a surface mounted after it took it;
 * it also tells the player the picture is wanted: with no surface mounted, a
 * music video's picture isn't streamed at all.
 */
export function VideoSurface({ fit = 'cover', className }: { fit?: VideoFit; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const enabled = useMusicVideosEnabled();
  useLayoutEffect(() => {
    const node = host.current;
    if (!enabled || !node) return;
    return claimVideoSurface(node, fit);
  }, [fit, enabled]);
  if (!enabled) return null;
  return <div ref={host} className={`pointer-events-none ${className ?? ''}`} aria-hidden="true" />;
}
