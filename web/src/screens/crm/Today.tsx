import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ImportContacts } from '../../components/ImportContacts';
import {
  displayName, lastStageChangeAt, liveForCustomer, propertyAddress, stageOf, timeAgo, todayBuckets,
} from '../../lib/crmUi';
import { useReady, useRows } from '../../lib/session';
import type { Customer } from '../../lib/types';

export function Today() {
  const { engine } = useReady();
  const customers = useRows(engine, 'customers');
  const phones = useRows(engine, 'customer_phones');
  const properties = useRows(engine, 'customer_properties');
  const memberships = useRows(engine, 'customer_tags');
  const activities = useRows(engine, 'customer_activities');
  const groups = useRows(engine, 'tag_groups');
  const tags = useRows(engine, 'tags');

  const live = (customers ?? []).filter((c) => !c.deleted_at);
  const buckets = todayBuckets(
    live,
    memberships ?? [],
    groups ?? [],
    tags ?? [],
    activities ?? [],
  );
  const now = new Date();
  const loading = customers === null;

  const Section = ({
    title, list, empty, hint,
  }: {
    title: string;
    list: Customer[];
    empty: string;
    hint: (c: Customer) => string;
  }) => (
    <section className="crm-today-section">
      <div className="crm-section-head">
        <span className="eyebrow">{title}</span>
        <span className="eyebrow muted">{list.length}</span>
      </div>
      {list.length ? (
        <div className="card flush">
          {list.slice(0, 6).map((c) => {
            const s = stageOf(c.id, memberships ?? [], groups ?? [], tags ?? []);
            return (
              <Link key={c.id} to={`/contacts/${c.id}`} className="crm-row">
                <span className="crm-stripe" style={{ background: s?.color || 'transparent' }} />
                <span className="grow">
                  <b>{displayName(c)}</b>
                  <span className="muted small">{hint(c)}</span>
                </span>
                <Icon name="chevronRight" size={18} />
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="muted" style={{ margin: '0 2px' }}>{empty}</p>
      )}
    </section>
  );

  const firstAddr = (c: Customer) => {
    const props = liveForCustomer(properties, c.id).sort((a, b) => a.sort - b.sort);
    return (props[0] && propertyAddress(props[0])) || '';
  };
  const firstPhone = (c: Customer) => {
    const ph = liveForCustomer(phones, c.id).sort((a, b) => a.sort - b.sort);
    return ph[0]?.value || c.phone || '';
  };

  return (
    <div className="page crm-today">
      <div className="crm-today-head">
        <div className="muted" style={{ fontWeight: 600 }}>
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div className="page-head" style={{ marginBottom: 10 }}>
          <h1>Today</h1>
          <div className="btn-row">
            <Link to="/contacts" className="btn"><Icon name="users" />Customers</Link>
          </div>
        </div>
        <div className="crm-today-stats">
          {[
            { label: 'New leads', n: buckets.newLeads.length, hot: false },
            { label: 'Estimates set', n: buckets.estSet.length, hot: false },
            { label: 'Going cold', n: buckets.cold.length, hot: buckets.cold.length > 0 },
          ].map((s) => (
            <div key={s.label} className={s.hot ? 'crm-stat hot' : 'crm-stat'}>
              <div className="crm-stat-n">{s.n}</div>
              <div className="crm-stat-l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="empty">Loading…</p>
      ) : live.length === 0 ? (
        <div className="empty">
          <h2 style={{ marginBottom: 8 }}>Follow-ups live here</h2>
          <p>Import contacts or add a customer, then use lead stages on their card.</p>
          <div className="btn-row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <ImportContacts />
            <Link to="/contacts/new" className="btn primary"><Icon name="plus" />New customer</Link>
          </div>
        </div>
      ) : (
        <>
          <Section
            title="Estimates going cold"
            list={buckets.cold}
            empty="Nothing going cold. Estimates sent more than 7 days ago show up here."
            hint={(c) => `Estimate sent ${timeAgo(lastStageChangeAt(c.id, activities ?? []))}`}
          />
          <Section
            title="New leads to call back"
            list={buckets.newLeads}
            empty="No new leads waiting."
            hint={(c) => firstAddr(c) || firstPhone(c) || ''}
          />
          <Section
            title="Estimates set"
            list={buckets.estSet}
            empty="No estimates set."
            hint={(c) => firstAddr(c) || ''}
          />
          <Section
            title="Waiting on a yes"
            list={buckets.waiting}
            empty="No estimates out."
            hint={(c) => `Sent ${timeAgo(lastStageChangeAt(c.id, activities ?? []))}`}
          />
        </>
      )}
    </div>
  );
}
