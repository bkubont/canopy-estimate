import { useState } from 'react';
import { isActive, ymdOf } from '../lib/calendar';
import { clientName, money, niceDate } from '../lib/estimate';
import { paidForJob } from '../lib/invoice';
import { can, useReady, useRows } from '../lib/session';
import { liveInvoice } from '../lib/status';
import type { Job } from '../lib/types';
import { Icon } from './Icon';
import { Chips, Field, Sheet } from './ui';

const REASONS: [string, string][] = [
  ['Went with someone else', 'Went with someone else'],
  ['Too expensive', 'Too expensive'],
  ['Not doing it now', 'Not doing it now'],
  ['Couldn’t reach them', 'Couldn’t reach them'],
  ['Other', 'Other'],
];

/** What a cancel or reopen changes on the job. The caller saves it its own way. */
export type CancelPatch = Pick<Job, 'cancelled_at' | 'cancel_reason'>;

/**
 * Cancel an estimate or job: the customer said no or backed out. The job keeps
 * its record and can be reopened; it leaves the board, dashboard and calendar,
 * and its calendar days are cancelled. A job with a live invoice has to have the
 * invoice voided first.
 */
export function CancelJobSheet({ job, open, onClose, apply }: { job: Job; open: boolean; onClose: () => void; apply: (p: CancelPatch) => void | Promise<void> }) {
  const { engine } = useReady();
  const events = useRows(engine, 'events');
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) { setReason(''); setOther(''); } }
  const inv = liveInvoice(invoices, job.id);
  const paid = paidForJob(payments ?? [], job.id);
  const days = (events ?? []).filter((e) => e.job_id === job.id && isActive(e));
  const what = job.signed_at ? 'job' : 'estimate';

  async function cancel() {
    const why = reason === 'Other' ? other.trim() || 'Other' : reason;
    await apply({ cancelled_at: new Date().toISOString(), cancel_reason: why });
    for (const e of days) await engine.save('events', { ...e, status: 'cancelled' });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Cancel ${job.number}`}>
      {inv ? (
        <>
          <p>{job.number} has invoice <b>{inv.number}</b>. Void the invoice first, then cancel the job.</p>
          <button type="button" className="btn block" onClick={onClose}>OK</button>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            The {what} for <b>{clientName(job.client) || job.number}</b> comes off the board, the dashboard and the calendar. It stays under
            Estimates → All (cancelled), and you can reopen it any time.
          </p>
          {days.length > 0 && <p className="notice warn">Its {days.length === 1 ? 'calendar entry is' : `${days.length} calendar entries are`} cancelled too.</p>}
          {paid > 0 && <p className="notice warn">{money(paid)} has been paid on this job. Any refund is up to you; the payment stays on record.</p>}
          <h4 className="label">Why? (optional)</h4>
          <Chips label="Reason" options={REASONS} value={reason} onChange={(v) => setReason(v || '')} />
          {reason === 'Other' && <div className="mt"><Field label="Reason"><input value={other} onChange={(e) => setOther(e.target.value)} /></Field></div>}
          <button type="button" className="btn danger block mt" onClick={() => void cancel()}>Cancel this {what}</button>
          <button type="button" className="btn block mt" onClick={onClose}>Keep it</button>
        </>
      )}
    </Sheet>
  );
}

/** The button that opens the cancel sheet (owner and office only). */
export function CancelJobButton({ job, apply, small }: { job: Job; apply: (p: CancelPatch) => void | Promise<void>; small?: boolean }) {
  const { org } = useReady();
  const [open, setOpen] = useState(false);
  if (!can.seePrices(org.role) || job.cancelled_at) return null;
  return (
    <>
      <button type="button" className={`btn ${small ? 'sm' : ''}`} onClick={() => setOpen(true)}><Icon name="close" size={16} />Cancel {job.signed_at ? 'job' : 'estimate'}</button>
      <CancelJobSheet job={job} open={open} onClose={() => setOpen(false)} apply={apply} />
    </>
  );
}

/** Shown at the top of a cancelled job, with Reopen for owner and office. */
export function CancelledBanner({ job, apply }: { job: Job; apply: (p: CancelPatch) => void | Promise<void> }) {
  const { org } = useReady();
  if (!job.cancelled_at) return null;
  return (
    <div className="card notice cancelled-banner" role="status">
      <div>
        <b>Cancelled {niceDate(ymdOf(new Date(job.cancelled_at)))}</b>
        {job.cancel_reason ? <span> · {job.cancel_reason}</span> : null}
        <div className="muted small">It’s off the board and calendar{job.signed_at ? '' : ', and the customer’s link no longer works'}.</div>
      </div>
      {can.seePrices(org.role) && (
        <button type="button" className="btn sm" onClick={() => void apply({ cancelled_at: null, cancel_reason: '' })}>Reopen</button>
      )}
    </div>
  );
}
