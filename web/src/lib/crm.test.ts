import { describe, expect, it } from 'vitest';
import { backfillRowsFromFlat, hasFlatAddress, mirrorPrimaryFields } from './crm';
import { crmStageSlugFromJob, STAGE_SLUGS } from './crmStage';
import { CRM_ENABLED } from './features';
import { TABLES, rowKey, type Customer } from './types';

const cust = (patch: Partial<Customer> = {}): Customer => ({
  id: 'c1', org_id: 'org-1', first_name: 'Dana', last_name: 'Smith', company: '',
  phone: '', email: '', street: '', town: '', state: 'MI', zip: '', notes: '', deleted_at: null, ...patch,
});

describe('CRM_ENABLED', () => {
  it('is on so Phase B People / Today UI ships for office', () => {
    expect(CRM_ENABLED).toBe(true);
  });
});

describe('TABLES CRM registration', () => {
  it('registers CRM tables after customers and before jobs', () => {
    const names = TABLES.map((t) => t.name);
    expect(names.indexOf('customers')).toBeLessThan(names.indexOf('tag_groups'));
    expect(names.indexOf('tag_groups')).toBeLessThan(names.indexOf('tags'));
    expect(names.indexOf('tags')).toBeLessThan(names.indexOf('customer_phones'));
    expect(names.indexOf('customer_tags')).toBeLessThan(names.indexOf('jobs'));
    expect(names).toContain('customer_emails');
    expect(names).toContain('customer_properties');
    expect(names).toContain('customer_activities');
  });

  it('keys customer_tags by customer_id + tag_id', () => {
    expect(rowKey('customer_tags', { customer_id: 'c1', tag_id: 't1' })).toBe('c1|t1');
  });
});

describe('backfill from flat customer', () => {
  it('creates phone, email, and structured property when flat fields are set', () => {
    const { phones, emails, properties } = backfillRowsFromFlat(cust({
      phone: '231-555-0101', email: 'dana@example.com',
      street: '12 Shore Ln', town: 'Suttons Bay', state: 'MI', zip: '49682',
    }));
    expect(phones).toHaveLength(1);
    expect(phones[0]!.label).toBe('mobile');
    expect(phones[0]!.value).toBe('231-555-0101');
    expect(emails[0]!.value).toBe('dana@example.com');
    expect(properties).toHaveLength(1);
    expect(properties[0]).toMatchObject({
      street: '12 Shore Ln', town: 'Suttons Bay', state: 'MI', zip: '49682',
      gate_code: '', hazards: [],
    });
  });

  it('skips empty contact fields and address-less customers', () => {
    expect(backfillRowsFromFlat(cust()).phones).toEqual([]);
    expect(backfillRowsFromFlat(cust()).emails).toEqual([]);
    expect(backfillRowsFromFlat(cust()).properties).toEqual([]);
    expect(hasFlatAddress(cust({ street: '  ' }))).toBe(false);
    expect(hasFlatAddress(cust({ zip: '49686' }))).toBe(true);
  });

  it('mirrors primary rows back onto flat customer fields', () => {
    const c = cust({ phone: 'old', email: 'old@x.com', street: 'old' });
    const { phones, emails, properties } = backfillRowsFromFlat(cust({
      phone: '231-555-0199', email: 'new@x.com', street: '1 Main', town: 'Leland', zip: '49654',
    }));
    const mirrored = mirrorPrimaryFields(c, phones, emails, properties);
    expect(mirrored.phone).toBe('231-555-0199');
    expect(mirrored.email).toBe('new@x.com');
    expect(mirrored.street).toBe('1 Main');
    expect(mirrored.town).toBe('Leland');
    expect(mirrored.zip).toBe('49654');
  });
});

describe('crmStageFromJob (D2 mapping)', () => {
  it('maps scheduled / in_progress → Booked and paid → Past', () => {
    expect(crmStageSlugFromJob({ stage: 'work_order', status: 'scheduled', signed_at: 'x', deleted_at: null }))
      .toBe(STAGE_SLUGS.booked);
    expect(crmStageSlugFromJob({ stage: 'work_order', status: 'in_progress', signed_at: 'x', deleted_at: null }))
      .toBe(STAGE_SLUGS.booked);
    expect(crmStageSlugFromJob({ stage: 'paid', status: 'done', signed_at: 'x', deleted_at: null }))
      .toBe(STAGE_SLUGS.past);
  });

  it('does not move stage for pending estimates', () => {
    expect(crmStageSlugFromJob({ stage: 'estimate', status: 'pending', signed_at: null, deleted_at: null })).toBeNull();
  });
});
