import type { LocalDb, OutboxEntry } from './localdb';
import { TABLES, TABLE_NAMES, rowKey, type TableName, type TableRows } from './types';

/** What the sync engine needs from the server. Supabase implements it; tests fake it. */
export interface Remote {
  pull(orgId: string, cursor: string | null): Promise<PullResult>;
  push(table: TableName, row: Record<string, unknown>): Promise<void>;
}

export interface PullResult {
  cursor: string;
  tables: Partial<Record<TableName, Record<string, unknown>[]>>;
}

/** Thrown by a Remote. permanent = the server refused it; retrying won't help. */
export class RemoteError extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
  }
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error';
  /** Changes on this device not yet on the server. */
  pending: number;
  /** Changes the server refused; shown to the person so nothing is lost silently. */
  failed: OutboxEntry[];
  lastSyncedAt: string | null;
  lastError: string | null;
}

type Listener = () => void;

const cursorKey = (orgId: string) => `cursor:${orgId}`;
const lastSyncKey = (orgId: string) => `lastSync:${orgId}`;

/**
 * Offline-first sync for one company on one device.
 *
 * Writes land in the local database and an outbox immediately, so the app
 * never waits on the network. sync() pushes the outbox (in table order) and
 * then pulls everything that changed on the server since the last cursor.
 *
 * Conflict rule: a row with an unsent local change is not overwritten by a
 * pull. Once the change is pushed, the next pull brings the server's copy, so
 * the last write to reach the server wins.
 */
export class SyncEngine {
  private listeners = new Set<Listener>();
  private changeListeners = new Set<(tables: Set<TableName>) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  status: SyncStatus = { state: 'idle', pending: 0, failed: [], lastSyncedAt: null, lastError: null };

  constructor(
    readonly db: LocalDb,
    private remote: Remote,
    readonly orgId: string,
    private opts: { debounceMs?: number } = {},
  ) {}

  // ---------------------------------------------------------------- reads

  async all<T extends TableName>(table: T, { includeDeleted = false } = {}): Promise<TableRows[T][]> {
    const rows = (await this.db.getAll(table)) as TableRows[T][];
    return rows.filter((r) => {
      const orgId = (r as { org_id?: string; id?: string }).org_id ?? (r as { id?: string }).id;
      return orgId === this.orgId && (includeDeleted || !r.deleted_at);
    });
  }

  async get<T extends TableName>(table: T, key: string): Promise<TableRows[T] | undefined> {
    return (await this.db.get(table, key)) as TableRows[T] | undefined;
  }

  // ---------------------------------------------------------------- writes

  /** Save a row on this device and queue it for the server. */
  async save<T extends TableName>(table: T, row: TableRows[T]): Promise<void> {
    const plain = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
    const key = rowKey(table, plain);
    const id = `${table}|${key}`;
    const tx = this.db.transaction([table, 'outbox'], 'readwrite');
    const prev = (await tx.objectStore('outbox').get(id)) as OutboxEntry | undefined;
    const entry: OutboxEntry = {
      id,
      table,
      key,
      row: plain,
      version: (prev?.version ?? 0) + 1,
      queuedAt: new Date().toISOString(),
    };
    await Promise.all([tx.objectStore(table).put(plain, key), tx.objectStore('outbox').put(entry), tx.done]);
    await this.refreshCounts();
    this.emitChange(new Set([table]));
    this.schedule();
  }

  /** Soft delete: the row stays (marked deleted) so the deletion syncs everywhere. */
  async remove<T extends TableName>(table: T, row: TableRows[T]): Promise<void> {
    await this.save(table, { ...row, deleted_at: new Date().toISOString() });
  }

  /** Throw away a change the server refused and fetch the server's copy again. */
  async discardFailed(entryId: string): Promise<void> {
    await this.db.delete('outbox', entryId);
    await this.db.delete('meta', cursorKey(this.orgId)); // full re-pull restores the server copy
    await this.refreshCounts();
    await this.sync();
  }

  // ---------------------------------------------------------------- sync

  /** Debounced sync after local edits. */
  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sync();
    }, this.opts.debounceMs ?? 800);
  }

  /** Push then pull. Overlapping calls share one run and trigger one more pass. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce() {
    this.setStatus({ state: 'syncing' });
    try {
      await this.pushAll();
      await this.pullAll();
      const now = new Date().toISOString();
      await this.db.put('meta', now, lastSyncKey(this.orgId));
      this.setStatus({ state: 'idle', lastSyncedAt: now, lastError: null });
    } catch (err) {
      const permanent = err instanceof RemoteError && err.permanent;
      this.setStatus({
        state: permanent ? 'error' : 'offline',
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
    await this.refreshCounts();
  }

  private async pushAll() {
    const entries = ((await this.db.getAll('outbox')) as OutboxEntry[])
      .filter((e) => !e.error)
      .sort((a, b) => order(a.table) - order(b.table) || a.queuedAt.localeCompare(b.queuedAt));
    for (const entry of entries) {
      try {
        await this.remote.push(entry.table, entry.row);
      } catch (err) {
        if (err instanceof RemoteError && err.permanent) {
          await this.markFailed(entry, err.message);
          continue;
        }
        throw err; // offline or server hiccup: stop, keep everything queued
      }
      await this.clearIfUnchanged(entry);
    }
  }

  private async markFailed(entry: OutboxEntry, message: string) {
    const tx = this.db.transaction('outbox', 'readwrite');
    const current = (await tx.store.get(entry.id)) as OutboxEntry | undefined;
    // If it was edited again while we were pushing, let the new version try.
    if (current && current.version === entry.version) await tx.store.put({ ...current, error: message });
    await tx.done;
  }

  private async clearIfUnchanged(entry: OutboxEntry) {
    const tx = this.db.transaction('outbox', 'readwrite');
    const current = (await tx.store.get(entry.id)) as OutboxEntry | undefined;
    if (current && current.version === entry.version) await tx.store.delete(entry.id);
    await tx.done;
  }

  private async pullAll() {
    const cursor = ((await this.db.get('meta', cursorKey(this.orgId))) as string | undefined) ?? null;
    const result = await this.remote.pull(this.orgId, cursor);
    const changed = new Set<TableName>();
    const tx = this.db.transaction([...TABLE_NAMES, 'outbox', 'meta'], 'readwrite');
    const outbox = tx.objectStore('outbox');
    for (const table of TABLE_NAMES) {
      const rows = result.tables[table] ?? [];
      const store = tx.objectStore(table);
      for (const row of rows) {
        const key = rowKey(table, row);
        if (await outbox.get(`${table}|${key}`)) continue; // unsent local edit wins for now
        await store.put(row, key);
        changed.add(table);
      }
    }
    await tx.objectStore('meta').put(result.cursor, cursorKey(this.orgId));
    await tx.done;
    if (changed.size) this.emitChange(changed);
  }

  // ---------------------------------------------------------------- status

  async refreshCounts() {
    const entries = (await this.db.getAll('outbox')) as OutboxEntry[];
    const lastSyncedAt = ((await this.db.get('meta', lastSyncKey(this.orgId))) as string | undefined) ?? null;
    this.setStatus({
      pending: entries.filter((e) => !e.error).length,
      failed: entries.filter((e) => e.error),
      lastSyncedAt: this.status.lastSyncedAt ?? lastSyncedAt,
    });
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onChange(fn: (tables: Set<TableName>) => void) {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn();
  }

  private emitChange(tables: Set<TableName>) {
    for (const fn of this.changeListeners) fn(tables);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
    this.changeListeners.clear();
  }
}

function order(table: TableName) {
  return TABLES.findIndex((t) => t.name === table);
}
