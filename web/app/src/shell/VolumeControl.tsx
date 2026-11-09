import { useEffect, useRef } from 'react';
import { VolumeIcon } from '@/components/icons/Transport';
import { usePlayer } from '@/state/player';
import { nextVolumeFromWheel } from './wheelVolume';

/**
 * Apple's volume control (report §1): the speaker mutes, and hovering it
 * slides the level in where the actions beside it were. Those actions fade
 * out while it's open, which is what [fadeForVolume] is for; both the player
 * pill and the full-screen player hold it in a `group/actions` row that
 * carries `data-volume-open`.
 *
 * The level slides in from the row's right edge, clearing the speaker: set
 * `--volume-gap` on the row where the speaker is a different size.
 */
const slider = [
  'absolute top-1/2 right-[var(--volume-gap,33px)] z-20 mx-0 mb-0 -mt-2 block h-5 w-24 cursor-pointer appearance-none rounded-full border border-white/10 bg-[#111218]/95 px-1 shadow-[0_4px_14px_rgba(0,0,0,.45)] backdrop-blur-md',
  'pointer-events-none translate-x-2 opacity-0 transition-[opacity,translate] duration-200',
  'data-open:pointer-events-auto data-open:translate-none data-open:opacity-100',
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-[2px] [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--systemPrimary)_var(--fill),var(--systemQuaternary)_var(--fill))]',
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-[2px] [&::-moz-range-track]:bg-[linear-gradient(to_right,var(--systemPrimary)_var(--fill),var(--systemQuaternary)_var(--fill))]',
  '[&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_2px_#0006]',
  '[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_0_2px_#0006]',
].join(' ');

/** What the level slides in over: the actions sharing the row get out of its way. */
export const fadeForVolume =
  'transition-opacity group-data-volume-open/actions:pointer-events-none group-data-volume-open/actions:opacity-0';

interface VolumeControlProps {
  open: boolean;
  onOpen: () => void;
  /** The speaker button's own styling, so it sits with the buttons around it. */
  className: string;
  iconSize?: number;
}

/**
 * Mouse-wheel volume over the control: React registers onWheel as a passive
 * listener, so preventDefault there would be ignored and the page would
 * scroll behind the pill — this native listener opts out with
 * { passive: false }. The page only stops scrolling while the wheel actually
 * changes the volume; at the limits it does nothing, because the player pill
 * sits outside the page's scroll area and wheeling over any part of it never
 * scrolls the page. Each step calls onOpen (it opens the slider, so the level
 * shows while it moves), and reading the store via getState keeps the handler
 * free of stale volume/mute values — setVolume also clears mute, so scrolling
 * up while muted unmutes.
 */
function useVolumeWheel(onStep: () => void) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { volume, setVolume } = usePlayer.getState();
      const next = nextVolumeFromWheel(volume, e.deltaY);
      if (next === volume) return;
      e.preventDefault();
      onStep();
      setVolume(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onStep]);
  return ref;
}

export function VolumeControl({ open, onOpen, className, iconSize = 20 }: VolumeControlProps) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const level = muted ? 0 : volume;
  const effectivelyMuted = level === 0;
  const restorePercent = Math.round((muted ? volume : 0) * 100);
  const volumeLabel = effectivelyMuted
    ? `Muted in Mellow${restorePercent ? ` · restore ${restorePercent}%` : ''} · click to unmute`
    : `Mellow output ${Math.round(level * 100)}% · click to mute · if silent, check Windows Volume Mixer`;
  const wheelRef = useVolumeWheel(onOpen);
  return (
    <span ref={wheelRef}>
      <input
        className={slider}
        data-open={open || undefined}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={level}
        aria-label="Volume"
        tabIndex={open ? 0 : -1}
        style={{ '--fill': `${level * 100}%` } as React.CSSProperties}
        onChange={(e) => setVolume(Number(e.currentTarget.value))}
      />
      <button
        className={`${className} aria-pressed:bg-red-500/15 aria-pressed:text-white aria-pressed:ring-1 aria-pressed:ring-red-400/40 aria-pressed:drop-shadow-[0_0_5px_rgba(255,102,114,0.55)]`}
        aria-label={volumeLabel}
        aria-pressed={effectivelyMuted}
        title={volumeLabel}
        onClick={toggleMute}
        onPointerEnter={onOpen}
        onFocus={onOpen}
      >
        <VolumeIcon
          level={level}
          muted={effectivelyMuted}
          size={iconSize}
          style={effectivelyMuted ? { color: '#fff' } : undefined}
        />
      </button>
    </span>
  );
}
