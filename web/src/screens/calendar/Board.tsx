import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { NotesBadge } from '../../components/WorkOrderNotes';
import { PhotoCount } from '../../components/Photos';
import { Sheet } from '../../components/ui';
import { blankEvent, boardColumn, COLUMN_LABEL, dayLabel, eventForJob, jobSchedule, todayMi, type BoardColumn } from '../../lib/calendar';
import { clientName, daysLabel, money, normalizeJob, num } from '../../lib/estimate';
import { invoiceFromJob } from '../../lib/invoice';
import { hoursLabel, hoursTotal, jobEntries } from '../../lib/expenses';
import { isWorkOrder, noteSummary } from '../../lib/notes';
import { takeNumber } from '../../lib/numbers';
import { can, useReady, useRow, useRows } from '../../lib/session';
import { liveInvoice } from '../../lib/status';
import { reserveNumbers } from '../../lib/supabase';
import type { CalEvent, Job } from '../../lib/types';
import { EventSheet } from './EventSheet';

const BLOCK_REASONS = ['Weather', 'Equipment rental', 'Access', 'Waiting on customer', 'Other'];

type Action = { id: string; label: string; run: () => void };
type Row = { job: Job; sched: ReturnType<typeof jobSchedule> };

/** Small "⋯" menu for the less common actions on a card. */
function MoreMenu({ actions, label }: { actions: Action[]; label: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!actions.length) return null;
  return (
    <div className="more-menu" ref={wrap}>
      <button type="button" className="btn sm icon-only" aria-label={`More actions for ${label}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="popover more-pop" role="menu">
          {actions.map((a) => (
            <button key={a.id} type="button" role="menuitem" className="pop-item" onClick={() => { setOpen(false); a.run(); }}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Board() {
  const { engine, org } = useReady();
  const jobs = useRows(engine, 'jobs');
  const events = useRows(engine, 'events');
  const members = useRows(engine, 'members');
  const invoices = useRows(engine, 'invoices');
  const pricings = useRows(engine, 'job_pricing');
  const timeEntries = useRows(engine, 'time_entries');
  const orgPricing = useRow(engine, 'org_pricing', org.org_id);
  const office = can.seePrices(org.role);
  const navigate = useNavigate();
  // Crew don't need the money columns; a job that's been invoiced is simply Done for them.
  const columns: BoardColumn[] = office ? ['approved', 'scheduled', 'in_progress', 'blocked', 'done', 'invoiced', 'paid'] : ['scheduled', 'in_progress', 'blocked', 'done'];
  const [tab, setTab] = useState<BoardColumn>(office ? 'approved' : 'scheduled');
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [blocking, setBlocking] = useState<Job | null>(null);
  const [toast, setToast] = useState('');
  const [drag, setDrag] = useState<{ label: string; x: number; y: number; over: BoardColumn | null } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const byColumn = useMemo(() => {
    const out = new Map<BoardColumn, Row[]>();
    for (const raw of jobs ?? []) {
      if (raw.deleted_at) continue;
      const job = normalizeJob(raw);
      let col = boardColumn(job, events ?? []);
      if (col === 'pending') continue;
      if (!office && (col === 'invoiced' || col === 'paid')) col = 'done';
      if (!office && col === 'approved') continue; // not on the calendar yet: nothing for crew to do
      out.set(col, [...(out.get(col) ?? []), { job, sched: jobSchedule(job.id, events ?? []) }]);
    }
    for (const list of out.values()) list.sort((a, b) => (a.sched.start ?? '9999').localeCompare(b.sched.start ?? '9999') || a.job.number.localeCompare(b.job.number));
    return out;
  }, [jobs, events, office]);

  const names = (ids: string[]) => ids.map((id) => (members ?? []).find((m) => m.user_id === id)?.display_name || 'Someone').join(', ');
  const NEXT_TAB: Partial<Record<Job['status'], BoardColumn>> = { in_progress: 'in_progress', blocked: 'blocked', done: 'done', scheduled: 'scheduled', approved: 'approved' };
  // Follow the job to its new column so it doesn't seem to vanish.
  const setStatus = (job: Job, status: Job['status'], block_reason = '') => {
    void engine.save('jobs', { ...job, status, block_reason });
    const next = NEXT_TAB[status];
    if (next) setTab(next);
  };
  const schedule = (job: Job) => navigate('/calendar', { state: { pick: job.id } });
  const addDay = (job: Job) => setEditing(eventForJob(blankEvent(org.org_id), job, todayMi()));
  async function createInvoice(job: Job) {
    const pricing = (pricings ?? []).find((p) => p.job_id === job.id);
    if (!pricing) return setToast('Prices for this job haven’t synced yet. Try again in a moment.');
    try {
      const number = await takeNumber(engine.db, org.org_id, 'invoice', reserveNumbers);
      const inv = invoiceFromJob(job, pricing, { number, dueDays: orgPricing?.invoice_due_days ?? 15 });
      await engine.save('invoices', inv);
      navigate(`/invoices/${inv.id}`);
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  /** The one obvious next step for a card, and everything else for the "⋯" menu. */
  function actionsFor({ job, sched }: Row, col: BoardColumn): { main: Action | null; more: Action[] } {
    const a = (id: string, label: string, run: () => void): Action => ({ id, label, run });
    const open = a('open', 'Open job', () => navigate(`/estimates/${job.id}`));
    const inv = liveInvoice(invoices, job.id);
    const entry = sched.events[0] ? a('entry', 'Calendar entry', () => setEditing(sched.events[0]!)) : null;
    const more = (...xs: (Action | null | false)[]) => xs.filter(Boolean) as Action[];
    switch (col) {
      case 'approved':
        return { main: office ? a('schedule', 'Schedule', () => schedule(job)) : null, more: more(open) };
      case 'scheduled':
        return { main: a('start', 'Start', () => setStatus(job, 'in_progress')), more: more(entry, office && a('day', 'Add a day', () => addDay(job)), a('block', 'Blocked…', () => setBlocking(job)), a('done', 'Mark done', () => setStatus(job, 'done')), open) };
      case 'in_progress':
        return { main: a('done', 'Mark done', () => setStatus(job, 'done')), more: more(entry, office && a('day', 'Add a day', () => addDay(job)), a('block', 'Blocked…', () => setBlocking(job)), open) };
      case 'blocked':
        return { main: a('resume', 'Resume', () => setStatus(job, 'in_progress')), more: more(entry, a('block', 'Change reason…', () => setBlocking(job)), a('done', 'Mark done', () => setStatus(job, 'done')), open) };
      case 'done':
        if (office && job.stage !== 'invoice' && job.stage !== 'paid') return { main: a('invoice', 'Create invoice', () => void createInvoice(job)), more: more(a('reopen', 'Reopen', () => setStatus(job, 'scheduled')), open) };
        return { main: null, more: more(job.stage !== 'invoice' && job.stage !== 'paid' && a('reopen', 'Reopen', () => setStatus(job, 'scheduled')), open) };
      default:
        return { main: inv ? a('inv', 'Open invoice', () => navigate(`/invoices/${inv.id}`)) : null, more: more(open) };
    }
  }

  /** Dropping a card on a column. Scheduled/Approved follow the calendar; Invoiced/Paid follow the money. */
  function dropOn(row: Row, to: BoardColumn, from: BoardColumn) {
    if (to === from) return;
    const { job, sched } = row;
    if (to === 'invoiced' || to === 'paid') return setToast('Invoiced and Paid follow the invoice. Open the job to create one.');
    if (from === 'invoiced' || from === 'paid') return setToast('This job has an invoice, so its column follows the money.');
    if (to === 'blocked') return setBlocking(job);
    if (to === 'scheduled') return sched.days.length ? setStatus(job, 'scheduled') : schedule(job);
    if (to === 'approved') return sched.days.length ? setToast('It has days on the calendar. Remove them there to move it back to Approved.') : setStatus(job, 'approved');
    setStatus(job, to as Job['status']);
  }

  const colAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-col]')?.getAttribute('data-col') ?? null) as BoardColumn | null;
  const startDrag = (row: Row, from: BoardColumn) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const label = clientName(row.job.client) || row.job.number;
    const board = document.querySelector<HTMLElement>('.board');
    const move = (e: PointerEvent) => {
      setDrag({ label, x: e.clientX, y: e.clientY, over: colAt(e.clientX, e.clientY) });
      // Near the board's edge, scroll it so columns off to the side can be reached.
      const r = board?.getBoundingClientRect();
      if (board && r) {
        if (e.clientX > r.right - 60) board.scrollLeft += 24;
        else if (e.clientX < r.left + 60) board.scrollLeft -= 24;
      }
    };
    const end = (e: PointerEvent, drop: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setDrag(null);
      const to = drop ? colAt(e.clientX, e.clientY) : null;
      if (to) dropOn(row, to, from);
    };
    const up = (e: PointerEvent) => end(e, true);
    const cancel = (e: PointerEvent) => end(e, false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const Card = ({ row, col }: { row: Row; col: BoardColumn }) => {
    const { job, sched } = row;
    const name = clientName(job.client) || job.number;
    const notes = isWorkOrder(job) ? noteSummary(job) : { count: 0, first: '' };
    const total = (pricings ?? []).find((p) => p.job_id === job.id)?.total;
    const days = num(job.days) + job.change_orders.reduce((s, c) => s + num(c.days), 0);
    const phone = job.client.phone?.replace(/[^\d+]/g, '');
    const { main, more } = actionsFor(row, col);
    return (
      <article className="jcard" data-job={job.id}
        onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,.popover')) navigate(`/estimates/${job.id}`); }}>
        <div className="jcard-top">
          <Link to={`/estimates/${job.id}`} className="jcard-name">{name}</Link>
          <span className="muted small">{job.number}</span>
          <button type="button" className="jcard-grip" aria-label={`Drag ${name} to another column`} onPointerDown={startDrag(row, col)}>
            <Icon name="grip" size={18} />
          </button>
        </div>
        <div className="jcard-links small">
          {job.client.town && <span className="muted">{job.client.town}</span>}
          {phone && <a href={`tel:${phone}`} className="tel"><Icon name="phone" size={14} />Call</a>}
          {phone && <a href={`sms:${phone}`} className="tel" aria-label={`Text ${name}`}><Icon name="message" size={15} /></a>}
        </div>
        <div className={`small ${col === 'approved' ? 'jcard-warn' : 'muted'} row-icon`}>
          <Icon name="calendar" size={14} />
          {sched.start ? `${dayLabel(sched.start)}${sched.end && sched.end !== sched.start ? ` – ${dayLabel(sched.end)}` : ''}` : `Not scheduled · ${daysLabel(days)}`}
        </div>
        {sched.crew.length > 0 && <div className="small muted row-icon"><Icon name="users" size={14} />{names(sched.crew)}</div>}
        {col === 'blocked' && job.block_reason && <div className="small jcard-blocked">Blocked: {job.block_reason}</div>}
        {notes.count > 0 && (
          <div className="jcard-note"><NotesBadge count={notes.count} /><span>{notes.first}</span></div>
        )}
        <div className="jcard-meta">
          <span className="jcard-counts">
            <PhotoCount jobId={job.id} />
            {(() => { const h = hoursTotal(jobEntries(timeEntries, job.id)); return h > 0 ? <span className="photo-count" aria-label={`${hoursLabel(h)} logged`}><Icon name="clock" size={14} />{hoursLabel(h)}</span> : null; })()}
          </span>
          {office && total != null && <span className="jcard-total">{money(total)}</span>}
        </div>
        {(main || more.length > 0) && (
          <div className="jcard-actions">
            {main && <button type="button" className="btn sm primary" onClick={main.run}>{main.label}</button>}
            <MoreMenu actions={more} label={name} />
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="page board-page">
      <div className="page-head">
        <h2>Jobs board</h2>
        <Link to="/calendar" className="btn sm"><Icon name="calendar" />Calendar</Link>
      </div>
      <div className="chips board-tabs" role="tablist" aria-label="Columns">
        {columns.map((c) => (
          <button key={c} type="button" className={`chip st-${c}`} role="tab" aria-selected={tab === c} aria-pressed={tab === c} onClick={() => setTab(c)}>
            {COLUMN_LABEL[c]} ({byColumn.get(c)?.length ?? 0})
          </button>
        ))}
      </div>
      {jobs === null || events === null ? <p className="empty">Loading…</p> : (
        <div className="board">
          {columns.map((c) => (
            <section key={c} data-col={c} className={`board-col st-${c} ${tab === c ? 'on' : ''} ${drag?.over === c ? 'drop' : ''}`} aria-label={COLUMN_LABEL[c]}>
              <header><span>{COLUMN_LABEL[c]}</span><span className="muted">{byColumn.get(c)?.length ?? 0}</span></header>
              {(byColumn.get(c) ?? []).map((row) => <Card key={row.job.id} row={row} col={c} />)}
              {!byColumn.get(c)?.length && <p className="board-empty">{drag ? 'Drop jobs here' : 'None'}</p>}
            </section>
          ))}
        </div>
      )}
      {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.label}</div>}
      {toast && <div className="toast" role="status"><span>{toast}</span><button type="button" className="link" onClick={() => setToast('')}>OK</button></div>}

      <Sheet open={!!blocking} onClose={() => setBlocking(null)} title="What’s holding it up?">
        <div className="pick-list">
          {BLOCK_REASONS.map((r) => (
            <button key={r} type="button" className="list-item" onClick={() => { if (blocking) setStatus(blocking, 'blocked', r); setBlocking(null); }}>
              <b>{r}</b>
            </button>
          ))}
        </div>
      </Sheet>
      <EventSheet event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
