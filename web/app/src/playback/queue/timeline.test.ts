import { describe, expect, it } from 'vitest';
import { previousTrackIndex } from './timeline';

describe('previous track targeting', () => {
  it('goes to the preceding queued track even when playback is already underway', () => {
    expect(previousTrackIndex(3, 8, 'off')).toBe(2);
  });

  it('restarts the first item when there is no earlier item', () => {
    expect(previousTrackIndex(0, 8, 'off')).toBe(0);
  });

  it('wraps to the last queued item only in repeat-all mode', () => {
    expect(previousTrackIndex(0, 3, 'all')).toBe(2);
    expect(previousTrackIndex(0, 3, 'one')).toBe(0);
  });

  it('has no target when the player has no current queue item', () => {
    expect(previousTrackIndex(-1, 3, 'all')).toBeNull();
    expect(previousTrackIndex(0, 0, 'off')).toBeNull();
    expect(previousTrackIndex(3, 3, 'off')).toBeNull();
  });
});
