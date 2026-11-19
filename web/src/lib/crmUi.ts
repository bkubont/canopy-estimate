/**
 * Display / filter helpers for CRM People + Today (Phase B).
 * Ported from Canopy Clients util patterns; field names match Estimate rows.
 */

import type {
  Customer, CustomerActivity, CustomerEmail, CustomerPhone, CustomerProperty,
  CustomerTag, Tag, TagGroup,
} from './types';
import { STAGE_SLUGS, stageTagGroup, type StageSlug } from './crmStage';

export function displayName(c: Pick<Customer, 'first_name' | 'last_name' | 'company' | 'phone' | 'email'>): string {
  const n = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return n || c.company || c.phone || c.email || 'No name';
}

/** Same as displayName for flat list rows — kept for SearchBox / legacy Contacts. */
export const customerName = displayName;

export function sortKey(c: Pick<Customer, 'first_name' | 'last_name' | 'company' | 'phone' | 'email'>): string {
  return (c.last_name || c.first_name || c.company || displayName(c)).toLowerCase();
}

export function digits(s: string): string {
  return s.replace(/[^\d+]/g, '');
}

export function timeAgo(isoOrMs: string | number): string {
  const t = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}

export function propertyAddress(p: Pick<CustomerProperty, 'street' | 'town' | 'state' | 'zip'>): string {
  const line1 = p.street.trim();
  const line2 = [p.town.trim(), [p.state.trim(), p.zip.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [line1, line2].filter(Boolean).join(', ');
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function liveForCustomer<T extends { customer_id: string; deleted_at: string | null }>(
  rows: T[] | null | undefined,
  customerId: string,
): T[] {
  return (rows ?? []).filter((r) => r.customer_id === customerId && !r.deleted_at);
}

export function tagIdsForCustomer(memberships: CustomerTag[], customerId: string): string[] {
  return memberships.filter((m) => m.customer_id === customerId && !m.deleted_at).map((m) => m.tag_id);
}

export function stageOf(
  customerId: string,
  memberships: CustomerTag[],
  groups: TagGroup[],
  tags: Tag[],
): Tag | undefined {
  const sg = stageTagGroup(groups);
  if (!sg) return undefined;
  const ids = new Set(tagIdsForCustomer(memberships, customerId));
  return tags
    .filter((t) => t.tag_group_id === sg.id && !t.deleted_at && ids.has(t.id))
    .sort((a, b) => a.sort - b.sort)[0];
}

export function tagsBySlug(tags: Tag[], groupId: string): Map<string, Tag> {
  const m = new Map<string, Tag>();
  for (const t of tags) {
    if (t.tag_group_id === groupId && !t.deleted_at) m.set(t.slug, t);
  }
  return m;
}

export function customersWithStageSlug(
  customers: Customer[],
  memberships: CustomerTag[],
  groups: TagGroup[],
  tags: Tag[],
  slug: StageSlug,
): Customer[] {
  const sg = stageTagGroup(groups);
  if (!sg) return [];
  const tag = tagsBySlug(tags, sg.id).get(slug);
  if (!tag) return [];
  const want = tag.id;
  return customers.filter((c) => !c.deleted_at && tagIdsForCustomer(memberships, c.id).includes(want));
}

const STAGE_ACTIVITY = new Set(['stage', 'imported', 'created']);

/** Epoch ms of the latest stage/imported/created activity (0 if none). */
export function lastStageChangeAt(customerId: string, activities: CustomerActivity[]): number {
  let max = 0;
  for (const a of activities) {
    if (a.deleted_at || a.customer_id !== customerId || !STAGE_ACTIVITY.has(a.type)) continue;
    const t = Date.parse(a.at);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

const COLD_MS = 7 * 86_400_000;

export interface TodayBuckets {
  newLeads: Customer[];
  estSet: Customer[];
  waiting: Customer[];
  cold: Customer[];
}

export function todayBuckets(
  customers: Customer[],
  memberships: CustomerTag[],
  groups: TagGroup[],
  tags: Tag[],
  activities: CustomerActivity[],
  now = Date.now(),
): TodayBuckets {
  const live = customers.filter((c) => !c.deleted_at);
  const newLeads = customersWithStageSlug(live, memberships, groups, tags, STAGE_SLUGS.new);
  const estSet = customersWithStageSlug(live, memberships, groups, tags, STAGE_SLUGS.estSet);
  const waiting = customersWithStageSlug(live, memberships, groups, tags, STAGE_SLUGS.estSent);
  const cold = waiting.filter((c) => {
    const last = lastStageChangeAt(c.id, activities);
    return last > 0 && now - last > COLD_MS;
  });
  return { newLeads, estSet, waiting, cold };
}

export function matchesPeopleSearch(args: {
  customer: Customer;
  phones: CustomerPhone[];
  emails: CustomerEmail[];
  properties: CustomerProperty[];
  tagNames: string[];
  query: string;
}): boolean {
  const q = args.query.trim().toLowerCase();
  if (!q) return true;
  const c = args.customer;
  const hay = [
    c.first_name, c.last_name, c.company, c.notes,
    ...args.phones.map((p) => p.value),
    ...args.emails.map((e) => e.value),
    ...args.properties.flatMap((p) => [propertyAddress(p), p.tree_notes, p.access]),
    ...args.tagNames,
  ].join(' ').toLowerCase();
  const dig = q.replace(/\D/g, '');
  return q.split(/\s+/).every((w) => hay.includes(w))
    || (dig.length >= 3 && args.phones.some((p) => digits(p.value).replace(/\D/g, '').includes(dig)));
}

export function doNotText(memberships: CustomerTag[], tags: Tag[], customerId: string): boolean {
  const ids = new Set(tagIdsForCustomer(memberships, customerId));
  return tags.some((t) => !t.deleted_at && ids.has(t.id) && (t.slug === 'do-not-text' || /do-not-text/i.test(t.slug)));
}
