import { useMemo, useRef, useState } from 'react';
import { Sheet } from '../../components/ui';
import { blankClient, clientName } from '../../lib/estimate';
import { useReady, useRows } from '../../lib/session';
import type { Client, Customer } from '../../lib/types';
import { parseVCards } from '../../lib/vcard';

export const customerToClient = (c: Customer): Client => ({
  firstName: c.first_name, lastName: c.last_name, company: c.company, phone: c.phone, email: c.email,
  street: c.street, town: c.town, state: c.state || 'MI', zip: c.zip,
});

export const clientToCustomer = (c: Client, id: string, orgId: string): Customer => ({
  id, org_id: orgId, first_name: c.firstName, last_name: c.lastName, company: c.company, phone: c.phone, email: c.email,
  street: c.street, town: c.town, state: c.state, zip: c.zip, notes: '', deleted_at: null,
});

interface Choice {
  key: string;
  client: Client;
  customerId: string | null;
  from: 'contacts' | 'past estimate';
}

const digits = (s: string) => s.replace(/\D/g, '').slice(-10);

/** One place to find a client: the shared contact list, past estimates, or the phone's contacts. */
export function ClientPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: Client, customerId: string | null) => void }) {
  const { engine } = useReady();
  const customers = useRows(engine, 'customers');
  const jobs = useRows(engine, 'jobs');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const choices = useMemo<Choice[]>(() => {
    const seen = new Set<string>();
    const out: Choice[] = [];
    for (const c of customers ?? []) {
      const client = customerToClient(c);
      seen.add(digits(c.phone) || clientName(client).toLowerCase());
      out.push({ key: c.id, client, customerId: c.id, from: 'contacts' });
    }
    for (const j of [...(jobs ?? [])].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))) {
      const client = { ...blankClient(), ...j.client };
      const k = digits(client.phone) || clientName(client).toLowerCase();
      if (!clientName(client) || seen.has(k)) continue;
      seen.add(k);
      out.push({ key: j.id, client, customerId: j.customer_id, from: 'past estimate' });
    }
    const needle = q.trim().toLowerCase();
    return out
      .filter((c) => !needle || [clientName(c.client), c.client.company, c.client.phone, c.client.street, c.client.town].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => clientName(a.client).localeCompare(clientName(b.client)));
  }, [customers, jobs, q]);

  const canPickNative = typeof navigator !== 'undefined' && 'contacts' in navigator && 'select' in (navigator as Navigator & { contacts: object }).contacts;

  async function fromPhone() {
    if (!canPickNative) return file.current?.click();
    try {
      type Picked = { name?: string[]; tel?: string[]; email?: string[]; address?: { addressLine?: string[]; city?: string; region?: string; postalCode?: string }[] };
      const api = (navigator as unknown as { contacts: { select: (p: string[], o: object) => Promise<Picked[]> } }).contacts;
      const [c] = await api.select(['name', 'tel', 'email', 'address'], { multiple: false });
      if (!c) return;
      const [first = '', ...rest] = (c.name?.[0] ?? '').split(/\s+/);
      const a = c.address?.[0];
      onPick({ ...blankClient(), firstName: first, lastName: rest.join(' '), phone: c.tel?.[0] ?? '', email: c.email?.[0] ?? '',
        street: a?.addressLine?.join(' ') ?? '', town: a?.city ?? '', state: (a?.region ?? 'MI').slice(0, 2).toUpperCase(), zip: a?.postalCode ?? '' }, null);
    } catch {
      /* cancelled */
    }
  }

  async function fromFile(f: File) {
    const cards = parseVCards(await f.text());
    if (!cards.length) return setMsg('No contacts found in that file.');
    onPick({ ...blankClient(), ...cards[0] }, null);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Choose client">
      <input type="search" placeholder="Search name, phone, address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" autoFocus />
      <div className="btn-row mt">
        <button type="button" className="btn sm" onClick={fromPhone}>📇 From this phone’s contacts</button>
      </div>
      {!canPickNative && (
        <p className="hint">On iPhone: in Contacts, open the person → Share Contact → Save to Files, then tap the button above and pick the file.</p>
      )}
      <input ref={file} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromFile(f); }} />
      {msg && <p className="error-text">{msg}</p>}
      <div className="pick-list">
        {choices.length ? choices.map((c) => (
          <button key={c.key} type="button" className="list-item" onClick={() => onPick(c.client, c.customerId)}>
            <b>{clientName(c.client)}</b>
            <span className="muted small">{[c.client.phone, c.client.town].filter(Boolean).join(' · ') || 'No phone or town'} · {c.from}</span>
          </button>
        )) : <p className="empty">{q ? 'No matches.' : 'No saved clients yet. Type them in, and they’ll be saved to Contacts.'}</p>}
      </div>
    </Sheet>
  );
}
