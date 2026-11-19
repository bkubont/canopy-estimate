import { describe, expect, it } from 'vitest';
import { matchesEstimateFilter } from './Estimates';
import type { Stage } from '../lib/status';

const stages: Stage[] = [
  'new', 'pending', 'approved', 'scheduled', 'in_progress', 'blocked', 'done', 'invoiced', 'overdue', 'paid', 'cancelled',
];

describe('matchesEstimateFilter', () => {
  it('office All is only pre-sign (drafts, awaiting, cancelled)', () => {
    const hit = stages.filter((s) => matchesEstimateFilter(s, 'all', true));
    expect(hit).toEqual(['new', 'pending', 'cancelled']);
  });

  it('office Active drafts / Awaiting signature split new vs pending', () => {
    expect(matchesEstimateFilter('new', 'drafts', true)).toBe(true);
    expect(matchesEstimateFilter('pending', 'drafts', true)).toBe(false);
    expect(matchesEstimateFilter('pending', 'awaiting', true)).toBe(true);
    expect(matchesEstimateFilter('new', 'awaiting', true)).toBe(false);
    expect(matchesEstimateFilter('approved', 'drafts', true)).toBe(false);
    expect(matchesEstimateFilter('approved', 'awaiting', true)).toBe(false);
  });

  it('crew All keeps signed pipeline jobs (not cancelled)', () => {
    const hit = stages.filter((s) => matchesEstimateFilter(s, 'all', false));
    expect(hit).toEqual(['new', 'pending', 'approved', 'scheduled', 'in_progress', 'blocked', 'done', 'invoiced', 'overdue', 'paid']);
  });
});
