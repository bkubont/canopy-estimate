import type { Job } from './types';

/**
 * Work-order notes: the team's internal notes on a job that's been signed but
 * not invoiced yet. They live in the job's existing internal notes (crew can
 * already edit those), one note per paragraph, plus the per-tree notes written
 * while estimating. Nothing here is ever printed or sent to the customer.
 */
export type Note = { text: string; by: string; when: string };
export type TreeNote = { tree: string; text: string };

const SIG = /\n— (.+?) · (.+)$/; // "…\n— Joey · Nov 15"

export const isWorkOrder = (job: Pick<Job, 'signed_at' | 'stage'>) =>
  !!job.signed_at && job.stage !== 'invoice' && job.stage !== 'paid' && job.stage !== 'archived';

export function parseNotes(text: string | null | undefined): Note[] {
  return (text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(SIG);
    return m ? { text: p.slice(0, m.index).trim(), by: m[1]!, when: m[2]! } : { text: p, by: '', when: '' };
  });
}

export const formatNotes = (notes: Note[]) =>
  notes.map((n) => (n.by ? `${n.text}\n— ${n.by} · ${n.when}` : n.text)).join('\n\n');

export function addNote(text: string | null | undefined, note: string, by: string, when: string) {
  return formatNotes([...parseNotes(text), { text: note.trim(), by: by.trim() || 'Someone', when }]);
}

export function removeNote(text: string | null | undefined, index: number) {
  return formatNotes(parseNotes(text).filter((_, i) => i !== index));
}

export function treeNotes(job: Pick<Job, 'trees' | 'change_orders'>): TreeNote[] {
  const trees = [...(job.trees ?? []), ...(job.change_orders ?? []).flatMap((c) => c.trees ?? [])];
  return trees.filter((t) => t.internal_notes?.trim()).map((t) => ({ tree: [t.qty > 1 ? `${t.qty} ×` : '', t.species || 'Tree'].filter(Boolean).join(' '), text: t.internal_notes.trim() }));
}

/** How many notes the badge shows, and the first line to show on a card. */
export function noteSummary(job: Pick<Job, 'internal_notes' | 'trees' | 'change_orders'>) {
  const notes = parseNotes(job.internal_notes);
  const trees = treeNotes(job);
  const first = notes[0]?.text ?? (trees[0] ? `${trees[0].tree}: ${trees[0].text}` : '');
  return { count: notes.length + trees.length, first: first.split('\n')[0] ?? '' };
}
