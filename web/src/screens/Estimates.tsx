import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Pill } from '../components/Pill';
import { clientName, money, niceDate } from '../lib/estimate';
import { refillNumbers } from '../lib/numbers';
import { can, useReady, useRow, useRows } from '../lib/session';
import { jobStage, STAGE_LABEL, type Stage } from '../lib/status';
import { reserveNumbers } from '../lib/supabase';
import { useCreateEstimate } from '../lib/useCreateEstimate';

const FILTERS: [string, string][] = [['all', 'All'], ...(['pending', 'approved', 'scheduled', 'in_progress', 'blocked', 'done', 'invoiced', 'overdue', 'paid'] as Stage[]).map((s) => [s, STAGE_LABEL[s]] as [string, string])];

export function Estimates() {
  const { engine, org } = useReady();
  const jobs = useRows(engine, 'jobs');
  const pricing = useRows(engine, 'job_pricing');
  const events = useRows(engine, 'events');
  const invoices = useRows(engine, 'invoices');
  const payments = useRows(engine, 'payments');
  const company = useRow(engine, 'organizations', org.org_id);
  const newEstimate = useCreateEstimate();
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
      .map((j) => ({ ...j, st: jobStage(j, events ?? [], invoices, payments) }))
      .filter((j) => filter === 'all' || j.st === filter)
      .filter((j) => !needle || [j.number, clientName(j.client), j.client?.phone, j.client?.street, j.client?.town].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? ''));
  }, [jobs, q, filter, events, invoices, payments]);

  async function create() {
    setError('');
    try {
      await newEstimate();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const profileMissing = company && can.editCompany(org.role) && (!company.phone.trim() || !company.name.trim());

  return (
    <div className="page">
      <div className="page-head">
        <h1>{canCreate ? 'Estimates' : 'Job details'}</h1>
        {canCreate && <button type="button" className="btn primary" onClick={create}><Icon name="plus" />New estimate</button>}
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
          {list.map((j) => (
            <Link key={j.id} to={`/estimates/${j.id}`} className={`list-item stripe st-${j.st}`}>
              <div className="row">
                <b>{clientName(j.client) || 'No name yet'}</b>
                {canCreate && <b>{money(totalById.get(j.id) ?? 0)}</b>}
              </div>
              <div className="row muted small">
                <span>{j.number} · {j.client?.town || 'No town'} · {niceDate(j.estimate_date)}</span>
                <Pill stage={j.st} />
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
