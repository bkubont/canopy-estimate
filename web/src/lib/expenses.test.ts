import { describe, expect, it } from 'vitest';
import { byCategory, categoriesIn, clockHours, expensesInMonth, hoursLabel, perCrewHour, total } from './expenses';

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
  it('turns a running clock into crew-hours (drive time counts)', () => {
    expect(clockHours('2026-11-16T12:00:00Z', '2026-11-16T21:00:00Z', 3)).toBe(27);
    expect(clockHours('2026-11-16T12:00:00Z', '2026-11-16T12:05:00Z', 1)).toBe(0.25);
    expect(clockHours('2026-11-16T12:00:00Z', '2026-11-16T14:20:00Z', 2)).toBe(4.75);
  });
  it('works out earnings per crew-hour', () => {
    expect(perCrewHour(4000, 27)).toBe(148.15);
    expect(perCrewHour(4000, 0)).toBeNull();
    expect(hoursLabel(26.5)).toBe('26.5 h');
  });
});
