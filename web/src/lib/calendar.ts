import { addDays, uid } from './estimate';
import type { CalEvent, Job } from './types';

export const TZ = 'America/Detroit';

export const EVENT_TYPES: [string, string][] = [
  ['tree_work', 'Tree work'], ['estimate_visit', 'Bid visit'], ['dump_run', 'Dump run'],
  ['equipment_rental', 'Equipment rental'], ['maintenance', 'Maintenance'], ['time_off', 'Time off'], ['other', 'Other'],
];
export const EVENT_LABEL = Object.fromEntries(EVENT_TYPES) as Record<string, string>;
/** Day tasks have no clock time and can wait in the task pool until someone picks a day. */
export const TASK_TYPES = new Set(['dump_run', 'equipment_rental', 'maintenance']);
export const isTask = (t: string) => TASK_TYPES.has(t);
export const BID_HOURS = 2;

// ---------------------------------------------------------------- Michigan time

function parts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
  );
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}
export const ymdOf = (d: Date) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
export const hmOf = (d: Date) => { const p = parts(d); return `${p.hour}:${p.minute}`; };
export const todayMi = () => ymdOf(new Date());

/** "2026-11-16" + "09:00" in Michigan → the matching instant (handles daylight saving). */
export function miToIso(ymd: string, hm: string) {
  const [Y, M, D] = ymd.split('-').map(Number) as [number, number, number];
  const [h, m] = hm.split(':').map(Number) as [number, number];
  const want = Date.UTC(Y, M - 1, D, h, m);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(t));
    t += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return new Date(t).toISOString();
}

export const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
export const weekStart = (ymd: string) => addDays(ymd, -weekday(ymd)); // Sunday
export const weekDays = (ymd: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(ymd), i));
export function monthCells(ymd: string) {
  const first = `${ymd.slice(0, 8)}01`;
  return Array.from({ length: 42 }, (_, i) => addDays(weekStart(first), i));
}
export const dayLabel = (ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

// ---------------------------------------------------------------- events

export const isActive = (e: CalEvent) => !e.deleted_at && e.status !== 'cancelled';

/** Every Michigan calendar day an entry touches. */
export function eventDays(e: CalEvent): string[] {
  if (e.unscheduled || !e.starts) return [];
  let first: string;
  let last: string;
  if (e.all_day) {
    first = e.starts.slice(0, 10);
    const endEx = (e.ends || '').slice(0, 10);
    last = endEx > first ? addDays(endEx, -1) : first;
  } else {
    first = ymdOf(new Date(e.starts));
    last = ymdOf(new Date(new Date(e.ends || e.starts).getTime() - 1));
    if (last < first) last = first;
  }
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}

const ORDER: Record<string, number> = { tree_work: 0, estimate_visit: 1 };
export function onDay(events: CalEvent[], ymd: string) {
  return events
    .filter((e) => isActive(e) && eventDays(e).includes(ymd))
    .sort((a, b) => (ORDER[a.type] ?? 2) - (ORDER[b.type] ?? 2) || (a.all_day ? '' : a.starts).localeCompare(b.all_day ? '' : b.starts) || a.title.localeCompare(b.title));
}

export const timeLabel = (e: CalEvent) => {
  if (e.all_day || !e.starts) return '';
  const fmt = (iso: string) => {
    const [h, m] = hmOf(new Date(iso)).split(':').map(Number) as [number, number];
    return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
  };
  return `${fmt(e.starts)}–${fmt(e.ends)}`;
};

/** A job's work days come only from its tree-work entries on the calendar. */
export function jobSchedule(jobId: string, events: CalEvent[]) {
  const mine = events.filter((e) => isActive(e) && e.type === 'tree_work' && e.job_id === jobId);
  const days = [...new Set(mine.flatMap(eventDays))].sort();
  return { events: mine, days, start: days[0] ?? null, end: days.at(-1) ?? null, crew: [...new Set(mine.flatMap((e) => e.assigned_to ?? []))] };
}

export type BoardColumn = 'pending' | 'approved' | 'scheduled' | 'in_progress' | 'blocked' | 'done' | 'invoiced' | 'paid';
export const COLUMN_LABEL: Record<BoardColumn, string> = {
  pending: 'Pending', approved: 'Approved', scheduled: 'Scheduled', in_progress: 'In progress', blocked: 'Blocked', done: 'Done', invoiced: 'Invoiced', paid: 'Paid',
};

/**
 * Where a job sits on the board. Signed + on the calendar = Scheduled; signed
 * but not on the calendar = Approved. In progress / Blocked / Done are set by
 * the crew; Invoiced and Paid follow the money.
 */
export function boardColumn(job: Pick<Job, 'id' | 'signed_at' | 'status' | 'stage'>, events: CalEvent[]): BoardColumn {
  if (job.stage === 'paid') return 'paid';
  if (job.stage === 'invoice') return 'invoiced';
  if (!job.signed_at) return 'pending';
  if (job.status === 'in_progress' || job.status === 'blocked' || job.status === 'done') return job.status;
  return jobSchedule(job.id, events).days.length ? 'scheduled' : 'approved';
}

/** Other entries that put the same person in two places on the same day (or at the same time). */
export function crewConflicts(candidate: CalEvent, events: CalEvent[]) {
  const people = new Set(candidate.assigned_to ?? []);
  if (!people.size || !isActive(candidate)) return [];
  const days = new Set(eventDays(candidate));
  return events.filter((e) => {
    if (e.id === candidate.id || !isActive(e) || !(e.assigned_to ?? []).some((p) => people.has(p))) return false;
    if (!eventDays(e).some((d) => days.has(d))) return false;
    if (!candidate.all_day && !e.all_day) return new Date(candidate.starts) < new Date(e.ends) && new Date(e.starts) < new Date(candidate.ends);
    return true;
  });
}

export function blankEvent(orgId: string, patch: Partial<CalEvent> = {}): CalEvent {
  return {
    id: uid(), org_id: orgId, type: 'other', title: '', status: 'confirmed', all_day: true, unscheduled: false,
    starts: '', ends: '', job_id: null, address: '', town: '', crew: '', equipment: [], notes: '', assigned_to: [], deleted_at: null, ...patch,
  };
}

/** All-day span covering `days` work days from `start` (½ day still takes the day). */
export const allDaySpan = (start: string, days: number) => ({ starts: start, ends: addDays(start, Math.max(1, Math.ceil(days))) });
