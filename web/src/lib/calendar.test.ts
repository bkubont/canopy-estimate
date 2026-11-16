import { describe, expect, it } from 'vitest';
import { allDaySpan, blankEvent, boardColumn, crewConflicts, eventDays, jobSchedule, miToIso, monthCells, onDay, reorderDay, scheduleJob, timeLabel, visitEventFor, visitForJob, weekDays, workDays, ymdOf } from './calendar';

const ev = (patch: Parameters<typeof blankEvent>[1]) => blankEvent('o1', patch);

describe('calendar', () => {
  it('converts Michigan times across daylight saving', () => {
    expect(miToIso('2026-07-01', '09:00')).toBe('2026-07-01T13:00:00.000Z'); // EDT
    expect(miToIso('2026-12-01', '09:00')).toBe('2026-12-01T14:00:00.000Z'); // EST
    expect(ymdOf(new Date('2026-11-13T04:30:00Z'))).toBe('2026-11-12'); // 11:30pm Michigan
  });

  it('weeks start on Sunday and months fill a 6-week grid', () => {
    expect(weekDays('2026-11-12')[0]).toBe('2026-11-08');
    expect(weekDays('2026-11-12')[6]).toBe('2026-11-14');
    const cells = monthCells('2026-11-12');
    expect(cells).toHaveLength(42);
    expect(cells[0]).toBe('2026-11-01');
  });

  it('a 2-day job covers both days; a timed bid covers its own day', () => {
    expect(eventDays(ev({ all_day: true, ...allDaySpan('2026-11-16', 2) }))).toEqual(['2026-11-16', '2026-11-17']);
    expect(eventDays(ev({ all_day: true, ...allDaySpan('2026-11-16', 0.5) }))).toEqual(['2026-11-16']);
    expect(eventDays(ev({ all_day: false, starts: miToIso('2026-11-16', '22:00'), ends: miToIso('2026-11-16', '23:30') }))).toEqual(['2026-11-16']);
    expect(eventDays(ev({ unscheduled: true }))).toEqual([]);
  });

  it('puts jobs first, then bids in time order, and hides cancelled entries', () => {
    const day = '2026-11-16';
    const list = onDay([
      ev({ type: 'dump_run', title: 'Dump', ...allDaySpan(day, 1) }),
      ev({ type: 'estimate_visit', title: 'Bid 2pm', all_day: false, starts: miToIso(day, '14:00'), ends: miToIso(day, '16:00') }),
      ev({ type: 'estimate_visit', title: 'Bid 9am', all_day: false, starts: miToIso(day, '09:00'), ends: miToIso(day, '11:00') }),
      ev({ type: 'tree_work', title: 'Job', ...allDaySpan(day, 1) }),
      ev({ type: 'tree_work', title: 'Cancelled', status: 'cancelled', ...allDaySpan(day, 1) }),
    ], day);
    expect(list.map((e) => e.title)).toEqual(['Job', 'Bid 9am', 'Bid 2pm', 'Dump']);
  });

  it('a job is Scheduled only while it has a tree-work day on the calendar', () => {
    const job = { id: 'j', signed_at: 'x', status: 'approved' as const, stage: 'estimate' as const };
    const day = ev({ type: 'tree_work', job_id: 'j', ...allDaySpan('2026-11-16', 2) });
    expect(boardColumn(job, [])).toBe('approved');
    expect(boardColumn(job, [day])).toBe('scheduled');
    expect(boardColumn(job, [{ ...day, status: 'cancelled' }])).toBe('approved');
    expect(boardColumn(job, [{ ...day, deleted_at: 'x' }])).toBe('approved');
    expect(boardColumn({ ...job, signed_at: null }, [day])).toBe('pending');
    expect(boardColumn({ ...job, status: 'in_progress' }, [day])).toBe('in_progress');
    expect(boardColumn({ ...job, stage: 'invoice' }, [day])).toBe('invoiced');
    expect(boardColumn({ ...job, stage: 'paid' }, [day])).toBe('paid');
    expect(jobSchedule('j', [day])).toMatchObject({ start: '2026-11-16', end: '2026-11-17' });
  });

  it('flags a crew member booked in two places', () => {
    const a = ev({ type: 'tree_work', assigned_to: ['sam'], ...allDaySpan('2026-11-16', 2) });
    const b = ev({ type: 'tree_work', assigned_to: ['sam', 'pat'], ...allDaySpan('2026-11-17', 1) });
    const c = ev({ type: 'tree_work', assigned_to: ['pat'], ...allDaySpan('2026-11-17', 1) });
    const d = ev({ type: 'tree_work', assigned_to: ['sam'], ...allDaySpan('2026-11-18', 1) });
    expect(crewConflicts(a, [a, b, c, d]).map((e) => e.id)).toEqual([b.id]);
    // Back-to-back bids on the same day are fine; overlapping ones are not.
    const bid1 = ev({ all_day: false, assigned_to: ['sam'], starts: miToIso('2026-11-20', '09:00'), ends: miToIso('2026-11-20', '11:00') });
    const bid2 = ev({ all_day: false, assigned_to: ['sam'], starts: miToIso('2026-11-20', '11:00'), ends: miToIso('2026-11-20', '13:00') });
    const bid3 = ev({ all_day: false, assigned_to: ['sam'], starts: miToIso('2026-11-20', '10:00'), ends: miToIso('2026-11-20', '12:00') });
    expect(crewConflicts(bid1, [bid2])).toEqual([]);
    expect(crewConflicts(bid1, [bid3]).length).toBe(1);
  });
});

describe('scheduling from the month view', () => {
  const job = (days: number) => ({
    id: 'j1', org_id: 'o1', number: 'E-1001', days, change_orders: [], equipment: [{ id: 'e', desc: 'Stump grinder', qty: 1 }],
    client: { firstName: 'Dana', lastName: 'Smith', town: 'Kingsley', street: '1 Main' }, trees: [], site: {},
  }) as never;

  it('skips Sundays and only Sundays', () => {
    // 2026-11-20 is a Friday
    expect(workDays('2026-11-20', 3)).toEqual(['2026-11-20', '2026-11-21', '2026-11-23']);
    expect(workDays('2026-11-22', 1)).toEqual(['2026-11-23']); // dropped on a Sunday → Monday
  });

  it('a 3-day job dropped on Friday becomes Fri–Sat and Monday', () => {
    const evs = scheduleJob('o1', job(3), '2026-11-20');
    expect(evs.map((e) => [e.starts, e.ends])).toEqual([['2026-11-20', '2026-11-22'], ['2026-11-23', '2026-11-24']]);
    expect(evs.every((e) => e.type === 'tree_work' && e.job_id === 'j1' && e.title === 'Dana Smith · Kingsley')).toBe(true);
    expect(jobSchedule('j1', evs).days).toEqual(['2026-11-20', '2026-11-21', '2026-11-23']);
  });

  it('a half-day job still takes one day', () => {
    expect(scheduleJob('o1', job(0.5), '2026-11-18').map((e) => [e.starts, e.ends])).toEqual([['2026-11-18', '2026-11-19']]);
  });

  it('moving an entry down swaps it with the next one and keeps the order on the day', () => {
    const day = '2026-11-16';
    const a = ev({ id: 'a', title: 'A', ...allDaySpan(day, 1), type: 'tree_work' });
    const b = ev({ id: 'b', title: 'B', ...allDaySpan(day, 1), type: 'equipment_rental' });
    const changed = reorderDay(onDay([a, b], day), 0, 1);
    const after = onDay([a, b].map((e) => changed.find((c) => c.id === e.id) ?? e), day);
    expect(after.map((e) => e.id)).toEqual(['b', 'a']);
    expect(reorderDay(after, 0, -1)).toEqual([]); // already first
  });
});

describe('estimate visits for new leads', () => {
  const lead = { id: 'j9', org_id: 'o1', number: 'E-1009', client: { firstName: 'Jim', lastName: 'Peterson', street: '310 Benzie Blvd', town: 'Beulah' }, trees: [], equipment: [], change_orders: [], days: 0, site: {} } as never;
  it('makes a two-hour bid at 9 am, filled in from the lead', () => {
    const v = visitEventFor('o1', lead, '2026-11-18');
    expect(v).toMatchObject({ type: 'estimate_visit', job_id: 'j9', title: 'Bid · Jim Peterson', town: 'Beulah', all_day: false });
    expect(timeLabel(v)).toBe('9am–11am');
  });
  it('finds the next visit coming up, else the last one', () => {
    const past = visitEventFor('o1', lead, '2026-11-10');
    const next = visitEventFor('o1', lead, '2026-11-20');
    expect(visitForJob('j9', [past, next], '2026-11-16T12:00:00Z')?.id).toBe(next.id);
    expect(visitForJob('j9', [past], '2026-11-16T12:00:00Z')?.id).toBe(past.id);
    expect(visitForJob('j9', [{ ...next, status: 'cancelled' }], '2026-11-16T12:00:00Z')).toBeNull();
  });
});
