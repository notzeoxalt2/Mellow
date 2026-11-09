// Adapted from AutoMix's src/lib/library/db.ts (https://github.com/heydavidf/automix),
// Copyright (C) 2026 David Finnegan. AGPL-3.0-only: see ./LICENSE and ./NOTICE.md.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TrackAnalysis } from './analysis/types';

interface AutomixDB extends DBSchema {
  /** Keyed by YouTube video id (TrackAnalysis.fileKey). */
  tracks: { key: string; value: TrackAnalysis; indexes: { cacheStoredAt: number } };
}

/** Keep derived analysis storage predictable; manual transition edits are retained. */
const MAX_CACHED_ANALYSES = 500;
const PRUNE_TO_ANALYSES = 450;

let dbPromise: Promise<IDBPDatabase<AutomixDB>> | null = null;

function getDb(): Promise<IDBPDatabase<AutomixDB>> {
  if (!dbPromise) {
    let migrateLegacyAges = false;
    dbPromise = openDB<AutomixDB>('bitchord-automix', 2, {
      upgrade(db, oldVersion, _newVersion, tx) {
        const store = oldVersion < 1 ? db.createObjectStore('tracks') : tx.objectStore('tracks');
        store.createIndex('cacheStoredAt', 'cacheStoredAt');
        migrateLegacyAges = oldVersion === 1;
      },
    }).then(async (db) => {
      if (migrateLegacyAges) {
        // Existing analyses predate age metadata. Label them as oldest cache
        // rows without dropping any analysis or manual transition override.
        const tx = db.transaction('tracks', 'readwrite');
        let cursor = await tx.store.openCursor();
        while (cursor) {
          if (typeof cursor.value.cacheStoredAt !== 'number') {
            await cursor.update({ ...cursor.value, cacheStoredAt: 0 });
          }
          cursor = await cursor.continue();
        }
        await tx.done;
      }
      return db;
    });
  }
  return dbPromise;
}

export async function getAnalysis(videoId: string): Promise<TrackAnalysis | undefined> {
  return (await getDb()).get('tracks', videoId);
}

export async function putAnalysis(analysis: TrackAnalysis): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('tracks', 'readwrite');
  const store = tx.objectStore('tracks');
  await store.put({ ...analysis, cacheStoredAt: Date.now() }, analysis.fileKey);

  let count = await store.count();
  if (count > MAX_CACHED_ANALYSES) {
    // Prune the oldest automatically generated analyses in a single storage
    // transaction. Explicitly tuned transition data belongs to the user.
    let cursor = await store.index('cacheStoredAt').openCursor();
    while (cursor && count > PRUNE_TO_ANALYSES) {
      if (!cursor.value.manualOverrides) {
        await cursor.delete();
        count -= 1;
      }
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}
