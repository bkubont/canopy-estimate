import { describe, expect, it } from 'vitest';
import {
  customersMatchingSmartList, filterEquals, filterIsMeaningful, matchesSmartList,
  normalizeSmartList,
} from './crmSmartLists';
import { STAGE_SLUGS } from './crmStage';
import type {
  Customer, CustomerActivity, CustomerTag, SmartList, Tag, TagGroup,
} from './types';

const org = 'org-1';
const cust = (id: string, patch: Partial<Customer> = {}): Customer => ({
  id, org_id: org, first_name: '', last_name: '', company: '', phone: '', email: '',
  street: '', town: '', state: 'MI', zip: '', notes: '', deleted_at: null, ...patch,
});

const stageGroup: TagGroup = {
  id: 'g-stage', org_id: org, name: 'Stage', slug: 'stage', mode: 'one',
  pipeline: true, allow_new: false, sort: 0, deleted_at: null,
};
const flagsGroup: TagGroup = {
  id: 'g-flags', org_id: org, name: 'Job flags', slug: 'flags', mode: 'many',
  pipeline: false, allow_new: true, sort: 4, deleted_at: null,
};
const tag = (id: string, groupId: string, slug: string, sort = 0): Tag => ({
  id, org_id: org, tag_group_id: groupId, name: slug, slug, color: '', sort, deleted_at: null,
});
const tags = [
  tag('t-new', stageGroup.id, STAGE_SLUGS.new, 0),
  tag('t-sent', stageGroup.id, STAGE_SLUGS.estSent, 2),
  tag('t-annual', flagsGroup.id, 'annual-customer', 5),
];
const groups = [stageGroup, flagsGroup];
const mem = (customerId: string, tagId: string): CustomerTag => ({
  org_id: org, customer_id: customerId, tag_id: tagId, deleted_at: null,
});
const act = (customerId: string, daysAgo: number): CustomerActivity => ({
  id: `a-${customerId}`, org_id: org, customer_id: customerId, type: 'stage',
  body: 'Stage → Estimate sent', at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  created_by: null, deleted_at: null,
});

const baseList = (patch: Partial<SmartList> = {}): SmartList => ({
  id: 'list-1', org_id: org, name: 'Test', query: '', stage_slugs: [], tag_refs: [],
  cold_only: false, pin_today: false, sort: 0, created_by: null, deleted_at: null, ...patch,
});

describe('normalizeSmartList', () => {
  it('coerces jsonb-ish fields', () => {
    const n = normalizeSmartList(baseList({
      stage_slugs: [' new ', ''] as unknown as string[],
      tag_refs: [{ group: 'flags', tag: 'annual-customer' }, { group: '', tag: 'x' }] as never,
    }));
    expect(n.stage_slugs).toEqual(['new']);
    expect(n.tag_refs).toEqual([{ group: 'flags', tag: 'annual-customer' }]);
  });
});

describe('matchesSmartList', () => {
  const people = [
    cust('c-new', { first_name: 'New', last_name: 'Lead' }),
    cust('c-cold', { first_name: 'Cold', last_name: 'Lead' }),
    cust('c-annual', { first_name: 'Ann', last_name: 'UAL' }),
  ];
  const memberships = [
    mem('c-new', 't-new'),
    mem('c-cold', 't-sent'),
    mem('c-annual', 't-new'),
    mem('c-annual', 't-annual'),
  ];
  const activities = [act('c-cold', 10), act('c-new', 1)];

  it('filters by stage slug', () => {
    const hit = customersMatchingSmartList({
      list: baseList({ stage_slugs: [STAGE_SLUGS.new] }),
      customers: people, phones: [], emails: [], properties: [],
      memberships, activities, groups, tags,
    });
    expect(hit.map((c) => c.id).sort()).toEqual(['c-annual', 'c-new']);
  });

  it('filters by tag refs (AND) and query', () => {
    expect(matchesSmartList({
      list: baseList({ tag_refs: [{ group: 'flags', tag: 'annual-customer' }], query: 'ann' }),
      customer: people[2]!, phones: [], emails: [], properties: [],
      memberships, activities, groups, tags,
    })).toBe(true);
    expect(matchesSmartList({
      list: baseList({ tag_refs: [{ group: 'flags', tag: 'annual-customer' }] }),
      customer: people[0]!, phones: [], emails: [], properties: [],
      memberships, activities, groups, tags,
    })).toBe(false);
  });

  it('applies going-cold rule', () => {
    const hit = customersMatchingSmartList({
      list: baseList({ cold_only: true }),
      customers: people, phones: [], emails: [], properties: [],
      memberships, activities, groups, tags,
    });
    expect(hit.map((c) => c.id)).toEqual(['c-cold']);
  });
});

describe('filter helpers', () => {
  it('detects meaningful / equal filters', () => {
    expect(filterIsMeaningful(baseList())).toBe(false);
    expect(filterIsMeaningful(baseList({ query: 'bay' }))).toBe(true);
    expect(filterEquals(
      baseList({ stage_slugs: ['new', 'past'] }),
      baseList({ stage_slugs: ['past', 'new'] }),
    )).toBe(true);
    expect(filterEquals(baseList({ query: 'a' }), baseList({ query: 'b' }))).toBe(false);
  });
});
