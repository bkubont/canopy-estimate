import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { blankEmail, blankPhone, blankProperty, saveCustomerBundle, softDeleteCustomer } from '../../lib/crmActions';
import { stageTagGroup } from '../../lib/crmStage';
import { displayName, liveForCustomer } from '../../lib/crmUi';
import { useReady, useRow, useRows } from '../../lib/session';
import type { Customer, CustomerEmail, CustomerPhone, CustomerProperty } from '../../lib/types';

const PHONE_LABELS = ['mobile', 'home', 'work', 'other'];
const EMAIL_LABELS = ['home', 'work', 'other'];

function blankCustomer(orgId: string): Customer {
  return {
    id: crypto.randomUUID(), org_id: orgId, first_name: '', last_name: '', company: '',
    phone: '', email: '', street: '', town: '', state: 'MI', zip: '', notes: '', deleted_at: null,
  };
}

export function EditCustomer() {
  const { id } = useParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const { engine, org, user } = useReady();
  const existing = useRow(engine, 'customers', isNew ? undefined : id);
  const phonesAll = useRows(engine, 'customer_phones');
  const emailsAll = useRows(engine, 'customer_emails');
  const propertiesAll = useRows(engine, 'customer_properties');
  const memberships = useRows(engine, 'customer_tags');
  const activities = useRows(engine, 'customer_activities');
  const groups = useRows(engine, 'tag_groups');
  const tags = useRows(engine, 'tags');

  const [customer, setCustomer] = useState<Customer | null>(isNew ? blankCustomer(org.org_id) : null);
  const [phones, setPhones] = useState<CustomerPhone[]>(
    isNew ? [blankPhone(org.org_id, '', { label: 'mobile' })] : [],
  );
  const [emails, setEmails] = useState<CustomerEmail[]>([]);
  const [properties, setProperties] = useState<CustomerProperty[]>(
    isNew ? [blankProperty(org.org_id, '')] : [],
  );
  const [hazardText, setHazardText] = useState<string[]>(isNew ? [''] : []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const prevPhones = useMemo(
    () => (!isNew && id ? liveForCustomer(phonesAll, id) : []),
    [phonesAll, id, isNew],
  );
  const prevEmails = useMemo(
    () => (!isNew && id ? liveForCustomer(emailsAll, id) : []),
    [emailsAll, id, isNew],
  );
  const prevProperties = useMemo(
    () => (!isNew && id ? liveForCustomer(propertiesAll, id) : []),
    [propertiesAll, id, isNew],
  );

  useEffect(() => {
    if (isNew || !existing || existing.deleted_at) return;
    setCustomer((d) => d ?? { ...existing });
  }, [existing, isNew]);

  useEffect(() => {
    if (isNew || !id || phonesAll === null) return;
    setPhones((cur) => {
      if (cur.length) return cur;
      const live = liveForCustomer(phonesAll, id).sort((a, b) => a.sort - b.sort);
      return live.length ? live.map((p) => ({ ...p })) : [blankPhone(org.org_id, id, { label: 'mobile' })];
    });
  }, [phonesAll, id, isNew, org.org_id]);

  useEffect(() => {
    if (isNew || !id || emailsAll === null) return;
    setEmails((cur) => {
      if (cur.length) return cur;
      return liveForCustomer(emailsAll, id).sort((a, b) => a.sort - b.sort).map((e) => ({ ...e }));
    });
  }, [emailsAll, id, isNew]);

  useEffect(() => {
    if (isNew || !id || propertiesAll === null) return;
    setProperties((cur) => {
      if (cur.length) return cur;
      const live = liveForCustomer(propertiesAll, id).sort((a, b) => a.sort - b.sort);
      const next = live.length ? live.map((p) => ({ ...p })) : [blankProperty(org.org_id, id)];
      setHazardText(next.map((p) => (p.hazards ?? []).join(', ')));
      return next;
    });
  }, [propertiesAll, id, isNew, org.org_id]);

  // Bind new blank phone/property customer_id once we know the draft id
  useEffect(() => {
    if (!customer) return;
    setPhones((ps) => ps.map((p) => (p.customer_id ? p : { ...p, customer_id: customer.id, org_id: org.org_id })));
    setEmails((es) => es.map((e) => (e.customer_id ? e : { ...e, customer_id: customer.id, org_id: org.org_id })));
    setProperties((ps) => ps.map((p) => (p.customer_id ? p : { ...p, customer_id: customer.id, org_id: org.org_id })));
  }, [customer?.id, org.org_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isNew && existing === null) {
    return <div className="page"><p className="empty">Customer not found.</p></div>;
  }
  if (!customer) return <div className="page"><p className="empty">Loading…</p></div>;

  const setC = <K extends keyof Customer>(k: K, v: Customer[K]) => setCustomer({ ...customer, [k]: v });
  const sg = stageTagGroup(groups ?? []);
  const newLeadName = sg
    ? (tags ?? []).filter((t) => t.tag_group_id === sg.id && !t.deleted_at).sort((a, b) => a.sort - b.sort)[0]?.name
    : 'New lead';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const propsWithHazards = properties.map((p, i) => ({
      ...p,
      hazards: (hazardText[i] || '').split(',').map((h) => h.trim()).filter(Boolean),
    }));
    const hasPhone = phones.some((p) => p.value.trim());
    if (!customer!.first_name.trim() && !customer!.last_name.trim() && !customer!.company.trim() && !hasPhone) {
      setErr('Add a name, company, or phone first.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const saved = await saveCustomerBundle(engine, {
        orgId: org.org_id,
        customer: customer!,
        phones: phones.map((p) => ({ ...p, customer_id: customer!.id, org_id: org.org_id })),
        emails: emails.map((em) => ({ ...em, customer_id: customer!.id, org_id: org.org_id })),
        properties: propsWithHazards.map((p) => ({ ...p, customer_id: customer!.id, org_id: org.org_id })),
        prevPhones,
        prevEmails,
        prevProperties,
        isNew,
        groups: groups ?? [],
        tags: tags ?? [],
        createdBy: user.id,
      });
      nav(`/contacts/${saved.id}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew) return;
    if (!confirm(`Delete ${displayName(customer!)} and their CRM history?`)) return;
    await softDeleteCustomer(engine, customer!, {
      phones: prevPhones,
      emails: prevEmails,
      properties: prevProperties,
      memberships: (memberships ?? []).filter((m) => m.customer_id === customer!.id),
      activities: (activities ?? []).filter((a) => a.customer_id === customer!.id),
    });
    nav('/contacts');
  }

  return (
    <form className="page crm-edit" onSubmit={(e) => void save(e)}>
      <div className="page-head">
        <h2>{isNew ? 'New customer' : 'Edit'}</h2>
        <div className="btn-row">
          <Link to={isNew ? '/contacts' : `/contacts/${customer.id}`} className="btn">Cancel</Link>
          <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {err && <p className="error-text" role="alert">{err}</p>}

      <section className="card">
        <div className="two">
          <label className="field"><span>First name</span>
            <input value={customer.first_name} onChange={(e) => setC('first_name', e.target.value)} autoCapitalize="words" autoComplete="given-name" autoFocus={isNew} />
          </label>
          <label className="field"><span>Last name</span>
            <input value={customer.last_name} onChange={(e) => setC('last_name', e.target.value)} autoCapitalize="words" autoComplete="family-name" />
          </label>
        </div>
        <label className="field"><span>Company / HOA</span>
          <input value={customer.company} onChange={(e) => setC('company', e.target.value)} autoCapitalize="words" autoComplete="organization" />
        </label>
      </section>

      <section className="card">
        <div className="crm-fieldset-head">
          <span className="eyebrow">Phone</span>
          <button type="button" className="btn sm" onClick={() => setPhones([...phones, blankPhone(org.org_id, customer.id, { label: 'mobile', sort: phones.length })])}>+ Add</button>
        </div>
        {phones.map((p, i) => (
          <div className="crm-multi" key={p.id}>
            <select value={p.label} onChange={(e) => setPhones(phones.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Phone label">
              {[...new Set([...PHONE_LABELS, p.label])].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <input type="tel" value={p.value} onChange={(e) => setPhones(phones.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="(555) 555-5555" aria-label="Phone number" />
            <button type="button" className="btn sm" aria-label="Remove phone" onClick={() => setPhones(phones.filter((_, j) => j !== i))}>−</button>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="crm-fieldset-head">
          <span className="eyebrow">Email</span>
          <button type="button" className="btn sm" onClick={() => setEmails([...emails, blankEmail(org.org_id, customer.id, { label: 'home', sort: emails.length })])}>+ Add</button>
        </div>
        {emails.map((em, i) => (
          <div className="crm-multi" key={em.id}>
            <select value={em.label} onChange={(e) => setEmails(emails.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Email label">
              {[...new Set([...EMAIL_LABELS, em.label])].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <input type="email" value={em.value} onChange={(e) => setEmails(emails.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="name@example.com" autoCapitalize="off" aria-label="Email" />
            <button type="button" className="btn sm" aria-label="Remove email" onClick={() => setEmails(emails.filter((_, j) => j !== i))}>−</button>
          </div>
        ))}
      </section>

      {properties.map((p, i) => (
        <section className="card" key={p.id}>
          <div className="crm-fieldset-head">
            <span className="eyebrow">Property {properties.length > 1 ? i + 1 : ''}</span>
            {properties.length > 1 && (
              <button
                type="button"
                className="btn sm danger"
                onClick={() => {
                  setProperties(properties.filter((_, j) => j !== i));
                  setHazardText(hazardText.filter((_, j) => j !== i));
                }}
              >
                Remove
              </button>
            )}
          </div>
          <label className="field"><span>Street</span>
            <input value={p.street} onChange={(e) => setProperties(properties.map((x, j) => (j === i ? { ...x, street: e.target.value } : x)))} autoComplete="address-line1" />
          </label>
          <div className="two">
            <label className="field"><span>Town</span>
              <input value={p.town} onChange={(e) => setProperties(properties.map((x, j) => (j === i ? { ...x, town: e.target.value } : x)))} autoComplete="address-level2" />
            </label>
            <label className="field"><span>State</span>
              <input value={p.state} maxLength={2} autoCapitalize="characters" onChange={(e) => setProperties(properties.map((x, j) => (j === i ? { ...x, state: e.target.value.toUpperCase() } : x)))} />
            </label>
          </div>
          <label className="field"><span>ZIP</span>
            <input value={p.zip} inputMode="numeric" autoComplete="postal-code" onChange={(e) => setProperties(properties.map((x, j) => (j === i ? { ...x, zip: e.target.value } : x)))} />
          </label>
          <div className="two">
            <label className="field"><span>Gate code</span>
              <input value={p.gate_code} onChange={(e) => setProperties(properties.map((x, j) => (j === i ? { ...x, gate_code: e.target.value } : x)))} />
            </label>
            <label className="field"><span>Hazards</span>
              <input
                value={hazardText[i] || ''}
                onChange={(e) => setHazardText((h) => { const n = [...h]; n[i] = e.target.value; return n; })}
                placeholder="Power lines, shed…"
              />
            </label>
          </div>
          <label className="field"><span>Access notes</span>
            <input value={p.access} onChange={(e) => setProperties(properties.map((x, j) => (j === i ? { ...x, access: e.target.value } : x)))} placeholder="Park on street, dog in back…" />
          </label>
          <label className="field"><span>Tree notes</span>
            <textarea value={p.tree_notes} onChange={(e) => setProperties(properties.map((x, j) => (j === i ? { ...x, tree_notes: e.target.value } : x)))} placeholder="What needs doing" />
          </label>
        </section>
      ))}
      <button
        type="button"
        className="btn"
        onClick={() => {
          setProperties([...properties, blankProperty(org.org_id, customer.id, { sort: properties.length })]);
          setHazardText([...hazardText, '']);
        }}
      >
        + Add another property
      </button>

      <section className="card">
        <label className="field"><span>Notes (internal)</span>
          <textarea value={customer.notes} onChange={(e) => setC('notes', e.target.value)} placeholder="Best time to call, billing notes…" />
        </label>
      </section>

      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={saving}>{isNew ? 'Add customer' : 'Save changes'}</button>
        {!isNew && <button type="button" className="btn danger" onClick={() => void remove()}>Delete customer</button>}
      </div>
      {isNew && (
        <p className="hint">New customers start as “{newLeadName || 'New lead'}”. Set other tags on their card after saving.</p>
      )}
    </form>
  );
}
