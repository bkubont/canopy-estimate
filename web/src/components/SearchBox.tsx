import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clientName } from '../lib/estimate';
import { useReady, useRows } from '../lib/session';
import { Icon } from './Icon';
import { customerName } from '../screens/Contacts';

type Hit = { key: string; title: string; sub: string; to: string };

/** One search for jobs and customers, always in the top bar. */
export function SearchBox() {
  const { engine } = useReady();
  const jobs = useRows(engine, 'jobs');
  const customers = useRows(engine, 'customers');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const narrow = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 599px)').matches;

  useEffect(() => {
    setOpen(false);
    setQ('');
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const has = (...parts: (string | undefined)[]) => parts.join(' ').toLowerCase().includes(needle);
    const jobHits = (jobs ?? [])
      .filter((j) => has(j.number, clientName(j.client), j.client?.company, j.client?.phone, j.client?.street, j.client?.town))
      .slice(0, 6)
      .map((j) => ({ key: j.id, title: clientName(j.client) || j.number, sub: [j.number, j.client?.town].filter(Boolean).join(' · '), to: `/estimates/${j.id}` }));
    const custHits = (customers ?? [])
      .filter((c) => has(c.first_name, c.last_name, c.company, c.phone, c.email, c.street, c.town))
      .slice(0, 4)
      .map((c) => ({ key: c.id, title: customerName(c) || 'No name', sub: ['Customer', c.town].filter(Boolean).join(' · '), to: `/contacts/${c.id}` }));
    return [...jobHits, ...custHits];
  }, [q, jobs, customers]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ('');
    nav(h.to);
  };

  return (
    <div className="top-search" ref={wrap}>
      <label>
        <Icon name="search" size={17} />
        <input type="search" value={q} placeholder={narrow ? 'Search' : 'Search jobs & customers'} aria-label="Search jobs and customers"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && hits[0]) go(hits[0]);
          }} />
      </label>
      {open && q.trim().length >= 2 && (
        <div className="popover search-results" role="listbox" aria-label="Search results">
          {hits.length ? hits.map((h) => (
            <button key={h.key} type="button" role="option" aria-selected="false" className="pop-item" onClick={() => go(h)}>
              <b>{h.title}</b>
              <span className="muted small">{h.sub}</span>
            </button>
          )) : <p className="muted small" style={{ margin: 12 }}>Nothing matches “{q.trim()}”.</p>}
        </div>
      )}
    </div>
  );
}
