/**
 * Phase C: map a CRM customer + property (+ preferred phone) onto a job snapshot.
 *
 * Convention (picker → estimate):
 * - street / town / state / ZIP → job.client address fields
 * - preferred phone → job.client.phone
 * - gate_code, access, tree_notes → job.internal_notes (never printed)
 * - hazards → job.site.other (appended; freeform, not the fixed conditions chips)
 *
 * Job stage/status stay the work board source of truth; this only fills client/site/notes.
 */

import { blankClient, blankSite } from './estimate';
import type { Client, Customer, CustomerPhone, CustomerProperty, Job, Site } from './types';

export function customerBaseClient(c: Customer, phone?: string | null): Client {
  return {
    ...blankClient(),
    firstName: c.first_name,
    lastName: c.last_name,
    company: c.company,
    phone: (phone ?? c.phone) || '',
    email: c.email,
    street: c.street,
    town: c.town,
    state: c.state || 'MI',
    zip: c.zip,
  };
}

/** Format gate / access / tree notes for internal_notes. */
export function propertyInternalNotes(p: Pick<CustomerProperty, 'gate_code' | 'access' | 'tree_notes'>): string {
  const lines: string[] = [];
  if (p.gate_code.trim()) lines.push(`Gate: ${p.gate_code.trim()}`);
  if (p.access.trim()) lines.push(`Access: ${p.access.trim()}`);
  if (p.tree_notes.trim()) lines.push(`Trees: ${p.tree_notes.trim()}`);
  return lines.join('\n');
}

export function mergeInternalNotes(existing: string, fromProperty: string): string {
  const a = existing.trim();
  const b = fromProperty.trim();
  if (!b) return a;
  if (!a) return b;
  if (a.includes(b)) return a;
  return `${a}\n${b}`;
}

/** Only the fields property hazards should touch — never wipe conditions/parking. */
export function siteFromProperty(
  p: Pick<CustomerProperty, 'hazards'>,
  existingOther = '',
): Partial<Site> {
  const hazards = (p.hazards ?? []).map((h) => h.trim()).filter(Boolean);
  if (!hazards.length) return {};
  const extra = hazards.join(', ');
  const other = existingOther.trim();
  return {
    other: other ? (other.includes(extra) ? other : `${other}; ${extra}`) : extra,
  };
}

export function clientFromProperty(
  base: Client,
  p: Pick<CustomerProperty, 'street' | 'town' | 'state' | 'zip'>,
): Client {
  return {
    ...base,
    street: p.street || base.street,
    town: p.town || base.town,
    state: (p.state || base.state || 'MI').slice(0, 2).toUpperCase(),
    zip: p.zip || base.zip,
  };
}

export interface PickSnapshot {
  client: Client;
  customerId: string;
  propertyId: string | null;
  sitePatch: Partial<Site>;
  internalNotesAppend: string;
}

/** Build the estimate snapshot from a contact pick (customer + optional property/phone). */
export function pickSnapshot(args: {
  customer: Customer;
  property?: CustomerProperty | null;
  phone?: CustomerPhone | string | null;
}): PickSnapshot {
  const phoneValue = typeof args.phone === 'string'
    ? args.phone
    : args.phone?.value ?? args.customer.phone;
  const base = customerBaseClient(args.customer, phoneValue);
  const p = args.property && !args.property.deleted_at ? args.property : null;
  if (!p) {
    return {
      client: base,
      customerId: args.customer.id,
      propertyId: null,
      sitePatch: {},
      internalNotesAppend: '',
    };
  }
  return {
    client: clientFromProperty(base, p),
    customerId: args.customer.id,
    propertyId: p.id,
    sitePatch: siteFromProperty(p, ''),
    internalNotesAppend: propertyInternalNotes(p),
  };
}

/** Apply a pick snapshot onto a job (client, customer_id, property_id, site, notes). */
export function applyPickToJob(job: Job, snap: PickSnapshot): Job {
  return {
    ...job,
    customer_id: snap.customerId,
    property_id: snap.propertyId,
    client: snap.client,
    site: { ...blankSite(), ...job.site, ...snap.sitePatch },
    internal_notes: mergeInternalNotes(job.internal_notes ?? '', snap.internalNotesAppend),
  };
}
