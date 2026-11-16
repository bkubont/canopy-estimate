import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ExpenseSheet } from '../../components/ExpenseSheet';
import { Thumb } from '../../components/Photos';
import { dayLabel, todayMi } from '../../lib/calendar';
import { money } from '../../lib/estimate';
import { Icon } from '../../components/Icon';
import { shareOrDownload } from '../../lib/pdf';
import { photoBlob } from '../../lib/photos';
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
  const [zipping, setZipping] = useState('');
  const rows = useMemo(() => {
    const byId = new Map((expenses ?? []).map((e) => [e.id, e]));
    const needle = q.trim().toLowerCase();
    return (photos ?? [])
      .filter((p) => p.kind === 'receipt' && !p.deleted_at)
      .map((p) => ({ p, e: p.expense_id ? byId.get(p.expense_id) : undefined }))
      // A receipt shows only with its expense: a removed expense takes its receipt with it.
      .filter(({ p, e }) => (!p.expense_id || (e && !e.deleted_at)) && (e?.spent_on ?? p.created_at ?? '').startsWith(ym))
      .filter(({ e }) => !needle || [e?.vendor, e?.category, e?.note].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => (b.e?.spent_on ?? '').localeCompare(a.e?.spent_on ?? ''));
  }, [photos, expenses, ym, q]);
  if (!can.seePrices(org.role)) return <Navigate to="/" replace />;

  /** Every receipt picture shown, in one .zip, named date_vendor_amount.jpg. */
  async function downloadAll() {
    setZipping('Gathering receipts…');
    try {
      const { zipSync } = await import('fflate');
      const files: Record<string, Uint8Array> = {};
      let missing = 0;
      for (const [n, { p, e }] of rows.entries()) {
        setZipping(`Gathering receipts… ${n + 1} of ${rows.length}`);
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
        <h1>Receipts</h1>
        {rows.length > 0 && <button type="button" className="btn" onClick={() => void downloadAll()} disabled={zipping.startsWith('Gathering')}><Icon name="download" />Download all</button>}
      </div>
      {zipping && <p className="hint" role="status">{zipping}</p>}
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
