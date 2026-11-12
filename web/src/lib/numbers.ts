import type { LocalDb } from './localdb';

/**
 * Estimate numbers are handed out by the server in blocks, so devices can
 * number estimates with no signal and two devices never use the same number.
 * Each device keeps a small stock and tops it up whenever it's online.
 */
export type Reserve = (orgId: string, kind: 'estimate' | 'invoice', count: number) => Promise<number>;

interface Block {
  next: number;
  end: number; // exclusive
}

const BLOCK = 20;
const REFILL_BELOW = 8;
const key = (orgId: string, kind: string) => `numbers:${orgId}:${kind}`;

export class NoNumbersError extends Error {
  constructor() {
    super('Connect to the internet once so this device can get estimate numbers.');
  }
}

async function stock(db: LocalDb, orgId: string, kind: string): Promise<Block[]> {
  return ((await db.get('meta', key(orgId, kind))) as Block[] | undefined) ?? [];
}
const remaining = (blocks: Block[]) => blocks.reduce((n, b) => n + (b.end - b.next), 0);

const inflight = new Map<string, Promise<void>>();

/** Top up the stock if it's running low. Safe to call often (one top-up at a time); does nothing offline. */
export function refillNumbers(db: LocalDb, orgId: string, kind: 'estimate' | 'invoice', reserve: Reserve): Promise<void> {
  const k = `${db.name}:${key(orgId, kind)}`;
  const running = inflight.get(k);
  if (running) return running;
  const run = (async () => {
    const blocks = await stock(db, orgId, kind);
    if (remaining(blocks) >= REFILL_BELOW) return;
    const first = await reserve(orgId, kind, BLOCK);
    const next = [...(await stock(db, orgId, kind)), { next: first, end: first + BLOCK }].sort((a, b) => a.next - b.next);
    await db.put('meta', next, key(orgId, kind));
  })().finally(() => inflight.delete(k));
  inflight.set(k, run);
  return run;
}

/** Take the next number, e.g. "E-1021". Tries to refill first; works offline from stock. */
export async function takeNumber(db: LocalDb, orgId: string, kind: 'estimate' | 'invoice', reserve: Reserve): Promise<string> {
  await refillNumbers(db, orgId, kind, reserve).catch(() => undefined);
  const tx = db.transaction('meta', 'readwrite');
  const blocks = (((await tx.store.get(key(orgId, kind))) as Block[] | undefined) ?? []).filter((b) => b.next < b.end).sort((a, b) => a.next - b.next);
  const block = blocks[0];
  if (!block) {
    await tx.done;
    throw new NoNumbersError();
  }
  const n = block.next;
  block.next += 1;
  await tx.store.put(blocks.filter((b) => b.next < b.end), key(orgId, kind));
  await tx.done;
  return `${kind === 'estimate' ? 'E' : 'INV'}-${n}`;
}
