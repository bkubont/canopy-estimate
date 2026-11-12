import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseRemote } from './supabase';
import { RemoteError } from './sync';

/** Record the HTTP calls supabase-js makes and answer them in order. */
function mockFetch(responses: { status: number; body: unknown }[] | Error) {
  const calls: { method: string; url: string; body: unknown; prefer: string | null }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    calls.push({
      method: init?.method ?? 'GET',
      url: decodeURIComponent(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      prefer: headers.get('Prefer'),
    });
    if (responses instanceof Error) throw responses;
    const r = responses.shift() ?? { status: 200, body: [] };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const row = {
  id: 'c1', org_id: 'o1', first_name: 'Dana', deleted_at: null,
  created_at: '2026-11-12T00:00:00Z', updated_at: 'x', updated_by: 'someone', sync_txid: '9',
};

describe('supabaseRemote.push', () => {
  it('updates an existing row and never sends server-owned columns', async () => {
    const calls = mockFetch([{ status: 200, body: [{ id: 'c1' }] }]);
    await supabaseRemote.push('customers', row);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toContain('/rest/v1/customers?id=eq.c1');
    expect(calls[0]!.body).not.toHaveProperty('updated_at');
    expect(calls[0]!.body).not.toHaveProperty('updated_by');
    expect(calls[0]!.body).not.toHaveProperty('sync_txid');
    expect(calls[0]!.body).toHaveProperty('created_at');
  });

  it('inserts when the server has no such row yet', async () => {
    const calls = mockFetch([{ status: 200, body: [] }, { status: 201, body: null }]);
    await supabaseRemote.push('customers', row);
    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'POST']);
    expect(calls[1]!.url).toContain('/rest/v1/customers');
  });

  it('matches members on both key columns', async () => {
    const calls = mockFetch([{ status: 200, body: [{ org_id: 'o1', user_id: 'u1' }] }]);
    await supabaseRemote.push('members', { org_id: 'o1', user_id: 'u1', role: 'crew', display_name: 'Sam', deleted_at: null });
    expect(calls[0]!.url).toContain('org_id=eq.o1');
    expect(calls[0]!.url).toContain('user_id=eq.u1');
  });

  it('treats "nothing updated" on company settings as a refusal, not a silent success', async () => {
    const calls = mockFetch([{ status: 200, body: [] }]);
    await expect(supabaseRemote.push('org_pricing', { org_id: 'o1', day_rate: 1, deleted_at: null })).rejects.toMatchObject({
      permanent: true,
    });
    expect(calls).toHaveLength(1); // never tries to insert company settings
  });

  it('reports a permission error as permanent with a plain-English message', async () => {
    mockFetch([
      { status: 200, body: [] },
      { status: 403, body: { code: '42501', message: 'new row violates row-level security policy for table "jobs"' } },
    ]);
    const err = await supabaseRemote.push('jobs', { ...row, number: 'E-1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RemoteError);
    expect((err as RemoteError).permanent).toBe(true);
    expect((err as RemoteError).message).toBe('You don’t have permission to make this change.');
  });

  it('treats a dropped connection as temporary so the change stays queued', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const err = await supabaseRemote.push('customers', row).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RemoteError);
    expect((err as RemoteError).permanent).toBe(false);
  });

  it('treats a server error as temporary', async () => {
    mockFetch([{ status: 503, body: { message: 'Service Unavailable' } }]);
    const err = await supabaseRemote.push('customers', row).catch((e: unknown) => e);
    expect((err as RemoteError).permanent).toBe(false);
  });
});

describe('supabaseRemote.pull', () => {
  it('calls sync_pull with the cursor and splits the reply into tables', async () => {
    const calls = mockFetch([{ status: 200, body: { cursor: '812', customers: [{ id: 'c1' }], jobs: [] } }]);
    const res = await supabaseRemote.pull('o1', '700');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toContain('/rest/v1/rpc/sync_pull');
    expect(calls[0]!.body).toEqual({ p_org: 'o1', p_since: '700' });
    expect(res.cursor).toBe('812');
    expect(res.tables.customers).toEqual([{ id: 'c1' }]);
    expect(res.tables).not.toHaveProperty('cursor');
  });
});
