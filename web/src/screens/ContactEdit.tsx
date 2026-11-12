import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useReady, useRow } from '../lib/session';
import type { Customer } from '../lib/types';
import { customerName } from './Contacts';

function blank(orgId: string): Customer {
  return {
    id: crypto.randomUUID(), org_id: orgId, first_name: '', last_name: '', company: '', phone: '', email: '',
    street: '', town: '', state: 'MI', zip: '', notes: '', deleted_at: null,
  };
}

const FIELDS: [keyof Customer, string, React.InputHTMLAttributes<HTMLInputElement>][] = [
  ['company', 'Company', { autoCapitalize: 'words', autoComplete: 'organization' }],
  ['phone', 'Phone', { type: 'tel', inputMode: 'tel', autoComplete: 'tel' }],
  ['email', 'Email', { type: 'email', inputMode: 'email', autoComplete: 'email' }],
  ['street', 'Address', { autoCapitalize: 'words', autoComplete: 'address-line1' }],
  ['town', 'Town', { autoCapitalize: 'words', autoComplete: 'address-level2' }],
];

export function ContactEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { engine, org } = useReady();
  const existing = useRow(engine, 'customers', isNew ? undefined : id);
  const nav = useNavigate();
  const [draft, setDraft] = useState<Customer | null>(isNew ? blank(org.org_id) : null);

  useEffect(() => {
    if (!isNew && existing) setDraft((d) => d ?? { ...existing });
  }, [existing, isNew]);

  if (!isNew && existing === null) return <div className="page"><p className="empty">Contact not found.</p></div>;
  if (!draft) return <div className="page"><p className="empty">Loading…</p></div>;

  const set = (k: keyof Customer, v: string) => setDraft({ ...draft, [k]: v });

  async function save(e: FormEvent) {
    e.preventDefault();
    await engine.save('customers', draft!);
    nav('/contacts');
  }

  async function remove() {
    if (!confirm(`Remove ${customerName(draft!)} from contacts?`)) return;
    await engine.remove('customers', draft!);
    nav('/contacts');
  }

  return (
    <form className="page" onSubmit={save}>
      <div className="page-head">
        <h2>{isNew ? 'New contact' : customerName(draft)}</h2>
      </div>
      <section className="card">
        <div className="two">
          <label className="field"><span>First name</span>
            <input value={draft.first_name} onChange={(e) => set('first_name', e.target.value)} autoCapitalize="words" autoComplete="given-name" />
          </label>
          <label className="field"><span>Last name</span>
            <input value={draft.last_name} onChange={(e) => set('last_name', e.target.value)} autoCapitalize="words" autoComplete="family-name" />
          </label>
        </div>
        {FIELDS.map(([k, label, attrs]) => (
          <label key={k} className="field"><span>{label}</span>
            <input {...attrs} value={String(draft[k] ?? '')} onChange={(e) => set(k, e.target.value)} />
          </label>
        ))}
        <div className="two">
          <label className="field"><span>State</span>
            <input value={draft.state} maxLength={2} autoCapitalize="characters" onChange={(e) => set('state', e.target.value.toUpperCase())} />
          </label>
          <label className="field"><span>ZIP</span>
            <input value={draft.zip} inputMode="numeric" autoComplete="postal-code" onChange={(e) => set('zip', e.target.value)} />
          </label>
        </div>
        <label className="field"><span>Notes (internal)</span>
          <textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Gate code, dog, best time to call…" />
        </label>
      </section>
      <div className="btn-row">
        <button type="submit" className="btn primary">Save contact</button>
        <button type="button" className="btn" onClick={() => nav('/contacts')}>Cancel</button>
        {!isNew && <button type="button" className="btn danger" onClick={remove}>Remove</button>}
      </div>
    </form>
  );
}
