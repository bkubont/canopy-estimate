import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { can, useReady } from '../lib/session';
import { SyncBadge } from './SyncBadge';

const TITLES: Record<string, string> = {
  calendar: 'Calendar',
  estimates: 'Estimates',
  contacts: 'Contacts',
  company: 'Company',
  team: 'Team',
  account: 'More',
  invoices: 'Invoices',
  board: 'Jobs board',
};

export function Shell() {
  const { org, user } = useReady();
  const loc = useLocation();
  const section = loc.pathname.split('/')[1] ?? '';
  const isOwner = org.role === 'owner';

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <img src="brand/logo.svg" alt="" />
          <div>
            <strong>{org.name}</strong>
          </div>
        </div>
        <NavLink to="/calendar">Calendar</NavLink>
        <NavLink to="/board">Jobs board</NavLink>
        <NavLink to="/estimates">{can.seePrices(org.role) ? 'Estimates' : 'Job details'}</NavLink>
        {can.seePrices(org.role) && <NavLink to="/invoices">Invoices</NavLink>}
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/company">Company</NavLink>
        {isOwner && <NavLink to="/team">Team</NavLink>}
        <div className="grow" />
        <NavLink to="/account">Account</NavLink>
        <div className="who">{user.email}</div>
      </aside>

      <div className="main">
        <header className="appbar">
          <img src="brand/logo.svg" alt="" className="appbar-logo" />
          <div className="appbar-title">{section === 'estimates' && !can.seePrices(org.role) ? 'Job details' : TITLES[section] ?? org.name}</div>
          <SyncBadge />
        </header>
        <Outlet />
      </div>

      <nav className="tabnav" aria-label="Primary">
        <NavLink to="/calendar"><span className="ico" aria-hidden="true">📅</span>Calendar</NavLink>
        {can.seePrices(org.role)
          ? <NavLink to="/estimates"><span className="ico" aria-hidden="true">📋</span>Estimates</NavLink>
          : <NavLink to="/board"><span className="ico" aria-hidden="true">🪵</span>Jobs</NavLink>}
        {can.seePrices(org.role)
          ? <NavLink to="/invoices"><span className="ico" aria-hidden="true">🧾</span>Invoices</NavLink>
          : <NavLink to="/contacts"><span className="ico" aria-hidden="true">👤</span>Contacts</NavLink>}
        <NavLink to="/account"><span className="ico" aria-hidden="true">⋯</span>More</NavLink>
      </nav>
    </div>
  );
}
