import { useEffect, useState, type FormEvent } from 'react';
import { can, useReady, useRow } from '../lib/session';
import type { Organization, OrgPricing } from '../lib/types';

const ORG_FIELDS: [keyof Organization, string, React.InputHTMLAttributes<HTMLInputElement>][] = [
  ['name', 'Company name', { required: true, autoCapitalize: 'words' }],
  ['contact_name', 'Contact name (on estimates)', { autoCapitalize: 'words' }],
  ['phone', 'Phone', { type: 'tel', inputMode: 'tel' }],
  ['email', 'Email', { type: 'email', inputMode: 'email' }],
  ['website', 'Website', {}],
  ['license', 'License #', {}],
];

export function Company() {
  const { engine, org } = useReady();
  const savedOrg = useRow(engine, 'organizations', org.org_id);
  const savedPricing = useRow(engine, 'org_pricing', org.org_id);
  const editable = can.editCompany(org.role);
  const showPrices = can.seePrices(org.role);
  const [o, setO] = useState<Organization | null>(null);
  const [p, setP] = useState<OrgPricing | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (savedOrg && !o) setO({ ...savedOrg }); }, [savedOrg, o]);
  useEffect(() => { if (savedPricing && !p) setP({ ...savedPricing }); }, [savedPricing, p]);

  if (!o) return <div className="page"><p className="empty">{savedOrg === null ? 'Waiting for first sync…' : 'Loading…'}</p></div>;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!o) return;
    await engine.save('organizations', o);
    if (p && showPrices) await engine.save('org_pricing', p);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <form className="page" onSubmit={save}>
      <div className="page-head"><h2>Company</h2></div>
      {!editable && <p className="hint">Only the owner can change company details.</p>}
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
        <section className="card">
          <h3>Shown on estimates and invoices</h3>
          {ORG_FIELDS.map(([k, label, attrs]) => (
            <label key={k} className="field"><span>{label}</span>
              <input {...attrs} value={String(o[k] ?? '')} onChange={(e) => setO({ ...o, [k]: e.target.value })} />
            </label>
          ))}
          <label className="field"><span>Address</span>
            <textarea rows={2} value={o.address} onChange={(e) => setO({ ...o, address: e.target.value })} />
          </label>
          <p className="muted small">Logo and contractor signature move here in Phase 2.</p>
        </section>

        {showPrices && p && (
          <section className="card">
            <h3>Pricing defaults <small className="muted">owner and office only</small></h3>
            <div className="two">
              <label className="field"><span>Day rate</span>
                <div className="price-input"><span>$</span>
                  <input type="number" inputMode="decimal" min={0} step="0.01" value={p.day_rate} onChange={(e) => setP({ ...p, day_rate: num(e.target.value) })} />
                </div>
              </label>
              <label className="field"><span>Equipment markup</span>
                <div className="price-input">
                  <input type="number" inputMode="decimal" min={0} step="1" value={Math.round((p.equipment_markup - 1) * 100)}
                    onChange={(e) => setP({ ...p, equipment_markup: 1 + num(e.target.value) / 100 })} /><span>%</span>
                </div>
              </label>
              <label className="field"><span>Tax rate</span>
                <div className="price-input">
                  <input type="number" inputMode="decimal" min={0} step="0.001" value={p.tax_rate} onChange={(e) => setP({ ...p, tax_rate: num(e.target.value) })} /><span>%</span>
                </div>
              </label>
              <label className="field"><span>Deposit</span>
                <div className="price-input">
                  <input type="number" inputMode="decimal" min={0} max={100} step="1" value={p.deposit_pct} onChange={(e) => setP({ ...p, deposit_pct: num(e.target.value) })} /><span>%</span>
                </div>
              </label>
              <label className="field"><span>Estimates valid for</span>
                <div className="price-input">
                  <input type="number" inputMode="numeric" min={1} step="1" value={p.valid_days} onChange={(e) => setP({ ...p, valid_days: num(e.target.value) || 30 })} /><span>days</span>
                </div>
              </label>
            </div>
            <p className="muted small">The markup is built into each equipment line on customer documents. Customers never see the rental cost.</p>
          </section>
        )}
      </fieldset>
      {editable && (
        <div className="btn-row">
          <button type="submit" className="btn primary">Save</button>
          {saved && <span className="muted small" role="status" style={{ alignSelf: 'center' }}>Saved</span>}
        </div>
      )}
    </form>
  );
}
