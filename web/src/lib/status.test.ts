import { describe, expect, it } from 'vitest';
import { blankEvent } from './calendar';
import { jobStage } from './status';
import type { Invoice, Payment } from './types';

const job = (o: Partial<{ signed_at: string | null; status: string; stage: string }> = {}) =>
  ({ id: 'j1', signed_at: null, status: 'pending', stage: 'estimate', ...o }) as never;
const work = blankEvent('o', { type: 'tree_work', job_id: 'j1', starts: '2026-11-16', ends: '2026-11-18' });
const inv = (o: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', org_id: 'o', job_id: 'j1', number: 'INV-1', status: 'sent', issue_date: '2026-11-01', due_date: '2026-11-10',
  lines: [{ id: 'l', desc: 'Work', qty: 1, unit: 1000, taxable: false }], tax_rate: 0, notes: '', internal_notes: '',
  sent_at: '2026-11-01', voided_at: null, deleted_at: null, ...o,
});
const pay = (amount: number): Payment => ({ id: 'p', org_id: 'o', job_id: 'j1', invoice_id: null, amount, method: 'cash', reference: '', received_on: '2026-11-02', note: '', recorded_by_name: '', voided_at: null, deleted_at: null } as Payment);

describe('jobStage', () => {
  it('follows signature, calendar and crew status', () => {
    expect(jobStage(job(), [])).toBe('new'); // a lead: no estimate written yet
    expect(jobStage({ ...(job() as object), trees: [{}] } as never, [])).toBe('pending'); // estimate written, waiting on the customer
    expect(jobStage(job({ signed_at: 'x', status: 'approved' }), [])).toBe('approved');
    expect(jobStage(job({ signed_at: 'x', status: 'approved' }), [work])).toBe('scheduled');
    expect(jobStage(job({ signed_at: 'x', status: 'blocked' }), [work])).toBe('blocked');
  });
  it('turns an invoiced job red once its invoice is overdue', () => {
    const j = job({ signed_at: 'x', status: 'done', stage: 'invoice' });
    expect(jobStage(j, [], [inv()], [], '2026-11-05')).toBe('invoiced');
    expect(jobStage(j, [], [inv()], [], '2026-11-14')).toBe('overdue');
    expect(jobStage(j, [], [inv()], [pay(1000)], '2026-11-14')).toBe('invoiced');
    expect(jobStage(j, [], [inv({ status: 'void' })], [], '2026-11-14')).toBe('invoiced');
  });
  it('paid wins', () => {
    expect(jobStage(job({ signed_at: 'x', stage: 'paid' }), [], [inv()], [], '2026-12-30')).toBe('paid');
  });
});
