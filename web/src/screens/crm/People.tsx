import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ImportContacts } from '../../components/ImportContacts';
import { exportAllContacts } from '../../components/SaveToContacts';
import { SmartListsBar, type ActiveFilter } from '../../components/SmartListsBar';
import { stageTagGroup } from '../../lib/crmStage';
import {
  customersMatchingSmartList, filterEquals, liveSmartLists, normalizeSmartList,
} from '../../lib/crmSmartLists';
import {
  displayName, liveForCustomer, matchesPeopleSearch, propertyAddress, sortKey, stageOf, tagIdsForCustomer,
} from '../../lib/crmUi';
import { useReady, useRows } from '../../lib/session';
import type { Customer, SmartList } from '../../lib/types';

export function People() {
  const { engine } = useReady();
  const customers = useRows(engine, 'customers');
  const phones = useRows(engine, 'customer_phones');
  const emails = useRows(engine, 'customer_emails');
  const properties = useRows(engine, 'customer_properties');
  const memberships = useRows(engine, 'customer_tags');
  const activities = useRows(engine, 'customer_activities');
  const groups = useRows(engine, 'tag_groups');
  const tags = useRows(engine, 'tags');
  const smartListRows = useRows(engine, 'smart_lists');
  const lists = useMemo(() => liveSmartLists(smartListRows), [smartListRows]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [stageId, setStageId] = useState<string | null>(null);
  const [coldOnly, setColdOnly] = useState(false);
  const [tagRefs, setTagRefs] = useState<SmartList['tag_refs']>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const liveCustomers = useMemo(() => (customers ?? []).filter((c) => !c.deleted_at), [customers]);
  const sg = useMemo(() => stageTagGroup(groups ?? []), [groups]);
  const stageTags = useMemo(
    () => (tags ?? []).filter((t) => sg && t.tag_group_id === sg.id && !t.deleted_at).sort((a, b) => a.sort - b.sort),
    [tags, sg],
  );

  const tagName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tags ?? []) if (!t.deleted_at) m.set(t.id, t.name);
    return m;
  }, [tags]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of liveCustomers) {
      const s = stageOf(c.id, memberships ?? [], groups ?? [], tags ?? []);
      if (s) m.set(s.id, (m.get(s.id) || 0) + 1);
    }
    return m;
  }, [liveCustomers, memberships, groups, tags]);

  const activeStageSlug = stageId
    ? (stageTags.find((t) => t.id === stageId)?.slug ?? null)
    : null;

  const activeFilter: ActiveFilter = useMemo(() => ({
    query: q,
    stage_slugs: activeStageSlug ? [activeStageSlug] : [],
    tag_refs: tagRefs,
    cold_only: coldOnly,
  }), [q, activeStageSlug, tagRefs, coldOnly]);

  function applyList(list: SmartList | null) {
    if (!list) {
      setQ('');
      setStageId(null);
      setColdOnly(false);
      setTagRefs([]);
      setActiveListId(null);
      return;
    }
    const n = normalizeSmartList(list);
    setQ(n.query);
    setColdOnly(n.cold_only);
    setTagRefs(n.tag_refs);
    setActiveListId(n.id);
    if (n.stage_slugs.length === 1 && sg) {
      const t = (tags ?? []).find(
        (x) => !x.deleted_at && x.tag_group_id === sg.id && x.slug === n.stage_slugs[0],
      );
      setStageId(t?.id ?? null);
    } else {
      setStageId(null);
    }
  }

  // Deep-link from Today: /contacts?list=<id>
  const listParam = searchParams.get('list');
  useEffect(() => {
    if (!listParam || !lists.length) return;
    const list = lists.find((l) => l.id === listParam);
    if (!list) return;
    const n = normalizeSmartList(list);
    setQ(n.query);
    setColdOnly(n.cold_only);
    setTagRefs(n.tag_refs);
    setActiveListId(n.id);
    if (n.stage_slugs.length === 1) {
      const pipeline = stageTagGroup(groups ?? []);
      const t = pipeline
        ? (tags ?? []).find((x) => !x.deleted_at && x.tag_group_id === pipeline.id && x.slug === n.stage_slugs[0])
        : undefined;
      setStageId(t?.id ?? null);
    } else {
      setStageId(null);
    }
    setSearchParams({}, { replace: true });
  }, [listParam, lists, groups, tags, setSearchParams]);

  // Keep activeListId in sync when the user tweaks chips/search away from the saved filter.
  useEffect(() => {
    if (!activeListId) return;
    const list = lists.find((l) => l.id === activeListId);
    if (!list || !filterEquals(list, activeFilter)) setActiveListId(null);
  }, [activeFilter, activeListId, lists]);

  const listMode = !!(activeListId || coldOnly || tagRefs.length);

  const shown = useMemo(() => {
    if (listMode) {
      return customersMatchingSmartList({
        list: activeFilter,
        customers: liveCustomers,
        phones: phones ?? [],
        emails: emails ?? [],
        properties: properties ?? [],
        memberships: memberships ?? [],
        activities: activities ?? [],
        groups: groups ?? [],
        tags: tags ?? [],
      }).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    }
    const query = q.trim().toLowerCase();
    return liveCustomers
      .filter((c) => {
        if (!stageId) return true;
        return tagIdsForCustomer(memberships ?? [], c.id).includes(stageId);
      })
      .filter((c) => matchesPeopleSearch({
        customer: c,
        phones: liveForCustomer(phones, c.id),
        emails: liveForCustomer(emails, c.id),
        properties: liveForCustomer(properties, c.id),
        tagNames: tagIdsForCustomer(memberships ?? [], c.id).map((id) => tagName.get(id) || ''),
        query,
      }))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }, [
    listMode, activeFilter, liveCustomers, phones, emails, properties, memberships,
    activities, groups, tags, q, stageId, tagName,
  ]);

  const letterGroups = useMemo(() => {
    const m = new Map<string, Customer[]>();
    for (const c of shown) {
      let L = sortKey(c).normalize('NFD')[0]?.toUpperCase() || '#';
      if (!/[A-Z]/.test(L)) L = '#';
      if (!m.has(L)) m.set(L, []);
      m.get(L)!.push(c);
    }
    return [...m.entries()];
  }, [shown]);

  const loading = customers === null;
  const activeName = activeListId ? lists.find((l) => l.id === activeListId)?.name : null;

  return (
    <div className="page crm-people">
      <div className="page-head">
        <h1>Customers{liveCustomers.length ? <small className="crm-count">{liveCustomers.length}</small> : null}</h1>
        <div className="btn-row">
          <ImportContacts />
          {!!liveCustomers.length && (
            <button type="button" className="btn" onClick={() => exportAllContacts(liveCustomers)}>
              <Icon name="download" />Export all
            </button>
          )}
          <Link to="/contacts/new" className="btn primary"><Icon name="plus" />New</Link>
        </div>
      </div>

      <input
        type="search"
        className="search"
        placeholder="Name, street, phone, tag…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
        }}
        aria-label="Search people"
      />

      {sg && liveCustomers.length > 0 && (
        <div className="chips scroll-x crm-stage-chips" role="group" aria-label="Filter by lead stage">
          <button
            type="button"
            className="chip"
            aria-pressed={stageId === null && !coldOnly && !tagRefs.length}
            onClick={() => {
              setStageId(null);
              setColdOnly(false);
              setTagRefs([]);
              setActiveListId(null);
            }}
          >
            All
          </button>
          {stageTags.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip crm-stage-chip"
              aria-pressed={stageId === t.id && !coldOnly}
              onClick={() => {
                setColdOnly(false);
                setTagRefs([]);
                setStageId(stageId === t.id ? null : t.id);
              }}
            >
              <i className="crm-dot" style={{ background: t.color || 'var(--muted)' }} />
              {t.name}
              <span className="crm-n">{counts.get(t.id) || 0}</span>
            </button>
          ))}
        </div>
      )}

      {liveCustomers.length > 0 && (
        <SmartListsBar
          active={activeFilter}
          activeListId={activeListId}
          onApply={applyList}
        />
      )}

      {(activeName || coldOnly || tagRefs.length > 0) && (
        <p className="crm-smart-active muted small">
          {activeName
            ? <>Showing list <b>{activeName}</b></>
            : coldOnly
              ? 'Showing estimates going cold'
              : 'Showing saved tag filter'}
          {' · '}
          <button type="button" className="link" onClick={() => applyList(null)}>Clear</button>
        </p>
      )}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : liveCustomers.length === 0 ? (
        <p className="empty">No customers yet. Import a contacts file or add your first person.</p>
      ) : shown.length === 0 ? (
        <p className="empty">No matches.</p>
      ) : (
        <div className="crm-letter-list">
          {letterGroups.map(([L, list]) => (
            <section key={L} className="crm-letter-group">
              <div className="crm-letter">{L}</div>
              <div className="card flush">
                {list.map((c) => {
                  const s = stageOf(c.id, memberships ?? [], groups ?? [], tags ?? []);
                  const props = liveForCustomer(properties, c.id).sort((a, b) => a.sort - b.sort);
                  const ph = liveForCustomer(phones, c.id).sort((a, b) => a.sort - b.sort);
                  const addr = props[0] ? propertyAddress(props[0]) : '';
                  const sub = [
                    c.company && (c.first_name || c.last_name) ? c.company : '',
                    addr,
                    !addr ? (ph[0]?.value || c.phone) : '',
                    s?.name,
                  ].filter(Boolean).join(' · ');
                  return (
                    <Link key={c.id} to={`/contacts/${c.id}`} className="crm-row">
                      <span className="crm-stripe" style={{ background: s?.color || 'transparent' }} />
                      <span className="grow">
                        <b>{displayName(c)}</b>
                        {sub && <span className="muted small">{sub}</span>}
                      </span>
                      <Icon name="chevronRight" size={18} />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
