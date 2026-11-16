import { describe, expect, it } from 'vitest';
import { bookkeeping, monthsIn, periodOf, shiftPeriod } from './books';

const job = { id: 'j1', org_id: 'o', number: 'E-1001', client: { firstName: 'Dana', lastName: 'Smith' }, trees: [], equipment: [], change_orders: [], days: 2, site: {}, deleted_at: null } as never;
const inv = (o: object) => ({ id: 'i1', org_id: 'o', job_id: 'j1', number: 'INV-1001', status: 'sent', issue_date: '2026-11-05', due_date: '2026-11-20',
  lines: [{ id: 'l', desc: 'Work', qty: 2, unit: 2000, taxable: true }], tax_rate: 6, notes: '', internal_notes: '', sent_at: 'x', voided_at: null, deleted_at: null, ...o }) as never;
const pay = (o: object) => ({ id: Math.random().toString(), org_id: 'o', job_id: 'j1', invoice_id: null, amount: 1000, method: 'check', reference: '2187', received_on: '2026-11-08', note: '', recorded_by_name: '', voided_at: null, deleted_at: null, ...o }) as never;
const exp = (o: object) => ({ id: Math.random().toString(), org_id: 'o', spent_on: '2026-11-03', vendor: 'Marathon', amount: 64.2, category: 'Fuel', paid_with: 'card', job_id: 'j1', note: '', entered_by: null, entered_by_name: 'Sam', deleted_at: null, ...o }) as never;
const hrs = (o: object) => ({ id: Math.random().toString(), org_id: 'o', job_id: 'j1', work_date: '2026-11-04', hours: 27, note: '', entered_by: null, entered_by_name: 'Sam', deleted_at: null, ...o }) as never;

describe('bookkeeping periods', () => {
  it('works out months, quarters and years', () => {
    expect(periodOf('month', '2026-02-14')).toMatchObject({ from: '2026-02-01', to: '2026-02-28', label: 'February 2026' });
    expect(periodOf('quarter', '2026-11-15')).toMatchObject({ from: '2026-10-01', to: '2026-12-31', label: 'Q4 2026 (Oct–Dec)' });
    expect(periodOf('year', '2026-11-15')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(shiftPeriod(periodOf('quarter', '2026-01-10'), -1).label).toBe('Q4 2025 (Oct–Dec)');
    expect(monthsIn(periodOf('quarter', '2026-11-15'))).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});

describe('bookkeeping numbers', () => {
  const books = bookkeeping({
    period: periodOf('month', '2026-11-15'), today: '2026-11-15',
    jobs: [job], invoices: [inv({}), inv({ id: 'draft', status: 'draft', number: 'INV-1002' })],
    payments: [pay({}), pay({ amount: 500, received_on: '2026-10-30' }), pay({ amount: 99, voided_at: 'x' })],
    expenses: [exp({}), exp({ amount: 120, category: 'Dump fees', job_id: null, vendor: 'County' }), exp({ spent_on: '2026-12-01' })],
    timeEntries: [hrs({}), hrs({ hours: 9, work_date: '2026-11-05' })], pricings: [], photos: [],
  });
  it('counts only sent invoices issued in the period, pre-tax and tax apart', () => {
    expect(books.invoices.map((i) => i.number)).toEqual(['INV-1001']);
    expect(books.totals).toMatchObject({ billed: 4000, tax: 240 });
  });
  it('counts money that came in during the period, not voided checks', () => {
    expect(books.totals.collected).toBe(1000);
    expect(books.payments[0]).toMatchObject({ customer: 'Dana Smith', invoice: 'INV-1001', method: 'Check', reference: '2187' });
  });
  it('a deposit from before the period still counts toward what the invoice has been paid', () => {
    expect(books.invoices[0]).toMatchObject({ total: 4240, paid: 1500, balance: 2740 });
    expect(books.totals.owed).toBe(2740);
  });
  it('totals spending by category and money in minus money out', () => {
    expect(books.totals.spent).toBe(184.2);
    expect(books.categories).toEqual([['Dump fees', 120], ['Fuel', 64.2]]);
    expect(books.totals.net).toBe(815.8);
  });
  it('puts each job’s billed, costs and crew-hours side by side', () => {
    expect(books.totals.hours).toBe(36);
    expect(books.jobs).toEqual([{ job: 'E-1001', customer: 'Dana Smith', billed: 4000, costs: 128.4, hours: 36, perHour: 111.11 }]);
  });
});
