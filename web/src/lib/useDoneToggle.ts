import { useEffect, useState } from 'react';
import type { SyncEngine } from './sync';
import type { CalEvent } from './types';

/**
 * Check a calendar entry off (or back on). The tick shows at once, before the
 * save comes back, so the box never flickers back to its old state.
 */
export function useDoneToggle(engine: SyncEngine, events: CalEvent[] | null) {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setPending((p) => {
      const left = Object.fromEntries(Object.entries(p).filter(([id, v]) => (events ?? []).find((e) => e.id === id)?.status === 'completed' !== v));
      return Object.keys(left).length === Object.keys(p).length ? p : left;
    });
  }, [events]);
  const isDone = (e: CalEvent) => pending[e.id] ?? e.status === 'completed';
  const toggle = (e: CalEvent) => {
    const next = !isDone(e);
    setPending((p) => ({ ...p, [e.id]: next }));
    void engine.save('events', { ...e, status: next ? 'completed' : 'confirmed' });
  };
  return { isDone, toggle };
}
