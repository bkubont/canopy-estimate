import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { uploadPending } from '../lib/photos';
import { can, useReady } from '../lib/session';
import { Icon, type IconName } from './Icon';
import { QuickAdd } from './QuickAdd';
import { SearchBox } from './SearchBox';
import { SyncBadge } from './SyncBadge';

type Item = { to: string; label: string; icon: IconName; end?: boolean };

const COLLAPSE_KEY = 'canopy.navCollapsed';
function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The menu, grouped like the rest of the business: work, money, settings. */
function menu(role: string): [string, Item[]][] {
  const office = can.seePrices(role);
  const work: Item[] = [
    { to: '/', label: 'Dashboard', icon: 'home', end: true },
    { to: '/board', label: 'Jobs board', icon: 'board' },
    { to: '/calendar', label: 'Calendar', icon: 'calendar' },
    { to: '/contacts', label: 'Customers', icon: 'users' },
  ];
  if (!office) work.push({ to: '/estimates', label: 'Job details', icon: 'file' });
  const groups: [string, Item[]][] = [['Work', work]];
  if (office) groups.push(['Money', [
    { to: '/estimates', label: 'Estimates', icon: 'file' },
    { to: '/invoices', label: 'Invoices', icon: 'dollar' },
    { to: '/expenses', label: 'Expenses', icon: 'wallet' },
    { to: '/receipts', label: 'Receipts', icon: 'receipt' },
  ]]);
  groups.push(['Settings', [
    { to: '/company', label: 'Company', icon: 'building' },
    ...(can.manageTeam(role) ? [{ to: '/team', label: 'Team', icon: 'users' } as Item] : []),
    { to: '/account', label: 'Account', icon: 'user' },
  ]]);
  return groups;
}

/** The five things used all day, at the bottom of the phone screen. */
function tabs(role: string): Item[] {
  return can.seePrices(role)
    ? [
        { to: '/', label: 'Home', icon: 'home', end: true },
        { to: '/calendar', label: 'Calendar', icon: 'calendar' },
        { to: '/estimates', label: 'Estimates', icon: 'file' },
        { to: '/board', label: 'Jobs', icon: 'board' },
        { to: '/invoices', label: 'Invoices', icon: 'dollar' },
      ]
    : [
        { to: '/', label: 'Home', icon: 'home', end: true },
        { to: '/calendar', label: 'Calendar', icon: 'calendar' },
        { to: '/board', label: 'Jobs', icon: 'board' },
        { to: '/contacts', label: 'Customers', icon: 'users' },
      ];
}

export function Shell() {
  const { org, user, engine } = useReady();
  const { pathname } = useLocation();

  // Photos taken with no signal go up when it's back (and every minute, just in case).
  useEffect(() => {
    const go = () => void uploadPending(engine.db);
    go();
    const t = setInterval(go, 60_000);
    window.addEventListener('online', go);
    return () => { clearInterval(t); window.removeEventListener('online', go); };
  }, [engine]);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [drawer]);

  // One button: on phones it opens the menu; on wide screens it folds the menu to icons.
  const toggleMenu = () => {
    if (window.matchMedia('(min-width: 900px)').matches) {
      const next = !collapsed;
      setCollapsed(next);
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
    } else setDrawer((d) => !d);
  };

  const tabItems = tabs(org.role);

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${drawer ? 'drawer-open' : ''}`}>
      <header className="topbar">
        <button type="button" className="top-icon" onClick={toggleMenu} aria-label={drawer ? 'Close menu' : 'Menu'} aria-expanded={drawer}>
          <Icon name="menu" size={22} />
        </button>
        <NavLink to="/" className="top-brand" aria-label={`${org.name}, dashboard`}>
          <img src="brand/logo.svg" alt="" />
          <span>{org.name}</span>
        </NavLink>
        <SearchBox />
        <QuickAdd />
        <SyncBadge />
        <NavLink to="/account" className="top-icon" aria-label="Account" title={user.email ?? ''}>
          <Icon name="user" size={21} />
        </NavLink>
      </header>

      <aside className="sidebar" aria-label="Main navigation">
        <div className="drawer-head">
          <img src="brand/logo.svg" alt="" />
          <b>{org.name}</b>
          <button type="button" className="top-icon" onClick={() => setDrawer(false)} aria-label="Close menu"><Icon name="close" /></button>
        </div>
        {menu(org.role).map(([group, items]) => (
          <div key={group} className="nav-group">
            <div className="nav-group-label">{group}</div>
            {items.map((it) => (
              <NavLink key={it.to + it.label} to={it.to} end={it.end} title={collapsed ? it.label : undefined}>
                <Icon name={it.icon} />
                <span className="nav-label">{it.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
        <div className="grow" />
        <button type="button" className="nav-collapse" onClick={toggleMenu} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}>
          <Icon name={collapsed ? 'expand' : 'collapse'} />
          <span className="nav-label">Collapse menu</span>
        </button>
      </aside>
      <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />

      <div className="main">
        <Outlet />
      </div>

      <nav className="tabnav" aria-label="Primary" style={{ gridTemplateColumns: `repeat(${tabItems.length}, 1fr)` }}>
        {tabItems.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}>
            <Icon name={it.icon} size={22} />
            {it.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
