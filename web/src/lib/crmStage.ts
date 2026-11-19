/**
 * CRM pipeline stage helpers (D2).
 *
 * Job `stage` / `status` remain source of truth for work. CRM Stage tags track
 * sales follow-up. Auto-sync from jobs (D2):
 *   job status → scheduled / in_progress  → CRM Stage "Booked"
 *   job stage  → paid                     → CRM Stage "Past customer"
 *
 * Each auto change logs a customer_activities row with type 'stage'.
 * Office can still override the stage tag manually on the customer card.
 * This never writes job.stage or job.status (work board stays separate).
 */

import { blankActivity, blankCustomerTag } from './crm';
import { CRM_ENABLED } from './features';
import type { SyncEngine } from './sync';
import type { CustomerTag, Job, Tag, TagGroup } from './types';
import { rowKey } from './types';

/** Stable slug for the pipeline Stage group seeded in seed_org_crm_tags. */
export const STAGE_GROUP_SLUG = 'stage';

/** Stage tag slugs seeded per org. */
export const STAGE_SLUGS = {
  new: 'new',
  estSet: 'est-set',
  estSent: 'est-sent',
  booked: 'booked',
  complete: 'complete',
  past: 'past',
} as const;

export type StageSlug = (typeof STAGE_SLUGS)[keyof typeof STAGE_SLUGS];

/**
 * Which CRM stage a job change should push the customer toward.
 * Returns null when the job event should not auto-move the pipeline.
 */
export function crmStageSlugFromJob(job: Pick<Job, 'stage' | 'status' | 'signed_at' | 'deleted_at'>): StageSlug | null {
  if (job.deleted_at) return null;
  if (job.stage === 'paid') return STAGE_SLUGS.past;
  if (job.status === 'scheduled' || job.status === 'in_progress') return STAGE_SLUGS.booked;
  return null;
}

/** Find the Stage tag group for an org's seeded taxonomy. */
export function stageTagGroup(groups: TagGroup[]): TagGroup | undefined {
  return groups.find((g) => g.slug === STAGE_GROUP_SLUG && !g.deleted_at);
}

/** Find a stage tag by slug within the Stage group. */
export function stageTag(tags: Tag[], groupId: string, slug: StageSlug): Tag | undefined {
  return tags.find((t) => t.tag_group_id === groupId && t.slug === slug && !t.deleted_at);
}

/**
 * Set the customer's CRM Stage from a job event (D2).
 * Replaces any prior Stage-group membership (mode 'one'), logs a stage activity
 * when the tag actually changes. Does not touch job.stage / job.status.
 */
export async function applyCrmStageFromJob(args: {
  engine: SyncEngine;
  job: Pick<Job, 'id' | 'org_id' | 'customer_id' | 'stage' | 'status' | 'signed_at' | 'deleted_at'>;
  createdBy?: string | null;
  /** Optional preloaded rows (tests / batch); otherwise loaded from the engine. */
  groups?: TagGroup[];
  tags?: Tag[];
  memberships?: CustomerTag[];
}): Promise<StageSlug | null> {
  if (!CRM_ENABLED) return null;
  const slug = crmStageSlugFromJob(args.job);
  const customerId = args.job.customer_id;
  if (!slug || !customerId) return null;

  const groups = args.groups ?? await args.engine.all('tag_groups');
  const tags = args.tags ?? await args.engine.all('tags');
  const memberships = args.memberships ?? await args.engine.all('customer_tags');

  const group = stageTagGroup(groups);
  if (!group) return null;
  const tag = stageTag(tags, group.id, slug);
  if (!tag) return null;

  const groupIds = new Set(tags.filter((t) => t.tag_group_id === group.id && !t.deleted_at).map((t) => t.id));
  const live = memberships.filter((m) => m.customer_id === customerId && !m.deleted_at);
  const already = live.some((m) => m.tag_id === tag.id);
  if (already) return slug;

  for (const m of live) {
    if (groupIds.has(m.tag_id)) await args.engine.remove('customer_tags', m);
  }

  const key = rowKey('customer_tags', { customer_id: customerId, tag_id: tag.id });
  const prev = await args.engine.get('customer_tags', key);
  const next: CustomerTag = prev
    ? { ...prev, deleted_at: null, org_id: args.job.org_id }
    : blankCustomerTag(args.job.org_id, customerId, tag.id);
  await args.engine.save('customer_tags', next);
  await args.engine.save('customer_activities', blankActivity(args.job.org_id, customerId, {
    type: 'stage',
    body: `Stage → ${tag.name} (from job ${args.job.id.slice(0, 8)})`,
    at: new Date().toISOString(),
    created_by: args.createdBy ?? null,
  }));
  return slug;
}

/**
 * After a payment is recorded: if the job is fully paid (sent invoice covered),
 * push CRM stage to Past without writing job.stage (server owns that).
 */
export async function applyCrmStageAfterPayment(args: {
  engine: SyncEngine;
  job: Pick<Job, 'id' | 'org_id' | 'customer_id' | 'stage' | 'status' | 'signed_at' | 'deleted_at'>;
  invoiceTotal: number | null;
  paidAfter: number;
  createdBy?: string | null;
}): Promise<StageSlug | null> {
  if (args.invoiceTotal == null || args.paidAfter + 1e-9 < args.invoiceTotal) return null;
  return applyCrmStageFromJob({
    engine: args.engine,
    job: { ...args.job, stage: 'paid' },
    createdBy: args.createdBy,
  });
}
