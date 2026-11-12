import { customerPricing, daysLabel, num, round2, todayYmd, addDays, totals } from './estimate';
import type { Invoice, InvoiceLine, Job, JobPricing, Payment } from './types';
import { uid } from './estimate';

/** Same math as the server (public.invoices_compute): round each line, tax only taxable lines. */
export function invoiceTotals(lines: InvoiceLine[], taxRate: number) {
  const amounts = lines.map((l) => round2(num(l.qty) * num(l.unit)));
  const subtotal = round2(amounts.reduce((s, a) => s + a, 0));
  const taxable = round2(lines.reduce((s, l, i) => s + (l.taxable ? amounts[i]! : 0), 0));
  const tax = round2((taxable * num(taxRate)) / 100);
  return { amounts, subtotal, tax, total: round2(subtotal + tax) };
}

/**
 * Start an invoice from a signed estimate: labor, each change order, equipment
 * at the customer's price, and other costs. Everything is editable until it's sent
 * (e.g. the job took 1½ days instead of 2).
 */
export function invoiceFromJob(job: Job, pricing: JobPricing, opts: { number: string; dueDays: number; today?: string }): Invoice {
  const cp = customerPricing(job, pricing);
  const t = totals(job, cp);
  const lines: InvoiceLine[] = [
    { id: uid(), desc: `Tree work — ${daysLabel(job.days)}`, qty: num(job.days), unit: cp.day_rate, taxable: true },
    ...job.change_orders.map((co, i) => ({
      id: uid(), desc: `Change order ${i + 1}${co.reason ? ` — ${co.reason === 'Other' && co.reason_other ? co.reason_other : co.reason}` : ''}`,
      qty: num(co.days), unit: cp.day_rate, taxable: true,
    })),
    ...t.lines.map((l) => ({ id: uid(), desc: l.desc || 'Equipment', qty: l.qty, unit: l.unit, taxable: true })),
    ...(t.additional ? [{ id: uid(), desc: 'Other costs', qty: 1, unit: t.additional, taxable: false }] : []),
  ];
  const issue = opts.today ?? todayYmd();
  return {
    id: uid(), org_id: job.org_id, job_id: job.id, number: opts.number, status: 'draft',
    issue_date: issue, due_date: addDays(issue, opts.dueDays), lines, tax_rate: cp.tax_rate,
    notes: 'Thank you for your business!', internal_notes: '', sent_at: null, voided_at: null, deleted_at: null,
  };
}

export const livePayments = (payments: Payment[], jobId: string) =>
  payments.filter((p) => p.job_id === jobId && !p.voided_at && !p.deleted_at);

export const paidForJob = (payments: Payment[], jobId: string) => round2(livePayments(payments, jobId).reduce((s, p) => s + num(p.amount), 0));

export type InvoiceStatus = 'draft' | 'unpaid' | 'partial' | 'paid' | 'overdue' | 'void';
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft', unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Paid', overdue: 'Overdue', void: 'Void',
};

export function invoiceStatus(inv: Invoice, paid: number, today = todayYmd()): InvoiceStatus {
  if (inv.status === 'void') return 'void';
  if (inv.status === 'draft') return 'draft';
  const { total } = invoiceTotals(inv.lines, inv.tax_rate);
  if (paid >= total) return 'paid';
  if (inv.due_date < today) return 'overdue';
  return paid > 0 ? 'partial' : 'unpaid';
}

export const balanceDue = (inv: Invoice, paid: number) => Math.max(0, round2(invoiceTotals(inv.lines, inv.tax_rate).total - paid));

export const METHOD_LABEL: Record<Payment['method'], string> = { cash: 'Cash', check: 'Check', card: 'Card', other: 'Other' };
