import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dayLabel, hmOf, miToIso, timeLabel, todayMi, ymdOf } from '../lib/calendar';
import { clientName, money, round2 } from '../lib/estimate';
import { clockHours, hoursLabel, hoursTotal, isOpen, jobEntries, jobExpenses, LONG_SHIFT_HOURS, MAX_ENTRY_HOURS, openClockFor, perCrewHour, total, workerOf } from '../lib/expenses';
import { can, useReady, useRow, useRows } from '../lib/session';
import type { TimeEntry } from '../lib/types';
import { Icon } from './Icon';
import { Field, Sheet } from './ui';

function elapsed(fromIso: string) {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(fromIso)) / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
const clockTime = (iso: string) => timeLabel({ all_day: false, starts: iso, ends: iso } as never).split('–')[0] ?? hmOf(new Date(iso));
const hoursSince = (iso: string) => (Date.now() - Date.parse(iso)) / 3_600_000;

/**
 * Hours on a job, for job costing (not payroll; drive time counts). Everyone
 * clocks in and out for themselves, and can fix their own times; owner and
 * office can fix anyone's and add hours for someone who forgot to clock in.
 * Older entries from before this were one crew total, and still count.
 */
export function JobHours({ jobId, billed }: { jobId: string; billed?: number }) {
  const { engine, org, user } = useReady();
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const all = useRows(engine, 'time_entries');
  const expenses = useRows(engine, 'expenses');
  const jobs = useRows(engine, 'jobs');
  const office = can.seePrices(org.role);
  const entries = useMemo(() => jobEntries(all, jobId), [all, jobId]);
  const done = entries.filter((e) => !isOpen(e));
  const onClock = entries.filter(isOpen);
  const hours = hoursTotal(done);
  const mine = openClockFor(all, user.id);
  const mineHere = mine?.job_id === jobId ? mine : null;
  const mineElsewhere = mine && !mineHere ? mine : null;
  const elsewhereName = mineElsewhere ? (() => { const j = (jobs ?? []).find((x) => x.id === mineElsewhere.job_id); return j ? clientName(j.client) || j.number : 'another job'; })() : '';
  const [, tick] = useState(0);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [editNote, setEditNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!onClock.length) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [onClock.length]);

  const myName = me?.display_name ?? '';
  const closeOut = (e: TimeEntry) => {
    const out = new Date().toISOString();
    return engine.save('time_entries', { ...e, clock_out: out, hours: clockHours(e.clock_in!, out) });
  };
  async function clockIn() {
    if (busy) return;
    setBusy(true);
    try {
      if (mineElsewhere) await closeOut(mineElsewhere);
      await engine.save('time_entries', {
        id: crypto.randomUUID(), org_id: org.org_id, job_id: jobId, work_date: todayMi(), hours: null, note: '',
        entered_by: user.id, entered_by_name: myName, worker_id: user.id, worker_name: myName,
        clock_in: new Date().toISOString(), clock_out: null, deleted_at: null,
      });
    } finally { setBusy(false); }
  }
  async function clockOut() {
    if (!mineHere || busy) return;
    // Over a long shift the clock was probably left running: have them put in the real time.
    if (hoursSince(mineHere.clock_in!) > LONG_SHIFT_HOURS) {
      setEditNote(`The clock has been running since ${dayLabel(ymdOf(new Date(mineHere.clock_in!)))} ${clockTime(mineHere.clock_in!)}, so it was probably left on. Put in when you really stopped.`);
      setEditing(mineHere);
      return;
    }
    setBusy(true);
    try { await closeOut(mineHere); } finally { setBusy(false); }
  }
  const blank = (): TimeEntry => ({
    id: crypto.randomUUID(), org_id: org.org_id, job_id: jobId, work_date: todayMi(), hours: 8, note: '',
    entered_by: user.id, entered_by_name: myName, worker_id: user.id, worker_name: myName, clock_in: null, clock_out: null, deleted_at: null,
  });
  const mayEdit = (e: TimeEntry) => office || e.worker_id === user.id || (!e.worker_id && e.entered_by === user.id);
  const costs = office ? total(jobExpenses(expenses, jobId)) : 0;
  const rate = office && billed && hours >= 1 ? perCrewHour(billed, hours) : null; // a few minutes would give a silly rate
  const longOn = mineElsewhere && hoursSince(mineElsewhere.clock_in!) > LONG_SHIFT_HOURS;

  return (
    <section className="card">
      <div className="row">
        <h3 className="row-icon" style={{ margin: 0 }}><Icon name="clock" />Hours</h3>
        <b>{hoursLabel(hours)} <span className="muted small">worked</span></b>
      </div>
      {office && (billed != null || costs > 0) && (
        <div className="hours-money small">
          {rate != null && <span>Earned <b>{money(rate)}</b> per hour worked</span>}
          {costs > 0 && <span>Job costs <b>{money(costs)}</b>{billed ? ` · left after costs ${money(round2(billed - costs))}` : ''}</span>}
        </div>
      )}
      {onClock.length > 0 && (
        <ul className="on-clock">
          {onClock.map((e) => (
            <li key={e.id}><span className="live-dot" aria-hidden />{e.worker_id === user.id ? 'You' : workerOf(e)} · on the clock since {clockTime(e.clock_in!)} ({elapsed(e.clock_in!)})</li>
          ))}
        </ul>
      )}
      <div className="btn-row mt">
        {mineHere ? (
          <button type="button" className="btn primary" disabled={busy} onClick={() => void clockOut()}><Icon name="clock" />Clock out · {elapsed(mineHere.clock_in!)}</button>
        ) : longOn ? null : (
          <button type="button" className="btn primary" disabled={busy} onClick={() => void clockIn()}><Icon name="play" size={16} />{mineElsewhere ? 'Switch to this job' : 'Clock in'}</button>
        )}
        <button type="button" className="btn" onClick={() => { setEditNote(''); setEditing(blank()); }}><Icon name="plus" />Add hours</button>
      </div>
      {mineElsewhere && (
        <p className="hint">
          You’re on the clock at <Link to={`/estimates/${mineElsewhere.job_id}`}>{elsewhereName}</Link> since {clockTime(mineElsewhere.clock_in!)}.{' '}
          {longOn ? 'Clock out there first and put in when you really stopped.' : 'Switching clocks you out there and in here.'}
        </p>
      )}
      {done.length > 0 && (
        <ul className="hours-list">
          {done.map((e) => (
            <li key={e.id}>
              <button type="button" className="hours-row" onClick={() => { if (mayEdit(e)) { setEditNote(''); setEditing(e); } }} disabled={!mayEdit(e)}>
                <span><b>{hoursLabel(Number(e.hours))}</b> · {workerOf(e)} · {dayLabel(e.work_date)}</span>
                <span className="muted small">{[e.clock_in && e.clock_out ? `${clockTime(e.clock_in)}–${clockTime(e.clock_out)}` : '', e.note].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <HoursSheet entry={editing} note={editNote} onClose={() => setEditing(null)} isNew={!!editing && !(all ?? []).some((x) => x.id === editing.id)} pickWorker={office} />
    </section>
  );
}

function HoursSheet({ entry, note, onClose, isNew, pickWorker }: { entry: TimeEntry | null; note: string; onClose: () => void; isNew: boolean; pickWorker: boolean }) {
  const { engine, org } = useReady();
  const members = useRows(engine, 'members');
  const team = (members ?? []).filter((m) => m.org_id === org.org_id && !m.deleted_at);
  const [e, setE] = useState<TimeEntry | null>(entry);
  const [inHm, setInHm] = useState('');
  const [outHm, setOutHm] = useState('');
  const [openedId, setOpenedId] = useState(entry?.id);
  const [error, setError] = useState('');
  if (entry?.id !== openedId) {
    setOpenedId(entry?.id);
    setE(entry);
    setError('');
    setInHm(entry?.clock_in ? hmOf(new Date(entry.clock_in)) : '');
    setOutHm(entry?.clock_out ? hmOf(new Date(entry.clock_out)) : entry?.clock_in ? '' : '');
  }
  if (!e) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const timed = !!e.clock_in;
  const timedHours = () => {
    if (!inHm || !outHm) return null;
    const a = miToIso(e.work_date, inHm);
    let b = miToIso(e.work_date, outHm);
    if (Date.parse(b) <= Date.parse(a)) b = new Date(Date.parse(b) + 86_400_000).toISOString(); // past midnight
    return { a, b, h: clockHours(a, b) };
  };
  const save = async () => {
    if (timed) {
      const t = timedHours();
      if (!t) return setError('Put in both times.');
      if (t.h > 24) return setError('That’s more than a day. Check the times.');
      if (t.b > new Date().toISOString()) return setError('The out time hasn’t happened yet.');
      await engine.save('time_entries', { ...e, clock_in: t.a, clock_out: t.b, hours: t.h });
      return onClose();
    }
    const h = round2(Number(e.hours));
    if (!(h > 0)) return setError('Enter the hours.');
    if (h > MAX_ENTRY_HOURS) return setError(`One entry can be at most ${MAX_ENTRY_HOURS} hours.`);
    await engine.save('time_entries', { ...e, hours: h });
    onClose();
  };
  const preview = timed ? timedHours() : null;
  const who = e.worker_id ? team.find((m) => m.user_id === e.worker_id) : null;
  return (
    <Sheet open={!!entry} onClose={onClose} title={isNew ? 'Add hours' : 'Hours'} action={<button type="button" className="btn primary sm" onClick={() => void save()}>Save</button>}>
      {note && <p className="notice" role="status">{note}</p>}
      {pickWorker && isNew ? (
        <Field label="Whose hours">
          <select value={e.worker_id ?? ''} onChange={(ev) => {
            const m = team.find((x) => x.user_id === ev.target.value);
            setE({ ...e, worker_id: m?.user_id ?? null, worker_name: m?.display_name ?? '' });
          }}>
            {team.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name || 'Unnamed'}</option>)}
          </select>
        </Field>
      ) : <p className="muted">{who?.display_name || workerOf(e)}</p>}
      <Field label="Day"><input type="date" value={e.work_date} onChange={(ev) => ev.target.value && setE({ ...e, work_date: ev.target.value })} /></Field>
      {timed ? (
        <div className="time-pair">
          <Field label="Clocked in"><input type="time" value={inHm} onChange={(ev) => setInHm(ev.target.value)} /></Field>
          <Field label="Clocked out"><input type="time" value={outHm} onChange={(ev) => setOutHm(ev.target.value)} /></Field>
        </div>
      ) : (
        <Field label="Hours" hint={e.worker_id ? 'Drive time included.' : 'An older crew total: everyone together.'}>
          <input type="number" inputMode="decimal" min={0.25} max={MAX_ENTRY_HOURS} step={0.25} value={e.hours ?? ''} onChange={(ev) => setE({ ...e, hours: Number(ev.target.value) })} />
        </Field>
      )}
      {preview && <p className="muted">That’s <b>{hoursLabel(preview.h)}</b>.</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <Field label="Note"><input value={e.note} onChange={(ev) => setE({ ...e, note: ev.target.value })} placeholder="Storm cleanup, extra chipper time…" /></Field>
      <button type="button" className="btn primary block" onClick={() => void save()}>Save hours</button>
      {!isNew && <button type="button" className="btn danger block mt" onClick={async () => {
        if (!confirm('Remove these hours?')) return;
        await engine.save('time_entries', { ...e, deleted_at: new Date().toISOString() });
        onClose();
      }}>Remove</button>}
    </Sheet>
  );
}
