import { describe, expect, it } from 'vitest';
import { moneyTypeFromSearch, receiptsInMonth } from './Expenses';

const expense = (o: object) => ({
  id: 'e', org_id: 'o', spent_on: '2026-11-05', vendor: '', amount: 10, category: 'Fuel',
  paid_with: 'card', job_id: null, note: '', entered_by: null, entered_by_name: '', deleted_at: null, ...o,
}) as never;

const photo = (o: object) => ({
  id: 'p', org_id: 'o', job_id: null, tree_id: null, kind: 'receipt', path: 'p.jpg',
  width: 1, height: 1, bytes: 1, taken_by: null, taken_by_name: '', note: '',
  expense_id: null, created_at: '2026-11-10T12:00:00Z', deleted_at: null, ...o,
}) as never;

describe('moneyTypeFromSearch', () => {
  it('defaults to expenses and only treats type=receipts as receipts', () => {
    expect(moneyTypeFromSearch(null)).toBe('expenses');
    expect(moneyTypeFromSearch('')).toBe('expenses');
    expect(moneyTypeFromSearch('expenses')).toBe('expenses');
    expect(moneyTypeFromSearch('receipts')).toBe('receipts');
  });
});

describe('receiptsInMonth', () => {
  it('keeps receipts tied to live expenses in the month, drops deleted ones', () => {
    const expenses = [
      expense({ id: 'e1', spent_on: '2026-11-05', vendor: 'Marathon' }),
      expense({ id: 'e2', spent_on: '2026-11-08', vendor: 'Home Depot', deleted_at: '2026-11-09T00:00:00Z' }),
      expense({ id: 'e3', spent_on: '2026-10-01', vendor: 'Old' }),
    ];
    const photos = [
      photo({ id: 'p1', expense_id: 'e1' }),
      photo({ id: 'p2', expense_id: 'e2' }),
      photo({ id: 'p3', expense_id: 'e3' }),
      photo({ id: 'p4', kind: 'before', expense_id: 'e1' }),
    ];
    const rows = receiptsInMonth(photos, expenses, '2026-11');
    expect(rows.map((r) => r.p.id)).toEqual(['p1']);
  });

  it('filters by vendor / category / note search', () => {
    const expenses = [
      expense({ id: 'e1', spent_on: '2026-11-05', vendor: 'Marathon', category: 'Fuel' }),
      expense({ id: 'e2', spent_on: '2026-11-06', vendor: 'Depot', category: 'Supplies', note: 'chips' }),
    ];
    const photos = [
      photo({ id: 'p1', expense_id: 'e1' }),
      photo({ id: 'p2', expense_id: 'e2' }),
    ];
    expect(receiptsInMonth(photos, expenses, '2026-11', 'fuel').map((r) => r.p.id)).toEqual(['p1']);
    expect(receiptsInMonth(photos, expenses, '2026-11', 'CHIPS').map((r) => r.p.id)).toEqual(['p2']);
  });
});
