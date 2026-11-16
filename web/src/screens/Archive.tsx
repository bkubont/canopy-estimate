import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '../components/Pill';
import { dayLabel, jobSchedule } from '../lib/calendar';
import { clientName, money, normalizeJob } from '../lib/estimate';
import { invoiceTotals, livePayments } from '../lib/invoice';
import { can, useReady, useRows } from '../lib/session';
import { liveInvoice } from '../lib/status';

/** Paid jobs: off the Jobs board, still here to look up. Newest first. */
export function Archive() {
  const { engine, org } = useReady();
  const jobs = useRows(engine, 'jobs');
  const events = useRows(engine, 'events');
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const office = can.seePrices(org.role);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (jobs ?? [])
      .filter((j) => !j.deleted_at && j.stage === 'paid')
      .map((raw) => {
        const job = normalizeJob(raw);
        const paidOn = livePayments(payments ?? [], job.id).map((p) => p.received_on).sort().at(-1) ?? '';
        const sched = jobSchedule(job.id, events ?? []);
        const inv = liveInvoice(invoices, job.id);
        return { job, paidOn, worked: sched.end ?? sched.start ?? '', inv, total: inv ? invoiceTotals(inv.lines, inv.tax_rate).total : null };
      })
      .filter(({ job, inv }) => !needle || [job.number, inv?.number, clientName(job.client), job.client.phone, job.client.street, job.client.town].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => (b.paidOn || b.worked).localeCompare(a.paidOn || a.worked));
  }, [jobs, events, invoices, payments, q]);

  return (
    <div className="page">
      <div className="page-head"><h1>Archive</h1></div>
      <p className="hint" style={{ marginTop: 0 }}>Jobs leave the Jobs board once they’re paid. They’re all here.</p>
      <input type="search" className="search" placeholder="Search name, job or invoice number, town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the archive" />
      {jobs === null ? <p className="empty">Loading…</p> : rows.length ? (
        <div className="list">
          {rows.map(({ job, paidOn, worked, inv, total }) => (
            <Link key={job.id} to={`/estimates/${job.id}`} className="list-item stripe st-paid">
              <div className="row"><b>{clientName(job.client) || job.number}</b>{office && total != null && <b>{money(total)}</b>}</div>
              <div className="row muted small">
                <span>{[job.number, inv?.number, job.client.town].filter(Boolean).join(' · ')}</span>
                <Pill stage="paid" />
              </div>
              <div className="muted small">{[worked && `Worked ${dayLabel(worked)}`, office && paidOn && `paid ${dayLabel(paidOn)}`].filter(Boolean).join(', ')}</div>
            </Link>
          ))}
        </div>
      ) : <p className="empty">{q ? 'No matches.' : 'Nothing archived yet. Jobs show up here once they’re paid.'}</p>}
    </div>
  );
}
