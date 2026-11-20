/**
 * Settings tag group editor (Phase E).
 *
 * Writes go through SyncEngine (IndexedDB → outbox). Display names and colors
 * are editable; slugs stay frozen after create so People / Today / smart lists
 * (which key off group+tag slugs) keep working.
 */

import { STAGE_GROUP_SLUG, STAGE_SLUGS } from './crmStage';
import type { SyncEngine } from './sync';
import type { Tag, TagGroup, TagGroupMode } from './types';

/** Pipeline Stage group — never delete or un-pipeline. */
export const PROTECTED_GROUP_SLUGS = new Set<string>([STAGE_GROUP_SLUG]);

/** Seeded stage tag slugs used by Today / D2 auto-stage / People filters. */
export const PROTECTED_TAG_SLUGS = new Set<string>(Object.values(STAGE_SLUGS));

/** Job-flag slug that blocks SMS on the customer card. */
export const DO_NOT_TEXT_SLUG = 'do-not-text';

const TAG_COLORS = [
  '',
  '#2a72d4',
  '#c48a00',
  '#e85a0c',
  '#23914f',
  '#7b8676',
  '#9b1a13',
  '#4a2ba8',
  '#0b6e99',
] as const;

export const TAG_COLOR_OPTIONS: readonly string[] = TAG_COLORS;

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tag';
}

/** Unique slug within a set of existing live slugs. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = slugify(base);
  if (!taken.has(root)) return root;
  for (let i = 2; i < 200; i++) {
    const next = `${root}-${i}`;
    if (!taken.has(next)) return next;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

export function liveGroups(groups: TagGroup[] | null | undefined): TagGroup[] {
  return (groups ?? []).filter((g) => !g.deleted_at).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function liveTagsForGroup(tags: Tag[] | null | undefined, groupId: string): Tag[] {
  return (tags ?? [])
    .filter((t) => t.tag_group_id === groupId && !t.deleted_at)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function isProtectedGroup(group: Pick<TagGroup, 'slug' | 'pipeline'>): boolean {
  return group.pipeline || PROTECTED_GROUP_SLUGS.has(group.slug);
}

export function isProtectedTag(tag: Pick<Tag, 'slug'>, group: Pick<TagGroup, 'slug' | 'pipeline'>): boolean {
  if (tag.slug === DO_NOT_TEXT_SLUG) return true;
  if (isProtectedGroup(group) && PROTECTED_TAG_SLUGS.has(tag.slug)) return true;
  return false;
}

export function groupModeLabel(group: Pick<TagGroup, 'mode' | 'pipeline'>): string {
  if (group.pipeline) return 'Pipeline · pick one';
  return group.mode === 'one' ? 'Pick one' : 'Pick many';
}

export function blankTagGroup(orgId: string, patch: Partial<TagGroup> = {}): TagGroup {
  return {
    id: crypto.randomUUID(),
    org_id: orgId,
    name: '',
    slug: '',
    mode: 'many',
    pipeline: false,
    allow_new: false,
    sort: 0,
    deleted_at: null,
    ...patch,
  };
}

export function blankTag(orgId: string, groupId: string, patch: Partial<Tag> = {}): Tag {
  return {
    id: crypto.randomUUID(),
    org_id: orgId,
    tag_group_id: groupId,
    name: '',
    slug: '',
    color: '',
    sort: 0,
    deleted_at: null,
    ...patch,
  };
}

export async function renameTagGroup(
  engine: SyncEngine,
  group: TagGroup,
  name: string,
): Promise<TagGroup> {
  const nextName = name.trim();
  if (!nextName) throw new Error('Group name is required');
  const next = { ...group, name: nextName };
  await engine.save('tag_groups', next);
  return next;
}

export async function updateTagGroupSettings(
  engine: SyncEngine,
  group: TagGroup,
  patch: { mode?: TagGroupMode; allow_new?: boolean },
): Promise<TagGroup> {
  if (isProtectedGroup(group) && patch.mode && patch.mode !== 'one') {
    throw new Error('Stage must stay pick-one');
  }
  const next: TagGroup = {
    ...group,
    mode: isProtectedGroup(group) ? 'one' : (patch.mode ?? group.mode),
    allow_new: patch.allow_new ?? group.allow_new,
    // Never clear pipeline on the Stage group.
    pipeline: isProtectedGroup(group) ? true : group.pipeline,
  };
  await engine.save('tag_groups', next);
  return next;
}

export async function createTagGroup(
  engine: SyncEngine,
  orgId: string,
  args: {
    name: string;
    mode: TagGroupMode;
    allow_new?: boolean;
    existing: TagGroup[];
  },
): Promise<TagGroup> {
  const name = args.name.trim();
  if (!name) throw new Error('Group name is required');
  const taken = new Set(liveGroups(args.existing).map((g) => g.slug));
  // Never collide with the protected Stage slug.
  taken.add(STAGE_GROUP_SLUG);
  const slug = uniqueSlug(name, taken);
  if (PROTECTED_GROUP_SLUGS.has(slug)) throw new Error('That group name is reserved');
  const maxSort = liveGroups(args.existing).reduce((n, g) => Math.max(n, g.sort), -1);
  const row = blankTagGroup(orgId, {
    name,
    slug,
    mode: args.mode,
    allow_new: !!args.allow_new,
    pipeline: false,
    sort: maxSort + 1,
  });
  await engine.save('tag_groups', row);
  return row;
}

export async function deleteTagGroup(
  engine: SyncEngine,
  group: TagGroup,
  tags: Tag[],
): Promise<void> {
  if (isProtectedGroup(group)) throw new Error('The Stage group can’t be deleted');
  for (const t of liveTagsForGroup(tags, group.id)) {
    await engine.remove('tags', t);
  }
  await engine.remove('tag_groups', group);
}

export async function renameTag(
  engine: SyncEngine,
  tag: Tag,
  name: string,
): Promise<Tag> {
  const nextName = name.trim();
  if (!nextName) throw new Error('Tag name is required');
  // Slug stays frozen — smart lists and Today key off slugs.
  const next = { ...tag, name: nextName };
  await engine.save('tags', next);
  return next;
}

export async function recolorTag(
  engine: SyncEngine,
  tag: Tag,
  color: string,
): Promise<Tag> {
  const next = { ...tag, color: color.trim() };
  await engine.save('tags', next);
  return next;
}

export async function createTag(
  engine: SyncEngine,
  orgId: string,
  args: {
    group: TagGroup;
    name: string;
    color?: string;
    existing: Tag[];
  },
): Promise<Tag> {
  const name = args.name.trim();
  if (!name) throw new Error('Tag name is required');
  const siblings = liveTagsForGroup(args.existing, args.group.id);
  const dup = siblings.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (dup) throw new Error('A tag with that name already exists');
  const taken = new Set(siblings.map((t) => t.slug));
  // Keep reserved stage slugs unique even if someone adds tags to Stage.
  for (const s of PROTECTED_TAG_SLUGS) taken.add(s);
  taken.add(DO_NOT_TEXT_SLUG);
  const slug = uniqueSlug(name, taken);
  const maxSort = siblings.reduce((n, t) => Math.max(n, t.sort), -1);
  const row = blankTag(orgId, args.group.id, {
    name,
    slug,
    color: (args.color ?? '').trim(),
    sort: maxSort + 1,
  });
  await engine.save('tags', row);
  return row;
}

export async function deleteTag(
  engine: SyncEngine,
  tag: Tag,
  group: TagGroup,
): Promise<void> {
  if (isProtectedTag(tag, group)) {
    throw new Error('That tag is used by People / Today and can’t be deleted');
  }
  await engine.remove('tags', tag);
}

export async function moveTag(
  engine: SyncEngine,
  tag: Tag,
  direction: -1 | 1,
  siblings: Tag[],
): Promise<void> {
  const live = siblings.filter((t) => !t.deleted_at).sort((a, b) => a.sort - b.sort);
  const idx = live.findIndex((t) => t.id === tag.id);
  const swapWith = live[idx + direction];
  if (idx < 0 || !swapWith) return;
  const aSort = tag.sort;
  await engine.save('tags', { ...tag, sort: swapWith.sort });
  await engine.save('tags', { ...swapWith, sort: aSort });
}
