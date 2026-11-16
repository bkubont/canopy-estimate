import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { ImportContacts } from '../components/ImportContacts';
import { Link } from 'react-router-dom';
import { useReady, useRows } from '../lib/session';
import type { Customer } from '../lib/types';

export const customerName = (c: Pick<Customer, 'first_name' | 'last_name' | 'company'>) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.company || 'No name';

export function Contacts() {
  const { engine } = useReady();
  const rows = useRows(engine, 'customers');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? [])
      .filter((c) => !c.deleted_at)
      .filter((c) => !needle || [c.first_name, c.last_name, c.company, c.phone, c.email, c.street, c.town].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => customerName(a).localeCompare(customerName(b)));
  }, [rows, q]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Customers</h1>
        <div className="btn-row">
          <ImportContacts />
          <Link to="/contacts/new" className="btn primary"><Icon name="plus" />New contact</Link>
        </div>
      </div>
      <input type="search" className="search" placeholder="Search name, phone, town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      {rows === null ? (
        <p className="empty">Loading…</p>
      ) : list.length ? (
        <div className="list">
          {list.map((c) => (
            <Link key={c.id} to={`/contacts/${c.id}`} className="list-item">
              <b>{customerName(c)}</b>
              <span className="muted small">{[c.phone, c.town].filter(Boolean).join(' · ') || 'No phone or town'}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="empty">{q ? 'No matches.' : 'No contacts yet. Everyone on your team will see contacts you add here.'}</p>
      )}
    </div>
  );
}
