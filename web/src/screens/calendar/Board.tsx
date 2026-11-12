import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '../../components/ui';
import { blankEvent, boardColumn, COLUMN_LABEL, dayLabel, jobSchedule, todayMi, type BoardColumn } from '../../lib/calendar';
import { clientName, daysLabel, normalizeJob, num } from '../../lib/estimate';
import { can, useReady, useRows } from '../../lib/session';
import type { CalEvent, Job } from '../../lib/types';
import { EventSheet, eventForJob } from './EventSheet';

const BLOCK_REASONS = ['Weather', 'Equipment rental', 'Access', 'Waiting on customer', 'Other'];

export function Board() {
  const { engine, org, user } = useReady();
  const jobs = useRows(engine, 'jobs');
  const events = useRows(engine, 'events');
  const members = useRows(engine, 'members');
  const office = can.seePrices(org.role);
  // Crew don't need the money columns; a job that's been invoiced is simply Done for them.
  const columns: BoardColumn[] = office ? ['approved', 'scheduled', 'in_progress', 'blocked', 'done', 'invoiced', 'paid'] : ['scheduled', 'in_progress', 'blocked', 'done'];
  const [tab, setTab] = useState<BoardColumn>(office ? 'approved' : 'scheduled');
  const [mineOnly, setMineOnly] = useState(org.role === 'crew');
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [blocking, setBlocking] = useState<Job | null>(null);

  const byColumn = useMemo(() => {
    const out = new Map<BoardColumn, { job: Job; sched: ReturnType<typeof jobSchedule> }[]>();
    for (const raw of jobs ?? []) {
      const job = normalizeJob(raw);
      let col = boardColumn(job, events ?? []);
      if (col === 'pending') continue;
      if (!office && (col === 'invoiced' || col === 'paid')) col = 'done';
      if (!office && col === 'approved') continue; // not on the calendar yet: nothing for crew to do
      const sched = jobSchedule(job.id, events ?? []);
      if (mineOnly && !sched.crew.includes(user.id)) continue;
      out.set(col, [...(out.get(col) ?? []), { job, sched }]);
    }
    for (const list of out.values()) list.sort((a, b) => (a.sched.start ?? '9999').localeCompare(b.sched.start ?? '9999') || a.job.number.localeCompare(b.job.number));
    return out;
  }, [jobs, events, office, mineOnly, user.id]);

  const names = (ids: string[]) => ids.map((id) => (members ?? []).find((m) => m.user_id === id)?.display_name || 'Someone').join(', ');
  const NEXT_TAB: Partial<Record<Job['status'], BoardColumn>> = { in_progress: 'in_progress', blocked: 'blocked', done: 'done', scheduled: 'scheduled' };
  // Follow the job to its new column so it doesn't seem to vanish.
  const setStatus = (job: Job, status: Job['status'], block_reason = '') => {
    void engine.save('jobs', { ...job, status, block_reason });
    const next = NEXT_TAB[status];
    if (next) setTab(next);
  };
  const schedule = (job: Job) => setEditing(eventForJob(blankEvent(org.org_id), job, todayMi()));

  const Card = ({ job, sched, col }: { job: Job; sched: ReturnType<typeof jobSchedule>; col: BoardColumn }) => (
    <article className="job-card">
      <div className="row"><b>{clientName(job.client) || job.number}</b><span className="muted small">{job.number}</span></div>
      <div className="muted small">
        {job.client.town || 'No town'} · {daysLabel(num(job.days) + job.change_orders.reduce((s, c) => s + num(c.days), 0))}
      </div>
      <div className="small">
        {sched.start
          ? <>📅 {dayLabel(sched.start)}{sched.end && sched.end !== sched.start ? ` – ${dayLabel(sched.end)}` : ''}</>
          : <span className="muted">Not on the calendar</span>}
      </div>
      {sched.crew.length > 0 && <div className="small">👷 {names(sched.crew)}</div>}
      {job.equipment.length > 0 && <div className="muted small">Equipment: {job.equipment.map((e) => e.desc).filter(Boolean).join(', ')}</div>}
      {col === 'blocked' && job.block_reason && <div className="small" style={{ color: 'var(--danger)' }}>Blocked: {job.block_reason}</div>}
      <div className="actions">
        {office && (col === 'approved' || col === 'scheduled') && (
          <button type="button" className="btn sm primary" onClick={() => schedule(job)}>{col === 'approved' ? '📅 Schedule' : '＋ Add day'}</button>
        )}
        {sched.events[0] && <button type="button" className="btn sm" onClick={() => setEditing(sched.events[0]!)}>Calendar entry</button>}
        {(col === 'scheduled' || col === 'blocked') && <button type="button" className="btn sm" onClick={() => setStatus(job, 'in_progress')}>▶ Start</button>}
        {(col === 'scheduled' || col === 'in_progress') && <button type="button" className="btn sm" onClick={() => setBlocking(job)}>Blocked</button>}
        {(col === 'in_progress' || col === 'scheduled') && <button type="button" className="btn sm" onClick={() => setStatus(job, 'done')}>✓ Done</button>}
        {col === 'done' && job.stage !== 'invoice' && job.stage !== 'paid' && <button type="button" className="btn sm" onClick={() => setStatus(job, 'scheduled')}>Reopen</button>}
        <Link className="btn sm" to={`/estimates/${job.id}`}>Open</Link>
      </div>
    </article>
  );

  return (
    <div className="page cal-page">
      <div className="page-head">
        <h2>Jobs board</h2>
        <div className="btn-row">
          <button type="button" className="chip" aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)}>Only mine</button>
          <Link to="/calendar" className="btn sm">Calendar</Link>
        </div>
      </div>
      <div className="chips board-tabs" role="tablist" aria-label="Columns">
        {columns.map((c) => (
          <button key={c} type="button" className="chip" role="tab" aria-selected={tab === c} aria-pressed={tab === c} onClick={() => setTab(c)}>
            {COLUMN_LABEL[c]} ({byColumn.get(c)?.length ?? 0})
          </button>
        ))}
      </div>
      {jobs === null || events === null ? <p className="empty">Loading…</p> : (
        <div className="board">
          {columns.map((c) => (
            <section key={c} className={`board-col ${tab === c ? 'on' : ''}`} aria-label={COLUMN_LABEL[c]}>
              <header><span>{COLUMN_LABEL[c]}</span><span className="muted">{byColumn.get(c)?.length ?? 0}</span></header>
              {(byColumn.get(c) ?? []).map(({ job, sched }) => <Card key={job.id} job={job} sched={sched} col={c} />)}
              {!byColumn.get(c)?.length && <p className="muted small" style={{ padding: '0 6px' }}>None</p>}
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!blocking} onClose={() => setBlocking(null)} title="What’s holding it up?">
        <div className="pick-list">
          {BLOCK_REASONS.map((r) => (
            <button key={r} type="button" className="list-item" onClick={() => { if (blocking) setStatus(blocking, 'blocked', r); setBlocking(null); }}>
              <b>{r}</b>
            </button>
          ))}
        </div>
      </Sheet>
      <EventSheet event={editing} onClose={() => setEditing(null)} onSaved={(e) => { if (e.type === 'tree_work' && tab === 'approved') setTab('scheduled'); }} />
    </div>
  );
}
