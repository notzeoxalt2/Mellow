import { describe, expect, it } from 'vitest';
import { mapConcurrent } from '../../../extension/lib/asyncPool';
import { YtSessionGate } from '../../../extension/lib/ytSessionGate';

describe('YouTube session rejection recovery', () => {
  it('keeps a rejected session blocked until a user refreshes or cookies change', () => {
    const gate = new YtSessionGate();
    gate.markRejected();

    expect(gate.rejected).toBe(true);
    expect(gate.recoverForRefresh(false)).toBe(false);
    expect(gate.rejected).toBe(true);

    expect(gate.recoverForRefresh(true)).toBe(true);
    expect(gate.rejected).toBe(false);
  });

  it('does not reset a healthy session on refresh and clears rejection after cookie changes', () => {
    const gate = new YtSessionGate();

    expect(gate.recoverForRefresh(true)).toBe(false);
    gate.markRejected();
    gate.invalidate();
    expect(gate.rejected).toBe(false);
    expect(gate.recoverForRefresh(true)).toBe(false);
  });
});

describe('bounded YouTube account probing', () => {
  it('keeps no more than the configured number of requests active and preserves account order', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapConcurrent([0, 1, 2, 3, 4, 5], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return value * 10;
    });

    expect(peak).toBe(2);
    expect(result).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('rejects invalid concurrency instead of silently starting an unbounded scan', async () => {
    await expect(mapConcurrent([1], 0, async (value) => value)).rejects.toThrow('concurrency must be a positive integer');
  });
});
