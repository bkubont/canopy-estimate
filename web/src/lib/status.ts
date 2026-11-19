import { boardColumn } from './calendar';
import { invoiceStatus, paidForJob } from './invoice';
import type { CalEvent, Invoice, Job, Payment } from './types';

/**
 * One color per stage, used everywhere a job appears (lists, board, calendar,
 * dashboard). Red only ever means a problem: Blocked or Overdue.
 */
export type Stage = 'cancelled' | 'new' | 'pending' | 'approved' | 'scheduled' | 'in_progress' | 'blocked' | 'done' | 'invoiced' | 'overdue' | 'paid';

export const STAGE_LABEL: Record<Stage, string> = {
  cancelled: 'Cancelled', new: 'New', pending: 'Pending', approved: 'Approved', scheduled: 'Scheduled', in_progress: 'In progress', blocked: 'Blocked',
  done: 'Done', invoiced: 'Invoiced', overdue: 'Overdue', paid: 'Paid',
};

/** What each stage asks of you, for the dashboard and tooltips. */
export const STAGE_MEANS: Record<Stage, string> = {
  cancelled: 'Off: the customer said no', new: 'Needs a visit', pending: 'Waiting on the customer', approved: 'Needs scheduling', scheduled: 'On the calendar', in_progress: 'Crew is on it',
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
  job: Pick<Job, 'id' | 'signed_at' | 'status' | 'stage'> & { trees?: unknown[] | null; cancelled_at?: string | null },
  events: CalEvent[],
  invoices?: Invoice[] | null,
  payments?: Payment[] | null,
  today?: string,
): Stage {
  if (job.cancelled_at) return 'cancelled';
  const col = boardColumn(job, events);
  // A lead: nobody has written the estimate yet (no trees), so it needs a visit.
  if (col === 'pending' && !(job.trees ?? []).length) return 'new';
  // When the open draft still has stage "invoice", a just-recorded final payment
  // should flip the hub to Paid from live invoice + payments without a reload.
  if (col === 'invoiced') {
    const inv = liveInvoice(invoices, job.id);
    if (inv) {
      const st = invoiceStatus(inv, paidForJob(payments ?? [], job.id), today);
      if (st === 'paid') return 'paid';
      if (st === 'overdue') return 'overdue';
    }
  }
  return col;
}

/** Invoice statuses mapped onto the same colors. */
export const INVOICE_STAGE: Record<string, Stage | 'neutral'> = {
  draft: 'neutral', unpaid: 'invoiced', partial: 'invoiced', overdue: 'overdue', paid: 'paid', void: 'neutral',
};

/**
 * The one primary Next action for the signed Job hub. Mirrors the Jobs board
 * (Schedule → Start → Mark done → Create/Send invoice → Record payment), with
 * unpaid deposit as Next only after the job is on the calendar — never ahead of Schedule.
 */
export type JobHubNextKind =
  | 'schedule'
  | 'start'
  | 'mark_done'
  | 'resume'
  | 'create_invoice'
  | 'send_invoice'
  | 'open_invoice'
  | 'record_payment'
  | 'record_deposit';

export type JobHubNext = { kind: JobHubNextKind; label: string };

const NEXT_LABEL: Record<JobHubNextKind, string> = {
  schedule: 'Schedule',
  start: 'Start',
  mark_done: 'Mark done',
  resume: 'Resume',
  create_invoice: 'Create invoice',
  send_invoice: 'Send invoice',
  open_invoice: 'Open invoice',
  record_payment: 'Record payment',
  record_deposit: 'Record deposit',
};

export function jobHubNext(input: {
  stage: Stage;
  invoice: Pick<Invoice, 'id' | 'status' | 'number'> | null;
  depositAsked: number;
  paid: number;
}): JobHubNext | null {
  const { stage, invoice, depositAsked, paid } = input;
  if (stage === 'cancelled' || stage === 'paid' || stage === 'new' || stage === 'pending') return null;

  const next = (kind: JobHubNextKind, label?: string): JobHubNext => ({
    kind,
    label: label ?? (kind === 'open_invoice' && invoice ? `Open invoice ${invoice.number}` : NEXT_LABEL[kind]),
  });

  if (stage === 'approved') return next('schedule');

  // Deposit is due at signing, but Schedule always wins until the job is on the calendar.
  // Once scheduled, collect the deposit before Start; later stages follow the board spine.
  if (stage === 'scheduled' && !invoice && depositAsked > paid) return next('record_deposit');

  if (stage === 'scheduled') return next('start');
  if (stage === 'in_progress') return next('mark_done');
  if (stage === 'blocked') return next('resume');

  if (stage === 'done') {
    if (!invoice) return next('create_invoice');
    if (invoice.status === 'draft') return next('send_invoice');
    return next('open_invoice');
  }

  if (stage === 'invoiced' || stage === 'overdue') {
    return invoice ? next('record_payment') : next('create_invoice');
  }

  return null;
}
