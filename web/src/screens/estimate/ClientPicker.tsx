import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/ui';
import { CRM_ENABLED } from '../../lib/features';
import { blankClient, clientName } from '../../lib/estimate';
import { customerBaseClient, pickSnapshot, type PickSnapshot } from '../../lib/crmJob';
import { stageOf, propertyAddress, liveForCustomer } from '../../lib/crmUi';
import { useReady, useRows } from '../../lib/session';
import type { Client, Customer, CustomerPhone, CustomerProperty } from '../../lib/types';
import { parseVCards } from '../../lib/vcard';

export const customerToClient = (c: Customer): Client => customerBaseClient(c);

export const clientToCustomer = (c: Client, id: string, orgId: string): Customer => ({
  id, org_id: orgId, first_name: c.firstName, last_name: c.lastName, company: c.company, phone: c.phone, email: c.email,
  street: c.street, town: c.town, state: c.state, zip: c.zip, notes: '', deleted_at: null,
});

interface Choice {
  key: string;
  client: Client;
  customerId: string | null;
  customer?: Customer;
  from: 'contacts' | 'past estimate';
  stageColor?: string;
  addressHint?: string;
  phoneHint?: string;
}

export type ClientPickResult = PickSnapshot | { client: Client; customerId: string | null };

const digits = (s: string) => s.replace(/\D/g, '').slice(-10);

function isFullPick(r: ClientPickResult): r is PickSnapshot {
  return 'propertyId' in r;
}

/** One place to find a client: CRM contacts (with property/phone), past estimates, or the phone. */
export function ClientPicker({
  open, onClose, onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (result: ClientPickResult) => void;
}) {
  const { engine } = useReady();
  const customers = useRows(engine, 'customers');
  const jobs = useRows(engine, 'jobs');
  const phones = useRows(engine, 'customer_phones');
  const properties = useRows(engine, 'customer_properties');
  const memberships = useRows(engine, 'customer_tags');
  const groups = useRows(engine, 'tag_groups');
  const tags = useRows(engine, 'tags');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [detail, setDetail] = useState<Customer | null>(null);
  const [propId, setPropId] = useState<string | null>(null);
  const [phoneId, setPhoneId] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const choices = useMemo<Choice[]>(() => {
    const seen = new Set<string>();
    const out: Choice[] = [];
    for (const c of customers ?? []) {
      if (c.deleted_at) continue;
      const client = customerToClient(c);
      seen.add(digits(c.phone) || clientName(client).toLowerCase());
      const stage = CRM_ENABLED ? stageOf(c.id, memberships ?? [], groups ?? [], tags ?? []) : undefined;
      const props = liveForCustomer(properties, c.id).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
      const primary = props[0];
      const ph = liveForCustomer(phones, c.id).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))[0];
      out.push({
        key: c.id,
        client,
        customerId: c.id,
        customer: c,
        from: 'contacts',
        stageColor: stage?.color,
        addressHint: primary ? propertyAddress(primary) : [c.street, c.town].filter(Boolean).join(', '),
        phoneHint: ph?.value || c.phone,
      });
    }
    for (const j of [...(jobs ?? [])].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))) {
      const client = { ...blankClient(), ...j.client };
      const k = digits(client.phone) || clientName(client).toLowerCase();
      if (!clientName(client) || seen.has(k)) continue;
      seen.add(k);
      out.push({
        key: j.id,
        client,
        customerId: j.customer_id,
        from: 'past estimate',
        addressHint: [client.street, client.town].filter(Boolean).join(', '),
        phoneHint: client.phone,
      });
    }
    const needle = q.trim().toLowerCase();
    return out
      .filter((c) => !needle || [
        clientName(c.client), c.client.company, c.client.phone, c.client.street, c.client.town,
        c.addressHint, c.phoneHint,
      ].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => clientName(a.client).localeCompare(clientName(b.client)));
  }, [customers, jobs, q, memberships, groups, tags, properties, phones]);

  const detailPhones = detail ? liveForCustomer(phones, detail.id).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)) : [];
  const detailProps = detail ? liveForCustomer(properties, detail.id).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)) : [];

  const canPickNative = typeof navigator !== 'undefined' && 'contacts' in navigator && 'select' in (navigator as Navigator & { contacts: object }).contacts;

  function finish(snap: ClientPickResult) {
    onPick(snap);
    setDetail(null);
    setPropId(null);
    setPhoneId(null);
    setQ('');
    setMsg('');
  }

  function confirmDetail() {
    if (!detail) return;
    const property = detailProps.find((p) => p.id === propId) ?? detailProps[0] ?? null;
    const phone = detailPhones.find((p) => p.id === phoneId) ?? detailPhones[0] ?? null;
    finish(pickSnapshot({ customer: detail, property, phone }));
  }

  function pickChoice(c: Choice) {
    if (!CRM_ENABLED || !c.customer) {
      finish({ client: c.client, customerId: c.customerId });
      return;
    }
    const props = liveForCustomer(properties, c.customer.id);
    const phs = liveForCustomer(phones, c.customer.id);
    // Zero or one of each → pick immediately with primary rows.
    if (props.length <= 1 && phs.length <= 1) {
      finish(pickSnapshot({
        customer: c.customer,
        property: props[0] ?? null,
        phone: phs[0] ?? null,
      }));
      return;
    }
    setDetail(c.customer);
    setPropId(props[0]?.id ?? null);
    setPhoneId(phs[0]?.id ?? null);
  }

  async function fromPhone() {
    if (!canPickNative) return file.current?.click();
    try {
      type Picked = { name?: string[]; tel?: string[]; email?: string[]; address?: { addressLine?: string[]; city?: string; region?: string; postalCode?: string }[] };
      const api = (navigator as unknown as { contacts: { select: (p: string[], o: object) => Promise<Picked[]> } }).contacts;
      const [c] = await api.select(['name', 'tel', 'email', 'address'], { multiple: false });
      if (!c) return;
      const [first = '', ...rest] = (c.name?.[0] ?? '').split(/\s+/);
      const a = c.address?.[0];
      finish({
        client: {
          ...blankClient(),
          firstName: first,
          lastName: rest.join(' '),
          phone: c.tel?.[0] ?? '',
          email: c.email?.[0] ?? '',
          street: a?.addressLine?.join(' ') ?? '',
          town: a?.city ?? '',
          state: (a?.region ?? 'MI').slice(0, 2).toUpperCase(),
          zip: a?.postalCode ?? '',
        },
        customerId: null,
      });
    } catch {
      /* cancelled */
    }
  }

  async function fromFile(f: File) {
    const cards = parseVCards(await f.text());
    if (!cards.length) return setMsg('No contacts found in that file.');
    finish({ client: { ...blankClient(), ...cards[0] }, customerId: null });
  }

  function closeAll() {
    setDetail(null);
    setPropId(null);
    setPhoneId(null);
    onClose();
  }

  return (
    <>
      <Sheet open={open && !detail} onClose={closeAll} title="Choose client">
        <input type="search" placeholder="Search name, phone, address" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" autoFocus />
        <div className="btn-row mt">
          <button type="button" className="btn sm" onClick={fromPhone}><Icon name="contact" />From this phone’s contacts</button>
        </div>
        {!canPickNative && (
          <p className="hint">On iPhone: in Contacts, open the person → Share Contact → Save to Files, then tap the button above and pick the file.</p>
        )}
        <input ref={file} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromFile(f); }} />
        {msg && <p className="error-text">{msg}</p>}
        <div className="pick-list">
          {choices.length ? choices.map((c) => (
            <button key={c.key} type="button" className="list-item stripe pick-client" onClick={() => pickChoice(c)}
              style={c.stageColor ? { borderLeftColor: c.stageColor } : undefined}>
              <b>{clientName(c.client)}</b>
              <span className="muted small">
                {[c.phoneHint, c.addressHint].filter(Boolean).join(' · ') || 'No phone or address'}
                {' · '}{c.from}
              </span>
            </button>
          )) : <p className="empty">{q ? 'No matches.' : 'No saved clients yet. Type them in, and they’ll be saved to Contacts.'}</p>}
        </div>
      </Sheet>

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? clientName(customerToClient(detail)) : 'Site & phone'}
        action={<button type="button" className="btn primary sm" onClick={confirmDetail}>Use on estimate</button>}
      >
        {detail && (
          <DetailPick
            phones={detailPhones}
            properties={detailProps}
            propId={propId}
            phoneId={phoneId}
            onProp={setPropId}
            onPhone={setPhoneId}
          />
        )}
      </Sheet>
    </>
  );
}

function DetailPick({
  phones, properties, propId, phoneId, onProp, onPhone,
}: {
  phones: CustomerPhone[];
  properties: CustomerProperty[];
  propId: string | null;
  phoneId: string | null;
  onProp: (id: string | null) => void;
  onPhone: (id: string | null) => void;
}) {
  return (
    <div className="pick-detail">
      {properties.length > 0 && (
        <section>
          <h4 className="label">Property</h4>
          <div className="pick-list">
            {properties.map((p) => (
              <button
                key={p.id}
                type="button"
                className="list-item"
                aria-pressed={propId === p.id}
                onClick={() => onProp(p.id)}
              >
                <b>{propertyAddress(p) || 'No address'}</b>
                <span className="muted small">
                  {[p.gate_code && `Gate ${p.gate_code}`, p.access, (p.hazards ?? []).join(', ')].filter(Boolean).join(' · ') || 'No access notes'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {phones.length > 0 && (
        <section className="mt">
          <h4 className="label">Phone for this estimate</h4>
          <div className="pick-list">
            {phones.map((p) => (
              <button
                key={p.id}
                type="button"
                className="list-item"
                aria-pressed={phoneId === p.id}
                onClick={() => onPhone(p.id)}
              >
                <b>{p.value}</b>
                <span className="muted small">{p.label || 'phone'}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {!properties.length && !phones.length && (
        <p className="hint">No extra phones or properties on this contact — using the primary fields.</p>
      )}
    </div>
  );
}

export { isFullPick };
