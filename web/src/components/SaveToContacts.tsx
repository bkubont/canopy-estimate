import { platform } from '../lib/install';
import type { Client, Customer } from '../lib/types';
import { toVCard } from '../lib/vcard';
import { Icon } from './Icon';

/** Hand a contacts file to the phone or computer: the iPhone shows its own "Create New Contact" card. */
export function openContactsFile(text: string, fileName: string) {
  const safe = fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Contact';
  if (platform() === 'iphone') {
    // Opening the card (rather than downloading it) shows the iPhone's own contact preview.
    const url = URL.createObjectURL(new Blob([text], { type: 'text/x-vcard' }));
    if (!window.open(url, '_blank')) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/vcard' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const nameOf = (c: Partial<Client>) => [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Contact';

export const customerAsClient = (c: Customer): Client => ({
  firstName: c.first_name, lastName: c.last_name, company: c.company, phone: c.phone, email: c.email,
  street: c.street, town: c.town, state: c.state, zip: c.zip,
});

/** Everyone in Customers as one contacts file (a backup, or to load them all into a Mac). */
export function exportAllContacts(customers: Customer[]) {
  const live = customers.filter((c) => !c.deleted_at);
  openContactsFile(live.map((c) => toVCard(customerAsClient(c), 'Advanced Tree Service customer')).join(''), 'ATS customers');
  return live.length;
}

/** "Save to Contacts" for one customer. */
export function SaveToContacts({ client, small }: { client: Partial<Client>; small?: boolean }) {
  const hasName = !!(client.firstName || client.lastName || client.company);
  if (!hasName && !client.phone && !client.email) return null;
  return (
    <button type="button" className={`btn ${small ? 'sm' : ''}`} onClick={() => openContactsFile(toVCard(client, 'Advanced Tree Service customer'), nameOf(client))}>
      <Icon name="contact" />Save to Contacts
    </button>
  );
}
