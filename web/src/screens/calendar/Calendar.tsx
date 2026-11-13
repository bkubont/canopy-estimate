import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allDaySpan, blankEvent, dayLabel, EVENT_LABEL, isActive, isTask, monthCells, onDay, timeLabel, todayMi, weekDays } from '../../lib/calendar';
import { addDays } from '../../lib/estimate';
import { can, useReady, useRows } from '../../lib/session';
import type { CalEvent } from '../../lib/types';
import { EventSheet } from './EventSheet';

type View = 'week' | 'month';

function loadPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode */
  }
}

export function Calendar() {
  const { engine, org, user } = useReady();
  const events = useRows(engine, 'events');
  const members = useRows(engine, 'members');
  const [cursor, setCursor] = useState(todayMi());
  const [view, setView] = useState<View>(() => loadPref('canopy.calView', 'week'));
  // Crew start on their own schedule; owner/office see everyone.
  const [mineOnly, setMineOnly] = useState(() => loadPref('canopy.calMine', org.role === 'crew' ? '1' : '0') === '1');
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [selected, setSelected] = useState(todayMi());
  const today = todayMi();

  const visible = useMemo(
    () => (events ?? []).filter((e) => isActive(e) && (!mineOnly || e.assigned_to?.includes(user.id))),
    [events, mineOnly, user.id],
  );
  const pool = visible.filter((e) => e.unscheduled && isTask(e.type)).sort((a, b) => a.title.localeCompare(b.title));
  const initials = (ids: string[]) =>
    ids.map((id) => (members ?? []).find((m) => m.user_id === id)?.display_name?.split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '?').join(' ');

  const shift = (dir: number) => {
    if (view === 'week') setCursor(addDays(cursor, 7 * dir));
    else {
      const d = new Date(`${cursor.slice(0, 8)}15T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + dir);
      setCursor(d.toISOString().slice(0, 10));
    }
  };
  const days = weekDays(cursor);
  const heading = view === 'week'
    ? `${dayLabel(days[0]!, { month: 'short', day: 'numeric' })} – ${dayLabel(days[6]!, { month: 'short', day: 'numeric', year: 'numeric' })}`
    : dayLabel(cursor, { month: 'long', year: 'numeric' });

  const addOn = (ymd: string) => setEditing(blankEvent(org.org_id, { type: can.seePrices(org.role) ? 'tree_work' : 'dump_run', title: can.seePrices(org.role) ? '' : 'Dump run', ...allDaySpan(ymd, 1) }));

  const Entry = ({ e }: { e: CalEvent }) => (
    <button type="button" className={`cal-entry type-${e.type} status-${e.status}`} onClick={() => setEditing(e)} title={e.title}>
      <span className="cal-entry-title">{e.title || EVENT_LABEL[e.type]}</span>
      <span className="cal-entry-meta">
        {timeLabel(e) || EVENT_LABEL[e.type]}
        {e.assigned_to?.length ? ` · ${initials(e.assigned_to)}` : ''}
      </span>
    </button>
  );

  return (
    <div className="page cal-page">
      <div className="cal-toolbar">
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn sm" onClick={() => { setCursor(today); setSelected(today); }}>Today</button>
          <button type="button" className="icon-btn" aria-label="Previous" onClick={() => shift(-1)}>‹</button>
          <button type="button" className="icon-btn" aria-label="Next" onClick={() => shift(1)}>›</button>
          <h2 className="cal-heading">{heading}</h2>
        </div>
        <div className="btn-row">
          <div className="chips" role="group" aria-label="View">
            {(['week', 'month'] as View[]).map((v) => (
              <button key={v} type="button" className="chip" aria-pressed={view === v} onClick={() => { setView(v); savePref('canopy.calView', v); }}>
                {v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={mineOnly} onClick={() => { setMineOnly(!mineOnly); savePref('canopy.calMine', mineOnly ? '0' : '1'); }}>
              Only mine
            </button>
          </div>
          <button type="button" className="btn primary sm" onClick={() => addOn(view === 'week' && cursor !== today ? days[0]! : today)}>＋ Add</button>
          <Link to="/board" className="btn sm">Jobs board</Link>
        </div>
      </div>

      <section className="card cal-pool">
        <div className="row">
          <h3 style={{ margin: 0 }}>Tasks with no day yet</h3>
          <button type="button" className="btn sm" onClick={() => setEditing(blankEvent(org.org_id, { type: 'dump_run', title: 'Dump run', unscheduled: true }))}>＋ Task</button>
        </div>
        {pool.length ? (
          <div className="cal-pool-list">{pool.map((e) => <Entry key={e.id} e={e} />)}</div>
        ) : (
          <p className="muted small" style={{ margin: '6px 0 0' }}>Dump runs, rentals and maintenance can wait here. Tap one to pick its day.</p>
        )}
      </section>

      {events === null ? <p className="empty">Loading…</p> : view === 'week' ? (
        <div className="cal-week" role="grid" aria-label="Week">
          {days.map((d) => {
            const list = onDay(visible, d);
            return (
              <section key={d} className={`cal-day ${d === today ? 'today' : ''}`} role="row" aria-label={dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}>
                <header className="cal-day-head">
                  <span className="dow">{dayLabel(d, { weekday: 'short' })}</span>
                  <span className="dom">{Number(d.slice(8))}</span>
                </header>
                <div className="cal-day-list">
                  {list.length ? list.map((e) => <Entry key={e.id} e={e} />) : <p className="muted small cal-empty">Nothing yet</p>}
                </div>
                <button type="button" className="link small cal-add" onClick={() => addOn(d)}>＋ Add</button>
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="cal-month">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <div key={w} className="cal-dow">{w}</div>)}
            {monthCells(cursor).map((d) => {
              const list = onDay(visible, d);
              return (
                <button key={d} type="button" className={`cal-cell ${d.slice(5, 7) !== cursor.slice(5, 7) ? 'outside' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'selected' : ''}`}
                  onClick={() => setSelected(d)} aria-label={`${dayLabel(d, { month: 'long', day: 'numeric' })}, ${list.length} entries`}>
                  <span className="dom">{Number(d.slice(8))}</span>
                  {list.slice(0, 3).map((e) => <span key={e.id} className={`cal-dot type-${e.type}`}>{e.title}</span>)}
                  {list.length > 3 && <span className="muted small">+{list.length - 3}</span>}
                </button>
              );
            })}
          </div>
          <section className="card mt">
            <div className="row">
              <h3 style={{ margin: 0 }}>{dayLabel(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
              <button type="button" className="btn sm" onClick={() => addOn(selected)}>＋ Add</button>
            </div>
            <div className="cal-day-list mt">
              {onDay(visible, selected).map((e) => <Entry key={e.id} e={e} />)}
              {onDay(visible, selected).length === 0 && <p className="muted small">Nothing on this day.</p>}
            </div>
          </section>
        </>
      )}

      <EventSheet event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
