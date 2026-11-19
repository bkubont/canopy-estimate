import { openDB, type IDBPDatabase } from 'idb';
import { TABLE_NAMES, type TableName } from './types';

/** A pending change waiting to reach the server. One entry per row; newer edits replace older ones. */
export interface OutboxEntry {
  id: string; // `${table}|${rowKey}`
  table: TableName;
  key: string;
  row: Record<string, unknown>;
  version: number;
  queuedAt: string;
  /** Set when the server permanently refused this change (e.g. not allowed). */
  error?: string;
  /** A brand-new row (e.g. an imported contact): it can go up in a batch insert. */
  fresh?: boolean;
}

// Bump when tables are added; the upgrade adds any missing stores.
const VERSION = 5;

/** Meta keys that hold the sync_pull cursor for an org (`cursor:<orgId>`). */
export function isSyncCursorKey(key: IDBValidKey): key is string {
  return typeof key === 'string' && key.startsWith('cursor:');
}

/**
 * Each signed-in person gets their own on-device database, so two people
 * sharing a tablet never see each other's unsynced work.
 */
export function localDbName(userId: string) {
  return `canopy-${userId}`;
}

export type LocalDb = IDBPDatabase;

export async function openLocalDb(name: string): Promise<LocalDb> {
  return openDB(name, VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      for (const t of TABLE_NAMES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t);
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      // Photos taken on this device that haven't reached file storage yet.
      if (!db.objectStoreNames.contains('photo_blobs')) db.createObjectStore('photo_blobs');

      // v5 adds CRM tables. A device that pulled while the server already had
      // seeded tags/backfill (but this client ignored unknown tables) advanced
      // its cursor and would never see those rows. Clear per-org cursors so the
      // next sync does a full pull. Fresh installs (oldVersion 0) have none.
      if (oldVersion > 0 && oldVersion < 5) {
        const meta = transaction.objectStore('meta');
        const keys = await meta.getAllKeys();
        await Promise.all(keys.filter(isSyncCursorKey).map((k) => meta.delete(k)));
      }
    },
  });
}

export async function deleteLocalDb(name: string) {
  const { deleteDB } = await import('idb');
  await deleteDB(name);
}
