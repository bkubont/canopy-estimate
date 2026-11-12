import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blankJob, blankPricing, blankTree, customerPricing } from '../lib/estimate';
import type { Organization } from '../lib/types';
import { EstimateDoc, toCustomerCompany, toCustomerJob } from './EstimateDoc';

const org = { id: 'o1', name: 'Advanced Tree Service', contact_name: 'Joey', phone: '231-555-0000', email: '', website: '', license: '', address: '', logo_data: '' } as Organization;

function render() {
  const job = blankJob({ org, number: 'E-1001', preparedBy: 'Joey', contractorSig: '' });
  job.client.firstName = 'Dana';
  job.internal_notes = 'SECRET-JOB-NOTE customer haggles';
  job.client_notes = 'Haul all brush';
  job.trees = [{ ...blankTree(), species: 'Ash', notes: 'Leaning toward house', internal_notes: 'SECRET-TREE-NOTE bring rigging' }];
  job.equipment = [{ id: 'l1', desc: 'Stump grinder', qty: 1, qty_manual: false }];
  job.change_orders = [{ id: 'c1', date: '2026-11-20', days: 1, reason: 'Weather delay', reason_other: '', trees: [{ ...blankTree(), species: 'Elm', internal_notes: 'SECRET-CO-NOTE' }], client_sig: '', client_sig_date: '', signed_by_name: '' }];
  const p = blankPricing(job, { day_rate: 2000, equipment_markup: 1.2 } as never);
  p.equipment_costs = { l1: 285 };
  return renderToStaticMarkup(<EstimateDoc company={toCustomerCompany(org)} job={toCustomerJob(job)} pricing={customerPricing(job, p)} />);
}

describe('EstimateDoc', () => {
  it('never prints internal notes, on the job, its trees or change-order trees', () => {
    const html = render();
    expect(html).not.toContain('SECRET');
    expect(html).toContain('Haul all brush');
    expect(html).toContain('Leaning toward house');
  });

  it('shows equipment at the marked-up price with no cost or markup line', () => {
    const html = render();
    expect(html).toContain('$342.00');
    expect(html).not.toContain('$285.00');
    expect(html).not.toMatch(/markup/i);
  });

  it('includes change-order days in the total', () => {
    expect(render()).toContain('$4,342.00');
  });
});
