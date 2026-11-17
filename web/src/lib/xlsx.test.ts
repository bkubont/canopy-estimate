import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { bookkeeping, periodOf } from './books';
import { bookkeepingFileName, bookkeepingXlsx } from './xlsx';

const books = bookkeeping({
  period: periodOf('month', '2026-11-15'), today: '2026-11-15',
  jobs: [{ id: 'j1', org_id: 'o', number: 'E-1001', client: { firstName: 'Dana', lastName: 'Smith' }, trees: [], equipment: [], change_orders: [], days: 2, site: {}, deleted_at: null } as never],
  invoices: [{ id: 'i1', org_id: 'o', job_id: 'j1', number: 'INV-1001', status: 'sent', issue_date: '2026-11-05', due_date: '2026-11-20', lines: [{ id: 'l', desc: 'Work', qty: 2, unit: 2000, taxable: true }], tax_rate: 6, notes: '', internal_notes: '', sent_at: 'x', voided_at: null, deleted_at: null } as never],
  payments: [{ id: 'p', org_id: 'o', job_id: 'j1', invoice_id: null, amount: 1000, method: 'check', reference: '2187', received_on: '2026-11-08', note: '', recorded_by_name: '', voided_at: null, deleted_at: null } as never],
  expenses: [{ id: 'e', org_id: 'o', spent_on: '2026-11-03', vendor: 'Marathon', amount: 64.2, category: 'Fuel', paid_with: 'card', job_id: 'j1', note: '', entered_by: null, entered_by_name: 'Sam', deleted_at: null } as never],
  timeEntries: [], pricings: [], photos: [],
});

describe('bookkeeping workbook', () => {
  it('is a real .xlsx with the six sheets, dates and dollar amounts', async () => {
    const blob = await bookkeepingXlsx(books, 'Advanced Tree Service', true);
    expect(blob.type).toContain('spreadsheetml');
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const workbook = strFromU8(files['xl/workbook.xml']!);
    for (const name of ['Summary', 'Payments received', 'Invoices', 'Expenses', 'Hours', 'Jobs']) expect(workbook).toContain(`name="${name}"`);
    const shared = strFromU8(files['xl/sharedStrings.xml'] ?? new Uint8Array());
    const all = Object.entries(files).filter(([k]) => k.startsWith('xl/worksheets/')).map(([, v]) => strFromU8(v)).join('') + shared;
    expect(all).toContain('Marathon');
    expect(all).toContain('INV-1001');
    expect(all).toContain('>4000<'); // billed before tax, as a number
    expect(all).toContain('>46334<'); // 11/08/2026 as an Excel date
    expect(strFromU8(files['xl/styles.xml']!)).toContain('[$$-409]#,##0.00');
  });
  it('leaves out the Hours sheet and columns while hours tracking is off', async () => {
    const files = unzipSync(new Uint8Array(await (await bookkeepingXlsx(books, 'Advanced Tree Service', false)).arrayBuffer()));
    expect(strFromU8(files['xl/workbook.xml']!)).not.toContain('name="Hours"');
    const shared = strFromU8(files['xl/sharedStrings.xml'] ?? new Uint8Array());
    expect(shared).not.toContain('Hours worked');
  });

  it('names the file after the company and period', () => {
    expect(bookkeepingFileName('Advanced Tree Service', books)).toBe('Advanced-Tree-Service_2026-11-01_to_2026-11-30.xlsx');
  });
});
