/**
 * Smart lists (Phase E / D7): saved People/Today filters.
 * Definitions sync as org rows; matching uses stable stage/tag slugs.
 */

import { STAGE_SLUGS } from './crmStage';
import {
  lastStageChangeAt, liveForCustomer, matchesPeopleSearch, stageOf, tagIdsForCustomer,
} from './crmUi';
import type { SyncEngine } from './sync';
import type {
  Customer, CustomerActivity, CustomerEmail, CustomerPhone, CustomerProperty,
  CustomerTag, SmartList, SmartListTagRef, Tag, TagGroup,
} from './types';

const COLD_MS = 7 * 86_400_000;

export function blankSmartList(orgId: string, patch: Partial<SmartList> = {}): SmartList {
  return {
    id: crypto.randomUUID(),
    org_id: orgId,
    name: '',
    query: '',
    stage_slugs: [],
    tag_refs: [],
    cold_only: false,
    pin_today: false,
    sort: 0,
    created_by: null,
    deleted_at: null,
    ...patch,
  };
}

export function normalizeTagRefs(refs: unknown): SmartListTagRef[] {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const group = String((r as SmartListTagRef).group ?? '').trim();
      const tag = String((r as SmartListTagRef).tag ?? '').trim();
      if (!group || !tag) return null;
      return { group, tag };
    })
    .filter((r): r is SmartListTagRef => !!r);
}

export function normalizeStageSlugs(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  return slugs.map((s) => String(s).trim()).filter(Boolean);
}

/** Coerce pull/IndexedDB row jsonb fields into typed arrays. */
export function normalizeSmartList(row: SmartList): SmartList {
  return {
    ...row,
    query: row.query ?? '',
    stage_slugs: normalizeStageSlugs(row.stage_slugs),
    tag_refs: normalizeTagRefs(row.tag_refs),
    cold_only: !!row.cold_only,
    pin_today: !!row.pin_today,
    sort: Number(row.sort) || 0,
  };
}

export function liveSmartLists(rows: SmartList[] | null | undefined): SmartList[] {
  return (rows ?? [])
    .filter((r) => !r.deleted_at)
    .map(normalizeSmartList)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

function resolveTagIds(
  refs: SmartListTagRef[],
  groups: TagGroup[],
  tags: Tag[],
): string[] | null {
  const ids: string[] = [];
  for (const ref of refs) {
    const g = groups.find((x) => !x.deleted_at && x.slug === ref.group);
    if (!g) return null;
    const t = tags.find((x) => !x.deleted_at && x.tag_group_id === g.id && x.slug === ref.tag);
    if (!t) return null;
    ids.push(t.id);
  }
  return ids;
}

export function matchesSmartList(args: {
  list: Pick<SmartList, 'query' | 'stage_slugs' | 'tag_refs' | 'cold_only'>;
  customer: Customer;
  phones: CustomerPhone[];
  emails: CustomerEmail[];
  properties: CustomerProperty[];
  memberships: CustomerTag[];
  activities: CustomerActivity[];
  groups: TagGroup[];
  tags: Tag[];
  now?: number;
}): boolean {
  const list = {
    ...args.list,
    stage_slugs: normalizeStageSlugs(args.list.stage_slugs),
    tag_refs: normalizeTagRefs(args.list.tag_refs),
  };
  const tagNames = tagIdsForCustomer(args.memberships, args.customer.id)
    .map((id) => args.tags.find((t) => t.id === id)?.name || '');

  if (!matchesPeopleSearch({
    customer: args.customer,
    phones: args.phones,
    emails: args.emails,
    properties: args.properties,
    tagNames,
    query: list.query,
  })) return false;

  const stage = stageOf(args.customer.id, args.memberships, args.groups, args.tags);
  if (list.stage_slugs.length) {
    if (!stage || !list.stage_slugs.includes(stage.slug)) return false;
  }

  if (list.tag_refs.length) {
    const want = resolveTagIds(list.tag_refs, args.groups, args.tags);
    if (!want) return false;
    const have = new Set(tagIdsForCustomer(args.memberships, args.customer.id));
    if (!want.every((id) => have.has(id))) return false;
  }

  if (list.cold_only) {
    if (!stage || stage.slug !== STAGE_SLUGS.estSent) return false;
    const last = lastStageChangeAt(args.customer.id, args.activities);
    const now = args.now ?? Date.now();
    if (!(last > 0 && now - last > COLD_MS)) return false;
  }

  return true;
}

export function customersMatchingSmartList(args: {
  list: Pick<SmartList, 'query' | 'stage_slugs' | 'tag_refs' | 'cold_only'>;
  customers: Customer[];
  phones: CustomerPhone[];
  emails: CustomerEmail[];
  properties: CustomerProperty[];
  memberships: CustomerTag[];
  activities: CustomerActivity[];
  groups: TagGroup[];
  tags: Tag[];
  now?: number;
}): Customer[] {
  return args.customers.filter((c) => {
    if (c.deleted_at) return false;
    return matchesSmartList({
      list: args.list,
      customer: c,
      phones: liveForCustomer(args.phones, c.id),
      emails: liveForCustomer(args.emails, c.id),
      properties: liveForCustomer(args.properties, c.id),
      memberships: args.memberships,
      activities: args.activities,
      groups: args.groups,
      tags: args.tags,
      now: args.now,
    });
  });
}

/** True when the draft has something worth saving as a named list. */
export function filterIsMeaningful(f: Pick<SmartList, 'query' | 'stage_slugs' | 'tag_refs' | 'cold_only'>): boolean {
  return !!(f.query.trim()
    || normalizeStageSlugs(f.stage_slugs).length
    || normalizeTagRefs(f.tag_refs).length
    || f.cold_only);
}

export function filterEquals(
  a: Pick<SmartList, 'query' | 'stage_slugs' | 'tag_refs' | 'cold_only'>,
  b: Pick<SmartList, 'query' | 'stage_slugs' | 'tag_refs' | 'cold_only'>,
): boolean {
  const as = normalizeStageSlugs(a.stage_slugs).slice().sort().join('|');
  const bs = normalizeStageSlugs(b.stage_slugs).slice().sort().join('|');
  const ar = normalizeTagRefs(a.tag_refs).map((r) => `${r.group}:${r.tag}`).sort().join('|');
  const br = normalizeTagRefs(b.tag_refs).map((r) => `${r.group}:${r.tag}`).sort().join('|');
  return a.query.trim() === b.query.trim()
    && as === bs
    && ar === br
    && !!a.cold_only === !!b.cold_only;
}

export async function saveSmartList(
  engine: SyncEngine,
  list: SmartList,
): Promise<void> {
  const next = normalizeSmartList({
    ...list,
    name: list.name.trim(),
    query: list.query.trim(),
  });
  if (!next.name) throw new Error('Name is required');
  await engine.save('smart_lists', next);
}

export async function deleteSmartList(engine: SyncEngine, list: SmartList): Promise<void> {
  await engine.remove('smart_lists', list);
}

export async function togglePinToday(engine: SyncEngine, list: SmartList): Promise<void> {
  await engine.save('smart_lists', { ...normalizeSmartList(list), pin_today: !list.pin_today });
}
