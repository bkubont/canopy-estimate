import { describe, expect, it } from 'vitest';
import { addNote, isWorkOrder, noteSummary, parseNotes, removeNote } from './notes';

describe('work-order notes', () => {
  it('only exist between signing and invoicing', () => {
    expect(isWorkOrder({ signed_at: null, stage: 'estimate' })).toBe(false);
    expect(isWorkOrder({ signed_at: 'x', stage: 'estimate' })).toBe(true);
    expect(isWorkOrder({ signed_at: 'x', stage: 'work_order' })).toBe(true);
    expect(isWorkOrder({ signed_at: 'x', stage: 'invoice' })).toBe(false);
    expect(isWorkOrder({ signed_at: 'x', stage: 'paid' })).toBe(false);
  });

  it('keeps notes written while estimating and adds signed notes after them', () => {
    let t = 'Gate code 4471';
    t = addNote(t, 'Dog in the yard,\nkeep gate shut', 'Sam', 'Nov 15');
    expect(parseNotes(t)).toEqual([
      { text: 'Gate code 4471', by: '', when: '' },
      { text: 'Dog in the yard,\nkeep gate shut', by: 'Sam', when: 'Nov 15' },
    ]);
    expect(parseNotes(removeNote(t, 0))).toEqual([{ text: 'Dog in the yard,\nkeep gate shut', by: 'Sam', when: 'Nov 15' }]);
  });

  it('counts job notes and tree notes for the badge', () => {
    const job = {
      internal_notes: 'Septic field on east side\n— Joey · Nov 14',
      trees: [{ species: 'Ash', qty: 2, internal_notes: 'Leaning on the garage' }, { species: 'Oak', qty: 1, internal_notes: '' }],
      change_orders: [],
    } as never;
    expect(noteSummary(job)).toEqual({ count: 2, first: 'Septic field on east side' });
    expect(noteSummary({ internal_notes: '', trees: [], change_orders: [] } as never).count).toBe(0);
  });
});
