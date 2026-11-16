import { addDays, clientName, customerPricing, normalizeJob, round2, totals } from './estimate';
import { byCategory, total } from './expenses';
import { invoiceStatus, invoiceTotals, METHOD_LABEL, paidForJob, type InvoiceStatus } from './invoice';
import type { Expense, Invoice, Job, JobPricing, Payment, Photo, TimeEntry } from './types';

/**
 * Simple bookkeeping for the owner's own records: money billed, money that
 * came in, money that went out, and crew-hours, for a month, quarter or year.
 * "Money in minus money out" is cash in hand (payments received − expenses),
 * not an accountant's profit.
 */
export type PeriodKind = 'month' | 'quarter' | 'year';
export interface Period { kind: PeriodKind; from: string; to: string; label: string }

const monthName = (ym: string, style: 'long' | 'short' = 'long') => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-US', { month: style, timeZone: 'UTC' });

export function periodOf(kind: PeriodKind, anchor: string): Period {
  const y = Number(anchor.slice(0, 4));
  const m = Number(anchor.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (kind === 'year') return { kind, from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  if (kind === 'quarter') {
    const q = Math.floor((m - 1) / 3);
    const m1 = q * 3 + 1;
    return { kind, from: `${y}-${pad(m1)}-01`, to: `${y}-${pad(m1 + 2)}-${lastDay(y, m1 + 2)}`, label: `Q${q + 1} ${y} (${monthName(`${y}-${pad(m1)}`, 'short')}–${monthName(`${y}-${pad(m1 + 2)}`, 'short')})` };
  }
  return { kind, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}`, label: `${monthName(`${y}-${pad(m)}`)} ${y}` };
}

/** The period before or after this one. */
export function shiftPeriod(p: Period, dir: number): Period {
  const anchor = dir < 0 ? addDays(p.from, -1) : addDays(p.to, 1);
  return periodOf(p.kind, anchor);
}

export const monthsIn = (p: Period) => {
  const out: string[] = [];
  for (let d = p.from; d <= p.to; d = addDays(`${d.slice(0, 7)}-28`, 4).slice(0, 7) + '-01') out.push(d.slice(0, 7));
  return out;
};

const live = <T extends { deleted_at?: string | null }>(rows: T[] | null | undefined) => (rows ?? []).filter((r) => !r.deleted_at);
const inPeriod = (ymd: string | null | undefined, p: Period) => !!ymd && ymd.slice(0, 10) >= p.from && ymd.slice(0, 10) <= p.to;

export interface Books {
  period: Period;
  months: { ym: string; label: string; billed: number; tax: number; collected: number; spent: number; net: number; hours: number }[];
  totals: { billed: number; tax: number; collected: number; spent: number; net: number; hours: number; owed: number };
  categories: [string, number][];
  payments: { date: string; customer: string; job: string; invoice: string; method: string; reference: string; amount: number }[];
  invoices: { number: string; issued: string; due: string; customer: string; job: string; subtotal: number; tax: number; total: number; paid: number; balance: number; status: InvoiceStatus }[];
  expenses: { date: string; vendor: string; category: string; paidWith: string; job: string; note: string; amount: number; receipt: boolean; by: string }[];
  hours: { date: string; job: string; customer: string; hours: number; by: string; note: string }[];
  jobs: { job: string; customer: string; billed: number; costs: number; hours: number; perHour: number | null }[];
}

export function bookkeeping(input: {
  period: Period; jobs: Job[] | null; invoices: Invoice[] | null; payments: Payment[] | null; expenses: Expense[] | null;
  timeEntries: TimeEntry[] | null; pricings: JobPricing[] | null; photos: Photo[] | null; today?: string;
}): Books {
  const { period } = input;
  const jobs = new Map(live(input.jobs).map((j) => [j.id, normalizeJob(j)]));
  const jobLabel = (id: string | null | undefined) => (id && jobs.get(id)?.number) || '';
  const customer = (id: string | null | undefined) => (id && jobs.get(id) ? clientName(jobs.get(id)!.client) : '');
  const allPayments = live(input.payments).filter((p) => !p.voided_at);

  const invoices = live(input.invoices).filter((i) => i.status === 'sent' && inPeriod(i.issue_date, period)).map((i) => {
    const t = invoiceTotals(i.lines, i.tax_rate);
    const paid = paidForJob(allPayments, i.job_id);
    return {
      number: i.number, issued: i.issue_date, due: i.due_date, customer: customer(i.job_id), job: jobLabel(i.job_id),
      subtotal: t.subtotal, tax: t.tax, total: t.total, paid: Math.min(paid, t.total), balance: round2(Math.max(0, t.total - paid)),
      status: invoiceStatus(i, paid, input.today),
    };
  }).sort((a, b) => a.issued.localeCompare(b.issued) || a.number.localeCompare(b.number));

  const payments = allPayments.filter((p) => inPeriod(p.received_on, period)).map((p) => ({
    date: p.received_on, customer: customer(p.job_id), job: jobLabel(p.job_id),
    invoice: live(input.invoices).find((i) => i.job_id === p.job_id && i.status !== 'void')?.number ?? 'Deposit',
    method: METHOD_LABEL[p.method] ?? p.method, reference: p.reference, amount: Number(p.amount),
  })).sort((a, b) => a.date.localeCompare(b.date));

  const withReceipt = new Set(live(input.photos).filter((p) => p.kind === 'receipt').map((p) => p.expense_id));
  const spentRows = live(input.expenses).filter((e) => inPeriod(e.spent_on, period));
  const expenses = spentRows.map((e) => ({
    date: e.spent_on, vendor: e.vendor, category: e.category || 'Other', paidWith: e.paid_with, job: e.job_id ? `${jobLabel(e.job_id)} ${customer(e.job_id)}`.trim() : '',
    note: e.note, amount: Number(e.amount), receipt: withReceipt.has(e.id), by: e.entered_by_name,
  })).sort((a, b) => a.date.localeCompare(b.date));

  const hourRows = live(input.timeEntries).filter((h) => inPeriod(h.work_date, period));
  const hours = hourRows.map((h) => ({ date: h.work_date, job: jobLabel(h.job_id), customer: customer(h.job_id), hours: Number(h.hours), by: h.entered_by_name, note: h.note }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const months = monthsIn(period).map((ym) => {
    const inv = invoices.filter((i) => i.issued.startsWith(ym));
    const billed = round2(inv.reduce((s, i) => s + i.subtotal, 0));
    const tax = round2(inv.reduce((s, i) => s + i.tax, 0));
    const collected = total(payments.filter((p) => p.date.startsWith(ym)));
    const spent = total(expenses.filter((e) => e.date.startsWith(ym)));
    const hrs = round2(hours.filter((h) => h.date.startsWith(ym)).reduce((s, h) => s + h.hours, 0));
    return { ym, label: `${monthName(ym)} ${ym.slice(0, 4)}`, billed, tax, collected, spent, net: round2(collected - spent), hours: hrs };
  });
  const sum = (k: 'billed' | 'tax' | 'collected' | 'spent' | 'net' | 'hours') => round2(months.reduce((s, m) => s + m[k], 0));

  // Every job that billed, spent or worked in the period.
  const jobIds = new Set([
    ...live(input.invoices).filter((i) => i.status === 'sent' && inPeriod(i.issue_date, period)).map((i) => i.job_id),
    ...spentRows.map((e) => e.job_id).filter(Boolean) as string[],
    ...hourRows.map((h) => h.job_id),
  ]);
  const jobRows = [...jobIds].filter((id) => jobs.has(id)).map((id) => {
    const inv = live(input.invoices).find((i) => i.job_id === id && i.status === 'sent');
    const pricing = live(input.pricings).find((p) => p.job_id === id);
    // Pre-tax, like the invoice: the invoice if there is one, otherwise the signed estimate.
    const billed = inv ? invoiceTotals(inv.lines, inv.tax_rate).subtotal : pricing ? totals(jobs.get(id)!, customerPricing(jobs.get(id)!, pricing)).subtotal : 0;
    const costs = total(live(input.expenses).filter((e) => e.job_id === id));
    const hrs = round2(live(input.timeEntries).filter((h) => h.job_id === id).reduce((s, h) => s + Number(h.hours), 0));
    return { job: jobLabel(id), customer: customer(id), billed, costs, hours: hrs, perHour: hrs > 0 ? round2(billed / hrs) : null };
  }).sort((a, b) => a.job.localeCompare(b.job));

  return {
    period, months, invoices, payments, expenses, hours, jobs: jobRows,
    categories: byCategory(spentRows),
    totals: { billed: sum('billed'), tax: sum('tax'), collected: sum('collected'), spent: sum('spent'), net: sum('net'), hours: sum('hours'), owed: round2(invoices.reduce((s, i) => s + i.balance, 0)) },
  };
}
