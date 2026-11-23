import { describe, expect, it } from 'vitest';
import { neededDocuments } from './documents';
import { blankJob, blankPricing } from './estimate';
import { invoiceFromJob } from './invoice';
import type { Invoice, Job, Organization, Payment } from './types';

const org = { id: 'o1' } as Organization;

function job(number: string, extra: Partial<Job> = {}): Job {
  return { ...blankJob({ org, number, preparedBy: '', contractorSig: '' }), ...extra };
}
function sentInvoice(j: Job, extra: Partial<Invoice> = {}): Invoice {
  const p = blankPricing(j, { day_rate: 1000, equipment_markup: 1.2, tax_rate: 0 } as never);
  return { ...invoiceFromJob(j, p, { number: 'INV-' + j.number, dueDays: 15, today: '2026-11-01' }), status: 'sent', sent_at: '2026-11-02T10:00:00Z', total: 1000, ...extra };
}
const pay = (jobId: string, amount: number, extra: Partial<Payment> = {}): Payment => ({
  id: `${jobId}-${amount}`, org_id: 'o1', job_id: jobId, invoice_id: null, amount, method: 'cash', reference: '', received_on: '2026-11-05',
  note: '', recorded_by_name: '', voided_at: null, deleted_at: null, ...extra,
});

describe('saved document copies', () => {
  it('needs nothing for an unsigned estimate', () => {
    expect(neededDocuments([job('E-1')], [], [], [], [])).toEqual([]);
  });

  it('files a signed estimate once, and again after a change order', () => {
    const j = job('E-2', { signed_at: '2026-10-01T12:00:00Z' });
    const first = neededDocuments([j], [], [], [], []);
    expect(first.map((d) => [d.kind, d.version_key])).toEqual([['estimate', '2026-10-01T12:00:00Z|co0']]);

    const saved = [{ job_id: j.id, kind: 'estimate', version_key: '2026-10-01T12:00:00Z|co0' }];
    expect(neededDocuments([j], [], [], [], saved)).toEqual([]);

    const withCo = { ...j, change_orders: [{ id: 'c', date: '', days: 1, reason: 'Extra tree', reason_other: '', trees: [], client_sig: 'x', client_sig_date: '', signed_by_name: '' }] };
    expect(neededDocuments([withCo], [], [], [], saved).map((d) => d.version_key)).toEqual(['2026-10-01T12:00:00Z|co1']);
  });

  it('files a sent invoice, but not a draft or a void one', () => {
    const j = job('E-3');
    expect(neededDocuments([j], [], [sentInvoice(j)], [], []).map((d) => d.kind)).toEqual(['invoice']);
    expect(neededDocuments([j], [], [sentInvoice(j, { status: 'draft', sent_at: null })], [], [])).toEqual([]);
    expect(neededDocuments([j], [], [sentInvoice(j, { status: 'void' })], [], [])).toEqual([]);
  });

  it('adds a receipt once the job is paid, keyed by what was paid', () => {
    const j = job('E-4', { stage: 'paid' });
    const inv = sentInvoice(j);
    const saved = [{ job_id: j.id, kind: 'invoice', version_key: inv.sent_at! }];
    const out = neededDocuments([j], [], [inv], [pay(j.id, 400), pay(j.id, 600, { received_on: '2026-11-09' }), pay(j.id, 50, { voided_at: '2026-11-06' })], saved);
    expect(out.map((d) => [d.kind, d.version_key])).toEqual([['receipt', 'paid|1000.00|2026-11-09']]);
  });

  it('skips deleted jobs', () => {
    expect(neededDocuments([job('E-5', { signed_at: '2026-10-01', deleted_at: '2026-10-02' })], [], [], [], [])).toEqual([]);
  });
});
