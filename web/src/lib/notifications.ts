import { eventDays, isActive, miToIso } from './calendar';
import { addDays, clientName, money, normalizeJob, num } from './estimate';
import { balanceDue, invoiceStatus, METHOD_LABEL, paidForJob } from './invoice';
import type { CalEvent, Invoice, Job, Payment, TimeEntry } from './types';

/**
 * The bell. Worked out on the device from what has synced, so it needs no
 * server piece. Starter set: a customer signed online, a change order was
 * signed, a payment came in, an invoice went overdue, a job got blocked, and
 * after 4 pm a reminder to log hours for a job that was on today's calendar.
 * Things you did yourself don't ring.
 */
export type NoteKind = 'signed' | 'change_order' | 'payment' | 'overdue' | 'blocked' | 'hours';
export interface BellItem { id: string; kind: NoteKind; at: string; text: string; to: string }

export function bellItems(input: {
  jobs: Job[] | null; payments: Payment[] | null; invoices: Invoice[] | null; events: CalEvent[] | null; timeEntries: TimeEntry[] | null;
  me: { id: string; name: string }; office: boolean; today: string; nowIso: string; days?: number;
}): BellItem[] {
  const { me, office, today } = input;
  const since = miToIso(addDays(today, -(input.days ?? 14)), '00:00');
  const out: BellItem[] = [];
  const jobs = (input.jobs ?? []).filter((j) => !j.deleted_at).map(normalizeJob);
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const who = (j: Job | undefined) => (j ? clientName(j.client) || j.number : 'A customer');

  for (const j of jobs) {
    if (j.signed_via === 'link' && j.signed_at) {
      out.push({ id: `signed:${j.id}:${j.signed_at}`, kind: 'signed', at: j.signed_at, text: `${who(j)} signed the estimate online (${j.number})`, to: `/estimates/${j.id}` });
    }
    j.change_orders.forEach((co, i) => {
      if (!co.client_sig || !co.client_sig_date || j.updated_by === me.id) return;
      // The exact signing time; change orders from before it was kept only have the day.
      out.push({ id: `co:${j.id}:${co.id ?? i}`, kind: 'change_order', at: co.signed_at ?? miToIso(co.client_sig_date, '00:00'), text: `${who(j)} signed change order ${i + 1} (+${num(co.days)} day${num(co.days) === 1 ? '' : 's'})`, to: `/estimates/${j.id}` });
    });
    if (j.status === 'blocked' && j.updated_by !== me.id && j.updated_at && j.stage !== 'invoice' && j.stage !== 'paid') {
      out.push({ id: `blocked:${j.id}:${j.updated_at}`, kind: 'blocked', at: j.updated_at, text: `${who(j)} is blocked${j.block_reason ? `: ${j.block_reason.toLowerCase()}` : ''}`, to: `/estimates/${j.id}` });
    }
  }

  if (office) {
    for (const p of input.payments ?? []) {
      if (p.deleted_at || p.voided_at || (me.name && p.recorded_by_name === me.name)) continue;
      out.push({ id: `pay:${p.id}`, kind: 'payment', at: p.created_at ?? miToIso(p.received_on, '12:00'), text: `${money(Number(p.amount))} ${METHOD_LABEL[p.method]?.toLowerCase() ?? ''} payment from ${who(byId.get(p.job_id))}`.replace('  ', ' '), to: `/estimates/${p.job_id}` });
    }
    for (const inv of input.invoices ?? []) {
      if (inv.deleted_at || inv.status !== 'sent') continue;
      const paid = paidForJob(input.payments ?? [], inv.job_id);
      if (invoiceStatus(inv, paid, today) !== 'overdue') continue;
      out.push({ id: `overdue:${inv.id}:${inv.due_date}`, kind: 'overdue', at: miToIso(addDays(inv.due_date, 1), '08:00'), text: `${inv.number} to ${who(byId.get(inv.job_id))} is overdue (${money(balanceDue(inv, paid))})`, to: `/invoices/${inv.id}` });
    }
  }

  // After 4 pm: jobs on today's calendar with no hours logged today.
  if (input.nowIso >= miToIso(today, '16:05')) { // nowIso runs 5 minutes ahead (see Bell)
    const logged = new Set((input.timeEntries ?? []).filter((t) => !t.deleted_at && t.work_date === today).map((t) => t.job_id));
    const todays = (input.events ?? []).filter((e) => isActive(e) && e.type === 'tree_work' && e.job_id && eventDays(e).includes(today)
      && (!e.assigned_to?.length || e.assigned_to.includes(me.id)));
    for (const jobId of new Set(todays.map((e) => e.job_id!))) {
      if (logged.has(jobId)) continue;
      out.push({ id: `hours:${jobId}:${today}`, kind: 'hours', at: miToIso(today, '16:00'), text: `Log today’s hours for ${who(byId.get(jobId))}`, to: `/estimates/${jobId}` });
    }
  }

  return out.filter((n) => n.at >= since && n.at <= input.nowIso).sort((a, b) => b.at.localeCompare(a.at));
}
