import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { bookkeeping, periodOf, shiftPeriod, type PeriodKind } from '../../lib/books';
import { todayMi } from '../../lib/calendar';
import { money } from '../../lib/estimate';
import { hoursLabel } from '../../lib/expenses';
import { HOURS_ENABLED } from '../../lib/features';
import { shareOrDownload } from '../../lib/pdf';
import { can, useReady, useRow, useRows } from '../../lib/session';
import { bookkeepingFileName, bookkeepingXlsx } from '../../lib/xlsx';

const KINDS: [PeriodKind, string][] = [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']];

/** The owner's numbers for a month, quarter or year, and the Excel file for the books. */
export function Reports() {
  const { engine, org } = useReady();
  const company = useRow(engine, 'organizations', org.org_id);
  const jobs = useRows(engine, 'jobs');
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const expenses = useRows(engine, 'expenses');
  const timeEntries = useRows(engine, 'time_entries');
  const pricings = useRows(engine, 'job_pricing');
  const photos = useRows(engine, 'photos');
  const [period, setPeriod] = useState(() => periodOf('month', todayMi()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const books = useMemo(
    () => bookkeeping({ period, jobs, invoices, payments, expenses, timeEntries, pricings, photos, today: todayMi() }),
    [period, jobs, invoices, payments, expenses, timeEntries, pricings, photos],
  );
  if (!can.seePrices(org.role)) return <Navigate to="/" replace />;
  const t = books.totals;

  async function download() {
    setBusy(true);
    setError('');
    try {
      const blob = await bookkeepingXlsx(books, company?.name ?? org.name);
      await shareOrDownload(blob, bookkeepingFileName(company?.name ?? org.name, books), `Bookkeeping, ${books.period.label}`);
    } catch (e) {
      setError((e as Error).message || 'The spreadsheet couldn’t be made.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page reports">
      <div className="page-head">
        <h1>Reports</h1>
        <button type="button" className="btn primary" onClick={() => void download()} disabled={busy}>
          <Icon name="download" />{busy ? 'Making the file…' : 'Download Excel'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="chips" role="group" aria-label="Period">
          {KINDS.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={period.kind === k} onClick={() => setPeriod(periodOf(k, period.from))}>{label}</button>
          ))}
        </div>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <button type="button" className="btn sm icon-only" aria-label="Earlier" onClick={() => setPeriod(shiftPeriod(period, -1))}><Icon name="chevronLeft" /></button>
          <b className="period-label">{period.label}</b>
          <button type="button" className="btn sm icon-only" aria-label="Later" onClick={() => setPeriod(shiftPeriod(period, 1))}><Icon name="chevronRight" /></button>
        </div>
      </div>

      <section className="tiles">
        <div className="tile"><span className="tile-label">Billed</span><span className="tile-value">{money(t.billed)}</span><span className="tile-sub">Before tax · {books.invoices.length} invoice{books.invoices.length === 1 ? '' : 's'}</span></div>
        <div className="tile"><span className="tile-label">Money in</span><span className="tile-value">{money(t.collected)}</span><span className="tile-sub">{books.payments.length} payment{books.payments.length === 1 ? '' : 's'} received</span></div>
        <div className="tile"><span className="tile-label">Money out</span><span className="tile-value">{money(t.spent)}</span><span className="tile-sub">{books.expenses.length} expense{books.expenses.length === 1 ? '' : 's'}</span></div>
        <div className={`tile ${t.net < 0 ? 'bad' : ''}`}><span className="tile-label">In minus out</span><span className="tile-value">{money(t.net)}</span><span className="tile-sub">Cash, not profit</span></div>
        <div className="tile"><span className="tile-label">Sales tax</span><span className="tile-value">{money(t.tax)}</span><span className="tile-sub">On invoices issued</span></div>
        {HOURS_ENABLED && <div className="tile"><span className="tile-label">Hours worked</span><span className="tile-value">{hoursLabel(t.hours)}</span><span className="tile-sub">Drive time included</span></div>}
      </section>

      <div className="dash-cols">
        <section className="dash-section">
          <div className="section-head"><h2>Jobs</h2></div>
          {books.jobs.length ? (
            <div className="table-wrap">
              <table className="report-table">
                <thead><tr><th>Job</th><th>Billed</th><th>Costs</th>{HOURS_ENABLED && <><th>Hours</th><th>Per hour</th></>}</tr></thead>
                <tbody>
                  {books.jobs.map((j) => (
                    <tr key={j.job}>
                      <td><b>{j.customer || j.job}</b><br /><span className="muted small">{j.job}</span></td>
                      <td>{money(j.billed)}</td><td>{money(j.costs)}</td>{HOURS_ENABLED && <><td>{hoursLabel(j.hours)}</td><td>{j.perHour == null ? '—' : money(j.perHour)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty card">No jobs billed, worked or with costs in {period.label}.</p>}
        </section>
        <section className="dash-section">
          <div className="section-head"><h2>Money out by category</h2></div>
          <div className="card">
            {books.categories.length ? books.categories.map(([c, a]) => <div key={c} className="sum-line"><span>{c}</span><span>{money(a)}</span></div>)
              : <p className="muted" style={{ margin: 0 }}>No expenses in {period.label}.</p>}
          </div>
          {books.months.length > 1 && (
            <>
              <div className="section-head"><h2>By month</h2></div>
              <div className="table-wrap">
                <table className="report-table">
                  <thead><tr><th>Month</th><th>In</th><th>Out</th><th>In − out</th></tr></thead>
                  <tbody>{books.months.map((m) => <tr key={m.ym}><td>{m.label}</td><td>{money(m.collected)}</td><td>{money(m.spent)}</td><td>{money(m.net)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
      <p className="hint">The Excel file has a Summary sheet, then every payment, invoice, expense{HOURS_ENABLED ? ' and hours' : ''} entry for {period.label}, plus each job’s numbers.</p>
    </div>
  );
}
