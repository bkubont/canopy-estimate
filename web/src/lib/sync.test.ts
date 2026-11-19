import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openLocalDb } from './localdb';
import { RemoteError, SyncEngine, type PullResult, type Remote } from './sync';
import { rowKey, type Customer, type Job, type TableName } from './types';

const ORG = 'org-1';

/** In-memory stand-in for Supabase with the same cursor behaviour as sync_pull. */
class FakeServer {
  seq = 0;
  rows = new Map<string, { table: TableName; row: Record<string, unknown>; seq: number }>();
  offline = false;
  refuse: (table: TableName, row: Record<string, unknown>) => string | null = () => null;
  pushLog: string[] = [];
  onPush?: () => Promise<void>;
  onPull?: () => Promise<void>;

  remote(): Remote {
    return {
      pull: async (orgId, cursor): Promise<PullResult> => {
        if (this.offline) throw new RemoteError('Failed to fetch', false);
        await this.onPull?.();
        const since = cursor ? Number(cursor) : 0;
        const tables: PullResult['tables'] = {};
        for (const { table, row, seq } of this.rows.values()) {
          if (seq < since) continue;
          if ((row.org_id ?? row.id) !== orgId) continue;
          (tables[table] ??= []).push(structuredClone(row));
        }
        return { cursor: String(this.seq + 1), tables };
      },
      push: async (table, row) => {
        if (this.offline) throw new RemoteError('Failed to fetch', false);
        const why = this.refuse(table, row);
        if (why) throw new RemoteError(why, true);
        await this.onPush?.();
        this.seq += 1;
        this.pushLog.push(`${table}:${String(row.id ?? row.job_id)}`);
        this.rows.set(`${table}|${rowKey(table, row)}`, { table, row: structuredClone(row), seq: this.seq });
      },
      insertMany: async (table, rows) => {
        if (this.offline) throw new RemoteError('Failed to fetch', false);
        for (const row of rows) {
          const why = this.refuse(table, row) ?? (this.rows.has(`${table}|${rowKey(table, row)}`) ? 'duplicate key' : null);
          if (why) throw new RemoteError(why, true); // all or nothing
        }
        this.batchLog.push(rows.length);
        for (const row of rows) {
          this.seq += 1;
          this.rows.set(`${table}|${rowKey(table, row)}`, { table, row: structuredClone(row), seq: this.seq });
        }
      },
    };
  }
  batchLog: number[] = [];

  serverRow(table: TableName, key: string) {
    return this.rows.get(`${table}|${key}`)?.row;
  }
}

let dbCount = 0;
async function device(server: FakeServer) {
  dbCount += 1;
  const db = await openLocalDb(`test-${dbCount}`);
  return new SyncEngine(db, server.remote(), ORG, { debounceMs: 60_000 });
}

function customer(id: string, patch: Partial<Customer> = {}): Customer {
  return {
    id, org_id: ORG, first_name: 'Dana', last_name: 'Smith', company: '', phone: '', email: '',
    street: '', town: '', state: 'MI', zip: '', notes: '', deleted_at: null, ...patch,
  };
}

function job(id: string, customerId: string): Job {
  return {
    id, org_id: ORG, number: 'E-1001', stage: 'estimate', status: 'pending', block_reason: '',
    customer_id: customerId, client: {} as never, trees: [], site: {} as never, equipment: [], days: 1, change_orders: [],
    client_notes: '', internal_notes: '', estimate_date: '2026-11-12', client_sig: '', client_sig_date: null,
    signed_at: null, signed_by_name: '', signed_via: '', prepared_by_name: '', contractor_sig: '', assigned_crew: '', deleted_at: null,
  };
}

describe('SyncEngine', () => {
  let server: FakeServer;
  beforeEach(() => {
    server = new FakeServer();
  });

  it('saves on the device instantly, before any network', async () => {
    server.offline = true;
    const a = await device(server);
    await a.save('customers', customer('c1'));
    expect((await a.all('customers')).map((c) => c.id)).toEqual(['c1']);
    expect(a.status.pending).toBe(1);
  });

  it('two devices see the same data', async () => {
    const a = await device(server);
    const b = await device(server);
    await a.save('customers', customer('c1', { phone: '231-555-0101' }));
    await a.sync();
    expect(a.status.pending).toBe(0);
    await b.sync();
    expect((await b.all('customers'))[0]?.phone).toBe('231-555-0101');
  });

  it('keeps changes queued while offline and sends them when back online', async () => {
    const a = await device(server);
    server.offline = true;
    await a.save('customers', customer('c1'));
    await a.sync();
    expect(a.status.state).toBe('offline');
    expect(a.status.pending).toBe(1);
    expect(server.serverRow('customers', 'c1')).toBeUndefined();

    server.offline = false;
    await a.sync();
    expect(a.status.state).toBe('idle');
    expect(a.status.pending).toBe(0);
    expect(server.serverRow('customers', 'c1')).toBeDefined();
  });

  it('does not overwrite an unsent local edit with an older server copy', async () => {
    const a = await device(server);
    const b = await device(server);
    await a.save('customers', customer('c1', { phone: 'old' }));
    await a.sync();
    await b.sync();

    server.offline = true;
    await b.save('customers', customer('c1', { phone: 'new from b' }));
    server.offline = false;
    await a.save('customers', customer('c1', { phone: 'new from a' }));
    await a.sync();

    // b pushes before it pulls, so b's edit is the last to reach the server.
    await b.sync();
    expect((await b.get('customers', 'c1'))?.phone).toBe('new from b');
    expect(server.serverRow('customers', 'c1')?.phone).toBe('new from b');
    await a.sync();
    expect((await a.get('customers', 'c1'))?.phone).toBe('new from b');
  });

  it('does not lose typing that happens while a pull is in flight', async () => {
    const a = await device(server);
    const b = await device(server);
    await a.save('customers', customer('c1', { phone: 'v1' }));
    await a.sync();
    await b.sync();
    await a.save('customers', customer('c1', { phone: 'v2 from a' }));
    await a.sync();

    // b starts pulling; while the request is out, the user on b edits the same customer.
    server.onPull = async () => {
      server.onPull = undefined;
      await b.save('customers', customer('c1', { phone: 'typed on b' }));
    };
    await b.sync();
    expect((await b.get('customers', 'c1'))?.phone).toBe('typed on b');
    expect(b.status.pending).toBe(1);
  });

  it('pushes customers before the jobs that point at them', async () => {
    const a = await device(server);
    await a.save('jobs', job('j1', 'c1'));
    await a.save('customers', customer('c1'));
    await a.sync();
    expect(server.pushLog).toEqual(['customers:c1', 'jobs:j1']);
  });

  it('pushes CRM child rows after customers and before jobs', async () => {
    const a = await device(server);
    await a.save('jobs', job('j1', 'c1'));
    await a.save('customer_phones', {
      id: 'p1', org_id: ORG, customer_id: 'c1', label: 'mobile', value: '231-555-0101', sort: 0, deleted_at: null,
    });
    await a.save('customer_properties', {
      id: 'prop1', org_id: ORG, customer_id: 'c1', street: '1 Main', town: 'Leland', state: 'MI', zip: '49654',
      gate_code: '', access: '', hazards: [], tree_notes: '', sort: 0, deleted_at: null,
    });
    await a.save('tag_groups', {
      id: 'g1', org_id: ORG, name: 'Stage', slug: 'stage', mode: 'one', pipeline: true, allow_new: false, sort: 0, deleted_at: null,
    });
    await a.save('tags', {
      id: 't1', org_id: ORG, tag_group_id: 'g1', name: 'Past customer', slug: 'past', color: '#7b8676', sort: 5, deleted_at: null,
    });
    await a.save('customer_tags', { org_id: ORG, customer_id: 'c1', tag_id: 't1', deleted_at: null });
    await a.save('customers', customer('c1'));
    await a.sync();
    expect(server.pushLog.map((s) => s.split(':')[0])).toEqual([
      'customers', 'tag_groups', 'tags', 'customer_phones',
      'customer_properties', 'customer_tags', 'jobs',
    ]);
  });

  it('syncs a CRM property to a second device', async () => {
    const a = await device(server);
    const b = await device(server);
    await a.save('customers', customer('c1'));
    await a.save('customer_properties', {
      id: 'prop1', org_id: ORG, customer_id: 'c1', street: '12 Shore Ln', town: 'Suttons Bay', state: 'MI', zip: '49682',
      gate_code: '4471', access: 'Park on street', hazards: ['Power lines'], tree_notes: 'Oak lean', sort: 0, deleted_at: null,
    });
    await a.sync();
    await b.sync();
    const prop = await b.get('customer_properties', 'prop1');
    expect(prop?.street).toBe('12 Shore Ln');
    expect(prop?.hazards).toEqual(['Power lines']);
  });

  it('flags a refused change, keeps syncing the rest, and can discard it', async () => {
    const a = await device(server);
    await a.save('customers', customer('c1', { phone: 'server copy' }));
    await a.sync();

    server.refuse = (table, row) => (table === 'customers' && row.id === 'c1' ? 'Not allowed' : null);
    await a.save('customers', customer('c1', { phone: 'refused edit' }));
    await a.save('customers', customer('c2'));
    await a.sync();
    expect(a.status.failed.map((f) => f.key)).toEqual(['c1']);
    expect(a.status.failed[0]?.error).toBe('Not allowed');
    expect(a.status.pending).toBe(0);
    expect(server.serverRow('customers', 'c2')).toBeDefined();

    server.refuse = () => null;
    await a.discardFailed(a.status.failed[0]!.id);
    expect(a.status.failed).toEqual([]);
    expect((await a.get('customers', 'c1'))?.phone).toBe('server copy');
  });

  it('keeps an edit made while that row was being sent', async () => {
    const a = await device(server);
    await a.save('customers', customer('c1', { phone: 'first' }));
    server.onPush = async () => {
      server.onPush = undefined;
      await a.save('customers', customer('c1', { phone: 'second' }));
    };
    await a.sync();
    // The second edit was queued mid-push; the follow-up pass sends it.
    await a.sync();
    expect(server.serverRow('customers', 'c1')?.phone).toBe('second');
    expect(a.status.pending).toBe(0);
  });

  it('syncs deletions to other devices', async () => {
    const a = await device(server);
    const b = await device(server);
    await a.save('customers', customer('c1'));
    await a.sync();
    await b.sync();
    const row = (await a.get('customers', 'c1'))!;
    await a.remove('customers', row);
    await a.sync();
    await b.sync();
    expect(await b.all('customers')).toEqual([]);
    expect((await b.all('customers', { includeDeleted: true })).length).toBe(1);
  });

  it('only shows rows for the current company', async () => {
    const a = await device(server);
    await a.save('customers', customer('c1'));
    await a.db.put('customers', customer('other', { org_id: 'org-2' }), 'other');
    expect((await a.all('customers')).map((c) => c.id)).toEqual(['c1']);
  });

  it('runs overlapping sync requests one at a time', async () => {
    const a = await device(server);
    await a.save('customers', customer('c1'));
    await Promise.all([a.sync(), a.sync(), a.sync()]);
    expect(server.pushLog).toEqual(['customers:c1']);
  });
});

describe('importing many rows', () => {
  it('saves them in one go and sends them up in batches of 200', async () => {
    const server = new FakeServer();
    const a = await device(server);
    const rows = Array.from({ length: 450 }, (_, i) => customer(`c${i}`, { first_name: `P${i}` }));
    await a.addMany('customers', rows);
    expect((await a.db.getAll('customers')).length).toBe(450);
    await a.sync();
    expect(server.batchLog).toEqual([200, 200, 50]);
    expect(server.pushLog).toEqual([]); // no one-by-one requests
    expect((await a.db.getAll('outbox')).length).toBe(0);
  });
  it('falls back to one at a time when a batch is refused, so one bad row doesn\u2019t block the rest', async () => {
    const server = new FakeServer();
    server.refuse = (_t, row) => (row.id === 'c3' ? 'Not allowed' : null);
    const a = await device(server);
    await a.addMany('customers', Array.from({ length: 5 }, (_, i) => customer(`c${i}`)));
    await a.sync();
    expect(server.batchLog).toEqual([]);
    expect(server.pushLog.length).toBe(4);
    const left = await a.db.getAll('outbox');
    expect(left.map((e) => [e.key, e.error])).toEqual([['c3', 'Not allowed']]);
  });
  it('keeps them queued while offline', async () => {
    const server = new FakeServer();
    server.offline = true;
    const a = await device(server);
    await a.addMany('customers', [customer('c1'), customer('c2')]);
    await a.sync().catch(() => undefined);
    expect((await a.db.getAll('outbox')).length).toBe(2);
    server.offline = false;
    await a.sync();
    expect(server.batchLog).toEqual([2]);
  });
});
