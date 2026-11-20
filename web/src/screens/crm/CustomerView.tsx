import { Fragment, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Pill } from '../../components/Pill';
import { Sheet } from '../../components/ui';
import { addNewTag, logActivity, toggleCustomerTag } from '../../lib/crmActions';
import { stageTagGroup } from '../../lib/crmStage';
import {
  digits, displayName, doNotText, liveForCustomer, mapsUrl, propertyAddress, stageOf, tagIdsForCustomer, timeAgo,
} from '../../lib/crmUi';
import { useReady, useRow, useRows } from '../../lib/session';
import { jobStage } from '../../lib/status';
import type { Tag, TagGroup } from '../../lib/types';

function jobRecency(j: { updated_at?: string; estimate_date?: string; created_at?: string }): number {
  return Date.parse(j.updated_at || j.estimate_date || j.created_at || '') || 0;
}

export function CustomerView() {
  const { id } = useParams();
  const { engine, org, user } = useReady();
  const customer = useRow(engine, 'customers', id);
  const phonesAll = useRows(engine, 'customer_phones');
  const emailsAll = useRows(engine, 'customer_emails');
  const propertiesAll = useRows(engine, 'customer_properties');
  const memberships = useRows(engine, 'customer_tags');
  const activitiesAll = useRows(engine, 'customer_activities');
  const groups = useRows(engine, 'tag_groups');
  const tags = useRows(engine, 'tags');
  const jobsAll = useRows(engine, 'jobs');
  const events = useRows(engine, 'events');
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const [picker, setPicker] = useState<TagGroup | null>(null);
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState('');
  const noteRef = useRef<HTMLInputElement>(null);

  const c = customer && !customer.deleted_at ? customer : null;
  const phones = useMemo(() => (c ? liveForCustomer(phonesAll, c.id).sort((a, b) => a.sort - b.sort) : []), [phonesAll, c]);
  const emails = useMemo(() => (c ? liveForCustomer(emailsAll, c.id).sort((a, b) => a.sort - b.sort) : []), [emailsAll, c]);
  const properties = useMemo(() => (c ? liveForCustomer(propertiesAll, c.id).sort((a, b) => a.sort - b.sort) : []), [propertiesAll, c]);
  const activities = useMemo(
    () => (c ? liveForCustomer(activitiesAll, c.id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : []),
    [activitiesAll, c],
  );
  const workJobs = useMemo(() => {
    if (!c) return [];
    return (jobsAll ?? [])
      .filter((j) => !j.deleted_at && j.customer_id === c.id)
      .sort((a, b) => jobRecency(b) - jobRecency(a));
  }, [jobsAll, c]);

  const sg = useMemo(() => stageTagGroup(groups ?? []), [groups]);
  const stageTags = useMemo(
    () => (tags ?? []).filter((t) => sg && t.tag_group_id === sg.id && !t.deleted_at).sort((a, b) => a.sort - b.sort),
    [tags, sg],
  );
  const stage = c ? stageOf(c.id, memberships ?? [], groups ?? [], tags ?? []) : undefined;
  const otherGroups = useMemo(
    () => (groups ?? []).filter((g) => !g.deleted_at && !g.pipeline).sort((a, b) => a.sort - b.sort),
    [groups],
  );
  const tagIds = c ? tagIdsForCustomer(memberships ?? [], c.id) : [];
  const blockText = c ? doNotText(memberships ?? [], tags ?? [], c.id) : false;
  const phone = phones[0]?.value || c?.phone || '';
  const addr = properties.map(propertyAddress).find(Boolean) || '';

  const toast = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(''), 2200);
  };

  if (customer === undefined) return <div className="page"><p className="empty">Loading…</p></div>;
  if (!c) {
    return (
      <div className="page">
        <Link to="/contacts" className="btn">‹ Customers</Link>
        <p className="empty">Customer not found.</p>
      </div>
    );
  }

  async function setStage(tag: Tag) {
    if (!sg || stage?.id === tag.id) return;
    await toggleCustomerTag(engine, {
      orgId: org.org_id,
      customerId: c!.id,
      tag,
      group: sg,
      groupTags: stageTags,
      memberships: memberships ?? [],
      createdBy: user.id,
    });
    toast(`Lead stage: ${tag.name}`);
  }

  async function addNote() {
    if (!note.trim()) return;
    await logActivity(engine, org.org_id, c!.id, 'note', note.trim(), user.id);
    setNote('');
    toast('Note added');
  }

  return (
    <div className="page crm-card">
      <div className="page-head">
        <Link to="/contacts" className="btn">‹ Customers</Link>
        <div className="btn-row">
          <Link to={`/contacts/${c.id}/edit`} className="btn"><Icon name="pen" />Edit</Link>
        </div>
      </div>
      {flash && <p className="hint" role="status">{flash}</p>}

      <section className="crm-hero card" style={{ borderTopColor: stage?.color || 'var(--line)' }}>
        <h2>{displayName(c)}</h2>
        <p className="muted small">
          {[
            c.company && (c.first_name || c.last_name) ? c.company : '',
            ...tagIds
              .map((tid) => (tags ?? []).find((t) => t.id === tid))
              .filter((t): t is Tag => {
                if (!t) return false;
                const g = (groups ?? []).find((x) => x.id === t.tag_group_id);
                return g?.slug === 'type' || g?.slug === 'source';
              })
              .map((t) => t.name),
          ].filter(Boolean).join(' · ')}
        </p>

        {sg && (
          <div className="crm-stages" role="group" aria-label="Lead stage">
            {stageTags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={stage?.id === t.id ? 'on' : ''}
                style={stage?.id === t.id ? { background: t.color } : undefined}
                onClick={() => void setStage(t)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="crm-acts">
          <a
            className="btn primary"
            href={phone && !blockText ? `sms:${digits(phone)}` : undefined}
            aria-disabled={!phone || blockText}
            onClick={(e) => {
              if (!phone || blockText) {
                e.preventDefault();
                toast(blockText ? 'Tagged “Do not text”' : 'No phone number');
                return;
              }
              void logActivity(engine, org.org_id, c.id, 'text', 'Texted', user.id);
            }}
          >
            <Icon name="message" />Text
          </a>
          <a
            className="btn"
            href={phone ? `tel:${digits(phone)}` : undefined}
            onClick={(e) => {
              if (!phone) { e.preventDefault(); toast('No phone number'); return; }
              void logActivity(engine, org.org_id, c.id, 'call', 'Called', user.id);
            }}
          >
            <Icon name="phone" />Call
          </a>
          <a
            className="btn"
            href={addr ? mapsUrl(addr) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { if (!addr) { e.preventDefault(); toast('No address'); } }}
          >
            <Icon name="pin" />Nav
          </a>
          <button type="button" className="btn" onClick={() => noteRef.current?.focus()}>
            <Icon name="pen" />Log
          </button>
        </div>
      </section>

      {properties.map((p, i) => {
        const line = propertyAddress(p);
        return (
          <section className="card crm-prop" key={p.id}>
            <div className="crm-section-head">
              <span className="eyebrow">Property</span>
              {properties.length > 1 && <span className="eyebrow muted">{i + 1} of {properties.length}</span>}
            </div>
            {line && <a className="crm-addr" href={mapsUrl(line)} target="_blank" rel="noopener noreferrer">{line}</a>}
            {p.hazards.map((h) => <div className="crm-hazard" key={h}>{h}</div>)}
            {(p.gate_code || p.access) && (
              <div className="chips" style={{ marginTop: 8 }}>
                {p.gate_code && <span className="chip">Gate {p.gate_code}</span>}
                {p.access && <span className="chip">{p.access}</span>}
              </div>
            )}
            {p.tree_notes && <p style={{ margin: '8px 0 0' }}>{p.tree_notes}</p>}
          </section>
        );
      })}

      <section className="card">
        <div className="eyebrow">Work</div>
        {workJobs.length === 0 ? (
          <p className="muted small" style={{ margin: '8px 0 0' }}>No jobs linked yet</p>
        ) : (
          <div className="crm-work-list">
            {workJobs.map((j) => {
              const site = [j.client?.street, j.client?.town].filter(Boolean).join(', ')
                || j.client?.town
                || '';
              const st = jobStage(j, events ?? [], invoices, payments);
              return (
                <Link key={j.id} to={`/estimates/${j.id}`} className="crm-work-row">
                  <span className="grow">
                    <b>{j.number}</b>
                    {site && <span className="muted small">{site}</span>}
                  </span>
                  <Pill stage={st} />
                  <Icon name="chevronRight" size={18} />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {(phones.length > 0 || emails.length > 0) && (
        <section className="card crm-prop">
          <dl className="crm-kv">
            {phones.map((p) => (
              <Fragment key={p.id}>
                <dt>{p.label}</dt>
                <dd><a href={`tel:${digits(p.value)}`}>{p.value}</a></dd>
              </Fragment>
            ))}
            {emails.map((e) => (
              <Fragment key={e.id}>
                <dt>{e.label === 'other' ? 'email' : e.label}</dt>
                <dd><a href={`mailto:${e.value}`}>{e.value}</a></dd>
              </Fragment>
            ))}
          </dl>
        </section>
      )}

      <section className="card">
        {otherGroups.map((g) => {
          const gTags = (tags ?? []).filter((t) => t.tag_group_id === g.id && !t.deleted_at).sort((a, b) => a.sort - b.sort);
          const on = gTags.filter((t) => tagIds.includes(t.id));
          return (
            <div className="crm-taggroup" key={g.id}>
              <div className="eyebrow">{g.name}</div>
              <div className="chips">
                {on.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={/power|dog|crane/i.test(t.name) ? 'chip warn-chip' : 'chip'}
                    onClick={() => setPicker(g)}
                  >
                    {t.name}
                  </button>
                ))}
                <button type="button" className="chip add" onClick={() => setPicker(g)}>
                  {on.length ? 'Change' : '+ Add'}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {c.notes && (
        <section className="card crm-prop">
          <span className="eyebrow">Notes</span>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{c.notes}</div>
        </section>
      )}

      <section className="card">
        <div className="eyebrow">Activity</div>
        <div className="crm-notebox">
          <input
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note or log a call…"
            enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === 'Enter') void addNote(); }}
            aria-label="New note"
          />
          <button type="button" className="btn primary" onClick={() => void addNote()} disabled={!note.trim()}>Add</button>
        </div>
        <div className="crm-timeline">
          {activities.map((a) => (
            <div key={a.id} className={a.type === 'stage' ? 'crm-tl stage' : 'crm-tl'}>
              <span>
                <b>{a.type === 'note' ? 'Note: ' : ''}</b>
                {a.body}
                <small>{timeAgo(a.at)}</small>
              </span>
            </div>
          ))}
          {!activities.length && <p className="muted small">No activity yet.</p>}
        </div>
      </section>

      {picker && (
        <TagPicker
          group={picker}
          customerId={c.id}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function TagPicker({ group, customerId, onClose }: { group: TagGroup; customerId: string; onClose: () => void }) {
  const { engine, org, user } = useReady();
  const groups = useRows(engine, 'tag_groups');
  const tags = useRows(engine, 'tags');
  const memberships = useRows(engine, 'customer_tags');
  const [name, setName] = useState('');
  const g = (groups ?? []).find((x) => x.id === group.id) || group;
  const gTags = (tags ?? []).filter((t) => t.tag_group_id === g.id && !t.deleted_at).sort((a, b) => a.sort - b.sort);
  const ids = new Set(tagIdsForCustomer(memberships ?? [], customerId));

  return (
    <Sheet open onClose={onClose} title={g.name} action={<button type="button" className="btn sm" onClick={onClose}>Done</button>}>
      <p className="muted" style={{ marginTop: 0 }}>{g.mode === 'one' ? 'Pick one.' : 'Pick any that apply.'}</p>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {gTags.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip"
            aria-pressed={ids.has(t.id)}
            style={{ fontSize: 16, padding: '10px 14px' }}
            onClick={() => {
              void toggleCustomerTag(engine, {
                orgId: org.org_id,
                customerId,
                tag: t,
                group: g,
                groupTags: gTags,
                memberships: memberships ?? [],
                createdBy: user.id,
              }).then(() => { if (g.mode === 'one') onClose(); });
            }}
          >
            {t.name}
          </button>
        ))}
      </div>
      {g.allow_new && (
        <div className="crm-notebox" style={{ marginTop: 12 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`New ${g.name.toLowerCase()} tag`}
            aria-label="New tag"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                void addNewTag(engine, {
                  orgId: org.org_id, customerId, group: g, groupTags: gTags,
                  memberships: memberships ?? [], name, createdBy: user.id,
                }).then(() => setName(''));
              }
            }}
          />
          <button
            type="button"
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              void addNewTag(engine, {
                orgId: org.org_id, customerId, group: g, groupTags: gTags,
                memberships: memberships ?? [], name, createdBy: user.id,
              }).then(() => setName(''));
            }}
          >
            Add
          </button>
        </div>
      )}
    </Sheet>
  );
}
