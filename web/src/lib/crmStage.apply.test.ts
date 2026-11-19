import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyCrmStageAfterPayment, applyCrmStageFromJob, STAGE_SLUGS } from './crmStage';
import { openLocalDb } from './localdb';
import { SyncEngine, type PullResult, type Remote } from './sync';
import type { CustomerTag, Tag, TagGroup } from './types';

const ORG = 'org-crm-stage';
let dbCount = 0;

const remote: Remote = {
  pull: async (): Promise<PullResult> => ({ cursor: '1', tables: {} }),
  push: async () => {},
  insertMany: async () => {},
};

async function engine() {
  dbCount += 1;
  const db = await openLocalDb(`crm-stage-${dbCount}`);
  return new SyncEngine(db, remote, ORG, { debounceMs: 60_000 });
}

const group: TagGroup = {
  id: 'g-stage', org_id: ORG, name: 'Stage', slug: 'stage', mode: 'one', pipeline: true, allow_new: false, sort: 0, deleted_at: null,
};
const booked: Tag = {
  id: 't-booked', org_id: ORG, tag_group_id: 'g-stage', name: 'Booked', slug: 'booked', color: '#e85a0c', sort: 3, deleted_at: null,
};
const past: Tag = {
  id: 't-past', org_id: ORG, tag_group_id: 'g-stage', name: 'Past customer', slug: 'past', color: '#7b8676', sort: 5, deleted_at: null,
};
const neu: Tag = {
  id: 't-new', org_id: ORG, tag_group_id: 'g-stage', name: 'New lead', slug: 'new', color: '#0404A9', sort: 0, deleted_at: null,
};

describe('applyCrmStageFromJob (D2)', () => {
  let e: SyncEngine;
  beforeEach(async () => {
    e = await engine();
    await e.save('tag_groups', group);
    await e.save('tags', neu);
    await e.save('tags', booked);
    await e.save('tags', past);
  });

  it('sets Booked when job becomes scheduled and logs a stage activity', async () => {
    const job = {
      id: 'j1', org_id: ORG, customer_id: 'c1', stage: 'estimate' as const, status: 'scheduled' as const,
      signed_at: '2026-11-01', deleted_at: null,
    };
    const slug = await applyCrmStageFromJob({ engine: e, job, createdBy: 'u1' });
    expect(slug).toBe(STAGE_SLUGS.booked);
    const tags = await e.all('customer_tags');
    expect(tags.filter((t) => !t.deleted_at).map((t) => t.tag_id)).toEqual(['t-booked']);
    const acts = await e.all('customer_activities');
    expect(acts.some((a) => a.type === 'stage' && a.body.includes('Booked'))).toBe(true);
  });

  it('replaces a prior stage tag (mode one) without touching job fields', async () => {
    const prior: CustomerTag = { org_id: ORG, customer_id: 'c1', tag_id: 't-new', deleted_at: null };
    await e.save('customer_tags', prior);
    await applyCrmStageFromJob({
      engine: e,
      job: {
        id: 'j1', org_id: ORG, customer_id: 'c1', stage: 'estimate', status: 'in_progress',
        signed_at: 'x', deleted_at: null,
      },
    });
    const live = (await e.all('customer_tags')).filter((t) => !t.deleted_at);
    expect(live).toHaveLength(1);
    expect(live[0]!.tag_id).toBe('t-booked');
  });

  it('sets Past when invoice is fully paid (applyCrmStageAfterPayment)', async () => {
    const job = {
      id: 'j1', org_id: ORG, customer_id: 'c1', stage: 'invoice' as const, status: 'done' as const,
      signed_at: 'x', deleted_at: null,
    };
    expect(await applyCrmStageAfterPayment({ engine: e, job, invoiceTotal: 1000, paidAfter: 500 })).toBeNull();
    expect(await applyCrmStageAfterPayment({ engine: e, job, invoiceTotal: 1000, paidAfter: 1000 })).toBe(STAGE_SLUGS.past);
    const live = (await e.all('customer_tags')).filter((t) => !t.deleted_at);
    expect(live.map((t) => t.tag_id)).toEqual(['t-past']);
  });

  it('no-ops without a customer_id (does not invent CRM links)', async () => {
    expect(await applyCrmStageFromJob({
      engine: e,
      job: { id: 'j1', org_id: ORG, customer_id: null, stage: 'paid', status: 'done', signed_at: 'x', deleted_at: null },
    })).toBeNull();
    expect(await e.all('customer_tags')).toEqual([]);
  });
});
