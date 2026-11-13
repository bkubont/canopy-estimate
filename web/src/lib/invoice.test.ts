import { describe, expect, it } from 'vitest';
import { blankJob, blankPricing, customerPricing, totals } from './estimate';
import { balanceDue, invoiceFromJob, invoiceStatus, invoiceTotals, paidForJob } from './invoice';
import type { Organization, Payment } from './types';

function signedJob() {
  const job = blankJob({ org: { id: 'o1' } as Organization, number: 'E-1001', preparedBy: '', contractorSig: '' });
  job.days = 2;
  job.equipment = [{ id: 'l1', desc: 'Stump grinder', qty: 2, qty_manual: false }];
  job.change_orders = [{ id: 'c', date: '', days: 1, reason: 'Weather delay', reason_other: '', trees: [], client_sig: 'x', client_sig_date: '', signed_by_name: '' }];
  const p = blankPricing(job, { day_rate: 2000, equipment_markup: 1.2, tax_rate: 6 } as never);
  p.equipment_costs = { l1: 285 };
  p.additional = 100;
  return { job, p };
}
const pay = (amount: number, extra: Partial<Payment> = {}): Payment => ({
  id: String(amount), org_id: 'o1', job_id: 'j', invoice_id: null, amount, method: 'cash', reference: '', received_on: '2026-11-12',
  note: '', recorded_by_name: '', voided_at: null, deleted_at: null, ...extra,
});

describe('invoices', () => {
  it('starts from the signed estimate with the same total', () => {
    const { job, p } = signedJob();
    const inv = invoiceFromJob(job, p, { number: 'INV-1001', dueDays: 15, today: '2026-11-12' });
    expect(inv.lines.map((l) => l.desc)).toEqual(['Tree work — 2 days', 'Change order 1 — Weather delay', 'Stump grinder', 'Other costs']);
    expect(invoiceTotals(inv.lines, inv.tax_rate).total).toBe(totals(job, customerPricing(job, p)).total);
    expect(inv.due_date).toBe('2026-11-27');
  });

  it('matches the server: tax only on taxable lines, rounded per line', () => {
    const lines = [
      { id: 'a', desc: 'Labor', qty: 2, unit: 2000, taxable: true },
      { id: 'b', desc: 'Grinder', qty: 2, unit: 342, taxable: true },
      { id: 'c', desc: 'Travel', qty: 1, unit: 100, taxable: false },
    ];
    expect(invoiceTotals(lines, 6)).toMatchObject({ subtotal: 4784, tax: 281.04, total: 5065.04 });
  });

  it('never carries rental cost or markup onto the invoice', () => {
    const { job, p } = signedJob();
    const inv = invoiceFromJob(job, p, { number: 'INV-1', dueDays: 15 });
    expect(JSON.stringify(inv)).not.toMatch(/285|markup/);
  });

  it('counts deposits and payments, ignoring voided ones', () => {
    const payments = [pay(500), pay(100, { voided_at: 'x' }), pay(50, { job_id: 'other' })];
    expect(paidForJob(payments, 'j')).toBe(500);
  });

  it('works out the status', () => {
    const { job, p } = signedJob();
    const inv = { ...invoiceFromJob(job, p, { number: 'INV-1', dueDays: 15, today: '2026-11-12' }), status: 'sent' as const };
    const total = invoiceTotals(inv.lines, inv.tax_rate).total;
    expect(invoiceStatus({ ...inv, status: 'draft' }, 0, '2026-11-12')).toBe('draft');
    expect(invoiceStatus(inv, 0, '2026-11-12')).toBe('unpaid');
    expect(invoiceStatus(inv, 500, '2026-11-12')).toBe('partial');
    expect(invoiceStatus(inv, 500, '2026-12-01')).toBe('overdue');
    expect(invoiceStatus(inv, total, '2026-12-01')).toBe('paid');
    expect(invoiceStatus({ ...inv, status: 'void' }, 0)).toBe('void');
    expect(balanceDue(inv, 500)).toBe(total - 500);
    expect(balanceDue(inv, total + 10)).toBe(0);
  });
});
