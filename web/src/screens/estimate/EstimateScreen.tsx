import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Pill } from '../../components/Pill';
import { CancelJobButton, CancelledBanner, type CancelPatch } from '../../components/CancelJob';
import { WorkOrderNotes } from '../../components/WorkOrderNotes';
import { JobPhotos } from '../../components/Photos';
import { JobHours } from '../../components/JobHours';
import { HOURS_ENABLED } from '../../lib/features';
import { isWorkOrder } from '../../lib/notes';
import { jobHubNext, jobStage, liveInvoice, STAGE_MEANS, type JobHubNextKind } from '../../lib/status';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { EstimateDoc, toCustomerCompany, toCustomerJob } from '../../components/EstimateDoc';
import { SignaturePad } from '../../components/SignaturePad';
import { Chips, Field, Sheet, Stepper } from '../../components/ui';
import {
  blankChangeOrder, CHANGE_REASONS, clientName, customerPricing, hasSeptic, money, niceDate, normalizeJob, notesToInternal, septicLine, todayYmd, totals, treeDetails, treeTitle,
} from '../../lib/estimate';
import { balanceDue, invoiceFromJob, invoiceTotals, paidForJob } from '../../lib/invoice';
import { takeNumber } from '../../lib/numbers';
import { can, useReady, useRow, useRows } from '../../lib/session';
import { reserveNumbers, voidSignature } from '../../lib/supabase';
import { PaymentSheet } from '../invoice/PaymentSheet';
import { EventSheet } from '../calendar/EventSheet';
import { dayLabel, jobSchedule } from '../../lib/calendar';
import type { ChangeOrder, Job, JobPricing, Organization } from '../../lib/types';
import { useJobDraft } from '../../lib/useJobDraft';
import { SendActions } from './SendActions';
import { StepClient } from './StepClient';
import { StepPricing } from './StepPricing';
import { StepReview } from './StepReview';
import { StepTrees, TreeList } from './StepTrees';

const STEPS = [
  { id: 'client', label: 'Client & Site' },
  { id: 'trees', label: 'Trees & Price' },
  { id: 'review', label: 'Sign & Send' },
] as const;

export function EstimateScreen() {
  const { id, step } = useParams();
  const { engine, org } = useReady();
  const company = useRow(engine, 'organizations', org.org_id);
  const draft = useJobDraft(engine, id);

  if (draft.missing) return <Navigate to="/estimates" replace />;
  if (!draft.job || !company) return <div className="page"><p className="empty">Loading…</p></div>;
  if (!can.seePrices(org.role)) return <JobSheet job={draft.job} updateJob={draft.updateJob} flush={draft.flush} />;
  if (!draft.pricing) return <div className="page"><p className="empty">Loading prices…</p></div>;
  if (draft.job.signed_at) return <SignedView {...draft} job={draft.job} pricing={draft.pricing} company={company} />;
  return <Wizard {...draft} job={draft.job} pricing={draft.pricing} company={company} step={step} />;
}

type Draft = ReturnType<typeof useJobDraft> & { job: Job; pricing: JobPricing; company: Organization };

function Wizard({ job, pricing, company, updateJob, updatePricing, flush, step }: Draft & { step?: string }) {
  const nav = useNavigate();
  const { engine } = useReady();
  // Older links to the pages that were merged land on the page that now holds them.
  const stepId = ({ pricing: 'trees', send: 'review' } as Record<string, string>)[step ?? ''] ?? step;
  const i = Math.max(0, STEPS.findIndex((s) => s.id === stepId));
  // Save first, then move on, unless the user already went somewhere else meanwhile.
  const go = async (to: string) => {
    const from = window.location.hash;
    await flush();
    if (window.location.hash === from) nav(to);
  };

  useEffect(() => {
    document.body.classList.add('has-bottombar');
    return () => document.body.classList.remove('has-bottombar');
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [i]);
  // Notes are all internal now: an old draft's printed notes move into its internal notes once.
  useEffect(() => {
    if (notesToInternal(job) !== job) updateJob(notesToInternal);
  }, [job, updateJob]);

  // A client typed in by hand is added to Contacts when you move on, so the team can find them next time.
  async function saveClientToContacts() {
    if (job.customer_id || !clientName(job.client)) return;
    const { clientToCustomer } = await import('./ClientPicker');
    const customerId = crypto.randomUUID();
    await engine.save('customers', clientToCustomer(job.client, customerId, job.org_id));
    updateJob((j) => ({ ...j, customer_id: customerId }));
  }

  const props = { job, pricing, updateJob, updatePricing };
  // Through the draft, so its autosave can't put back the old (not cancelled) copy.
  const cancelApply = (p: CancelPatch) => { updateJob((j) => ({ ...j, ...p })); void flush(); };
  const next = STEPS[i + 1];
  const prev = STEPS[i - 1];

  return (
    <div className="page wizard" style={{ maxWidth: 1200 }}>
      <div className="wiz-head">
        <div className="wiz-title">
          <span className="muted small">{job.number}</span>
          <b>{clientName(job.client) || 'New estimate'}</b>
        </div>
        <Pill stage={jobStage(job, [])} />
        <CancelJobButton small job={job} apply={cancelApply} />
      </div>
      <CancelledBanner job={job} apply={cancelApply} />
      <nav className="steps" aria-label="Estimate steps">
        {STEPS.map((s, n) => (
          <Link key={s.id} to={`/estimates/${job.id}/${s.id}`} className={`${n === i ? 'on' : ''} ${n < i ? 'done' : ''}`} aria-current={n === i ? 'step' : undefined}
            onClick={() => { void flush(); if (i === 0) void saveClientToContacts(); }}>
            <span className="dot">{n < i ? '✓' : n + 1}</span><span className="step-label">{s.label}</span>
          </Link>
        ))}
      </nav>

      {STEPS[i]!.id === 'client' && <StepClient {...props} />}
      {STEPS[i]!.id === 'trees' && (
        <div className="wizard-grid two-col">
          <StepTrees {...props} />
          <div><StepPricing {...props} /></div>
        </div>
      )}
      {STEPS[i]!.id === 'review' && (
        <>
          <StepReview {...props} onSigned={() => void go(`/estimates/${job.id}`)} />
          <section className="card">
            <div className="sec-head"><h2><Icon name="message" size={18} />Send to client</h2></div>
            <SendActions job={job} pricing={pricing} company={company} flush={flush} />
          </section>
          <DangerZone job={job} />
        </>
      )}

      <footer className="bottombar">
        <button type="button" className="btn" onClick={() => void go(prev ? `/estimates/${job.id}/${prev.id}` : '/estimates')}>
          ‹ {prev ? 'Back' : 'Estimates'}
        </button>
        <button type="button" className="btn primary" onClick={() => {
          if (i === 0) void saveClientToContacts();
          void go(next ? `/estimates/${job.id}/${next.id}` : '/estimates');
        }}>
          {next ? `Next: ${next.label} ›` : 'Done ✓'}
        </button>
      </footer>
    </div>
  );
}

function DangerZone({ job }: { job: Job }) {
  const { engine } = useReady();
  const nav = useNavigate();
  return (
    <div className="btn-row mt">
      <button type="button" className="btn danger" onClick={async () => {
        if (!confirm(`Delete ${job.number}? It disappears for the whole team.`)) return;
        await engine.remove('jobs', job);
        nav('/estimates');
      }}><Icon name="trash" />Delete estimate</button>
    </div>
  );
}

// ---------------------------------------------------------------- signed

function SignedView({ job, pricing, company, updateJob, flush, setJob, setPricing }: Draft) {
  const { org, engine, user } = useReady();
  const nav = useNavigate();
  const [co, setCo] = useState<ChangeOrder | null>(null);
  const [voiding, setVoiding] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [invError, setInvError] = useState('');
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const orgPricing = useRow(engine, 'org_pricing', org.org_id);
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const t = totals(job, customerPricing(job, pricing));
  const invoice = liveInvoice(invoices, job.id);
  const events = useRows(engine, 'events');
  const sched = jobSchedule(job.id, events ?? []);
  const [scheduling, setScheduling] = useState<import('../../lib/types').CalEvent | null>(null);
  const cancelApply = (p: CancelPatch) => { updateJob((j) => ({ ...j, ...p })); void flush(); };
  const paid = paidForJob(payments ?? [], job.id);
  const stage = jobStage(job, events ?? [], invoices, payments);
  const next = jobHubNext({ stage, invoice, depositAsked: t.deposit, paid });
  const depositLeft = Math.max(0, t.deposit - paid);
  const owed = invoice ? balanceDue(invoice, paid) : Math.max(0, t.total - paid);
  const nextIs = (kind: JobHubNextKind) => next?.kind === kind;

  function setStatus(status: Job['status'], block_reason = '') {
    updateJob((j) => ({ ...j, status, block_reason }));
    void flush();
  }

  function openSchedule() {
    if (sched.events[0]) setScheduling(sched.events[0]);
    else nav('/calendar', { state: { pick: job.id } });
  }

  async function createInvoice() {
    setInvError('');
    try {
      await flush();
      const number = await takeNumber(engine.db, org.org_id, 'invoice', reserveNumbers);
      const inv = invoiceFromJob(job, pricing, { number, dueDays: orgPricing?.invoice_due_days ?? 15 });
      await engine.save('invoices', inv);
      nav(`/invoices/${inv.id}`);
    } catch (e) {
      setInvError((e as Error).message);
    }
  }

  function runNext() {
    if (!next) return;
    switch (next.kind) {
      case 'schedule':
        return openSchedule();
      case 'start':
        return setStatus('in_progress');
      case 'mark_done':
        return setStatus('done');
      case 'resume':
        return setStatus('in_progress');
      case 'create_invoice':
        return void createInvoice();
      case 'send_invoice':
      case 'open_invoice':
        if (invoice) nav(`/invoices/${invoice.id}`);
        return;
      case 'record_payment':
      case 'record_deposit':
        return setPayOpen(true);
    }
  }

  async function voidSig() {
    if (!confirm('Remove the client’s signature so the estimate can be changed? It goes back to Pending, any change orders are removed, and the client will need to sign again.')) return;
    setVoiding('working');
    try {
      await flush();
      await voidSignature(job.id);
      await engine.sync();
      const [j, p] = await Promise.all([engine.get('jobs', job.id), engine.get('job_pricing', job.id)]);
      if (p) setPricing(p);
      if (j) setJob(normalizeJob(j));
      setVoiding('');
    } catch (e) {
      setVoiding(navigator.onLine ? (e as Error).message : 'Removing a signature needs a connection.');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{job.number} · {clientName(job.client)}</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            <Pill stage={stage} /> {STAGE_MEANS[stage]}
          </p>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Signed{job.signed_by_name ? ` by ${job.signed_by_name}` : ''} on {niceDate(job.client_sig_date)}{job.signed_via === 'link' ? ' (online)' : ''} · {money(t.total)}
          </p>
        </div>
        {isWorkOrder(job) && <WorkOrderNotes job={job} onChange={(internal_notes) => { updateJob((j) => ({ ...j, internal_notes })); void flush(); }} />}
      </div>
      <CancelledBanner job={job} apply={cancelApply} />

      <section className="card">
        <div className="row" style={{ marginBottom: next ? 12 : 0 }}>
          <span>{sched.start ? <><Icon name="calendar" size={15} /> {dayLabel(sched.start)}{sched.end !== sched.start ? ` – ${dayLabel(sched.end!)}` : ''}</> : <span className="muted">Not on the calendar yet</span>}</span>
          {!nextIs('schedule') && (
            <button type="button" className="btn sm" onClick={openSchedule}>
              {sched.start ? 'Change dates' : <><Icon name="calendar" />Schedule</>}
            </button>
          )}
        </div>
        {next && (
          <button type="button" className="btn primary block" onClick={() => runNext()}>
            {next.kind === 'schedule' && <Icon name="calendar" />}
            {(next.kind === 'create_invoice' || next.kind === 'send_invoice' || next.kind === 'open_invoice') && <Icon name="dollar" />}
            {(next.kind === 'record_deposit' || next.kind === 'record_payment') && <Icon name="plus" />}
            {next.label}
          </button>
        )}
        {invError && <p className="error-text">{invError}</p>}
      </section>

      {HOURS_ENABLED && <JobHours jobId={job.id} billed={invoice ? invoiceTotals(invoice.lines, invoice.tax_rate).subtotal : t.subtotal} />}

      <section className="card">
        <div className="sum-line"><span>Signed total{job.change_orders.length ? ' (with change orders)' : ''}</span><b>{money(t.total)}</b></div>
        <div className="sum-line"><span>Paid so far{t.deposit ? ` (deposit asked: ${money(t.deposit)})` : ''}</span><span>{money(paid)}</span></div>
        {invoice && <div className="sum-line"><span>Still owed on {invoice.number}</span><span>{money(owed)}</span></div>}
      </section>

      <div id="photos"><JobPhotos jobId={job.id} /></div>

      <details className="more">
        <summary>More</summary>
        <h4 className="label">Money</h4>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          {invoice && !nextIs('open_invoice') && !nextIs('send_invoice') && (
            <Link className="btn" to={`/invoices/${invoice.id}`}>Open invoice {invoice.number}</Link>
          )}
          {!invoice && !nextIs('record_deposit') && (
            <button type="button" className="btn" onClick={() => setPayOpen(true)}><Icon name="plus" />Record deposit</button>
          )}
          {invoice && invoice.status !== 'draft' && !nextIs('record_payment') && (
            <button type="button" className="btn" onClick={() => setPayOpen(true)}><Icon name="plus" />Record payment</button>
          )}
        </div>
        <h4 className="label">Estimate</h4>
        <SendActions job={job} pricing={pricing} company={company} flush={flush} />
        <h4 className="label">Job</h4>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button type="button" className="btn" onClick={() => setCo(blankChangeOrder())}><Icon name="plus" />Change order</button>
          {stage === 'scheduled' && !nextIs('start') && (
            <button type="button" className="btn" onClick={() => setStatus('in_progress')}>Start</button>
          )}
          {(stage === 'scheduled' || stage === 'in_progress' || stage === 'blocked') && !nextIs('mark_done') && (
            <button type="button" className="btn" onClick={() => setStatus('done')}>Mark done</button>
          )}
          {stage === 'blocked' && !nextIs('resume') && (
            <button type="button" className="btn" onClick={() => setStatus('in_progress')}>Resume</button>
          )}
          {can.seePrices(org.role) && <button type="button" className="btn danger" onClick={() => void voidSig()} disabled={voiding === 'working'}>Remove signature</button>}
          <CancelJobButton job={job} apply={cancelApply} />
        </div>
        {voiding && voiding !== 'working' && <p className="hint" role="status">{voiding}</p>}
      </details>

      <EventSheet event={scheduling} onClose={() => setScheduling(null)} />
      <PaymentSheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={invoice ? `Payment on ${invoice.number}` : `Deposit on ${job.number}`}
        suggested={invoice ? owed : depositLeft}
        base={{ org_id: job.org_id, job_id: job.id, invoice_id: invoice?.id ?? null, recorded_by_name: me?.display_name ?? '' }}
        onSave={(p) => {
          void engine.save('payments', p);
          setPayOpen(false);
        }}
      />
      <ChangeOrderSheet
        jobId={job.id}
        co={co}
        dayRate={customerPricing(job, pricing).day_rate}
        onClose={() => setCo(null)}
        onSave={(c) => {
          updateJob((j) => ({ ...j, change_orders: [...j.change_orders, c] }));
          void flush(); // a signed change order is saved right away, not after the typing pause
          setCo(null);
        }}
      />
    </div>
  );
}

function ChangeOrderSheet({ co, dayRate, onClose, onSave, jobId }: { co: ChangeOrder | null; dayRate: number; onClose: () => void; onSave: (c: ChangeOrder) => void; jobId: string }) {
  const [c, setC] = useState<ChangeOrder | null>(co);
  const [error, setError] = useState('');
  const [openedId, setOpenedId] = useState(co?.id);
  if (co?.id !== openedId) {
    setOpenedId(co?.id);
    setC(co);
    setError('');
  }
  if (!c) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = <K extends keyof ChangeOrder>(k: K, v: ChangeOrder[K]) => setC({ ...c, [k]: v });

  function save() {
    if (!c) return;
    if (!c.reason) return setError('Choose a reason.');
    if (c.reason === 'Other' && !c.reason_other.trim()) return setError('Describe the reason.');
    if (!c.signed_by_name.trim()) return setError('Type the client’s name.');
    if (!c.client_sig) return setError('The client needs to sign.');
    onSave({ ...c, client_sig_date: c.client_sig_date || todayYmd(), signed_at: new Date().toISOString() });
  }

  return (
    <Sheet open={!!co} onClose={onClose} title="Change order">
      <p className="hint">Adds days (and any extra trees) to the signed estimate. The client signs to approve it.</p>
      <h4 className="label">Additional days</h4>
      <Stepper label="Additional days" value={c.days} step={0.5} min={0.5} onChange={(v) => set('days', v)} />
      <div className="sum-line">At {money(dayRate)}/day <b>{money(c.days * dayRate)}</b></div>
      <h4 className="label">Reason</h4>
      <Chips label="Reason" options={CHANGE_REASONS} value={c.reason} onChange={(v) => set('reason', v)} required />
      {c.reason === 'Other' && <input className="mt" aria-label="Describe the reason" placeholder="Describe the reason…" value={c.reason_other} onChange={(e) => set('reason_other', e.target.value)} />}
      <h4 className="label">Add trees <small className="muted">optional</small></h4>
      <TreeList jobId={jobId} trees={c.trees} onChange={(trees) => set('trees', trees)} />
      <h4 className="label">Client signature</h4>
      <Field label="Client’s name"><input value={c.signed_by_name} onChange={(e) => set('signed_by_name', e.target.value)} autoCapitalize="words" /></Field>
      <SignaturePad value={c.client_sig} onChange={(v) => set('client_sig', v)} label="Client signs to approve the change" />
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="button" className="btn primary block" onClick={save}>Save change order</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- crew

/** What crew see: the work, the site and every internal note, with no prices. */
function JobSheet({ job, updateJob, flush }: { job: Job; updateJob: Draft['updateJob']; flush: Draft['flush'] }) {
  const { engine, org } = useReady();
  const company = useRow(engine, 'organizations', org.org_id);
  const events = useRows(engine, 'events');
  const sched = jobSchedule(job.id, events ?? []);
  const allTrees = [...job.trees, ...job.change_orders.flatMap((c) => c.trees)];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{job.number} · {clientName(job.client)}</h2>
          <Pill stage={jobStage(job, events ?? [])} />
        </div>
        {isWorkOrder(job) && <WorkOrderNotes job={job} onChange={(internal_notes) => { updateJob((j) => ({ ...j, internal_notes })); void flush(); }} />}
      </div>
      <CancelledBanner job={job} apply={() => undefined} />
      <section className="card">
        <b className="row-icon">{sched.start ? <><Icon name="calendar" size={15} /> {dayLabel(sched.start)}{sched.end !== sched.start ? ` – ${dayLabel(sched.end!)}` : ''}</> : 'Not on the calendar yet'}</b>
      </section>
      <section className="card">
        <h3>Client</h3>
        <p style={{ margin: 0 }}>{clientName(job.client)}<br />{[job.client.street, job.client.town].filter(Boolean).join(', ')}</p>
        {job.client.phone && <a className="btn sm mt" href={`tel:${job.client.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={16} />Call {job.client.phone}</a>}
      </section>
      {HOURS_ENABLED && <JobHours jobId={job.id} />}
      <section className="card">
        <h3>Trees</h3>
        {allTrees.map((t, i) => (
          <div key={t.id} className="sum-line" style={{ display: 'block' }}>
            <b>{i + 1}. {treeTitle(t)}</b>
            <div className="muted small">{treeDetails(t)}</div>
            {t.notes && <div className="small">{t.notes}</div>}
          </div>
        ))}
      </section>
      <section className="card">
        <h3>Site</h3>
        <p className="small" style={{ margin: 0 }}>
          {[...job.site.conditions, job.site.other].filter(Boolean).join(', ') || 'No site notes'}<br />
          {job.site.parking && <>Parking: {job.site.parking}<br /></>}
          {job.site.debris && <>Wood &amp; debris: {job.site.debris}<br /></>}
          {septicLine(job.site) && <>{hasSeptic(job.site.septic) ? <b>⚠ Septic / drain field: {septicLine(job.site)}</b> : <>Septic / drain field: {septicLine(job.site)}</>}<br /></>}
          Days: {job.days + job.change_orders.reduce((s, c) => s + c.days, 0)} · Equipment: {job.equipment.map((e) => e.desc).filter(Boolean).join(', ') || 'none'}
        </p>
      </section>
      {company && (
        <details className="card">
          <summary>Customer’s copy (without prices)</summary>
          <div className="doc-preview"><EstimateDoc company={toCustomerCompany(company)} job={toCustomerJob(job)} pricing={null} /></div>
        </details>
      )}
      <div id="photos"><JobPhotos jobId={job.id} /></div>
    </div>
  );
}
