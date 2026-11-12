import { describe, expect, it } from 'vitest';
import { allDaySpan, blankEvent, boardColumn, crewConflicts, eventDays, jobSchedule, miToIso, monthCells, onDay, weekDays, ymdOf } from './calendar';

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
