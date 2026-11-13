import { useState } from 'react';
import { SignaturePad } from '../../components/SignaturePad';
import { Chips, Field, MoneyInput } from '../../components/ui';
import { clientName, customerPricing, DEPOSIT_CHOICES, money, niceDate, num, OTHER_COST_CHOICES, todayYmd, totals, VALID_CHOICES, validUntil } from '../../lib/estimate';
import { useReady, useRow } from '../../lib/session';
import type { StepProps } from './types';

export function StepReview({ job, pricing, updateJob, updatePricing, onSigned }: StepProps & { onSigned: () => void }) {
  const { engine, org, user } = useReady();
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const cp = customerPricing(job, pricing);
  const t = totals(job, cp);
  const [name, setName] = useState(clientName(job.client));
  const [sig, setSig] = useState('');
  const [error, setError] = useState('');
  const contractorSig = job.contractor_sig || me?.signature_data || '';

  function sign() {
    if (!job.trees.length) return setError('Add at least one tree before signing.');
    if (!name.trim()) return setError('Type the client’s name.');
    if (!sig) return setError('The client needs to sign in the box.');
    const snapshot = customerPricing(job, pricing);
    updateJob((j) => ({
      ...j, client_sig: sig, client_sig_date: todayYmd(), signed_at: new Date().toISOString(), signed_via: 'device',
      signed_by_name: name.trim(), status: 'approved', contractor_sig: j.contractor_sig || contractorSig,
      prepared_by_name: j.prepared_by_name || me?.display_name || '',
    }));
    updatePricing((p) => ({ ...p, signed_snapshot: snapshot }));
    onSigned();
  }

  return (
    <div className="wizard-grid two-col">
      <div>
        <h2 className="step-title">Review</h2>
        <section className="card">
          <div className="sum-line"><span>Labor ({job.days} day{job.days === 1 ? '' : 's'} × {money(cp.day_rate)})</span><span>{money(t.baseLabor)}</span></div>
          <div className="sum-line"><span>Equipment</span><span>{money(t.equipment)}</span></div>
          <div className="sum-line"><b>Subtotal</b><b>{money(t.subtotal)}</b></div>
        </section>
        <section className="card">
          <h4 className="label">Tax</h4>
          <div className="row">
            <div className="price-input" style={{ maxWidth: 160 }}>
              <input type="number" inputMode="decimal" min={0} step="0.001" aria-label="Tax rate" value={pricing.tax_rate}
                onChange={(e) => updatePricing((p) => ({ ...p, tax_rate: num(e.target.value) }))} /><span>%</span>
            </div>
            <span>{money(t.tax)}</span>
          </div>
          <h4 className="label">Other costs <small className="muted">travel, misc.</small></h4>
          <Chips label="Other costs" options={OTHER_COST_CHOICES} value={pricing.additional} onChange={(v) => updatePricing((p) => ({ ...p, additional: num(v) }))} required />
          <div className="mt"><MoneyInput label="Other costs amount" value={pricing.additional || null} placeholder="Other amount" onChange={(v) => updatePricing((p) => ({ ...p, additional: v ?? 0 }))} /></div>
          <div className="sum-line grand mt"><span>Total</span><span>{money(t.total)}</span></div>
        </section>
        <section className="card">
          <h4 className="label">Estimate is valid for</h4>
          <Chips label="Valid for" options={VALID_CHOICES} value={pricing.valid_days} onChange={(v) => updatePricing((p) => ({ ...p, valid_days: num(v) || 30 }))} required />
          <p className="muted small">Valid until {niceDate(validUntil(job, cp))}.</p>
          <h4 className="label">Deposit</h4>
          <Chips label="Deposit" options={DEPOSIT_CHOICES} value={pricing.deposit_amt == null ? pricing.deposit_pct : ''}
            onChange={(v) => updatePricing((p) => ({ ...p, deposit_pct: num(v), deposit_amt: null }))} />
          <div className="row mt">
            <MoneyInput label="Deposit amount" placeholder="or an amount" value={pricing.deposit_amt}
              onChange={(v) => updatePricing((p) => ({ ...p, deposit_amt: v }))} />
            <b>{money(t.deposit)}</b>
          </div>
        </section>
      </div>

      <div>
        <h2 className="step-title">Client signature</h2>
        <section className="card">
          <p className="muted small" style={{ marginTop: 0 }}>
            Hand the device to the client. Signing approves the estimate and locks it. Changes after that are made with a change order.
          </p>
          <Field label="Client’s name"><input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" /></Field>
          <SignaturePad value={sig} onChange={setSig} label="Client signs above to accept the estimate" />
          {error && <p className="error-text" role="alert">{error}</p>}
          <button type="button" className="btn primary block" onClick={sign}>✍ Client accepts {money(t.total)}</button>
          <p className="hint">Client not here? Skip this. On the next step, text or email them a link to sign on their own phone.</p>
        </section>
        <section className="card">
          <h4 className="label">Your signature</h4>
          {contractorSig ? <img src={contractorSig} alt="Your signature" style={{ maxHeight: 60 }} /> : (
            <p className="muted small">Add your signature once under More → Account, and it goes on every estimate you prepare.</p>
          )}
        </section>
      </div>
    </div>
  );
}
