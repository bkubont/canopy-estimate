import { useEffect, useMemo, useState } from 'react';
import { dayLabel, hmOf, timeLabel, todayMi } from '../lib/calendar';
import { money, round2 } from '../lib/estimate';
import { clockHours, hoursLabel, hoursTotal, jobEntries, jobExpenses, perCrewHour, total } from '../lib/expenses';
import { can, useReady, useRow, useRows } from '../lib/session';
import type { TimeEntry } from '../lib/types';
import { Icon } from './Icon';
import { Field, Sheet, Stepper } from './ui';

const clockKey = (userId: string, jobId: string) => `canopy.clock.${userId}.${jobId}`;
const readClock = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeClock = (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private mode */ } };

function elapsed(startIso: string) {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(startIso)) / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
const clockTime = (iso: string) => timeLabel({ all_day: false, starts: iso, ends: iso } as never).split('–')[0] ?? hmOf(new Date(iso));

/**
 * Crew-hours on a job, for job costing (not payroll; drive time counts).
 * The clock is kept on this phone, so it keeps running with the screen locked
 * or no signal; stopping it asks how many people were there.
 */
export function JobHours({ jobId, billed }: { jobId: string; billed?: number }) {
  const { engine, org, user } = useReady();
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const members = useRows(engine, 'members');
  const all = useRows(engine, 'time_entries');
  const expenses = useRows(engine, 'expenses');
  const office = can.seePrices(org.role);
  const entries = useMemo(() => jobEntries(all, jobId), [all, jobId]);
  const hours = hoursTotal(entries);
  const key = clockKey(user.id, jobId);
  const [started, setStarted] = useState(() => readClock(key));
  const [, tick] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [people, setPeople] = useState(2);
  const [editing, setEditing] = useState<TimeEntry | null>(null);

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [started]);

  const start = () => { const now = new Date().toISOString(); writeClock(key, now); setStarted(now); };
  async function stop() {
    if (!started) return;
    const h = clockHours(started, new Date().toISOString(), people);
    await engine.save('time_entries', {
      id: crypto.randomUUID(), org_id: org.org_id, job_id: jobId, work_date: todayMi(), hours: h,
      note: `Clock ${clockTime(started)}–${clockTime(new Date().toISOString())}, ${people} ${people === 1 ? 'person' : 'people'}`,
      entered_by: user.id, entered_by_name: me?.display_name ?? '', deleted_at: null,
    });
    writeClock(key, null);
    setStarted(null);
    setStopping(false);
  }
  const blank = (): TimeEntry => ({ id: crypto.randomUUID(), org_id: org.org_id, job_id: jobId, work_date: todayMi(), hours: 8, note: '', entered_by: user.id, entered_by_name: me?.display_name ?? '', deleted_at: null });
  const mayEdit = (e: TimeEntry) => office || e.entered_by === user.id;
  const costs = office ? total(jobExpenses(expenses, jobId)) : 0;
  const rate = office && billed ? perCrewHour(billed, hours) : null;

  return (
    <section className="card">
      <div className="row">
        <h3 className="row-icon" style={{ margin: 0 }}><Icon name="clock" />Hours</h3>
        <b>{hoursLabel(hours)} <span className="muted small">crew-hours</span></b>
      </div>
      {office && (billed != null || costs > 0) && (
        <div className="hours-money small">
          {rate != null && <span>Earned <b>{money(rate)}</b> per crew-hour</span>}
          {costs > 0 && <span>Job costs <b>{money(costs)}</b>{billed ? ` · left after costs ${money(round2(billed - costs))}` : ''}</span>}
        </div>
      )}
      <div className="btn-row mt">
        {started ? (
          <button type="button" className="btn primary" onClick={() => { setPeople(Math.max(1, Math.min(6, (members ?? []).filter((m) => !m.deleted_at).length))); setStopping(true); }}><Icon name="clock" />Stop clock · {elapsed(started)}</button>
        ) : (
          <button type="button" className="btn primary" onClick={start}><Icon name="play" size={16} />Start clock</button>
        )}
        <button type="button" className="btn" onClick={() => setEditing(blank())}><Icon name="plus" />Add hours</button>
      </div>
      {started && <p className="hint">Running since {clockTime(started)} on this phone. It keeps going with the screen off.</p>}
      {entries.length > 0 && (
        <ul className="hours-list">
          {entries.map((e) => (
            <li key={e.id}>
              <button type="button" className="hours-row" onClick={() => mayEdit(e) && setEditing(e)} disabled={!mayEdit(e)}>
                <span><b>{hoursLabel(Number(e.hours))}</b> · {dayLabel(e.work_date)}</span>
                <span className="muted small">{[e.entered_by_name, e.note].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={stopping} onClose={() => setStopping(false)} title="Stop the clock">
        {started && <p>Clock ran {elapsed(started)} (since {clockTime(started)}), drive time included.</p>}
        <div className="field"><span>How many people were working?</span><Stepper label="People" value={people} min={1} onChange={setPeople} /></div>
        {started && <p className="muted">That’s <b>{hoursLabel(clockHours(started, new Date().toISOString(), people))}</b> crew-hours.</p>}
        <button type="button" className="btn primary block" onClick={() => void stop()}>Save hours</button>
        <button type="button" className="btn block mt" onClick={() => { writeClock(key, null); setStarted(null); setStopping(false); }}>Discard this clock</button>
      </Sheet>
      <HoursSheet entry={editing} onClose={() => setEditing(null)} isNew={!!editing && !entries.some((x) => x.id === editing.id)} />
    </section>
  );
}

function HoursSheet({ entry, onClose, isNew }: { entry: TimeEntry | null; onClose: () => void; isNew: boolean }) {
  const { engine } = useReady();
  const [e, setE] = useState<TimeEntry | null>(entry);
  const [openedId, setOpenedId] = useState(entry?.id);
  if (entry?.id !== openedId) { setOpenedId(entry?.id); setE(entry); }
  if (!e) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const save = async () => { if (Number(e.hours) > 0) { await engine.save('time_entries', { ...e, hours: round2(Number(e.hours)) }); onClose(); } };
  return (
    <Sheet open={!!entry} onClose={onClose} title={isNew ? 'Add hours' : 'Hours'} action={<button type="button" className="btn primary sm" onClick={() => void save()}>Save</button>}>
      <Field label="Day"><input type="date" value={e.work_date} onChange={(ev) => ev.target.value && setE({ ...e, work_date: ev.target.value })} /></Field>
      <Field label="Crew-hours" hint="Everyone together, drive time included: 3 people × 9 hours = 27.">
        <input type="number" inputMode="decimal" min={0.25} step={0.25} value={e.hours} onChange={(ev) => setE({ ...e, hours: Number(ev.target.value) })} />
      </Field>
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
