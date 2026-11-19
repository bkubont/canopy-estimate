import { describe, expect, it } from 'vitest';
import {
  customersWithStageSlug, displayName, lastStageChangeAt, matchesPeopleSearch, propertyAddress,
  sortKey, stageOf, todayBuckets,
} from './crmUi';
import { STAGE_SLUGS } from './crmStage';
import type {
  Customer, CustomerActivity, CustomerPhone, CustomerProperty, CustomerTag, Tag, TagGroup,
} from './types';

const org = 'org-1';
const cust = (id: string, patch: Partial<Customer> = {}): Customer => ({
  id, org_id: org, first_name: '', last_name: '', company: '', phone: '', email: '',
  street: '', town: '', state: 'MI', zip: '', notes: '', deleted_at: null, ...patch,
});

const group: TagGroup = {
  id: 'g-stage', org_id: org, name: 'Stage', slug: 'stage', mode: 'one',
  pipeline: true, allow_new: false, sort: 0, deleted_at: null,
};
const tag = (id: string, slug: string, sort: number, color = '#000'): Tag => ({
  id, org_id: org, tag_group_id: group.id, name: slug, slug, color, sort, deleted_at: null,
});
const tags = [
  tag('t-new', STAGE_SLUGS.new, 0, '#2a72d4'),
  tag('t-set', STAGE_SLUGS.estSet, 1, '#c48a00'),
  tag('t-sent', STAGE_SLUGS.estSent, 2, '#c48a00'),
];
const mem = (customerId: string, tagId: string): CustomerTag => ({
  org_id: org, customer_id: customerId, tag_id: tagId, deleted_at: null,
});

describe('crmUi display helpers', () => {
  it('prefers person name, then company, then phone', () => {
    expect(displayName(cust('1', { first_name: 'Dana', last_name: 'Smith' }))).toBe('Dana Smith');
    expect(displayName(cust('1', { company: 'Bay HOA' }))).toBe('Bay HOA');
    expect(displayName(cust('1', { phone: '231-555-0101' }))).toBe('231-555-0101');
    expect(sortKey(cust('1', { first_name: 'Dana', last_name: 'Smith' }))).toBe('smith');
  });

  it('formats structured property addresses', () => {
    expect(propertyAddress({ street: '12 Shore', town: 'Leland', state: 'MI', zip: '49654' }))
      .toBe('12 Shore, Leland, MI 49654');
  });
});

describe('stage + Today buckets', () => {
  const people = [
    cust('c-new', { first_name: 'New' }),
    cust('c-set', { first_name: 'Set' }),
    cust('c-sent', { first_name: 'Sent' }),
    cust('c-cold', { first_name: 'Cold' }),
  ];
  const memberships = [
    mem('c-new', 't-new'),
    mem('c-set', 't-set'),
    mem('c-sent', 't-sent'),
    mem('c-cold', 't-sent'),
  ];
  const activities: CustomerActivity[] = [
    {
      id: 'a1', org_id: org, customer_id: 'c-sent', type: 'stage', body: 'Stage → Estimate sent',
      at: new Date().toISOString(), created_by: null, deleted_at: null,
    },
    {
      id: 'a2', org_id: org, customer_id: 'c-cold', type: 'stage', body: 'Stage → Estimate sent',
      at: new Date(Date.now() - 10 * 86_400_000).toISOString(), created_by: null, deleted_at: null,
    },
  ];

  it('resolves pipeline stage from customer_tags by slug group', () => {
    expect(stageOf('c-new', memberships, [group], tags)?.slug).toBe(STAGE_SLUGS.new);
    expect(customersWithStageSlug(people, memberships, [group], tags, STAGE_SLUGS.estSent).map((c) => c.id))
      .toEqual(['c-sent', 'c-cold']);
  });

  it('builds Today buckets with 7-day cold filter on estimate-sent', () => {
    const b = todayBuckets(people, memberships, [group], tags, activities);
    expect(b.newLeads.map((c) => c.id)).toEqual(['c-new']);
    expect(b.estSet.map((c) => c.id)).toEqual(['c-set']);
    expect(b.waiting.map((c) => c.id)).toEqual(['c-sent', 'c-cold']);
    expect(b.cold.map((c) => c.id)).toEqual(['c-cold']);
    expect(lastStageChangeAt('c-cold', activities)).toBeGreaterThan(0);
  });
});

describe('people search', () => {
  it('matches tokens and phone digits', () => {
    const customer = cust('1', { first_name: 'Dana', last_name: 'Smith', notes: 'gate' });
    const phones: CustomerPhone[] = [{
      id: 'p1', org_id: org, customer_id: '1', label: 'mobile', value: '(231) 555-0101', sort: 0, deleted_at: null,
    }];
    const properties: CustomerProperty[] = [{
      id: 'pr1', org_id: org, customer_id: '1', street: '12 Shore', town: 'Leland', state: 'MI', zip: '49654',
      gate_code: '', access: '', hazards: [], tree_notes: '', sort: 0, deleted_at: null,
    }];
    expect(matchesPeopleSearch({ customer, phones, emails: [], properties, tagNames: ['New lead'], query: 'shore dana' })).toBe(true);
    expect(matchesPeopleSearch({ customer, phones, emails: [], properties, tagNames: [], query: '555-010' })).toBe(true);
    expect(matchesPeopleSearch({ customer, phones, emails: [], properties, tagNames: [], query: 'zzz' })).toBe(false);
  });
});
