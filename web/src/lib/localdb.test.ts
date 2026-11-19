import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalDb, isSyncCursorKey, openLocalDb } from './localdb';

describe('isSyncCursorKey', () => {
  it('matches per-org sync_pull cursor meta keys only', () => {
    expect(isSyncCursorKey('cursor:org-1')).toBe(true);
    expect(isSyncCursorKey('lastSync:org-1')).toBe(false);
    expect(isSyncCursorKey('orgs')).toBe(false);
    expect(isSyncCursorKey(1)).toBe(false);
  });
});

describe('openLocalDb v5 upgrade', () => {
  const name = 'localdb-v5-upgrade-test';

  afterEach(async () => {
    await deleteLocalDb(name);
  });

  it('clears sync cursors when upgrading from v4 so CRM seed/backfill can pull', async () => {
    const old = await openDB(name, 4, {
      upgrade(db) {
        db.createObjectStore('customers');
        db.createObjectStore('meta');
      },
    });
    await old.put('meta', '812', 'cursor:org-1');
    await old.put('meta', '812', 'cursor:org-2');
    await old.put('meta', '2026-11-19T12:00:00Z', 'lastSync:org-1');
    await old.put('meta', 'org-1', 'currentOrg');
    old.close();

    const db = await openLocalDb(name);
    expect(await db.get('meta', 'cursor:org-1')).toBeUndefined();
    expect(await db.get('meta', 'cursor:org-2')).toBeUndefined();
    expect(await db.get('meta', 'lastSync:org-1')).toBe('2026-11-19T12:00:00Z');
    expect(await db.get('meta', 'currentOrg')).toBe('org-1');
    expect(db.objectStoreNames.contains('customer_properties')).toBe(true);
    expect(db.objectStoreNames.contains('tag_groups')).toBe(true);
    db.close();
  });

  it('does not require clearing cursors on a fresh v5 install', async () => {
    const db = await openLocalDb(name);
    expect(await db.getAllKeys('meta')).toEqual([]);
    db.close();
  });
});
