import { useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ExpenseSheet, blankExpense } from '../../components/ExpenseSheet';
import { Icon } from '../../components/Icon';
import { Thumb } from '../../components/Photos';
import { dayLabel, todayMi } from '../../lib/calendar';
import { clientName, money, normalizeJob } from '../../lib/estimate';
import { byCategory, expensesInMonth, PAID_WITH, total } from '../../lib/expenses';
import { shareOrDownload } from '../../lib/pdf';
import { photoBlob } from '../../lib/photos';
import { can, useReady, useRows } from '../../lib/session';
import type { Expense, Photo } from '../../lib/types';

export type MoneyType = 'expenses' | 'receipts';

const TYPES: [MoneyType, string][] = [
  ['expenses', 'Expenses'],
  ['receipts', 'Receipts'],
];

/** Query `type=receipts` focuses the photo grid; anything else is the expense list. */
export function moneyTypeFromSearch(raw: string | null): MoneyType {
  return raw === 'receipts' ? 'receipts' : 'expenses';
}

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

type ReceiptRow = { p: Photo; e: Expense | undefined };

/** Receipt photos for a month, optionally narrowed by vendor/category/note. */
export function receiptsInMonth(
  photos: Photo[] | null | undefined,
  expenses: Expense[] | null | undefined,
  ym: string,
  q = '',
): ReceiptRow[] {
  const byId = new Map((expenses ?? []).map((e) => [e.id, e]));
  const needle = q.trim().toLowerCase();
  return (photos ?? [])
    .filter((p) => p.kind === 'receipt' && !p.deleted_at)
    .map((p) => ({ p, e: p.expense_id ? byId.get(p.expense_id) : undefined }))
    // A receipt shows only with its expense: a removed expense takes its receipt with it.
    .filter(({ p, e }) => (!p.expense_id || (e && !e.deleted_at)) && (e?.spent_on ?? p.created_at ?? '').startsWith(ym))
    .filter(({ e }) => !needle || [e?.vendor, e?.category, e?.note].join(' ').toLowerCase().includes(needle))
    .sort((a, b) => (b.e?.spent_on ?? '').localeCompare(a.e?.spent_on ?? ''));
}

/**
 * One Money inbox for office: expense list and receipt photos, toggled by type filter.
 * Crew still add via Quick Add only — they never see this screen.
 */
export function Expenses() {
  const { engine, org } = useReady();
  const expenses = useRows(engine, 'expenses');
  const photos = useRows(engine, 'photos');
  const jobs = useRows(engine, 'jobs');
  const [params, setParams] = useSearchParams();
  const type = moneyTypeFromSearch(params.get('type'));
  const [ym, setYm] = useState(todayMi().slice(0, 7));
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [zipping, setZipping] = useState('');
  const list = useMemo(() => expensesInMonth(expenses, ym), [expenses, ym]);
  const withReceipt = useMemo(() => new Set((photos ?? []).filter((p) => p.kind === 'receipt' && !p.deleted_at).map((p) => p.expense_id)), [photos]);
  const receiptRows = useMemo(() => receiptsInMonth(photos, expenses, ym, q), [photos, expenses, ym, q]);
  if (!can.seePrices(org.role)) return <Navigate to="/" replace />;

  const setType = (next: MoneyType) => {
    const n = new URLSearchParams(params);
    if (next === 'receipts') n.set('type', 'receipts');
    else n.delete('type');
    setParams(n, { replace: true });
  };

  const jobName = (id: string | null) => {
    const j = id ? (jobs ?? []).find((x) => x.id === id) : null;
    return j ? `${j.number} · ${clientName(normalizeJob(j).client)}` : '';
  };
  const cats = byCategory(list);

  /** Every receipt picture shown, in one .zip, named date_vendor_amount.jpg. */
  async function downloadAll() {
    setZipping('Gathering receipts…');
    try {
      const { zipSync } = await import('fflate');
      const files: Record<string, Uint8Array> = {};
      let missing = 0;
      for (const [n, { p, e }] of receiptRows.entries()) {
        setZipping(`Gathering receipts… ${n + 1} of ${receiptRows.length}`);
        const blob = await photoBlob(engine.db, p);
        if (!blob) { missing++; continue; }
        const base = [e?.spent_on ?? '', (e?.vendor || e?.category || 'receipt').replace(/[^\w-]+/g, '-'), e ? e.amount.toFixed(2) : ''].filter(Boolean).join('_');
        let name = `${base}.jpg`;
        for (let i = 2; files[name]; i++) name = `${base}_${i}.jpg`;
        files[name] = new Uint8Array(await blob.arrayBuffer());
      }
      const zip = zipSync(files, { level: 0 }); // pictures are already compressed
      await shareOrDownload(new Blob([zip], { type: 'application/zip' }), `Receipts_${ym}.zip`, `Receipts, ${monthName(ym)}`);
      setZipping(missing ? `${missing} receipt${missing > 1 ? 's' : ''} couldn’t be downloaded (still uploading from a phone?).` : '');
    } catch (err) {
      setZipping((err as Error).message);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Expenses</h1>
        {type === 'expenses' ? (
          <button type="button" className="btn primary" onClick={() => setEditing(blankExpense(org.org_id))}><Icon name="plus" />Add expense</button>
        ) : receiptRows.length > 0 ? (
          <button type="button" className="btn" onClick={() => void downloadAll()} disabled={zipping.startsWith('Gathering')}><Icon name="download" />Download all</button>
        ) : null}
      </div>
      {zipping && <p className="hint" role="status">{zipping}</p>}
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}><MonthPicker ym={ym} onChange={setYm} /></div>
      <div className="chips est-filters" role="group" aria-label="Type">
        {TYPES.map(([id, label]) => (
          <button key={id} type="button" className="chip" aria-pressed={type === id} onClick={() => setType(id)}>{label}</button>
        ))}
      </div>

      {type === 'expenses' ? (
        <>
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
        </>
      ) : (
        <>
          <input type="search" className="search" placeholder="Search vendor or category" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search receipts" />
          {photos === null ? <p className="empty">Loading…</p> : receiptRows.length ? (
            <div className="receipt-grid">
              {receiptRows.map(({ p, e }) => (
                <figure key={p.id} className="receipt">
                  <Thumb photo={p} onOpen={() => e && setEditing(e)} />
                  <figcaption>
                    <b>{e?.vendor || e?.category || 'Receipt'}</b>
                    <span className="muted small">{e ? `${dayLabel(e.spent_on)} · ${money(e.amount)}` : 'Expense still syncing'}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : <p className="empty">{q ? 'No matches.' : `No receipts in ${monthName(ym)}.`}</p>}
        </>
      )}
      <ExpenseSheet expense={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
