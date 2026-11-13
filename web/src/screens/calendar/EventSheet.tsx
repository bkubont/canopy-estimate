import { useMemo, useState } from 'react';
import { Chips, Field, Sheet, Stepper } from '../../components/ui';
import { allDaySpan, BID_HOURS, crewConflicts, dayLabel, EVENT_TYPES, eventDays, hmOf, isTask, miToIso, todayMi, ymdOf } from '../../lib/calendar';
import { clientName, daysLabel, normalizeJob, num } from '../../lib/estimate';
import { useReady, useRows } from '../../lib/session';
import type { CalEvent, Job } from '../../lib/types';

const STATUSES: [string, string][] = [['tentative', 'Tentative'], ['confirmed', 'Confirmed'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];

/** Fill a calendar entry from a job: title, place, equipment, and as many days as the job takes. */
export function eventForJob(e: CalEvent, job: Job, start?: string): CalEvent {
  const j = normalizeJob(job);
  const days = num(j.days) + j.change_orders.reduce((s, c) => s + num(c.days), 0);
  return {
    ...e, type: 'tree_work', job_id: j.id, all_day: true, unscheduled: false,
    title: e.title || `${clientName(j.client) || j.number}${j.client.town ? ` · ${j.client.town}` : ''}`,
    address: e.address || j.client.street, town: e.town || j.client.town,
    equipment: e.equipment.length ? e.equipment : j.equipment.map((l) => l.desc).filter(Boolean),
    ...allDaySpan(start ?? (e.starts.slice(0, 10) || todayMi()), days),
  };
}

export function EventSheet({ event, onClose, onSaved }: { event: CalEvent | null; onClose: () => void; onSaved?: (e: CalEvent) => void }) {
  const { engine } = useReady();
  const members = useRows(engine, 'members');
  const jobs = useRows(engine, 'jobs');
  const events = useRows(engine, 'events');
  const [e, setE] = useState<CalEvent | null>(event);
  const [openedId, setOpenedId] = useState(event?.id);
  if (event?.id !== openedId) {
    setOpenedId(event?.id);
    setE(event);
  }

  const signedJobs = useMemo(() => (jobs ?? []).filter((j) => j.signed_at && j.stage !== 'paid').sort((a, b) => a.number.localeCompare(b.number)), [jobs]);
  const conflicts = useMemo(() => (e ? crewConflicts(e, events ?? []) : []), [e, events]);
  const nameOf = (id: string) => (members ?? []).find((m) => m.user_id === id)?.display_name || 'Someone';

  if (!e) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const isNew = !(events ?? []).some((x) => x.id === e.id);
  const set = (patch: Partial<CalEvent>) => setE({ ...e, ...patch });
  const day = e.starts ? (e.all_day ? e.starts.slice(0, 10) : ymdOf(new Date(e.starts))) : todayMi();
  const spanDays = e.all_day ? Math.max(1, eventDays(e).length) : 1;
  const startHm = !e.all_day && e.starts ? hmOf(new Date(e.starts)) : '09:00';
  const hours = !e.all_day && e.starts && e.ends ? (new Date(e.ends).getTime() - new Date(e.starts).getTime()) / 3600000 : BID_HOURS;

  const setDay = (ymd: string) => set(e.all_day ? allDaySpan(ymd, spanDays) : timed(ymd, startHm, hours));
  const timed = (ymd: string, hm: string, h: number) => {
    const starts = miToIso(ymd, hm);
    return { starts, ends: new Date(new Date(starts).getTime() + h * 3600000).toISOString() };
  };

  function setType(type: string) {
    if (type === 'estimate_visit') return set({ type, all_day: false, unscheduled: false, ...timed(day, startHm, BID_HOURS), title: e!.title || 'Bid visit' });
    const next: Partial<CalEvent> = { type, all_day: true, ...(e!.all_day ? {} : allDaySpan(day, 1)) };
    if (!e!.title || EVENT_TYPES.some(([, l]) => l === e!.title)) next.title = type === 'tree_work' ? '' : EVENT_TYPES.find(([id]) => id === type)?.[1] ?? '';
    if (!isTask(type)) next.unscheduled = false;
    set(next);
  }

  async function save() {
    if (!e) return;
    const out = e.unscheduled ? { ...e, starts: '', ends: '' } : e.starts ? e : { ...e, ...allDaySpan(todayMi(), 1) };
    if (!out.title.trim()) out.title = EVENT_TYPES.find(([id]) => id === out.type)?.[1] ?? 'Entry';
    await engine.save('events', out);
    onSaved?.(out);
    onClose();
  }

  return (
    <Sheet open={!!event} onClose={onClose} title={isNew ? 'Add to calendar' : 'Calendar entry'}
      action={<button type="button" className="btn primary sm" onClick={() => void save()}>Save</button>}>
      <h4 className="label">What</h4>
      <Chips label="Type" options={EVENT_TYPES} value={e.type} onChange={(v) => v && setType(v)} required />

      {(e.type === 'tree_work' || e.type === 'estimate_visit') && (
        <Field label={e.type === 'tree_work' ? 'Job' : 'Estimate (optional)'}>
          <select value={e.job_id ?? ''} onChange={(ev) => {
            const job = (jobs ?? []).find((j) => j.id === ev.target.value);
            if (!job) return set({ job_id: null });
            set(e.type === 'tree_work' ? eventForJob({ ...e, title: '', address: '', town: '', equipment: [] }, job, day) : {
              job_id: job.id, title: e.title === 'Bid visit' ? `Bid · ${clientName(normalizeJob(job).client)}` : e.title,
              address: e.address || normalizeJob(job).client.street, town: e.town || normalizeJob(job).client.town,
            });
          }}>
            <option value="">{e.type === 'tree_work' ? 'Choose a signed estimate…' : 'None'}</option>
            {(e.type === 'tree_work' ? signedJobs : jobs ?? []).map((j) => (
              <option key={j.id} value={j.id}>{j.number} · {clientName(normalizeJob(j).client) || 'No name'}{j.client?.town ? ` · ${j.client.town}` : ''}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Title"><input value={e.title} onChange={(ev) => set({ title: ev.target.value })} placeholder="Shown on the calendar" /></Field>

      {isTask(e.type) && (
        <label className="check">
          <input type="checkbox" checked={e.unscheduled} onChange={(ev) => set(ev.target.checked ? { unscheduled: true } : { unscheduled: false, ...allDaySpan(day, 1) })} />
          <span>No day yet: keep it in the task list</span>
        </label>
      )}

      {!e.unscheduled && (
        <>
          <div className="two">
            <Field label="Date"><input type="date" value={day} onChange={(ev) => ev.target.value && setDay(ev.target.value)} /></Field>
            {e.all_day ? (
              <div className="field"><span>Days</span><Stepper label="Days" value={spanDays} min={1} onChange={(v) => set(allDaySpan(day, v))} /></div>
            ) : (
              <Field label="Start time"><input type="time" value={startHm} onChange={(ev) => ev.target.value && set(timed(day, ev.target.value, hours))} /></Field>
            )}
          </div>
          {e.all_day && spanDays > 1 && <p className="hint">{dayLabel(day)} to {dayLabel(eventDays(e).at(-1)!)}</p>}
          {e.type === 'tree_work' && e.job_id && (
            <p className="hint">Estimate is for {daysLabel(num(normalizeJob((jobs ?? []).find((j) => j.id === e.job_id) ?? ({} as Job)).days))}.</p>
          )}
        </>
      )}

      <h4 className="label">Crew</h4>
      <div className="chips" role="group" aria-label="Crew">
        {(members ?? []).map((m) => {
          const on = e.assigned_to.includes(m.user_id);
          return (
            <button key={m.user_id} type="button" className="chip" aria-pressed={on}
              onClick={() => set({ assigned_to: on ? e.assigned_to.filter((x) => x !== m.user_id) : [...e.assigned_to, m.user_id] })}>
              {m.display_name || 'No name'}
            </button>
          );
        })}
      </div>
      {conflicts.length > 0 && (
        <div className="card notice warn mt" role="alert">
          <b>Double-booked</b>
          {conflicts.map((c) => (
            <p key={c.id} className="small" style={{ margin: '4px 0 0' }}>
              {c.assigned_to.filter((p) => e.assigned_to.includes(p)).map(nameOf).join(', ')} is also on “{c.title}” ({eventDays(c).map((d) => dayLabel(d)).join(', ')}).
            </p>
          ))}
          <p className="muted small" style={{ margin: '4px 0 0' }}>You can still save.</p>
        </div>
      )}

      <h4 className="label">Status</h4>
      <Chips label="Status" options={STATUSES} value={e.status} onChange={(v) => v && set({ status: v })} required />
      <div className="mt" />
      <div className="two">
        <Field label="Address"><input value={e.address} onChange={(ev) => set({ address: ev.target.value })} /></Field>
        <Field label="Town"><input value={e.town} onChange={(ev) => set({ town: ev.target.value })} /></Field>
      </div>
      <Field label="Equipment"><input value={e.equipment.join(', ')} onChange={(ev) => set({ equipment: ev.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Comma-separated" /></Field>
      <Field label="Notes"><textarea rows={2} value={e.notes} onChange={(ev) => set({ notes: ev.target.value })} /></Field>
      <button type="button" className="btn primary block" onClick={() => void save()}>Save</button>
      {!isNew && (
        <button type="button" className="btn danger block mt" onClick={async () => {
          if (!confirm('Remove this from the calendar?')) return;
          await engine.remove('events', e);
          onClose();
        }}>Remove from calendar</button>
      )}
    </Sheet>
  );
}
