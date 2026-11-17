import type { Books } from './books';
import { HOURS_ENABLED } from './features';
import { INVOICE_STATUS_LABEL } from './invoice';

/**
 * The bookkeeping workbook: a Summary sheet, then one sheet per list, with real
 * dates and dollar amounts so sorting and sums work in Excel or Google Sheets.
 */
type Cell = { value?: string | number | Date | null; format?: string; fontWeight?: 'bold'; type?: unknown; align?: 'right' } | null;
const USD = '[$$-409]#,##0.00';
const head = (...titles: string[]): Cell[] => titles.map((t) => ({ value: t, fontWeight: 'bold' }));
const money = (n: number | null | undefined): Cell => (n == null ? null : { value: Math.round(n * 100) / 100, format: USD });
const date = (ymd: string): Cell => (ymd ? { value: new Date(`${ymd.slice(0, 10)}T00:00:00Z`), format: 'mm/dd/yyyy' } : null);
const text = (s: string | null | undefined): Cell => ({ value: s ?? '' });
const num = (n: number): Cell => ({ value: n, format: '0.##' });
const bold = (s: string): Cell => ({ value: s, fontWeight: 'bold' });

/** `hours` adds the hours columns and sheet; off while hours tracking is switched off. */
export function workbookSheets(b: Books, company: string, hours = HOURS_ENABLED) {
  const h = <T,>(...cells: T[]) => (hours ? cells : []);
  const summary: Cell[][] = [
    [bold(`${company} — bookkeeping`)],
    [text(b.period.label)],
    [text(`${b.period.from} to ${b.period.to}`)],
    [],
    head('Month', 'Billed (before tax)', 'Sales tax on invoices', 'Money in (payments)', 'Money out (expenses)', 'Money in minus out', ...h('Hours worked')),
    ...b.months.map((m) => [text(m.label), money(m.billed), money(m.tax), money(m.collected), money(m.spent), money(m.net), ...h(num(m.hours))]),
    [bold('Total'), money(b.totals.billed), money(b.totals.tax), money(b.totals.collected), money(b.totals.spent), money(b.totals.net), ...h(num(b.totals.hours))],
    [],
    [bold('Still owed on these invoices'), money(b.totals.owed)],
    [],
    head('Expenses by category', 'Amount'),
    ...b.categories.map(([c, a]) => [text(c), money(a)]),
    [],
    [text('“Money in minus out” is payments received minus expenses: cash in hand, not an accountant’s profit.')],
  ];
  const sheets = [
    { sheet: 'Summary', data: summary, columns: [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, ...h({ width: 11 })] },
    {
      sheet: 'Payments received', columns: [{ width: 12 }, { width: 24 }, { width: 10 }, { width: 11 }, { width: 9 }, { width: 14 }, { width: 13 }],
      data: [head('Date', 'Customer', 'Job', 'Invoice', 'Method', 'Check # / ref.', 'Amount'),
        ...b.payments.map((p) => [date(p.date), text(p.customer), text(p.job), text(p.invoice), text(p.method), text(p.reference), money(p.amount)])],
    },
    {
      sheet: 'Invoices', columns: [{ width: 11 }, { width: 12 }, { width: 12 }, { width: 24 }, { width: 10 }, { width: 13 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 11 }],
      data: [head('Invoice', 'Issued', 'Due', 'Customer', 'Job', 'Before tax', 'Tax', 'Total', 'Paid', 'Balance', 'Status'),
        ...b.invoices.map((i) => [text(i.number), date(i.issued), date(i.due), text(i.customer), text(i.job), money(i.subtotal), money(i.tax), money(i.total), money(i.paid), money(i.balance), text(INVOICE_STATUS_LABEL[i.status])])],
    },
    {
      sheet: 'Expenses', columns: [{ width: 12 }, { width: 22 }, { width: 20 }, { width: 9 }, { width: 24 }, { width: 24 }, { width: 13 }, { width: 9 }, { width: 14 }],
      data: [head('Date', 'Vendor', 'Category', 'Paid with', 'Job', 'Note', 'Amount', 'Receipt', 'Added by'),
        ...b.expenses.map((e) => [date(e.date), text(e.vendor), text(e.category), text(e.paidWith), text(e.job), text(e.note), money(e.amount), text(e.receipt ? 'Yes' : ''), text(e.by)])],
    },
    ...h({
      sheet: 'Hours', columns: [{ width: 12 }, { width: 10 }, { width: 24 }, { width: 11 }, { width: 14 }, { width: 40 }],
      data: [head('Date', 'Job', 'Customer', 'Hours worked', 'Entered by', 'Note'),
        ...b.hours.map((h) => [date(h.date), text(h.job), text(h.customer), num(h.hours), text(h.by), text(h.note)])],
    }),
    {
      sheet: 'Jobs', columns: [{ width: 10 }, { width: 24 }, { width: 16 }, { width: 14 }, ...h({ width: 11 }, { width: 18 })],
      data: [head('Job', 'Customer', 'Billed (before tax)', 'Job costs', ...h('Hours worked', 'Earned per hour worked')),
        ...b.jobs.map((j) => [text(j.job), text(j.customer), money(j.billed), money(j.costs), ...h(num(j.hours), money(j.perHour))])],
    },
  ];
  return sheets;
}

export async function bookkeepingXlsx(b: Books, company: string, hours = HOURS_ENABLED): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const sheets = workbookSheets(b, company, hours).map((s) => ({ ...s, stickyRowsCount: s.sheet === 'Summary' ? 0 : 1 }));
  const blob = await (writeExcelFile as unknown as (sheets: unknown) => { toBlob(): Promise<Blob> })(sheets).toBlob();
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const bookkeepingFileName = (company: string, b: Books) =>
  `${(company || 'Bookkeeping').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}_${b.period.from}_to_${b.period.to}.xlsx`;
