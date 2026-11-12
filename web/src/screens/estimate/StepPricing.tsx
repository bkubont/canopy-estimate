import { Chips, MoneyInput, Stepper } from '../../components/ui';
import { customerPricing, DAY_CHOICES, EQUIPMENT, internalEquipmentSummary, money, num, round2, syncEquipmentDays, totals, uid } from '../../lib/estimate';
import { useReady, useRow } from '../../lib/session';
import type { StepProps } from './types';

export function StepPricing({ job, pricing, updateJob, updatePricing }: StepProps) {
  const { engine, org } = useReady();
  const orgPricing = useRow(engine, 'org_pricing', org.org_id);
  const cp = customerPricing(job, pricing);
  const t = totals(job, cp);
  const internal = internalEquipmentSummary(job, pricing);
  const markupPct = Math.round((num(pricing.equipment_markup) - 1) * 100);

  const setDays = (days: number) => updateJob((j) => syncEquipmentDays({ ...j, days: days || 0.5 }));

  /** Remember what a rental costs so it fills in next time, for the whole company. */
  const rememberCost = (desc: string, cost: number | null) => {
    if (!orgPricing || !desc.trim() || cost == null) return;
    const k = desc.trim().toLowerCase();
    if (orgPricing.equipment_costs?.[k] === cost) return;
    if (org.role === 'owner') void engine.save('org_pricing', { ...orgPricing, equipment_costs: { ...orgPricing.equipment_costs, [k]: cost } });
  };

  const addLine = (desc: string) => {
    const id = uid();
    const known = orgPricing?.equipment_costs?.[desc.toLowerCase()] ?? EQUIPMENT.find(([d]) => d === desc)?.[1];
    updateJob((j) => ({ ...j, equipment: [...j.equipment, { id, desc, qty: num(j.days) || 1, qty_manual: false }] }));
    if (known != null) updatePricing((p) => ({ ...p, equipment_costs: { ...p.equipment_costs, [id]: known } }));
  };

  return (
    <div className="wizard-grid two-col">
      <div>
        <h2 className="step-title">Job days</h2>
        <section className="card">
          <Chips label="Days" options={DAY_CHOICES} value={job.days} onChange={(v) => setDays(num(v) || job.days)} required />
          <div className="mt"><Stepper label="Days" value={job.days} step={0.5} min={0.5} onChange={setDays} /></div>
          <h4 className="label">Day rate</h4>
          <MoneyInput label="Day rate" value={pricing.day_rate} onChange={(v) => updatePricing((p) => ({ ...p, day_rate: v ?? 0 }))} />
          <div className="sum-line grand mt"><span>Labor</span><span>{money(t.baseLabor)}</span></div>
        </section>
        <p className="hint">Work dates are set on the calendar after the estimate is signed.</p>
      </div>

      <div>
        <h2 className="step-title">Equipment rentals</h2>
        <section className="card">
          <h4 className="label">Tap to add</h4>
          <div className="chips">
            {EQUIPMENT.map(([d]) => <button key={d} type="button" className="chip add" onClick={() => addLine(d)}>＋ {d}</button>)}
            <button type="button" className="chip add" onClick={() => addLine('')}>＋ Other</button>
          </div>
        </section>
        {job.equipment.map((line) => {
          const cost = pricing.equipment_costs?.[line.id];
          const unit = round2(num(cost) * (num(pricing.equipment_markup) || 1));
          return (
            <div className="line-card" key={line.id}>
              <div className="line-head">
                <input aria-label="Equipment description" placeholder="Description" value={line.desc}
                  onChange={(e) => updateJob((j) => ({ ...j, equipment: j.equipment.map((l) => (l.id === line.id ? { ...l, desc: e.target.value } : l)) }))}
                  onBlur={() => rememberCost(line.desc, cost ?? null)} />
                <button type="button" className="icon-btn" aria-label={`Remove ${line.desc || 'equipment'}`}
                  onClick={() => updateJob((j) => ({ ...j, equipment: j.equipment.filter((l) => l.id !== line.id) }))}>✕</button>
              </div>
              <div className="qty-price">
                <div>
                  <h4 className="label">Days</h4>
                  <Stepper label={`${line.desc || 'Equipment'} days`} value={line.qty} step={0.5} min={0.5}
                    onChange={(v) => updateJob((j) => ({ ...j, equipment: j.equipment.map((l) => (l.id === line.id ? { ...l, qty: v, qty_manual: true } : l)) }))} />
                </div>
                <div>
                  <h4 className="label">Rental cost / day <span className="internal-tag">private</span></h4>
                  <MoneyInput label={`${line.desc || 'Equipment'} rental cost`} value={cost ?? null}
                    onChange={(v) => updatePricing((p) => ({ ...p, equipment_costs: { ...p.equipment_costs, [line.id]: v ?? 0 } }))} />
                </div>
              </div>
              <div className="sum-line"><span>Customer price {money(unit)}/day</span><b>{money(round2(unit * num(line.qty)))}</b></div>
            </div>
          );
        })}
        <section className="card">
          <div className="sum-line grand"><span>Equipment</span><span>{money(t.equipment)}</span></div>
          {job.equipment.length > 0 && (
            <div className="sum-line private">
              <span>Your cost {money(internal.cost)} · {markupPct}% markup earns</span><span>{money(internal.markupEarned)}</span>
            </div>
          )}
          <p className="hint" style={{ marginBottom: 0 }}>Customers see one price per item, with the markup built in.</p>
        </section>
      </div>
    </div>
  );
}
