// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackAnalysis } from './analysis/types';

const DB_NAME = 'bitchord-automix';

function analysis(fileKey: string, manualOverrides?: TrackAnalysis['manualOverrides']): TrackAnalysis {
  return {
    fileKey,
    path: fileKey,
    tags: { title: fileKey, artist: 'QA' },
    durationSec: 180,
    bpm: 120,
    beatIntervalSec: 0.5,
    firstDownbeatSec: 0,
    gridConfidence: 0.8,
    camelot: null,
    keyName: null,
    keyConfidence: 0,
    energy: 0.5,
    energyCurve: [],
    introEndSec: null,
    outroStartSec: null,
    analysisVersion: 8,
    ...(manualOverrides ? { manualOverrides } : {}),
  };
}

describe('AutoMix analysis storage retention', () => {
  afterEach(() => vi.restoreAllMocks());

  it('migrates v1 rows, prunes oldest derived rows to the cap, and retains manual edits', async () => {
    // Seed the real prior schema so this covers both migration and retention.
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('tracks');
      },
    });
    await v1.put('tracks', analysis('manual-legacy', { bpm: 123 }), 'manual-legacy');
    v1.close();

    const { getAnalysis, putAnalysis } = await import('./db');
    const migrated = await getAnalysis('manual-legacy');
    expect(migrated?.cacheStoredAt).toBe(0);
    expect(migrated?.manualOverrides).toEqual({ bpm: 123 });

    let clock = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock++);
    for (let index = 0; index < 500; index += 1) {
      await putAnalysis(analysis(`derived-${String(index).padStart(3, '0')}`));
    }

    const db = await openDB(DB_NAME, 2);
    const rows = await db.getAll('tracks');
    db.close();

    expect(rows).toHaveLength(450);
    expect(rows.find((row) => row.fileKey === 'manual-legacy')?.manualOverrides).toEqual({ bpm: 123 });
    expect(rows.some((row) => row.fileKey === 'derived-000')).toBe(false);
    expect(rows.some((row) => row.fileKey === 'derived-499')).toBe(true);
  });
});
