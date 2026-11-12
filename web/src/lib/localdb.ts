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
}

// Bump when tables are added; the upgrade adds any missing stores.
const VERSION = 2;

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
    upgrade(db) {
      for (const t of TABLE_NAMES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t);
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    },
  });
}

export async function deleteLocalDb(name: string) {
  const { deleteDB } = await import('idb');
  await deleteDB(name);
}
