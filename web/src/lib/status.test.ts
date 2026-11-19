import { describe, expect, it } from 'vitest';
import { blankEvent } from './calendar';
import { jobHubNext, jobStage } from './status';
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

describe('jobHubNext', () => {
  const base = { invoice: null as Invoice | null, depositAsked: 0, paid: 0 };

  it('leads with Schedule when signed and not on the calendar', () => {
    expect(jobHubNext({ ...base, stage: 'approved' })?.kind).toBe('schedule');
    // Unpaid deposit does not beat Schedule.
    expect(jobHubNext({ ...base, stage: 'approved', depositAsked: 500 })?.kind).toBe('schedule');
  });

  it('collects an unpaid deposit once the job is scheduled, before Start', () => {
    expect(jobHubNext({ ...base, stage: 'scheduled', depositAsked: 500 })?.kind).toBe('record_deposit');
    expect(jobHubNext({ ...base, stage: 'scheduled', depositAsked: 500, paid: 500 })?.kind).toBe('start');
    expect(jobHubNext({ ...base, stage: 'scheduled' })?.kind).toBe('start');
  });

  it('mirrors board crew actions for in progress and blocked', () => {
    expect(jobHubNext({ ...base, stage: 'in_progress' })?.kind).toBe('mark_done');
    expect(jobHubNext({ ...base, stage: 'blocked' })?.kind).toBe('resume');
    // After Start, Mark done stays primary; unpaid deposit moves to More.
    expect(jobHubNext({ ...base, stage: 'in_progress', depositAsked: 200 })?.kind).toBe('mark_done');
  });

  it('invoices from Done, and sends a draft before calling it done money-wise', () => {
    expect(jobHubNext({ ...base, stage: 'done' })?.kind).toBe('create_invoice');
    expect(jobHubNext({ ...base, stage: 'done', invoice: inv({ status: 'draft' }) })?.kind).toBe('send_invoice');
    expect(jobHubNext({ ...base, stage: 'done', invoice: inv() })?.kind).toBe('open_invoice');
  });

  it('collects payment once invoiced or overdue', () => {
    expect(jobHubNext({ ...base, stage: 'invoiced', invoice: inv() })?.kind).toBe('record_payment');
    expect(jobHubNext({ ...base, stage: 'overdue', invoice: inv() })?.kind).toBe('record_payment');
  });

  it('has no Next when the job is finished or off', () => {
    expect(jobHubNext({ ...base, stage: 'paid', invoice: inv() })).toBeNull();
    expect(jobHubNext({ ...base, stage: 'cancelled' })).toBeNull();
  });

  it('does not make Create invoice the primary before Done', () => {
    for (const stage of ['approved', 'scheduled', 'in_progress', 'blocked'] as const) {
      expect(jobHubNext({ ...base, stage })?.kind).not.toBe('create_invoice');
    }
  });
});
