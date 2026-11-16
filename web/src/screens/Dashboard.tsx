import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { Pill } from '../components/Pill';
import { JobQuickIcons } from '../components/JobQuickIcons';
import { NotesBadge } from '../components/WorkOrderNotes';
import { isWorkOrder, noteSummary } from '../lib/notes';
import { dayLabel, EVENT_LABEL, jobSchedule, onDay, timeLabel, todayMi, visitForJob, weekday } from '../lib/calendar';
import { expensesInMonth, hoursLabel, hoursTotal, total } from '../lib/expenses';
import { addDays, clientName, money, normalizeJob, round2 } from '../lib/estimate';
import { balanceDue, invoiceStatus, paidForJob } from '../lib/invoice';
import { can, useReady, useRow, useRows } from '../lib/session';
import { jobStage, liveInvoice, type Stage } from '../lib/status';
import type { CalEvent, Job } from '../lib/types';
import { useDoneToggle } from '../lib/useDoneToggle';

const daysSince = (ymd: string | null | undefined, today: string) =>
  ymd ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${ymd.slice(0, 10)}T12:00:00Z`)) / 86_400_000) : 0;
const ago = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

type Attention = { key: string; to: string; title: string; why: string; stage: Stage; icon: IconName; rank: number };

export function Dashboard() {
  const { engine, org, user } = useReady();
  const jobsRaw = useRows(engine, 'jobs');
  const events = useRows(engine, 'events');
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const pricing = useRows(engine, 'job_pricing');
  const expenses = useRows(engine, 'expenses');
  const timeEntries = useRows(engine, 'time_entries');
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const office = can.seePrices(org.role);
  const today = todayMi();
  const { isDone, toggle } = useDoneToggle(engine, events);

  const data = useMemo(() => {
    const evs = events ?? [];
    const jobs = (jobsRaw ?? []).filter((j) => j.stage !== 'archived' && !j.deleted_at).map(normalizeJob);
    const totalById = new Map((pricing ?? []).map((p) => [p.job_id, p.total]));
    const withStage = jobs.map((j) => ({ job: j, stage: jobStage(j, evs, invoices, payments, today) }));

    // ---- needs attention, worst first
    const attention: Attention[] = [];
    for (const { job, stage } of withStage) {
      const name = clientName(job.client) || job.number;
      const to = `/estimates/${job.id}`;
      if (stage === 'overdue') {
        const inv = liveInvoice(invoices, job.id)!;
        const owed = balanceDue(inv, paidForJob(payments ?? [], job.id));
        attention.push({ key: job.id, to: `/invoices/${inv.id}`, title: name, why: `${money(owed)} overdue ${daysSince(inv.due_date, today)} days`, stage, icon: 'alert', rank: 0 });
      } else if (stage === 'blocked') {
        attention.push({ key: job.id, to, title: name, why: `Blocked${job.block_reason ? `: ${job.block_reason.toLowerCase()}` : ''}`, stage, icon: 'alert', rank: 1 });
      } else if (office && stage === 'done') {
        attention.push({ key: job.id, to, title: name, why: 'Finished, needs an invoice', stage, icon: 'dollar', rank: 2 });
      } else if (office && stage === 'approved') {
        const n = daysSince(job.signed_at, today);
        attention.push({ key: job.id, to, title: name, why: `Signed ${ago(n)}, not on the calendar`, stage, icon: 'calendar', rank: 3 });
      } else if (office && stage === 'new' && !visitForJob(job.id, evs)) {
        attention.push({ key: job.id, to: '/board?tab=new', title: name, why: 'New lead, no visit scheduled', stage, icon: 'calendar', rank: 3 });
      } else if (office && stage === 'pending' && job.client.firstName + job.client.lastName + job.client.company) {
        const n = daysSince(job.estimate_date, today);
        if (n >= 7) attention.push({ key: job.id, to, title: name, why: `Estimate from ${n} days ago, not signed yet`, stage, icon: 'file', rank: 4 });
      }
    }
    attention.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));

    // ---- today
    const todays = onDay(evs, today);

    // ---- active jobs (on the calendar or being worked)
    const active = withStage
      .filter(({ stage }) => stage === 'in_progress' || stage === 'scheduled' || stage === 'blocked' || (office && stage === 'done'))
      .map(({ job, stage }) => {
        const sched = jobSchedule(job.id, evs);
        const inv = liveInvoice(invoices, job.id);
        return { job, stage, sched, total: totalById.get(job.id) ?? 0, due: inv ? balanceDue(inv, paidForJob(payments ?? [], job.id)) : null };
      })
      .sort((a, b) => (a.sched.start ?? '9999').localeCompare(b.sched.start ?? '9999'));

    // ---- money tiles
    let owed = 0;
    let overdue = 0;
    let overdueCount = 0;
    let openCount = 0;
    for (const inv of invoices ?? []) {
      if (inv.deleted_at) continue;
      const paid = paidForJob(payments ?? [], inv.job_id);
      const st = invoiceStatus(inv, paid, today);
      if (st === 'unpaid' || st === 'partial' || st === 'overdue') {
        owed += balanceDue(inv, paid);
        openCount++;
      }
      if (st === 'overdue') {
        overdue += balanceDue(inv, paid);
        overdueCount++;
      }
    }
    const month = today.slice(0, 7);
    const collected = (payments ?? []).filter((p) => !p.voided_at && !p.deleted_at && p.received_on.startsWith(month)).reduce((s, p) => s + Number(p.amount || 0), 0);
    const pending = withStage.filter((x) => x.stage === 'pending' && x.job.trees.length);
    const pendingValue = pending.reduce((s, x) => s + (totalById.get(x.job.id) ?? 0), 0);

    const spent = total(expensesInMonth(expenses, month));
    const weekStart = addDays(today, -weekday(today));
    const weekHours = hoursTotal((timeEntries ?? []).filter((e) => !e.deleted_at && e.work_date >= weekStart && e.work_date <= today));
    return { spent, weekHours, attention, todays, active, owed: round2(owed), overdue: round2(overdue), overdueCount, openCount, collected: round2(collected), pendingCount: pending.length, pendingValue };
  }, [jobsRaw, events, invoices, payments, pricing, office, today, expenses, timeEntries]);

  const loading = jobsRaw === null || events === null;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (me?.display_name || '').split(/\s+/)[0];
  const jobFor = (e: CalEvent): Job | undefined => (e.job_id ? (jobsRaw ?? []).find((j) => j.id === e.job_id) : undefined);

  return (
    <div className="page dash">
      <div className="dash-hello">
        <span className="muted">{dayLabel(today, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        <h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
      </div>

      {office && (
        <section className="tiles" aria-label="Money">
          <Link to="/invoices" className="tile">
            <span className="tile-label">Owed to you</span>
            <span className="tile-value">{money(data.owed)}</span>
            <span className="tile-sub">{data.openCount === 1 ? '1 invoice' : `${data.openCount} invoices`}</span>
          </Link>
          <Link to="/invoices" className={`tile ${data.overdue ? 'bad' : ''}`}>
            <span className="tile-label">Overdue</span>
            <span className="tile-value">{money(data.overdue)}</span>
            <span className="tile-sub">{data.overdueCount ? `${data.overdueCount} invoice${data.overdueCount > 1 ? 's' : ''}` : 'Nothing late'}</span>
          </Link>
          <Link to="/invoices" className="tile">
            <span className="tile-label">Collected in {dayLabel(today, { month: 'long' })}</span>
            <span className="tile-value">{money(data.collected)}</span>
            <span className="tile-sub">Payments received</span>
          </Link>
          <Link to="/estimates" className="tile">
            <span className="tile-label">Estimates out</span>
            <span className="tile-value">{money(data.pendingValue)}</span>
            <span className="tile-sub">{data.pendingCount === 1 ? '1 waiting to be signed' : `${data.pendingCount} waiting to be signed`}</span>
          </Link>
          <Link to="/expenses" className="tile">
            <span className="tile-label">Spent in {dayLabel(today, { month: 'long' })}</span>
            <span className="tile-value">{money(data.spent)}</span>
            <span className="tile-sub">Expenses</span>
          </Link>
          <Link to="/board" className="tile">
            <span className="tile-label">Hours this week</span>
            <span className="tile-value">{hoursLabel(data.weekHours)}</span>
            <span className="tile-sub">Crew-hours on jobs</span>
          </Link>
        </section>
      )}

      <div className="dash-cols">
        <section className="dash-section">
          <div className="section-head">
            <h2>Needs attention</h2>
            <Link to="/board">Jobs board</Link>
          </div>
          {loading ? <p className="empty">Loading…</p> : data.attention.length ? (
            <div className="list">
              {data.attention.map((a) => (
                <Link key={a.key + a.rank} to={a.to} className={`list-item attn stripe st-${a.stage}`}>
                  <span className="attn-icon"><Icon name={a.icon} /></span>
                  <span className="attn-text">
                    <b>{a.title}</b>
                    <span className="attn-why">{a.why}</span>
                  </span>
                  <Pill stage={a.stage} />
                </Link>
              ))}
            </div>
          ) : <p className="empty card">Nothing needs you right now.</p>}
        </section>

        <section className="dash-section">
          <div className="section-head">
            <h2>Today</h2>
            <Link to="/calendar">Calendar</Link>
          </div>
          {loading ? <p className="empty">Loading…</p> : data.todays.length ? (
            <div className="card flush">
              {data.todays.map((e) => {
                const job = jobFor(e);
                const stage = job ? jobStage(job, events ?? [], invoices, payments, today) : null;
                const done = isDone(e);
                return (
                  <div key={e.id} className={`today-row ${done ? 'is-done' : ''}`}>
                    <input type="checkbox" checked={done} aria-label={`Done: ${e.title || EVENT_LABEL[e.type]}`}
                      onChange={() => toggle(e)} />
                    <Link to={job ? `/estimates/${job.id}` : '/calendar'} className="today-link">
                      <span className={`today-dot ${stage ? `st-${stage}` : `type-${e.type}`}`} aria-hidden="true" />
                      <span className="today-text">
                        <b>{e.title || EVENT_LABEL[e.type]}</b>
                        <span className="muted small">{[timeLabel(e) || EVENT_LABEL[e.type], e.town].filter(Boolean).join(' · ')}</span>
                      </span>
                      {stage && <Pill stage={stage} />}
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : <p className="empty card">Nothing on the calendar today.</p>}
        </section>
      </div>

      <section className="dash-section">
        <div className="section-head">
          <h2>Active jobs</h2>
          <Link to="/board">View all</Link>
        </div>
        {loading ? <p className="empty">Loading…</p> : data.active.length ? (
          <div className="job-grid">
            {data.active.slice(0, 8).map(({ job, stage, sched, total, due }) => (
              <article key={job.id} className={`job-tile st-${stage}`}>
                <div className="job-tile-main">
                  <Link to={`/estimates/${job.id}`} className="job-tile-name">{clientName(job.client) || job.number}{isWorkOrder(job) && <NotesBadge count={noteSummary(job).count} />}</Link>
                  <span className="muted small">{[job.number, job.client.town].filter(Boolean).join(' · ')}</span>
                  {job.client.phone && (
                    <a className="tel" href={`tel:${job.client.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={15} />{job.client.phone}</a>
                  )}
                  <span className="muted small row-icon">
                    <Icon name="calendar" size={14} />
                    {sched.start ? `${dayLabel(sched.start, { month: 'short', day: 'numeric' })}${sched.end && sched.end !== sched.start ? ` → ${dayLabel(sched.end, { month: 'short', day: 'numeric' })}` : ''}` : 'Not on the calendar'}
                  </span>
                </div>
                <div className="job-tile-side">
                  <Pill stage={stage} />
                  {office && <b className="money">{money(total)}</b>}
                  {office && due !== null && due > 0 && <span className="due">{money(due)} due</span>}
                  {office && stage === 'done' && <span className="due">Needs invoice</span>}
                  <JobQuickIcons job={job} />
                </div>
              </article>
            ))}
          </div>
        ) : <p className="empty card">No jobs on the go. Signed estimates show up here once they’re scheduled.</p>}
      </section>
    </div>
  );
}
