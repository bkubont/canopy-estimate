/**
 * CRM pipeline stage helpers (D2).
 *
 * Job `stage` / `status` remain source of truth for work. CRM Stage tags track
 * sales follow-up. Auto-sync from jobs is locked yes (D2) but ships in Phase C
 * with the People UI — Phase A only documents the mapping and leaves a stub.
 *
 * Mapping (when Phase C wires this):
 *   job status → scheduled / in_progress  → CRM Stage "Booked"
 *   job stage  → paid                     → CRM Stage "Past customer"
 *     (Complete may be used as an intermediate; Past is the backfill target per D3)
 *
 * Each auto change should log a customer_activities row with type 'stage'.
 * Office can still override the stage tag manually on the customer card.
 */

import type { Job, Tag, TagGroup } from './types';

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
 * TODO(Phase C): apply crmStageSlugFromJob when a job is saved — set the
 * customer's Stage tag (mode 'one': replace prior stage tags), log a stage
 * activity, and refresh via engine.save. Do not call from UI until CRM_ENABLED.
 */
export function applyCrmStageFromJob(_args: {
  job: Pick<Job, 'id' | 'org_id' | 'customer_id' | 'stage' | 'status' | 'signed_at' | 'deleted_at'>;
}): void {
  // Phase A stub — wiring lands with ClientPicker / job save hooks in Phase C.
}
