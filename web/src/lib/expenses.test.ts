import { describe, expect, it } from 'vitest';
import { byCategory, categoriesIn, clockHours, expensesInMonth, hoursLabel, hoursTotal, isOpen, openClockFor, perCrewHour, total, workerOf } from './expenses';

const ex = (o: object) => ({ id: Math.random().toString(), org_id: 'o', spent_on: '2026-11-03', vendor: '', amount: 10, category: 'Fuel', paid_with: 'card', job_id: null, note: '', entered_by: null, entered_by_name: '', deleted_at: null, ...o }) as never;

describe('expenses and hours', () => {
  it('keeps typed-in categories and puts Other last', () => {
    expect(categoriesIn([ex({ category: 'Chainsaw parts' })]).slice(-2)).toEqual(['Chainsaw parts', 'Other']);
  });
  it('totals a month by category, ignoring removed and other months', () => {
    const list = expensesInMonth([ex({ amount: 64.2 }), ex({ amount: 120, category: 'Dump fees' }), ex({ amount: 5, deleted_at: 'x' }), ex({ spent_on: '2026-10-30' })], '2026-11');
    expect(total(list)).toBe(184.2);
    expect(byCategory(list)).toEqual([['Dump fees', 120], ['Fuel', 64.2]]);
  });
  it('turns clock-in to clock-out into that person\u2019s hours, to the minute', () => {
    expect(clockHours('2026-11-16T12:00:00Z', '2026-11-16T21:00:00Z')).toBe(9);
    expect(clockHours('2026-11-16T12:00:00Z', '2026-11-16T14:20:00Z')).toBe(2.33);
    expect(clockHours('2026-11-16T12:00:00Z', '2026-11-16T12:00:10Z')).toBe(0.02); // never zero
  });
  it('finds a person\u2019s running clock and leaves it out of the totals', () => {
    const te = (o: object) => ({ id: Math.random().toString(), org_id: 'o', job_id: 'j', work_date: '2026-11-16', hours: 4, note: '', entered_by: 'u1', entered_by_name: 'Bea', deleted_at: null, ...o }) as never;
    const running = te({ hours: null, worker_id: 'u2', worker_name: 'Sam', clock_in: '2026-11-16T12:00:00Z' });
    const list = [te({}), running, te({ hours: null, worker_id: 'u2', clock_in: 'x', deleted_at: 'y' })];
    expect(isOpen(running)).toBe(true);
    expect(openClockFor(list, 'u2')).toBe(running);
    expect(openClockFor(list, 'u1')).toBeNull();
    expect(hoursTotal(list.slice(0, 2))).toBe(4);
    expect(workerOf(running)).toBe('Sam');
    expect(workerOf(te({}))).toBe('Bea (crew total)');
  });
  it('works out earnings per crew-hour', () => {
    expect(perCrewHour(4000, 27)).toBe(148.15);
    expect(perCrewHour(4000, 0)).toBeNull();
    expect(hoursLabel(26.5)).toBe('26.5 h');
  });
});
