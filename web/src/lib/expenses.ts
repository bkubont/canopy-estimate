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

/** The database refuses a single entry above this (older crew-total entries could be a whole crew's day). */
export const MAX_ENTRY_HOURS = 200;

/** Hours between clocking in and out, to the minute (at least one minute). */
export function clockHours(inIso: string, outIso: string) {
  const min = Math.max(1, Math.round((Date.parse(outIso) - Date.parse(inIso)) / 60_000));
  return round2(min / 60);
}

/** A clock that is still running: clocked in, no hours yet. */
export const isOpen = (e: TimeEntry) => e.hours == null && !!e.clock_in && !e.deleted_at;

/** The person's running clock, on any job. */
export const openClockFor = (entries: TimeEntry[] | null | undefined, userId: string) =>
  live(entries).find((e) => isOpen(e) && e.worker_id === userId) ?? null;

/** Whose hours an entry is, for lists. Older entries were crew totals. */
export const workerOf = (e: TimeEntry) => e.worker_name || (e.worker_id ? 'Someone' : e.entered_by_name ? `${e.entered_by_name} (crew total)` : 'Crew total');

/** A shift longer than this was almost certainly a clock left running. */
export const LONG_SHIFT_HOURS = 16;

/** What a job earned per crew-hour (billed total ÷ crew-hours), or null without hours. */
export const perCrewHour = (billed: number, hours: number) => (hours > 0 ? round2(billed / hours) : null);

export const hoursLabel = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')} h`;
