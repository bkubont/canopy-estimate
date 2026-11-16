import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ExpenseSheet } from '../../components/ExpenseSheet';
import { Thumb } from '../../components/Photos';
import { dayLabel, todayMi } from '../../lib/calendar';
import { money } from '../../lib/estimate';
import { can, useReady, useRows } from '../../lib/session';
import type { Expense } from '../../lib/types';
import { MonthPicker, monthName } from './Expenses';

/** Every receipt picture, by month; tap one to open its expense. */
export function Receipts() {
  const { engine, org } = useReady();
  const photos = useRows(engine, 'photos');
  const expenses = useRows(engine, 'expenses');
  const [ym, setYm] = useState(todayMi().slice(0, 7));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Expense | null>(null);
  const rows = useMemo(() => {
    const byId = new Map((expenses ?? []).map((e) => [e.id, e]));
    const needle = q.trim().toLowerCase();
    return (photos ?? [])
      .filter((p) => p.kind === 'receipt' && !p.deleted_at)
      .map((p) => ({ p, e: p.expense_id ? byId.get(p.expense_id) : undefined }))
      .filter(({ p, e }) => !e?.deleted_at && (e?.spent_on ?? p.created_at ?? '').startsWith(ym))
      .filter(({ e }) => !needle || [e?.vendor, e?.category, e?.note].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => (b.e?.spent_on ?? '').localeCompare(a.e?.spent_on ?? ''));
  }, [photos, expenses, ym, q]);
  if (!can.seePrices(org.role)) return <Navigate to="/" replace />;

  return (
    <div className="page">
      <div className="page-head"><h1>Receipts</h1></div>
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <MonthPicker ym={ym} onChange={setYm} />
      </div>
      <input type="search" className="search" placeholder="Search vendor or category" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search receipts" />
      {photos === null ? <p className="empty">Loading…</p> : rows.length ? (
        <div className="receipt-grid">
          {rows.map(({ p, e }) => (
            <figure key={p.id} className="receipt">
              <Thumb photo={p} onOpen={() => e && setOpen(e)} />
              <figcaption>
                <b>{e?.vendor || e?.category || 'Receipt'}</b>
                <span className="muted small">{e ? `${dayLabel(e.spent_on)} · ${money(e.amount)}` : 'Expense still syncing'}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="empty">{q ? 'No matches.' : `No receipts in ${monthName(ym)}.`}</p>}
      <ExpenseSheet expense={open} onClose={() => setOpen(null)} />
    </div>
  );
}
