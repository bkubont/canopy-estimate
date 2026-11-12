import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { EstimateDoc, toCustomerCompany, toCustomerJob } from '../../components/EstimateDoc';
import { SignaturePad } from '../../components/SignaturePad';
import { Chips, Field, Sheet, Stepper } from '../../components/ui';
import {
  blankChangeOrder, CHANGE_REASONS, clientName, customerPricing, money, niceDate, normalizeJob, STATUS_LABEL, todayYmd, totals, treeDetails, treeTitle,
} from '../../lib/estimate';
import { can, useReady, useRow } from '../../lib/session';
import { voidSignature } from '../../lib/supabase';
import type { ChangeOrder, Job, JobPricing, Organization } from '../../lib/types';
import { useJobDraft } from '../../lib/useJobDraft';
import { SendActions } from './SendActions';
import { StepClient } from './StepClient';
import { StepPricing } from './StepPricing';
import { StepReview } from './StepReview';
import { StepTrees, TreeList } from './StepTrees';

const STEPS = [
  { id: 'client', label: 'Client & Site' },
  { id: 'trees', label: 'Trees' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'review', label: 'Review & Sign' },
  { id: 'send', label: 'Send' },
] as const;

export function EstimateScreen() {
  const { id, step } = useParams();
  const { engine, org } = useReady();
  const company = useRow(engine, 'organizations', org.org_id);
  const draft = useJobDraft(engine, id);

  if (draft.missing) return <Navigate to="/estimates" replace />;
  if (!draft.job || !company) return <div className="page"><p className="empty">Loading…</p></div>;
  if (!can.seePrices(org.role)) return <JobSheet job={draft.job} />;
  if (!draft.pricing) return <div className="page"><p className="empty">Loading prices…</p></div>;
  if (draft.job.signed_at) return <SignedView {...draft} job={draft.job} pricing={draft.pricing} company={company} />;
  return <Wizard {...draft} job={draft.job} pricing={draft.pricing} company={company} step={step} />;
}

type Draft = ReturnType<typeof useJobDraft> & { job: Job; pricing: JobPricing; company: Organization };

function Wizard({ job, pricing, company, updateJob, updatePricing, flush, step }: Draft & { step?: string }) {
  const nav = useNavigate();
  const { engine } = useReady();
  const i = Math.max(0, STEPS.findIndex((s) => s.id === step));
  const go = async (to: string) => {
    await flush();
    nav(to);
  };

  useEffect(() => {
    document.body.classList.add('has-bottombar');
    return () => document.body.classList.remove('has-bottombar');
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [i]);

  // A client typed in by hand is added to Contacts when you move on, so the team can find them next time.
  async function saveClientToContacts() {
    if (job.customer_id || !clientName(job.client)) return;
    const { clientToCustomer } = await import('./ClientPicker');
    const customerId = crypto.randomUUID();
    await engine.save('customers', clientToCustomer(job.client, customerId, job.org_id));
    updateJob((j) => ({ ...j, customer_id: customerId }));
  }

  const props = { job, pricing, updateJob, updatePricing };
  const next = STEPS[i + 1];
  const prev = STEPS[i - 1];

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="row" style={{ marginBottom: 6 }}>
        <b>{job.number}{clientName(job.client) ? ` · ${clientName(job.client)}` : ''}</b>
        <span className={`status ${job.status}`}>{STATUS_LABEL[job.status]}</span>
      </div>
      <nav className="steps" aria-label="Estimate steps">
        {STEPS.map((s, n) => (
          <Link key={s.id} to={`/estimates/${job.id}/${s.id}`} className={`${n === i ? 'on' : ''} ${n < i ? 'done' : ''}`} aria-current={n === i ? 'step' : undefined}
            onClick={() => { void flush(); if (i === 0) void saveClientToContacts(); }}>
            <span className="dot">{n + 1}</span>{s.label}
          </Link>
        ))}
      </nav>

      {STEPS[i]!.id === 'client' && <StepClient {...props} />}
      {STEPS[i]!.id === 'trees' && <StepTrees {...props} />}
      {STEPS[i]!.id === 'pricing' && <StepPricing {...props} />}
      {STEPS[i]!.id === 'review' && <StepReview {...props} onSigned={() => void go(`/estimates/${job.id}`)} />}
      {STEPS[i]!.id === 'send' && (
        <>
          <h2 className="step-title">Send to client</h2>
          <SendActions job={job} pricing={pricing} company={company} flush={flush} />
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
      }}>🗑 Delete estimate</button>
    </div>
  );
}

// ---------------------------------------------------------------- signed

function SignedView({ job, pricing, company, updateJob, flush, setJob, setPricing }: Draft) {
  const { org, engine } = useReady();
  const [co, setCo] = useState<ChangeOrder | null>(null);
  const [voiding, setVoiding] = useState('');
  const t = totals(job, customerPricing(job, pricing));

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
            <span className={`status ${job.status}`}>{STATUS_LABEL[job.status]}</span>{' '}
            Signed{job.signed_by_name ? ` by ${job.signed_by_name}` : ''} on {niceDate(job.client_sig_date)}{job.signed_via === 'link' ? ' (online)' : ''} · {money(t.total)}
          </p>
        </div>
      </div>
      <section className="internal">
        <Field label="Internal notes" hint="For your team only. You can still edit these after signing.">
          <textarea rows={2} value={job.internal_notes} onChange={(e) => updateJob((j) => ({ ...j, internal_notes: e.target.value }))} />
        </Field>
      </section>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn primary" onClick={() => setCo(blankChangeOrder())}>＋ Change order</button>
        {can.seePrices(org.role) && <button type="button" className="btn danger" onClick={() => void voidSig()} disabled={voiding === 'working'}>Remove signature</button>}
      </div>
      {voiding && voiding !== 'working' && <p className="hint" role="status">{voiding}</p>}
      <SendActions job={job} pricing={pricing} company={company} flush={flush} />

      <ChangeOrderSheet
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

function ChangeOrderSheet({ co, dayRate, onClose, onSave }: { co: ChangeOrder | null; dayRate: number; onClose: () => void; onSave: (c: ChangeOrder) => void }) {
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
    onSave({ ...c, client_sig_date: c.client_sig_date || todayYmd() });
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
      <TreeList trees={c.trees} onChange={(trees) => set('trees', trees)} />
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
function JobSheet({ job }: { job: Job }) {
  const { engine, org } = useReady();
  const company = useRow(engine, 'organizations', org.org_id);
  const allTrees = [...job.trees, ...job.change_orders.flatMap((c) => c.trees)];
  return (
    <div className="page">
      <div className="page-head">
        <h2>{job.number} · {clientName(job.client)}</h2>
        <span className={`status ${job.status}`}>{STATUS_LABEL[job.status]}</span>
      </div>
      <section className="card">
        <h3>Client</h3>
        <p style={{ margin: 0 }}>{clientName(job.client)}<br />{[job.client.street, job.client.town].filter(Boolean).join(', ')}</p>
        {job.client.phone && <a className="btn sm mt" href={`tel:${job.client.phone.replace(/[^\d+]/g, '')}`}>📞 Call {job.client.phone}</a>}
      </section>
      {job.internal_notes && <section className="internal"><b>Internal notes</b><p style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>{job.internal_notes}</p></section>}
      <section className="card">
        <h3>Trees</h3>
        {allTrees.map((t, i) => (
          <div key={t.id} className="sum-line" style={{ display: 'block' }}>
            <b>{i + 1}. {treeTitle(t)}</b>
            <div className="muted small">{treeDetails(t)}</div>
            {t.notes && <div className="small">{t.notes}</div>}
            {t.internal_notes && <div className="small"><span className="internal-tag">internal</span> {t.internal_notes}</div>}
          </div>
        ))}
      </section>
      <section className="card">
        <h3>Site</h3>
        <p className="small" style={{ margin: 0 }}>
          {[...job.site.conditions, job.site.other].filter(Boolean).join(', ') || 'No site notes'}<br />
          {job.site.parking && <>Parking: {job.site.parking}<br /></>}
          {job.site.debris && <>Wood &amp; debris: {job.site.debris}<br /></>}
          Days: {job.days + job.change_orders.reduce((s, c) => s + c.days, 0)} · Equipment: {job.equipment.map((e) => e.desc).filter(Boolean).join(', ') || 'none'}
        </p>
      </section>
      {company && (
        <details className="card">
          <summary>Customer’s copy (without prices)</summary>
          <div className="doc-preview"><EstimateDoc company={toCustomerCompany(company)} job={toCustomerJob(job)} pricing={null} /></div>
        </details>
      )}
    </div>
  );
}
