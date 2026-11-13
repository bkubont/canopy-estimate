import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { clientName, money, niceDate } from '../../lib/estimate';
import { balanceDue, INVOICE_STATUS_LABEL, invoiceStatus, invoiceTotals, paidForJob, type InvoiceStatus } from '../../lib/invoice';
import { can, useReady, useRows } from '../../lib/session';

const FILTERS: [string, string, (s: InvoiceStatus) => boolean][] = [
  ['open', 'Unpaid', (s) => s === 'unpaid' || s === 'partial' || s === 'overdue'],
  ['overdue', 'Overdue', (s) => s === 'overdue'],
  ['draft', 'Drafts', (s) => s === 'draft'],
  ['paid', 'Paid', (s) => s === 'paid'],
  ['all', 'All', () => true],
];

export function Invoices() {
  const { engine, org } = useReady();
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const jobs = useRows(engine, 'jobs');
  const [filter, setFilter] = useState('open');

  const rows = useMemo(() => {
    const jobById = new Map((jobs ?? []).map((j) => [j.id, j]));
    return (invoices ?? []).map((inv) => {
      const paid = paidForJob(payments ?? [], inv.job_id);
      return { inv, job: jobById.get(inv.job_id), status: invoiceStatus(inv, paid), balance: balanceDue(inv, paid), total: invoiceTotals(inv.lines, inv.tax_rate).total };
    }).sort((a, b) => b.inv.issue_date.localeCompare(a.inv.issue_date) || b.inv.number.localeCompare(a.inv.number));
  }, [invoices, payments, jobs]);

  if (!can.seePrices(org.role)) return <Navigate to="/board" replace />;

  const test = FILTERS.find(([id]) => id === filter)![2];
  const list = rows.filter((r) => test(r.status));
  const outstanding = rows.filter((r) => ['unpaid', 'partial', 'overdue'].includes(r.status)).reduce((s, r) => s + r.balance, 0);
  const overdue = rows.filter((r) => r.status === 'overdue').reduce((s, r) => s + r.balance, 0);

  return (
    <div className="page">
      <div className="page-head"><h2>Invoices</h2></div>
      <section className="card">
        <div className="sum-line"><span>Outstanding</span><b>{money(outstanding)}</b></div>
        <div className="sum-line"><span>Overdue</span><b style={{ color: overdue ? 'var(--danger)' : undefined }}>{money(overdue)}</b></div>
      </section>
      <div className="chips est-filters" role="group" aria-label="Invoice status">
        {FILTERS.map(([id, label]) => <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      {invoices === null ? <p className="empty">Loading…</p> : list.length ? (
        <div className="list">
          {list.map(({ inv, job, status, balance, total }) => (
            <Link key={inv.id} to={`/invoices/${inv.id}`} className="list-item">
              <div className="row"><b>{clientName(job?.client) || 'No name'}</b><b>{money(status === 'paid' || status === 'void' || status === 'draft' ? total : balance)}</b></div>
              <div className="row muted small">
                <span>{inv.number} · due {niceDate(inv.due_date)}</span>
                <span className={`status inv-${status}`}>{INVOICE_STATUS_LABEL[status]}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : <p className="empty">{rows.length ? 'Nothing here.' : 'No invoices yet. Open a signed estimate and tap “Create invoice”.'}</p>}
    </div>
  );
}
