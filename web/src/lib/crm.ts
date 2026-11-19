/**
 * CRM helpers used once the People UI ships (Phase B). Phase A registers the
 * tables and keeps flat customers.* as the primary mirror for legacy screens.
 *
 * Write rule (from the migration plan): CRM edits update phones/emails/properties
 * and refresh the flat primary fields from the first / primary rows.
 */

import type {
  Customer, CustomerActivity, CustomerEmail, CustomerPhone, CustomerProperty, CustomerTag,
} from './types';

export function blankPhone(orgId: string, customerId: string, patch: Partial<CustomerPhone> = {}): CustomerPhone {
  return {
    id: crypto.randomUUID(), org_id: orgId, customer_id: customerId,
    label: 'mobile', value: '', sort: 0, deleted_at: null, ...patch,
  };
}

export function blankEmail(orgId: string, customerId: string, patch: Partial<CustomerEmail> = {}): CustomerEmail {
  return {
    id: crypto.randomUUID(), org_id: orgId, customer_id: customerId,
    label: 'work', value: '', sort: 0, deleted_at: null, ...patch,
  };
}

export function blankProperty(orgId: string, customerId: string, patch: Partial<CustomerProperty> = {}): CustomerProperty {
  return {
    id: crypto.randomUUID(), org_id: orgId, customer_id: customerId,
    street: '', town: '', state: 'MI', zip: '',
    gate_code: '', access: '', hazards: [], tree_notes: '', sort: 0, deleted_at: null, ...patch,
  };
}

export function blankActivity(orgId: string, customerId: string, patch: Partial<CustomerActivity> = {}): CustomerActivity {
  return {
    id: crypto.randomUUID(), org_id: orgId, customer_id: customerId,
    type: 'note', body: '', at: new Date().toISOString(), created_by: null, deleted_at: null, ...patch,
  };
}

export function blankCustomerTag(orgId: string, customerId: string, tagId: string, patch: Partial<CustomerTag> = {}): CustomerTag {
  return { org_id: orgId, customer_id: customerId, tag_id: tagId, deleted_at: null, ...patch };
}

/** True when flat address parts warrant a primary property row (migration backfill rule). */
export function hasFlatAddress(c: Pick<Customer, 'street' | 'town' | 'zip'>): boolean {
  return !!(c.street.trim() || c.town.trim() || c.zip.trim());
}

/** Refresh denormalized primary contact/address fields from the first live rows. */
export function mirrorPrimaryFields(
  customer: Customer,
  phones: CustomerPhone[],
  emails: CustomerEmail[],
  properties: CustomerProperty[],
): Customer {
  const phone = phones.filter((p) => !p.deleted_at).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))[0];
  const email = emails.filter((e) => !e.deleted_at).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))[0];
  const prop = properties.filter((p) => !p.deleted_at).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))[0];
  return {
    ...customer,
    phone: phone?.value ?? '',
    email: email?.value ?? '',
    street: prop?.street ?? '',
    town: prop?.town ?? '',
    state: prop?.state ?? (customer.state || 'MI'),
    zip: prop?.zip ?? '',
  };
}

/**
 * Rows to create when backfilling one flat customer (same rules as the SQL migration).
 * Used by unit tests; the server migration is the source of truth for existing data.
 */
export function backfillRowsFromFlat(customer: Customer): {
  phones: CustomerPhone[];
  emails: CustomerEmail[];
  properties: CustomerProperty[];
} {
  const phones = customer.phone.trim()
    ? [blankPhone(customer.org_id, customer.id, { value: customer.phone, label: 'mobile', sort: 0 })]
    : [];
  const emails = customer.email.trim()
    ? [blankEmail(customer.org_id, customer.id, { value: customer.email, label: 'work', sort: 0 })]
    : [];
  const properties = hasFlatAddress(customer)
    ? [blankProperty(customer.org_id, customer.id, {
      street: customer.street, town: customer.town, state: customer.state || 'MI', zip: customer.zip, sort: 0,
    })]
    : [];
  return { phones, emails, properties };
}
