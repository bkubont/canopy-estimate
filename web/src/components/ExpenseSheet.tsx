import { useMemo, useRef, useState } from 'react';
import { todayMi } from '../lib/calendar';
import { clientName, normalizeJob } from '../lib/estimate';
import { categoriesIn, PAID_WITH } from '../lib/expenses';
import { addPhoto } from '../lib/photos';
import { can, useReady, useRow, useRows } from '../lib/session';
import type { Expense } from '../lib/types';
import { Icon } from './Icon';
import { PhotoViewer, Thumb, usePhotos } from './Photos';
import { Chips, Field, MoneyInput, Sheet } from './ui';

export function blankExpense(orgId: string, patch: Partial<Expense> = {}): Expense {
  return {
    id: crypto.randomUUID(), org_id: orgId, spent_on: todayMi(), vendor: '', amount: 0, category: '', paid_with: 'card',
    job_id: null, note: '', entered_by: null, entered_by_name: '', deleted_at: null, ...patch,
  };
}

/**
 * Add or edit an expense, with pictures of the receipt. Crew use the same form
 * to send in a receipt (they can add one, never see the list or change it).
 */
export function ExpenseSheet({ expense, onClose, onSaved }: { expense: Expense | null; onClose: () => void; onSaved?: (e: Expense) => void }) {
  const { engine, org, user } = useReady();
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const all = useRows(engine, 'expenses');
  const jobs = useRows(engine, 'jobs');
  const office = can.seePrices(org.role);
  const [e, setE] = useState<Expense | null>(expense);
  const [openedId, setOpenedId] = useState(expense?.id);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<import('../lib/types').Photo | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (expense?.id !== openedId) {
    setOpenedId(expense?.id);
    setE(expense);
    setFiles([]);
    setError('');
  }
  const receipts = usePhotos({ expenseId: e?.id ?? '__none__', kind: 'receipt' });
  const categories = useMemo(() => categoriesIn(all), [all]);
  const signedJobs = useMemo(() => (jobs ?? []).filter((j) => j.signed_at && !j.deleted_at).sort((a, b) => b.number.localeCompare(a.number)), [jobs]);

  if (!e) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const isNew = !(all ?? []).some((x) => x.id === e.id);
  const set = (patch: Partial<Expense>) => setE({ ...e, ...patch });
  const custom = !!e.category && !categories.includes(e.category);

  async function save() {
    if (!e) return;
    if (!(Number(e.amount) > 0)) return setError('Enter the amount.');
    setBusy(true);
    setError('');
    try {
      const out: Expense = {
        ...e, category: e.category.trim() || 'Other', vendor: e.vendor.trim(),
        entered_by: e.entered_by ?? user.id, entered_by_name: e.entered_by_name || me?.display_name || '',
      };
      await engine.save('expenses', out);
      for (const f of files) {
        await addPhoto(engine, f, { org_id: org.org_id, job_id: out.job_id, expense_id: out.id, kind: 'receipt', taken_by: user.id, taken_by_name: me?.display_name ?? '' });
      }
      onSaved?.(out);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // An expense that's already saved takes new receipt pictures right away.
  async function addFiles(list: FileList | null) {
    if (!list?.length || !e) return;
    if (isNew) return setFiles((f) => [...f, ...Array.from(list)]);
    setBusy(true);
    try {
      for (const f of Array.from(list)) await addPhoto(engine, f, { org_id: org.org_id, job_id: e.job_id, expense_id: e.id, kind: 'receipt', taken_by: user.id, taken_by_name: me?.display_name ?? '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!expense} onClose={onClose} title={office ? (isNew ? 'Add expense' : 'Expense') : 'Send a receipt'}
      action={<button type="button" className="btn primary sm" onClick={() => void save()} disabled={busy}>Save</button>}>
      {!office && <p className="hint" style={{ marginTop: 0 }}>Goes straight to the office. You won’t see it in a list afterwards.</p>}
      <h4 className="label">Receipt</h4>
      <div className="photo-strip">
        {receipts.map((p) => <Thumb key={p.id} photo={p} onOpen={() => setViewing(p)} />)}
        {files.map((f, i) => <span key={i} className="thumb"><span className="thumb-wait">{f.name || 'Photo'}<br />added</span></span>)}
        <label className={`thumb add ${busy ? 'busy' : ''}`}>
          <Icon name="camera" size={22} />
          <span>{receipts.length + files.length ? 'Add' : 'Receipt photo'}</span>
          <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label="Add receipt photo" onChange={(ev) => { void addFiles(ev.target.files); ev.target.value = ''; }} />
        </label>
      </div>
      <div className="two mt">
        <Field label="Amount"><MoneyInput label="Amount" value={e.amount || ''} onChange={(v) => set({ amount: v ?? 0 })} /></Field>
        <Field label="Date"><input type="date" value={e.spent_on} onChange={(ev) => ev.target.value && set({ spent_on: ev.target.value })} /></Field>
      </div>
      <Field label="Vendor"><input value={e.vendor} onChange={(ev) => set({ vendor: ev.target.value })} placeholder="Where it was bought" autoCapitalize="words" /></Field>
      <h4 className="label">Category</h4>
      <Chips label="Category" options={custom ? [...categories, e.category] : categories} value={e.category} onChange={(v) => set({ category: v })} />
      <input className="mt" aria-label="Other category" placeholder="Or type your own category…" value={custom ? e.category : ''} onChange={(ev) => set({ category: ev.target.value })} />
      <h4 className="label">Paid with</h4>
      <Chips label="Paid with" options={PAID_WITH} value={e.paid_with} onChange={(v) => v && set({ paid_with: v })} required />
      <div className="mt" />
      <Field label="Job (optional)" hint="Ties the cost to a job, so you can see what each job really cost.">
        <select value={e.job_id ?? ''} onChange={(ev) => set({ job_id: ev.target.value || null })}>
          <option value="">No job</option>
          {signedJobs.map((j) => <option key={j.id} value={j.id}>{j.number} · {clientName(normalizeJob(j).client) || 'No name'}</option>)}
        </select>
      </Field>
      <Field label="Note"><input value={e.note} onChange={(ev) => set({ note: ev.target.value })} /></Field>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="button" className="btn primary block" onClick={() => void save()} disabled={busy}>{office ? 'Save expense' : 'Send receipt'}</button>
      {office && !isNew && (
        <button type="button" className="btn danger block mt" onClick={async () => {
          if (!confirm('Remove this expense?')) return;
          const gone = new Date().toISOString();
          await engine.save('expenses', { ...e, deleted_at: gone });
          for (const p of receipts) await engine.save('photos', { ...p, deleted_at: gone }); // its receipt goes too
          onClose();
        }}>Remove expense</button>
      )}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </Sheet>
  );
}
