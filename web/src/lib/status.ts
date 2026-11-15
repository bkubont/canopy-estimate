import { boardColumn } from './calendar';
import { invoiceStatus, paidForJob } from './invoice';
import type { CalEvent, Invoice, Job, Payment } from './types';

/**
 * One color per stage, used everywhere a job appears (lists, board, calendar,
 * dashboard). Red only ever means a problem: Blocked or Overdue.
 */
export type Stage = 'pending' | 'approved' | 'scheduled' | 'in_progress' | 'blocked' | 'done' | 'invoiced' | 'overdue' | 'paid';

export const STAGE_LABEL: Record<Stage, string> = {
  pending: 'Pending', approved: 'Approved', scheduled: 'Scheduled', in_progress: 'In progress', blocked: 'Blocked',
  done: 'Done', invoiced: 'Invoiced', overdue: 'Overdue', paid: 'Paid',
};

/** What each stage asks of you, for the dashboard and tooltips. */
export const STAGE_MEANS: Record<Stage, string> = {
  pending: 'Waiting on the customer', approved: 'Needs scheduling', scheduled: 'On the calendar', in_progress: 'Crew is on it',
  blocked: 'Problem', done: 'Needs an invoice', invoiced: 'Waiting on payment', overdue: 'Payment is late', paid: 'Finished',
};

/** The job's live (not void) invoice, if any. */
export const liveInvoice = (invoices: Invoice[] | null | undefined, jobId: string) =>
  (invoices ?? []).find((i) => i.job_id === jobId && i.status !== 'void' && !i.deleted_at) ?? null;

/**
 * The stage of a job. Crew never receive invoices or payments, so for them an
 * invoiced job simply shows as Invoiced (from the job's own stage) and never Overdue.
 */
export function jobStage(
  job: Pick<Job, 'id' | 'signed_at' | 'status' | 'stage'>,
  events: CalEvent[],
  invoices?: Invoice[] | null,
  payments?: Payment[] | null,
  today?: string,
): Stage {
  const col = boardColumn(job, events);
  if (col === 'invoiced') {
    const inv = liveInvoice(invoices, job.id);
    if (inv && invoiceStatus(inv, paidForJob(payments ?? [], job.id), today) === 'overdue') return 'overdue';
  }
  return col;
}

/** Invoice statuses mapped onto the same colors. */
export const INVOICE_STAGE: Record<string, Stage | 'neutral'> = {
  draft: 'neutral', unpaid: 'invoiced', partial: 'invoiced', overdue: 'overdue', paid: 'paid', void: 'neutral',
};
