import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ExpenseSheet, blankExpense } from '../../components/ExpenseSheet';
import { Icon } from '../../components/Icon';
import { dayLabel, todayMi } from '../../lib/calendar';
import { clientName, money, normalizeJob } from '../../lib/estimate';
import { byCategory, expensesInMonth, PAID_WITH, total } from '../../lib/expenses';
import { can, useReady, useRows } from '../../lib/session';
import type { Expense } from '../../lib/types';

export const shiftMonth = (ym: string, dir: number) => {
  const d = new Date(`${ym}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 7);
};
export const monthName = (ym: string) => dayLabel(`${ym}-15`, { month: 'long', year: 'numeric' });

export function MonthPicker({ ym, onChange }: { ym: string; onChange: (ym: string) => void }) {
  return (
    <div className="btn-row" style={{ alignItems: 'center' }}>
      <button type="button" className="btn sm icon-only" aria-label="Previous month" onClick={() => onChange(shiftMonth(ym, -1))}><Icon name="chevronLeft" /></button>
      <b style={{ minWidth: 130, textAlign: 'center' }}>{monthName(ym)}</b>
      <button type="button" className="btn sm icon-only" aria-label="Next month" onClick={() => onChange(shiftMonth(ym, 1))}><Icon name="chevronRight" /></button>
    </div>
  );
}

export function Expenses() {
  const { engine, org } = useReady();
  const expenses = useRows(engine, 'expenses');
  const photos = useRows(engine, 'photos');
  const jobs = useRows(engine, 'jobs');
  const [ym, setYm] = useState(todayMi().slice(0, 7));
  const [editing, setEditing] = useState<Expense | null>(null);
  const list = useMemo(() => expensesInMonth(expenses, ym), [expenses, ym]);
  const withReceipt = useMemo(() => new Set((photos ?? []).filter((p) => p.kind === 'receipt' && !p.deleted_at).map((p) => p.expense_id)), [photos]);
  if (!can.seePrices(org.role)) return <Navigate to="/" replace />;
  const jobName = (id: string | null) => {
    const j = id ? (jobs ?? []).find((x) => x.id === id) : null;
    return j ? `${j.number} · ${clientName(normalizeJob(j).client)}` : '';
  };
  const cats = byCategory(list);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Expenses</h1>
        <button type="button" className="btn primary" onClick={() => setEditing(blankExpense(org.org_id))}><Icon name="plus" />Add expense</button>
      </div>
      <div className="row" style={{ marginBottom: 12 }}><MonthPicker ym={ym} onChange={setYm} /></div>
      <section className="card">
        <div className="sum-line grand"><span>Spent in {monthName(ym)}</span><span>{money(total(list))}</span></div>
        {cats.map(([c, amt]) => <div key={c} className="sum-line"><span>{c}</span><span>{money(amt)}</span></div>)}
      </section>
      {expenses === null ? <p className="empty">Loading…</p> : list.length ? (
        <div className="list">
          {list.map((e) => (
            <button key={e.id} type="button" className="list-item" onClick={() => setEditing(e)}>
              <div className="row"><b>{e.vendor || e.category}</b><b>{money(e.amount)}</b></div>
              <div className="row muted small">
                <span>{dayLabel(e.spent_on)} · {e.category}{e.job_id ? ` · ${jobName(e.job_id)}` : ''}</span>
                <span className="row-icon">{withReceipt.has(e.id) && <Icon name="receipt" size={14} label="Has a receipt" />}{PAID_WITH.find(([k]) => k === e.paid_with)?.[1]}</span>
              </div>
              {e.entered_by_name && <div className="muted small">Added by {e.entered_by_name}</div>}
            </button>
          ))}
        </div>
      ) : <p className="empty">No expenses in {monthName(ym)}.</p>}
      <ExpenseSheet expense={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
