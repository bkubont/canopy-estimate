import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { NotesBadge } from '../../components/WorkOrderNotes';
import { isWorkOrder, noteSummary } from '../../lib/notes';
import { Sheet } from '../../components/ui';
import {
  allDaySpan, blankEvent, boardColumn, dayLabel, EVENT_LABEL, isActive, isTask, jobDays, monthCells, onDay, reorderDay,
  scheduleJob, timeLabel, todayMi, weekday,
} from '../../lib/calendar';
import { addDays, clientName, daysLabel, normalizeJob } from '../../lib/estimate';
import { can, useReady, useRows } from '../../lib/session';
import { jobStage } from '../../lib/status';
import { useDoneToggle } from '../../lib/useDoneToggle';
import type { CalEvent, Job } from '../../lib/types';
import { EventSheet } from './EventSheet';

/** Something waiting for a day: a signed job, or a rental with no date yet. */
type Pending = { kind: 'job'; job: Job } | { kind: 'rental'; event: CalEvent };
const pendingName = (p: Pending) => (p.kind === 'job' ? clientName(normalizeJob(p.job).client) || p.job.number : p.event.title || 'Rental');
const pendingDays = (p: Pending) => (p.kind === 'job' ? jobDays(p.job) : 1);

const monthOf = (ymd: string, dir: number) => {
  const d = new Date(`${ymd.slice(0, 8)}15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
};

/**
 * Drag something from the side list onto a day. Works with a mouse, a pen or a
 * finger (pointer events), so it behaves the same on a computer and an iPad.
 * A tap without moving is left to the card's own click (pick, then tap a day).
 */
function useDragToDay(onDrop: (item: Pending, day: string) => void) {
  const [drag, setDrag] = useState<{ label: string; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const justDragged = useRef(false);
  const dayAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('[data-day]')?.getAttribute('data-day') ?? null;

  const start = (item: Pending) => (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    const sx = ev.clientX;
    const sy = ev.clientY;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
      moved = true;
      setDrag({ label: pendingName(item), x: e.clientX, y: e.clientY });
      setHover(dayAt(e.clientX, e.clientY));
    };
    const finish = (e: PointerEvent, drop: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setDrag(null);
      setHover(null);
      if (!moved) return;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 80);
      const day = drop ? dayAt(e.clientX, e.clientY) : null;
      if (day) onDrop(item, day);
    };
    const up = (e: PointerEvent) => finish(e, true);
    const cancel = (e: PointerEvent) => finish(e, false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  return { drag, hover, start, justDragged };
}

export function Calendar() {
  const { engine, org } = useReady();
  const events = useRows(engine, 'events');
  const jobs = useRows(engine, 'jobs');
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const office = can.seePrices(org.role);
  const today = todayMi();
  const [cursor, setCursor] = useState(today);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [picked, setPicked] = useState<Pending | null>(null);
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const monthRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const { isDone, toggle: toggleDone } = useDoneToggle(engine, events);
  const active = useMemo(() => (events ?? []).filter(isActive), [events]);
  const toSchedule = useMemo(
    () => (jobs ?? []).filter((j) => !j.deleted_at && boardColumn(j, active) === 'approved').sort((a, b) => (a.signed_at ?? '').localeCompare(b.signed_at ?? '')),
    [jobs, active],
  );
  const rentals = useMemo(() => active.filter((e) => e.unscheduled && isTask(e.type)).sort((a, b) => a.title.localeCompare(b.title)), [active]);

  const notesFor = (e: CalEvent) => {
    const job = e.type === 'tree_work' && e.job_id ? (jobs ?? []).find((j) => j.id === e.job_id) : undefined;
    return job && isWorkOrder(job) ? noteSummary(normalizeJob(job)).count : 0;
  };
  const stageClass = (e: CalEvent) => {
    const job = e.type === 'tree_work' && e.job_id ? (jobs ?? []).find((j) => j.id === e.job_id) : undefined;
    return job ? ` st-${jobStage(job, active, invoices, payments)}` : '';
  };

  const addOn = (ymd: string, patch: Partial<CalEvent> = {}) =>
    setEditing(blankEvent(org.org_id, { type: office ? 'tree_work' : 'equipment_rental', title: office ? '' : 'Equipment rental', status: 'confirmed', ...allDaySpan(ymd, 1), ...patch }));

  // Arriving from Quick Add ("Calendar entry") or a job's Schedule button.
  useEffect(() => {
    const st = location.state as { add?: boolean; pick?: string } | null;
    if (!st) return;
    if (st.add) addOn(today);
    if (st.pick && jobs) {
      const job = jobs.find((j) => j.id === st.pick);
      if (job) setPicked({ kind: 'job', job });
      window.scrollTo(0, 0);
    }
    if (st.add || jobs) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, jobs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  async function place(item: Pending, day: string) {
    setPicked(null);
    if (item.kind === 'job') {
      const made = scheduleJob(org.org_id, item.job, day);
      for (const e of made) await engine.save('events', e);
      const days = made.flatMap((e) => { const out: string[] = []; for (let d = e.starts; d < e.ends; d = addDays(d, 1)) out.push(d); return out; });
      setToast({
        text: `${pendingName(item)}: ${dayLabel(days[0]!)}${days.length > 1 ? ` – ${dayLabel(days.at(-1)!)}` : ''}${made.length > 1 ? ' (Sunday skipped)' : ''}`,
        undo: () => { for (const e of made) void engine.remove('events', e); },
      });
    } else {
      const before = item.event;
      await engine.save('events', { ...before, unscheduled: false, ...allDaySpan(day, 1) });
      setToast({ text: `${pendingName(item)}: ${dayLabel(day)}`, undo: () => void engine.save('events', before) });
    }
  }
  const { drag, hover, start, justDragged } = useDragToDay((item, day) => void place(item, day));

  const cells = monthCells(cursor);
  const month = cursor.slice(0, 7);
  const rows = cells[35]!.slice(0, 7) === month ? 6 : 5; // drop a last row that's all next month
  const shown = cells.slice(0, rows * 7);

  const dayList = openDay ? onDay(active, openDay) : [];
  const move = (i: number, dir: -1 | 1) => { for (const e of reorderDay(dayList, i, dir)) void engine.save('events', e); };

  const card = (p: Pending) => {
    const key = p.kind === 'job' ? p.job.id : p.event.id;
    const isPicked = picked && (picked.kind === 'job' ? picked.job.id : picked.event.id) === key;
    return (
      <button key={key} type="button" className={`sched-card ${p.kind === 'job' ? 'stripe st-approved' : 'rental'} ${isPicked ? 'picked' : ''}`}
        onPointerDown={start(p)} aria-pressed={!!isPicked}
        onClick={() => {
          if (justDragged.current) return;
          setPicked(isPicked ? null : p);
          // On a phone the list sits under the month: bring the days back into view.
          if (!isPicked && monthRef.current && monthRef.current.getBoundingClientRect().top < 0) monthRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}>
        <Icon name={p.kind === 'job' ? 'grip' : 'truck'} size={16} className="grip" />
        <span className="sched-text">
          <b>{pendingName(p)}{p.kind === 'job' && <NotesBadge count={noteSummary(normalizeJob(p.job)).count} />}</b>
          <span className="muted small">
            {p.kind === 'job' ? [normalizeJob(p.job).client.town, daysLabel(Number(normalizeJob(p.job).days) || 1)].filter(Boolean).join(' · ') : 'Equipment rental'}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="page cal2">
      <div className="cal2-head">
        <h1>{dayLabel(cursor, { month: 'long', year: 'numeric' })}</h1>
        <div className="btn-row">
          <button type="button" className="btn sm" onClick={() => setCursor(today)}>Today</button>
          <button type="button" className="btn sm icon-only" aria-label="Previous month" onClick={() => setCursor(monthOf(cursor, -1))}><Icon name="chevronLeft" /></button>
          <button type="button" className="btn sm icon-only" aria-label="Next month" onClick={() => setCursor(monthOf(cursor, 1))}><Icon name="chevronRight" /></button>
          <button type="button" className="btn sm primary" onClick={() => addOn(cursor.slice(0, 7) === today.slice(0, 7) ? today : cursor)}><Icon name="plus" />Add</button>
        </div>
      </div>
      <div className="cal-legend" aria-label="Color key">
        {(['scheduled', 'in_progress', 'blocked', 'done'] as const).map((s) => (
          <span key={s}><i className={`sw st-${s}`} />{s === 'in_progress' ? 'In progress' : s[0]!.toUpperCase() + s.slice(1)}</span>
        ))}
        <span><i className="sw bid" />Bid</span>
        <span><i className="sw rental" />Rental</span>
        <span><i className="sw off" />Time off</span>
      </div>

      {picked && (
        <div className="pick-banner" role="status">
          <span>Tap a day for <b>{pendingName(picked)}</b>{pendingDays(picked) > 1 ? ` (${pendingDays(picked)} days, Sundays skipped)` : ''}.</span>
          <button type="button" className="btn sm" onClick={() => setPicked(null)}>Cancel</button>
        </div>
      )}

      <div className={`cal2-layout ${office ? 'with-panel' : ''}`}>
        <section aria-label="Month" ref={monthRef}>
          <div className="mgrid-dows" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <span key={w}>{w}</span>)}</div>
          {events === null ? <p className="empty">Loading…</p> : (
            <div className={`mgrid ${picked ? 'picking' : ''}`} style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
              {shown.map((d) => {
                const list = onDay(active, d);
                const cls = [
                  'mcell', d.slice(0, 7) !== month && 'outside', weekday(d) === 0 && 'sunday', d === today && 'today', hover === d && 'drop',
                ].filter(Boolean).join(' ');
                return (
                  <button key={d} type="button" className={cls} data-day={d}
                    aria-label={`${dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}${list.length ? `, ${list.length} on the calendar` : ''}`}
                    onClick={() => (picked ? void place(picked, d) : setOpenDay(d))}>
                    <span className="dom">{Number(d.slice(8))}</span>
                    {list.slice(0, 3).map((e) => (
                      <span key={e.id} className={`mchip type-${e.type} status-${e.status}${stageClass(e)}`}><NotesBadge count={notesFor(e)} />{e.title || EVENT_LABEL[e.type]}</span>
                    ))}
                    {list.length > 3 && <span className="more">+{list.length - 3} more</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {office && (
          <aside className="sched-panel" aria-label="Waiting for a day">
            <div className="section-head"><h2>To schedule</h2><span className="muted small">{toSchedule.length}</span></div>
            {toSchedule.length ? <div className="sched-list">{toSchedule.map((job) => card({ kind: 'job', job }))}</div>
              : <p className="muted small">Every signed job is on the calendar.</p>}
            <p className="hint">Drag a job onto a day, or tap it and then tap the day. It fills its days from there and skips Sundays.</p>
            <div className="section-head mt"><h2>Rentals</h2>
              <button type="button" className="link" onClick={() => setEditing(blankEvent(org.org_id, { type: 'equipment_rental', title: '', status: 'confirmed', unscheduled: true }))}>+ Rental</button>
            </div>
            {rentals.length ? <div className="sched-list">{rentals.map((event) => card({ kind: 'rental', event }))}</div>
              : <p className="muted small">Pick-ups and returns with no day yet wait here.</p>}
          </aside>
        )}
      </div>

      {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.label}</div>}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          <button type="button" className="link" onClick={() => { toast.undo(); setToast(null); }}>Undo</button>
        </div>
      )}

      <Sheet open={!!openDay} onClose={() => setOpenDay(null)} title={openDay ? dayLabel(openDay, { weekday: 'long', month: 'long', day: 'numeric' }) : ''}>
        {openDay && (
          <>
            {dayList.length ? (
              <ol className="day-list">
                {dayList.map((e, i) => (
                  <li key={e.id} className={`day-row type-${e.type}${stageClass(e)} ${isDone(e) ? 'is-done' : ''}`}>
                    <input type="checkbox" checked={isDone(e)} onChange={() => toggleDone(e)} aria-label={`Done: ${e.title || EVENT_LABEL[e.type]}`} />
                    <button type="button" className="day-row-main" onClick={() => setEditing(e)}>
                      <b>{e.title || EVENT_LABEL[e.type]}<NotesBadge count={notesFor(e)} /></b>
                      <span className="muted small">{[timeLabel(e) || EVENT_LABEL[e.type], e.town].filter(Boolean).join(' · ')}</span>
                    </button>
                    <span className="day-row-move">
                      <button type="button" className="icon-btn" aria-label={`Move ${e.title} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronUp" /></button>
                      <button type="button" className="icon-btn" aria-label={`Move ${e.title} down`} disabled={i === dayList.length - 1} onClick={() => move(i, 1)}><Icon name="chevronDown" /></button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : <p className="muted">Nothing on this day yet.</p>}
            <button type="button" className="btn block mt" onClick={() => addOn(openDay)}><Icon name="plus" />Add to this day</button>
            {office && toSchedule.length > 0 && (
              <>
                <h4 className="label mt">Schedule a job starting this day</h4>
                <div className="pick-list">
                  {toSchedule.map((job) => (
                    <button key={job.id} type="button" className="list-item stripe st-approved" onClick={() => { const d = openDay; setOpenDay(null); void place({ kind: 'job', job }, d); }}>
                      <b>{clientName(normalizeJob(job).client) || job.number}</b>
                      <span className="muted small">{[normalizeJob(job).client.town, `${jobDays(job)} day${jobDays(job) > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Sheet>
      <EventSheet event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

