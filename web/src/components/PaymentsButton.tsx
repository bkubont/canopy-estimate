import { useState } from 'react';
import { Link } from 'react-router-dom';
import { dayLabel } from '../lib/calendar';
import { clientName, customerPricing, money, normalizeJob, round2, totals } from '../lib/estimate';
import { balanceDue, livePayments, METHOD_LABEL, paidForJob } from '../lib/invoice';
import { useReady, useRow, useRows } from '../lib/session';
import { liveInvoice } from '../lib/status';
import type { Job, Payment } from '../lib/types';
import { PaymentSheet } from '../screens/invoice/PaymentSheet';
import { Icon } from './Icon';
import { Sheet } from './ui';

/**
 * The $ icon on a job card (owner and office only): what's been paid and what's
 * owed, and a quick way to record a deposit or payment without leaving the page.
 * Before there's an invoice a payment is a deposit; after, it goes against the invoice.
 */
export function PaymentsButton({ job: raw }: { job: Job }) {
  const { engine, org, user } = useReady();
  const job = normalizeJob(raw);
  const payments = useRows(engine, 'payments');
  const invoices = useRows(engine, 'invoices');
  const pricing = useRow(engine, 'job_pricing', job.id);
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const inv = liveInvoice(invoices, job.id);
  const list = livePayments(payments ?? [], job.id);
  const paid = paidForJob(payments ?? [], job.id);
  const t = pricing ? totals(job, customerPricing(job, pricing)) : null;
  const owed = inv ? balanceDue(inv, paid) : t ? Math.max(0, round2(t.total - paid)) : null;
  const depositLeft = !inv && t ? Math.max(0, round2(t.deposit - paid)) : 0;
  const name = clientName(job.client) || job.number;
  const label = list.length ? `Payments, ${list.length}` : 'Payments';

  return (
    <>
      <button type="button" className={`card-icon ${paid > 0 ? 'has-paid' : ''}`} onClick={() => setOpen(true)} aria-label={label} title="Deposits and payments">
        <Icon name="dollar" size={17} />
        {list.length > 0 && <span className="card-icon-count">{list.length}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Payments · ${name}`}>
        {open && (
          <>
            <div className="pay-summary">
              <div><span className="muted small">Paid so far</span><b>{money(paid)}</b></div>
              {owed != null && <div><span className="muted small">{inv ? `Still owed on ${inv.number}` : 'Left on the estimate'}</span><b>{money(owed)}</b></div>}
            </div>
            {!inv && t && t.deposit > 0 && <p className="muted small">Deposit asked: {money(t.deposit)}{depositLeft === 0 ? ' (received)' : ''}</p>}
            {list.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
              <ul className="pay-list">
                {list.map((p) => (
                  <li key={p.id}>
                    <span><b>{money(p.amount)}</b> · {METHOD_LABEL[p.method]}{p.reference ? ` #${p.reference}` : ''}{p.invoice_id ? '' : ' · deposit'}</span>
                    <span className="muted small">{dayLabel(p.received_on)}{p.recorded_by_name ? ` · ${p.recorded_by_name}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn primary block mt" onClick={() => setRecording(true)}>
              <Icon name="plus" />{inv ? 'Record payment' : 'Record deposit'}
            </button>
            {inv && <Link to={`/invoices/${inv.id}`} className="btn block mt">Open invoice {inv.number}</Link>}
          </>
        )}
      </Sheet>
      <PaymentSheet
        open={recording}
        onClose={() => setRecording(false)}
        title={inv ? `Payment on ${inv.number}` : `Deposit on ${job.number}`}
        suggested={inv ? (owed ?? 0) : depositLeft}
        base={{ org_id: job.org_id, job_id: job.id, invoice_id: inv?.id ?? null, recorded_by_name: me?.display_name ?? '' }}
        onSave={(p: Payment) => { void engine.save('payments', p); setRecording(false); }}
      />
    </>
  );
}
