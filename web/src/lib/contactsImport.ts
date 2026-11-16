import type { Client, Customer } from './types';

/** Last 10 digits, so "(231) 555-0101", "231-555-0101" and "+1 231 555 0101" match. */
export const phoneKey = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);
const emailKey = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();
const nameKey = (first?: string, last?: string, company?: string) => `${first ?? ''} ${last ?? ''}`.trim().toLowerCase() || (company ?? '').trim().toLowerCase();

export interface ImportRow { key: number; client: Partial<Client>; already: string | null }

/**
 * Contacts from a file, each marked if it's already in Customers (same phone,
 * same email, or the same name with no phone or email to tell them apart) or
 * appears twice in the file.
 */
export function planImport(cards: Partial<Client>[], existing: Customer[]): ImportRow[] {
  const phones = new Map<string, string>();
  const emails = new Map<string, string>();
  const names = new Map<string, string>();
  const label = (c: Pick<Customer, 'first_name' | 'last_name' | 'company'>) => [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || 'a customer';
  for (const c of existing) {
    if (c.deleted_at) continue;
    if (phoneKey(c.phone).length >= 7) phones.set(phoneKey(c.phone), label(c));
    if (emailKey(c.email)) emails.set(emailKey(c.email), label(c));
    names.set(nameKey(c.first_name, c.last_name, c.company), label(c));
  }
  return cards.map((client, key) => {
    const p = phoneKey(client.phone);
    const e = emailKey(client.email);
    const n = nameKey(client.firstName, client.lastName, client.company);
    const already = (p.length >= 7 && phones.get(p)) || (e && emails.get(e)) || (!p && !e && names.get(n)) || null;
    const me = [client.firstName, client.lastName].filter(Boolean).join(' ') || client.company || 'this contact';
    if (p.length >= 7 && !phones.has(p)) phones.set(p, `${me} (earlier in this file)`);
    if (e && !emails.has(e)) emails.set(e, `${me} (earlier in this file)`);
    if (!p && !e && !names.has(n)) names.set(n, `${me} (earlier in this file)`);
    return { key, client, already };
  });
}

export function toCustomer(c: Partial<Client>, orgId: string): Customer {
  return {
    id: crypto.randomUUID(), org_id: orgId, first_name: c.firstName ?? '', last_name: c.lastName ?? '', company: c.company ?? '',
    phone: c.phone ?? '', email: c.email ?? '', street: c.street ?? '', town: c.town ?? '', state: c.state || 'MI', zip: c.zip ?? '', notes: '', deleted_at: null,
  };
}
