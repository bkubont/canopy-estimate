import { round2 } from './estimate';
import type { Expense, PaidWith, TimeEntry } from './types';

export const EXPENSE_CATEGORIES = ['Fuel', 'Dump fees', 'Equipment rental', 'Repairs & maintenance', 'Supplies', 'Subcontractors', 'Other'];
export const PAID_WITH: [PaidWith, string][] = [['card', 'Card'], ['cash', 'Cash'], ['check', 'Check'], ['other', 'Other']];

const live = <T extends { deleted_at?: string | null }>(rows: T[] | null | undefined) => (rows ?? []).filter((r) => !r.deleted_at);

/** The standard categories plus any the team has typed in before. */
export function categoriesIn(expenses: Expense[] | null | undefined) {
  const used = live(expenses).map((e) => e.category.trim()).filter(Boolean);
  return [...new Set([...EXPENSE_CATEGORIES.slice(0, -1), ...used.filter((c) => !EXPENSE_CATEGORIES.includes(c)).sort(), 'Other'])];
}

export function expensesInMonth(expenses: Expense[] | null | undefined, ym: string) {
  return live(expenses).filter((e) => e.spent_on.startsWith(ym)).sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.amount - a.amount);
}

export function byCategory(expenses: Expense[]) {
  const m = new Map<string, number>();
  for (const e of expenses) m.set(e.category || 'Other', round2((m.get(e.category || 'Other') ?? 0) + Number(e.amount)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export const total = (rows: { amount: number }[]) => round2(rows.reduce((s, r) => s + Number(r.amount || 0), 0));

export const jobExpenses = (expenses: Expense[] | null | undefined, jobId: string) => live(expenses).filter((e) => e.job_id === jobId);

// ---------------------------------------------------------------- hours

export const jobEntries = (entries: TimeEntry[] | null | undefined, jobId: string) =>
  live(entries).filter((e) => e.job_id === jobId).sort((a, b) => b.work_date.localeCompare(a.work_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));

export const hoursTotal = (entries: TimeEntry[]) => round2(entries.reduce((s, e) => s + Number(e.hours || 0), 0));

/** Crew-hours from a running clock: elapsed time × people, rounded to the quarter hour. */
export function clockHours(startIso: string, endIso: string, people: number) {
  const h = Math.max(0, (Date.parse(endIso) - Date.parse(startIso)) / 3_600_000);
  return Math.max(0.25, Math.round(h * Math.max(1, people) * 4) / 4);
}

/** What a job earned per crew-hour (billed total ÷ crew-hours), or null without hours. */
export const perCrewHour = (billed: number, hours: number) => (hours > 0 ? round2(billed / hours) : null);

export const hoursLabel = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')} h`;
