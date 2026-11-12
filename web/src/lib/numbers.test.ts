import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openLocalDb } from './localdb';
import { NoNumbersError, takeNumber, type Reserve } from './numbers';

let n = 0;
const db = () => openLocalDb(`numbers-${++n}`);

function server() {
  let next = 1001;
  let online = true;
  const reserve: Reserve = async (_org, _kind, count) => {
    if (!online) throw new Error('offline');
    const first = next;
    next += count;
    return first;
  };
  return { reserve, setOnline: (v: boolean) => (online = v) };
}

describe('estimate numbers', () => {
  it('two devices never hand out the same number', async () => {
    const s = server();
    const a = await db();
    const b = await db();
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      seen.add(await takeNumber(a, 'o1', 'estimate', s.reserve));
      seen.add(await takeNumber(b, 'o1', 'estimate', s.reserve));
    }
    expect(seen.size).toBe(60);
  });

  it('keeps numbering offline from its stock, then explains when it runs out', async () => {
    const s = server();
    const a = await db();
    expect(await takeNumber(a, 'o1', 'estimate', s.reserve)).toBe('E-1001');
    s.setOnline(false);
    const offline: string[] = [];
    for (let i = 0; i < 19; i++) offline.push(await takeNumber(a, 'o1', 'estimate', s.reserve));
    expect(offline.at(-1)).toBe('E-1020');
    await expect(takeNumber(a, 'o1', 'estimate', s.reserve)).rejects.toBeInstanceOf(NoNumbersError);
  });

  it('starts at the lowest number even when several top-ups race', async () => {
    const s = server();
    const a = await db();
    await Promise.all([1, 2, 3].map(() => takeNumber(a, 'o1', 'estimate', s.reserve)));
    expect(await takeNumber(a, 'o1', 'estimate', s.reserve)).toBe('E-1004');
  });

  it('numbers go up in order on one device', async () => {
    const s = server();
    const a = await db();
    const got = [];
    for (let i = 0; i < 25; i++) got.push(await takeNumber(a, 'o1', 'estimate', s.reserve));
    expect(got.slice(0, 3)).toEqual(['E-1001', 'E-1002', 'E-1003']);
    expect(new Set(got).size).toBe(25);
  });
});
