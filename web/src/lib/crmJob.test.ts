import { describe, expect, it } from 'vitest';
import {
  applyPickToJob, clientFromProperty, customerBaseClient, mergeInternalNotes,
  pickSnapshot, propertyInternalNotes, siteFromProperty,
} from './crmJob';
import { blankJob, blankSite } from './estimate';
import type { Customer, CustomerProperty, Organization } from './types';

const org = { id: 'org-1' } as Organization;
const cust = (patch: Partial<Customer> = {}): Customer => ({
  id: 'c1', org_id: 'org-1', first_name: 'Dana', last_name: 'Smith', company: '',
  phone: '231-555-0100', email: 'dana@x.com', street: '1 Main', town: 'Leland', state: 'MI', zip: '49654',
  notes: '', deleted_at: null, ...patch,
});
const prop = (patch: Partial<CustomerProperty> = {}): CustomerProperty => ({
  id: 'p1', org_id: 'org-1', customer_id: 'c1', street: '12 Shore', town: 'Suttons Bay', state: 'MI', zip: '49682',
  gate_code: '4411', access: 'Drive around back', hazards: ['dogs', 'overhead wires'], tree_notes: 'Big oak',
  sort: 0, deleted_at: null, ...patch,
});

describe('property → job snapshot (Phase C)', () => {
  it('maps structured address onto client and keeps preferred phone', () => {
    const base = customerBaseClient(cust(), '231-555-0199');
    const client = clientFromProperty(base, prop());
    expect(client.phone).toBe('231-555-0199');
    expect(client).toMatchObject({ street: '12 Shore', town: 'Suttons Bay', zip: '49682', state: 'MI' });
  });

  it('puts gate/access/tree notes in internal notes, hazards in site.other', () => {
    expect(propertyInternalNotes(prop())).toContain('Gate: 4411');
    expect(propertyInternalNotes(prop())).toContain('Access: Drive around back');
    expect(propertyInternalNotes(prop())).toContain('Trees: Big oak');
    expect(siteFromProperty(prop()).other).toBe('dogs, overhead wires');
    expect(mergeInternalNotes('Already here', 'Gate: 4411')).toBe('Already here\nGate: 4411');
  });

  it('applyPickToJob sets customer_id, property_id, and does not wipe site conditions', () => {
    const job = blankJob({ org, number: 'E-1', preparedBy: '', contractorSig: '' });
    job.site = { ...blankSite(), conditions: ['Clear Access'], parking: 'Street' };
    const snap = pickSnapshot({ customer: cust(), property: prop(), phone: '231-555-0199' });
    const next = applyPickToJob(job, snap);
    expect(next.customer_id).toBe('c1');
    expect(next.property_id).toBe('p1');
    expect(next.client.phone).toBe('231-555-0199');
    expect(next.client.street).toBe('12 Shore');
    expect(next.site.conditions).toEqual(['Clear Access']);
    expect(next.site.parking).toBe('Street');
    expect(next.site.other).toBe('dogs, overhead wires');
    expect(next.internal_notes).toContain('Gate: 4411');
  });
});
