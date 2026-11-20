import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { STAGE_GROUP_SLUG, STAGE_SLUGS } from './crmStage';
import {
  createTag,
  createTagGroup,
  deleteTag,
  deleteTagGroup,
  DO_NOT_TEXT_SLUG,
  groupModeLabel,
  isProtectedGroup,
  isProtectedTag,
  liveGroups,
  liveTagsForGroup,
  renameTag,
  slugify,
  uniqueSlug,
} from './crmTagEditor';
import { openLocalDb } from './localdb';
import { SyncEngine, type PullResult, type Remote } from './sync';
import type { Tag, TagGroup } from './types';

const ORG = 'org-tag-ed';
let dbCount = 0;
const remote: Remote = {
  pull: async (): Promise<PullResult> => ({ cursor: '1', tables: {} }),
  push: async () => {},
  insertMany: async () => {},
};
async function engine() {
  dbCount += 1;
  return new SyncEngine(await openLocalDb(`tag-ed-${dbCount}`), remote, ORG, { debounceMs: 60_000 });
}

const group = (patch: Partial<TagGroup> = {}): TagGroup => ({
  id: 'g1', org_id: 'o1', name: 'Flags', slug: 'flags', mode: 'many',
  pipeline: false, allow_new: true, sort: 0, deleted_at: null, ...patch,
});

const tag = (patch: Partial<Tag> = {}): Tag => ({
  id: 't1', org_id: 'o1', tag_group_id: 'g1', name: 'Dog', slug: 'dog',
  color: '', sort: 0, deleted_at: null, ...patch,
});

describe('slugify / uniqueSlug', () => {
  it('slugifies names', () => {
    expect(slugify('HOA / Property mgr')).toBe('hoa-property-mgr');
    expect(slugify('  ')).toBe('tag');
  });

  it('avoids taken slugs', () => {
    const taken = new Set(['dog', 'dog-2']);
    expect(uniqueSlug('Dog', taken)).toBe('dog-3');
    expect(uniqueSlug('Crane job', taken)).toBe('crane-job');
  });
});

describe('protection rules (People / Today / smart lists)', () => {
  it('protects Stage group and seeded stage tags', () => {
    const stage = group({ slug: STAGE_GROUP_SLUG, pipeline: true, mode: 'one', name: 'Stage' });
    expect(isProtectedGroup(stage)).toBe(true);
    expect(isProtectedTag(tag({ slug: STAGE_SLUGS.new }), stage)).toBe(true);
    expect(isProtectedTag(tag({ slug: STAGE_SLUGS.estSent }), stage)).toBe(true);
    expect(isProtectedTag(tag({ slug: 'custom-stage' }), stage)).toBe(false);
  });

  it('protects Do not text by slug', () => {
    const flags = group({ slug: 'flags' });
    expect(isProtectedTag(tag({ slug: DO_NOT_TEXT_SLUG }), flags)).toBe(true);
    expect(isProtectedTag(tag({ slug: 'dog' }), flags)).toBe(false);
  });

  it('does not protect ordinary custom groups', () => {
    expect(isProtectedGroup(group())).toBe(false);
  });
});

describe('live helpers', () => {
  it('filters deleted and sorts', () => {
    const groups = [
      group({ id: 'b', name: 'B', slug: 'b', sort: 2 }),
      group({ id: 'a', name: 'A', slug: 'a', sort: 1, deleted_at: 'x' }),
      group({ id: 'c', name: 'C', slug: 'c', sort: 0 }),
    ];
    expect(liveGroups(groups).map((g) => g.slug)).toEqual(['c', 'b']);

    const tags = [
      tag({ id: '2', name: 'Two', slug: 'two', sort: 1 }),
      tag({ id: '1', name: 'One', slug: 'one', sort: 0, deleted_at: 'x' }),
      tag({ id: '3', name: 'Three', slug: 'three', sort: 2, tag_group_id: 'other' }),
    ];
    expect(liveTagsForGroup(tags, 'g1').map((t) => t.slug)).toEqual(['two']);
  });

  it('labels modes', () => {
    expect(groupModeLabel(group({ pipeline: true, mode: 'one' }))).toBe('Pipeline · pick one');
    expect(groupModeLabel(group({ mode: 'one' }))).toBe('Pick one');
    expect(groupModeLabel(group({ mode: 'many' }))).toBe('Pick many');
  });
});

describe('tag editor writes', () => {
  let e: SyncEngine;
  const stage = group({
    id: 'g-stage', name: 'Stage', slug: STAGE_GROUP_SLUG, mode: 'one', pipeline: true, allow_new: false,
  });
  const neu = tag({
    id: 't-new', tag_group_id: 'g-stage', name: 'New lead', slug: STAGE_SLUGS.new, color: '#2a72d4',
  });

  beforeEach(async () => {
    e = await engine();
    await e.save('tag_groups', stage);
    await e.save('tags', neu);
  });

  it('creates a custom group with a stable unique slug', async () => {
    const g = await createTagGroup(e, ORG, {
      name: 'Referral partners', mode: 'many', existing: [stage],
    });
    expect(g.slug).toBe('referral-partners');
    expect(g.pipeline).toBe(false);
    const t = await createTag(e, ORG, {
      group: g, name: 'Realtor buddy', existing: [neu],
    });
    expect(t.slug).toBe('realtor-buddy');
    expect(t.tag_group_id).toBe(g.id);
  });

  it('renames without changing slug (smart-list safe)', async () => {
    const next = await renameTag(e, neu, 'Fresh lead');
    expect(next.name).toBe('Fresh lead');
    expect(next.slug).toBe(STAGE_SLUGS.new);
  });

  it('refuses deleting Stage group or seeded stage tags', async () => {
    await expect(deleteTagGroup(e, stage, [neu])).rejects.toThrow(/Stage/);
    await expect(deleteTag(e, neu, stage)).rejects.toThrow(/can’t be deleted/);
  });

  it('refuses deleting Do not text', async () => {
    const flags = group({ id: 'g-flags', slug: 'flags', name: 'Job flags' });
    const dnt = tag({
      id: 't-dnt', tag_group_id: 'g-flags', name: 'Do not text', slug: DO_NOT_TEXT_SLUG,
    });
    await e.save('tag_groups', flags);
    await e.save('tags', dnt);
    await expect(deleteTag(e, dnt, flags)).rejects.toThrow(/can’t be deleted/);
  });
});
