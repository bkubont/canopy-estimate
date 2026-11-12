import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { blankJob, blankPricing, clientName, money, niceDate, STATUS_LABEL } from '../lib/estimate';
import { refillNumbers, takeNumber } from '../lib/numbers';
import { can, useReady, useRow, useRows } from '../lib/session';
import { reserveNumbers } from '../lib/supabase';
import type { Job } from '../lib/types';

const FILTERS: [string, string][] = [['all', 'All'], ...Object.entries(STATUS_LABEL)];

export function Estimates() {
  const { engine, org, user } = useReady();
  const jobs = useRows(engine, 'jobs');
  const pricing = useRows(engine, 'job_pricing');
  const company = useRow(engine, 'organizations', org.org_id);
  const orgPricing = useRow(engine, 'org_pricing', org.org_id);
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const canCreate = can.seePrices(org.role);

  // Keep a stock of estimate numbers on this device for working offline.
  useEffect(() => {
    if (canCreate) void refillNumbers(engine.db, org.org_id, 'estimate', reserveNumbers).catch(() => undefined);
  }, [engine, org.org_id, canCreate]);

  const totalById = useMemo(() => new Map((pricing ?? []).map((p) => [p.job_id, p.total])), [pricing]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (jobs ?? [])
      .filter((j) => j.stage !== 'archived')
      .filter((j) => filter === 'all' || j.status === filter)
      .filter((j) => !needle || [j.number, clientName(j.client), j.client?.phone, j.client?.street, j.client?.town].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? ''));
  }, [jobs, q, filter]);

  async function create() {
    if (!company) return setError('Company details haven’t synced yet. Try again in a moment.');
    setError('');
    try {
      const number = await takeNumber(engine.db, org.org_id, 'estimate', reserveNumbers);
      const job = blankJob({ org: company, number, preparedBy: me?.display_name ?? '', contractorSig: me?.signature_data ?? '' });
      await engine.save('jobs', job);
      await engine.save('job_pricing', blankPricing(job, orgPricing));
      nav(`/estimates/${job.id}/client`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const profileMissing = company && can.editCompany(org.role) && (!company.phone.trim() || !company.name.trim());

  return (
    <div className="page">
      <div className="page-head">
        <h2>{canCreate ? 'Estimates' : 'Job details'}</h2>
        {canCreate && <button type="button" className="btn primary" onClick={create}>＋ New estimate</button>}
      </div>
      {profileMissing && (
        <div className="card notice warn">
          <b>Add your company phone</b>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>It goes on every estimate.</p>
          <Link to="/company" className="btn sm">Company details</Link>
        </div>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
      <input type="search" className="search" placeholder="Search number, customer, town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search estimates" />
      <div className="chips est-filters" role="group" aria-label="Status">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {jobs === null ? <p className="empty">Loading…</p> : list.length ? (
        <div className="list">
          {list.map((j: Job) => (
            <Link key={j.id} to={`/estimates/${j.id}`} className="list-item">
              <div className="row">
                <b>{clientName(j.client) || 'No name yet'}</b>
                {canCreate && <b>{money(totalById.get(j.id) ?? 0)}</b>}
              </div>
              <div className="row muted small">
                <span>{j.number} · {j.client?.town || 'No town'} · {niceDate(j.estimate_date)}</span>
                {canCreate && (j.stage === 'invoice' || j.stage === 'paid')
                  ? <span className={`status inv-${j.stage === 'paid' ? 'paid' : 'unpaid'}`}>{j.stage === 'paid' ? 'Paid' : 'Invoiced'}</span>
                  : <span className={`status ${j.status}`}>{STATUS_LABEL[j.status]}</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="empty">{q || filter !== 'all' ? 'No matches.' : canCreate ? 'No estimates yet. Tap “New estimate” to start.' : 'No estimates yet.'}</p>
      )}
    </div>
  );
}
