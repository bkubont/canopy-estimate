import { describe, expect, it } from 'vitest';
import { blankJob, blankPricing, customerPricing, internalEquipmentSummary, summaryText, syncEquipmentDays, totals, todayYmd, addDays } from './estimate';
import type { Job, JobPricing, Organization } from './types';

const org = { id: 'o1', name: 'Advanced Tree Service', phone: '231-555-0000', email: 'ats@example.com' } as Organization;

function sample(): { job: Job; p: JobPricing } {
  const job = blankJob({ org, number: 'E-1001', preparedBy: 'Joey', contractorSig: '' });
  job.client.firstName = 'Dana';
  job.equipment = [{ id: 'l1', desc: 'Stump grinder', qty: 1, qty_manual: false }];
  const p = blankPricing(job, { day_rate: 2000, equipment_markup: 1.2, tax_rate: 0, deposit_pct: 0, valid_days: 30 } as never);
  p.equipment_costs = { l1: 285 };
  return { job, p };
}

describe('pricing', () => {
  it('matches the original app’s total for the same job ($2,342)', () => {
    const { job, p } = sample();
    const t = totals(job, customerPricing(job, p));
    expect(t.labor).toBe(2000);
    expect(t.equipment).toBe(342);
    expect(t.total).toBe(2342);
  });

  it('builds the markup into the equipment line; the customer copy has no cost or markup', () => {
    const { job, p } = sample();
    const cp = customerPricing(job, p);
    expect(cp.unit_prices.l1).toBe(342);
    expect(JSON.stringify(cp)).not.toMatch(/285|markup|cost/);
    expect(totals(job, cp).lines[0]).toMatchObject({ desc: 'Stump grinder', qty: 1, unit: 342, amount: 342 });
  });

  it('rounds each marked-up price to the cent like the server does', () => {
    const { job, p } = sample();
    p.equipment_costs = { l1: 245.55 }; // × 1.2 = 294.66
    expect(customerPricing(job, p).unit_prices.l1).toBe(294.66);
    p.equipment_costs = { l1: 0.125 }; // × 1.2 = 0.15
    expect(customerPricing(job, p).unit_prices.l1).toBe(0.15);
  });

  it('taxes labor and equipment but not other costs', () => {
    const { job, p } = sample();
    p.tax_rate = 6;
    p.additional = 100;
    const t = totals(job, customerPricing(job, p));
    expect(t.tax).toBe(140.52);
    expect(t.total).toBe(2342 + 140.52 + 100);
  });

  it('uses a fixed deposit amount over a percentage, never more than the total', () => {
    const { job, p } = sample();
    p.deposit_pct = 25;
    expect(totals(job, customerPricing(job, p)).deposit).toBe(585.5);
    p.deposit_amt = 500;
    expect(totals(job, customerPricing(job, p)).deposit).toBe(500);
    p.deposit_amt = 99999;
    expect(totals(job, customerPricing(job, p)).deposit).toBe(2342);
  });

  it('adds change-order days at the day rate', () => {
    const { job, p } = sample();
    job.change_orders = [{ id: 'c', date: '', days: 1.5, reason: 'Weather delay', reason_other: '', trees: [], client_sig: 'x', client_sig_date: '', signed_by_name: '' }];
    const t = totals(job, customerPricing(job, p));
    expect(t.changeLabor).toBe(3000);
    expect(t.total).toBe(5342);
  });

  it('uses the signed prices once signed, even if company rates change later', () => {
    const { job, p } = sample();
    p.signed_snapshot = customerPricing(job, p);
    p.day_rate = 2500;
    p.equipment_costs = { l1: 400 };
    expect(totals(job, customerPricing(job, p)).total).toBe(2342);
  });

  it('shows the owner what the rental cost and what the markup earned', () => {
    const { job, p } = sample();
    job.equipment[0]!.qty = 2;
    expect(internalEquipmentSummary(job, p)).toEqual({ cost: 570, charged: 684, markupEarned: 114 });
  });

  it('rental days follow job days unless typed by hand', () => {
    const { job } = sample();
    job.equipment.push({ id: 'l2', desc: 'Chipper', qty: 1, qty_manual: true });
    const next = syncEquipmentDays({ ...job, days: 3 });
    expect(next.equipment.map((l) => l.qty)).toEqual([3, 1]);
  });

  it('text/email summary never mentions cost or markup', () => {
    const { job, p } = sample();
    const text = summaryText(job, customerPricing(job, p), org, 'https://x/#/c/abc');
    expect(text).toContain('Hi Dana');
    expect(text).toContain('$2,342.00');
    expect(text).toContain('https://x/#/c/abc');
    expect(text).not.toMatch(/285|markup/i);
  });

  it('dates use Michigan time', () => {
    // 11:30pm in Michigan on Nov 12 is already Nov 13 in UTC.
    expect(todayYmd(new Date('2026-1113T04:30:00Z'.replace('1113', '11-13')))).toBe('2026-11-12');
    expect(addDays('2026-11-12', 30)).toBe('2026-12-12');
  });
});
