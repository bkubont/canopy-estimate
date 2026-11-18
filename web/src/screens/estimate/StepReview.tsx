import { useState } from 'react';
import { Icon } from '../../components/Icon';
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
        <section className="card">
          <div className="sec-head"><h2><Icon name="dollar" size={18} />Price</h2></div>
          <div className="sum-line"><span>Labor · {job.days} day{job.days === 1 ? '' : 's'} × {money(cp.day_rate)}</span><span>{money(t.baseLabor)}</span></div>
          <div className="sum-line"><span>Equipment</span><span>{money(t.equipment)}</span></div>
          <div className="sum-line">
            <span className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>Tax
              <span className="price-input pct-input">
                <input type="number" inputMode="decimal" min={0} step="0.001" aria-label="Tax rate" value={pricing.tax_rate}
                  onChange={(e) => updatePricing((p) => ({ ...p, tax_rate: num(e.target.value) }))} /><span>%</span>
              </span>
            </span>
            <span>{money(t.tax)}</span>
          </div>
          <h4 className="label">Other costs <small className="muted">travel, misc.</small></h4>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Chips label="Other costs" options={OTHER_COST_CHOICES} value={pricing.additional} onChange={(v) => updatePricing((p) => ({ ...p, additional: num(v) }))} required />
            <MoneyInput label="Other costs amount" value={pricing.additional || null} placeholder="Other amount" onChange={(v) => updatePricing((p) => ({ ...p, additional: v ?? 0 }))} />
          </div>
          <div className="total-band"><span>Total</span><span>{money(t.total)}</span></div>
        </section>

        <section className="card">
          <div className="sec-head"><h2><Icon name="file" size={18} />Terms</h2></div>
          <h4 className="label">Valid for <small className="muted">until {niceDate(validUntil(job, cp))}</small></h4>
          <Chips label="Valid for" options={VALID_CHOICES} value={pricing.valid_days} onChange={(v) => updatePricing((p) => ({ ...p, valid_days: num(v) || 30 }))} required />
          <h4 className="label">Deposit <small className="muted">{money(t.deposit)}</small></h4>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Chips label="Deposit" options={DEPOSIT_CHOICES} value={pricing.deposit_amt == null ? pricing.deposit_pct : ''}
              onChange={(v) => updatePricing((p) => ({ ...p, deposit_pct: num(v), deposit_amt: null }))} />
            <MoneyInput label="Deposit amount" placeholder="or an amount" value={pricing.deposit_amt}
              onChange={(v) => updatePricing((p) => ({ ...p, deposit_amt: v }))} />
          </div>
        </section>
      </div>

      <section className="card">
        <div className="sec-head"><h2><Icon name="pen" size={18} />Sign here</h2></div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Client with you? Hand them the device. Signing approves and locks the estimate; later changes go on a change order.
        </p>
        <Field label="Client’s name"><input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" /></Field>
        <SignaturePad value={sig} onChange={setSig} label="Client signs above to accept the estimate" />
        {error && <p className="error-text" role="alert">{error}</p>}
        <button type="button" className="btn primary block" onClick={sign}><Icon name="pen" />Client accepts {money(t.total)}</button>
        <div className="your-sig">
          <span className="muted small">Your signature</span>
          {contractorSig ? <img src={contractorSig} alt="Your signature" /> : (
            <span className="muted small">Add it once under Account (person icon, top right) and it goes on every estimate.</span>
          )}
        </div>
      </section>
    </div>
  );
}
