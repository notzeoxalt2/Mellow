import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockedExecFile } = vi.hoisted(() => ({ mockedExecFile: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: mockedExecFile, execFileSync: vi.fn() };
});

import { setWindowsAccent } from '../../../desktop/src/windowsAccent.js';

describe('Windows accent sync retry state', () => {
  afterEach(() => mockedExecFile.mockReset());

  it('retries the same artwork color after PowerShell fails once', async () => {
    let attempts = 0;
    mockedExecFile.mockImplementation((...args: unknown[]) => {
      attempts += 1;
      const callback = args.at(-1) as (error: Error | null) => void;
      callback(attempts === 1 ? new Error('temporary registry failure') : null);
      return {};
    });

    await expect(setWindowsAccent('unused-user-data', true, '#12AbEF')).rejects.toThrow('temporary registry failure');
    await expect(setWindowsAccent('unused-user-data', true, '#12abef')).resolves.toBeUndefined();
    await expect(setWindowsAccent('unused-user-data', true, '#12ABEF')).resolves.toBeUndefined();

    expect(attempts).toBe(2);
  });
});
