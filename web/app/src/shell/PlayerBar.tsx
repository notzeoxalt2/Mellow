import { useEffect, useState } from 'react';
import { useArtworkColor } from '@/lib/artworkColor';
import { readAppearancePreferences } from '@/lib/appearance';
import { PanelRight } from 'lucide-react';
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
import { FavoriteButton } from '@/components/music/FavoriteButton';
import { TrackMenu } from '@/components/music/TrackMenu';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { Lcd } from './Lcd';
import { fadeForVolume, VolumeControl } from './VolumeControl';

const control = 'grid place-items-center rounded-[6px] disabled:opacity-40';
// Shuffle and repeat: secondary, and the theme accent colour when on
const toggle = `${control} size-7 text-secondary aria-pressed:text-(--theme-accent) transition-colors`;
const transport = `${control} size-7 text-primary hover:text-white transition-colors`;
const action = 'grid h-7 w-6 place-items-center rounded-[4px] text-primary aria-pressed:text-(--theme-accent) transition-colors';
// The actions the volume level slides in over: they fade out while it's open.
const fading = `${action} ${fadeForVolume}`;

/** The floating glass player pill (report §1). */
export function PlayerBar() {
  const sidePanel = useUi((s) => s.sidePanel);
  const toggleSidePanel = useUi((s) => s.toggleSidePanel);
  const hasTrack = usePlayer((s) => s.nowPlaying !== null);
  const videoId = usePlayer((s) => s.nowPlaying?.videoId ?? null);
  // The queue's entry for what's playing: the track menu needs the full track.
  const track = usePlayer((s) => {
    const entry = s.queue[s.index]?.track;
    return entry && entry.videoId === s.nowPlaying?.videoId ? entry : null;
  });
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const artColor = useArtworkColor(nowPlaying?.artworkUrl);
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat !== 'off' || (s.autoplay && s.index >= 0));
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayer.getState();
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [appearance, setAppearance] = useState(readAppearancePreferences);

  useEffect(() => {
    const onAppChange = () => setAppearance(readAppearancePreferences());
    window.addEventListener('mellow:appearance-changed', onAppChange);
    return () => window.removeEventListener('mellow:appearance-changed', onAppChange);
  }, []);

  return (
    // The side panel overlays the page; the pill re-centres in what's left.
    <div
      className="pointer-events-none absolute right-0 bottom-(--player-bottom-offset) left-(--web-navigation-width) z-[calc(var(--z-web-chrome)-1)] flex justify-center px-5 transition-[padding-inline-end] duration-(--duration-panel) ease-panel data-[panel-open=true]:pe-[calc(var(--side-panel-width)+20px)] max-sm:hidden"
      data-panel-open={sidePanel !== null}
    >
      <div
        className="glass-pill group/pill pointer-events-auto relative grid h-(--player-pill-height) w-[min(668px,100%)] grid-cols-[184px_minmax(180px,427px)_minmax(57px,auto)] items-center rounded-pill px-4 transition-shadow duration-300"
        style={
          hasTrack && appearance.playerBarGlow
            ? {
                boxShadow: `0 18px 46px rgba(0, 0, 0, 0.55), 0 0 28px color-mix(in srgb, var(--ambient-glow-tint, var(--theme-accent)) ${((appearance.playerBarGlowStrength / 100) * 40).toFixed(1)}%, transparent)`,
              }
            : undefined
        }
        role="region"
        aria-label="Player"
      >
        <div className="flex items-center justify-between pr-2">
          <button className={toggle} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
            <ShuffleIcon size={28} />
          </button>
          <div className="flex items-center gap-1.5">
            <button className={transport} disabled={!hasTrack} aria-label="Previous" onClick={previous}>
              <BackwardIcon size={26} />
            </button>
            <button className={transport} disabled={!hasTrack} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
              {playing ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
            </button>
            <button className={transport} disabled={!hasTrack || !hasNext} aria-label="Next" onClick={next}>
              <ForwardIcon size={26} />
            </button>
          </div>
          <button
            className={toggle}
            aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat'}
            aria-pressed={repeat !== 'off'}
            onClick={cycleRepeat}
          >
            {repeat === 'one' ? <RepeatOneIcon size={28} /> : <RepeatIcon size={28} />}
          </button>
        </div>

        <div className={`h-full min-w-0 px-4 transition-opacity duration-150${volumeOpen ? ' opacity-0' : ''}`}>
          <Lcd />
        </div>

        <div
          className="group/actions relative flex items-center justify-end gap-[9px]"
          data-volume-open={volumeOpen || undefined}
          onPointerLeave={(e) => {
            // The slider is positioned to the left of this compact action row.
            // Keep it open when the pointer crosses from the speaker into it.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setVolumeOpen(false);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setVolumeOpen(false);
          }}
        >
          <FavoriteButton
            videoId={videoId}
            track={nowPlaying ? { title: nowPlaying.title, artist: nowPlaying.artist } : undefined}
            className={fading}
          />
          {track && <TrackMenu track={track} className={fading} placement="above-end" />}
          {/* Always here: the panel itself says whether this track has lyrics, and from where. */}
          <button className={fading} aria-label="Lyrics" aria-pressed={sidePanel === 'lyrics'} onClick={() => toggleSidePanel('lyrics')}>
            {sidePanel === 'lyrics' ? <LyricsActiveIcon size={18} /> : <LyricsIcon size={18} />}
          </button>
          <button className={fading} aria-label="Now Playing details" title="Now Playing details" aria-pressed={sidePanel === 'now-playing'} onClick={() => toggleSidePanel('now-playing')}>
            <PanelRight size={18} />
          </button>
          <button
            className={fading}
            aria-label="Up Next"
            aria-pressed={sidePanel === 'up-next'}
            onClick={() => toggleSidePanel('up-next')}
          >
            <UpNextIcon size={18} />
          </button>
          <VolumeControl open={volumeOpen} onOpen={() => setVolumeOpen(true)} className={action} />
        </div>
      </div>
    </div>
  );
}
