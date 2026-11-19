import { describe, expect, it } from 'vitest';
import { estimateReadyForSignature } from '../lib/estimate';
import type { Job, JobPricing } from '../lib/types';
import { matchesEstimateFilter } from './Estimates';
import type { Stage } from '../lib/status';

const stages: Stage[] = [
  'new', 'pending', 'approved', 'scheduled', 'in_progress', 'blocked', 'done', 'invoiced', 'overdue', 'paid', 'cancelled',
];

const tree = (o: Partial<Job['trees'][number]> = {}): Job['trees'][number] => ({
  id: 't1', species: 'Oak', work: ['Removal'], location: '', size: '', condition: '', qty: 1, notes: '', internal_notes: '', ...o,
});

const job = (o: Partial<Job> = {}): Pick<Job, 'trees' | 'client' | 'signed_at' | 'cancelled_at'> => ({
  trees: [],
  client: { firstName: 'Ada', lastName: 'Lovelace', company: '', phone: '', email: '', street: '', town: '', state: 'MI', zip: '' },
  signed_at: null,
  cancelled_at: null,
  ...o,
});

const pricing = (o: Partial<Pick<JobPricing, 'total' | 'share_token'>> = {}) => ({
  total: 2400,
  share_token: 'tok-1',
  ...o,
});

describe('estimateReadyForSignature', () => {
  it('office: false until scope, client, price, and customer link are all set', () => {
    expect(estimateReadyForSignature(job(), pricing(), true)).toBe(false); // no trees
    expect(estimateReadyForSignature(job({ trees: [tree({ species: '', work: [] })] }), pricing(), true)).toBe(false); // blank tree
    expect(estimateReadyForSignature(job({ trees: [tree()], client: { firstName: '', lastName: '', company: '', phone: '', email: '', street: '', town: '', state: 'MI', zip: '' } }), pricing(), true)).toBe(false);
    expect(estimateReadyForSignature(job({ trees: [tree()] }), pricing({ total: 0 }), true)).toBe(false);
    expect(estimateReadyForSignature(job({ trees: [tree()] }), pricing({ share_token: null }), true)).toBe(false);
    expect(estimateReadyForSignature(job({ trees: [tree()] }), pricing(), true)).toBe(true);
  });

  it('crew: trees + client is enough without pricing rows', () => {
    // Crew RLS never returns job_pricing; priced readiness would always be false.
    expect(estimateReadyForSignature(job({ trees: [tree()] }), null, false)).toBe(true);
    expect(estimateReadyForSignature(job({ trees: [tree()] }), undefined, false)).toBe(true);
    expect(estimateReadyForSignature(job(), null, false)).toBe(false); // no trees
    expect(estimateReadyForSignature(job({ trees: [tree({ species: '', work: [] })] }), null, false)).toBe(false);
    expect(estimateReadyForSignature(job({ trees: [tree()], client: { firstName: '', lastName: '', company: '', phone: '', email: '', street: '', town: '', state: 'MI', zip: '' } }), null, false)).toBe(false);
  });

  it('crew path feeds Awaiting signature when matched through the filter', () => {
    const ready = estimateReadyForSignature(job({ trees: [tree()] }), null, false);
    expect(matchesEstimateFilter('pending', 'awaiting', false, ready)).toBe(true);
    expect(matchesEstimateFilter('pending', 'drafts', false, ready)).toBe(false);
    const notReady = estimateReadyForSignature(job(), null, false);
    expect(matchesEstimateFilter('new', 'drafts', false, notReady)).toBe(true);
    expect(matchesEstimateFilter('new', 'awaiting', false, notReady)).toBe(false);
  });

  it('keeps signed or cancelled jobs out of ready', () => {
    expect(estimateReadyForSignature(job({ trees: [tree()], signed_at: 'x' }), pricing(), true)).toBe(false);
    expect(estimateReadyForSignature(job({ trees: [tree()], cancelled_at: 'x' }), pricing(), true)).toBe(false);
    expect(estimateReadyForSignature(job({ trees: [tree()], signed_at: 'x' }), null, false)).toBe(false);
  });
});

describe('matchesEstimateFilter', () => {
  it('office All is only pre-sign (drafts, awaiting, cancelled)', () => {
    const hit = stages.filter((s) => matchesEstimateFilter(s, 'all', true));
    expect(hit).toEqual(['new', 'pending', 'cancelled']);
  });

  it('keeps unfinished pending estimates in Active drafts until ready for signature', () => {
    // First tree flips jobStage to pending, but without readiness it stays a draft.
    expect(matchesEstimateFilter('pending', 'drafts', true, false)).toBe(true);
    expect(matchesEstimateFilter('pending', 'awaiting', true, false)).toBe(false);
    expect(matchesEstimateFilter('new', 'drafts', true, false)).toBe(true);
    expect(matchesEstimateFilter('new', 'awaiting', true, false)).toBe(false);
  });

  it('puts ready unsigned estimates under Awaiting signature', () => {
    expect(matchesEstimateFilter('pending', 'awaiting', true, true)).toBe(true);
    expect(matchesEstimateFilter('pending', 'drafts', true, true)).toBe(false);
    expect(matchesEstimateFilter('approved', 'awaiting', true, true)).toBe(false);
    expect(matchesEstimateFilter('approved', 'drafts', true, true)).toBe(false);
  });

  it('crew All keeps signed pipeline jobs (not cancelled)', () => {
    const hit = stages.filter((s) => matchesEstimateFilter(s, 'all', false));
    expect(hit).toEqual(['new', 'pending', 'approved', 'scheduled', 'in_progress', 'blocked', 'done', 'invoiced', 'overdue', 'paid']);
  });
});
