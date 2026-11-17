import { StarFilledIcon, StarIcon } from '@/components/icons/Transport';
import { useLikeStatus, useSetLiked, useSignedIn } from '@/data/music/queries';
import { usePlayer } from '@/state/player';

interface FavoriteButtonProps {
  videoId: string | null;
  track?: { title: string; artist: string; durationSec?: number };
  className?: string;
  size?: number;
}

/**
 * Apple's Favorite star, backed by YouTube Music's like (a liked song joins
 * Liked Music). Only shown signed in; also syncs to Spotify Liked Songs.
 */
export function FavoriteButton({ videoId, track, className, size = 18 }: FavoriteButtonProps) {
  const signedIn = useSignedIn();
  const status = useLikeStatus(videoId);
  const setLiked = useSetLiked();
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  if (!signedIn || !videoId) return null;
  const liked = status.data === 'LIKE';
  const effectiveTrack =
    track ?? (nowPlaying?.videoId === videoId ? { title: nowPlaying.title, artist: nowPlaying.artist } : undefined);
  return (
    <button
      className={className}
      aria-label={liked ? 'Unfavorite' : 'Favorite'}
      aria-pressed={liked}
      disabled={status.isPending}
      onClick={(event) => {
        event.stopPropagation();
        setLiked.mutate({ videoId, liked: !liked, track: effectiveTrack });
      }}
    >
      {liked ? <StarFilledIcon size={size} /> : <StarIcon size={size} />}
    </button>
  );
}
