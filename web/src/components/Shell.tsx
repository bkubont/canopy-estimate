import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { saveMissingDocuments } from '../lib/documents';
import { CRM_ENABLED } from '../lib/features';
import { uploadPending } from '../lib/photos';
import { can, useReady } from '../lib/session';
import { Bell } from './Bell';
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
  // Estimates (drafts + awaiting signature) sit with Work; signed pipeline is Jobs board.
  const work: Item[] = [
    { to: '/', label: 'Dashboard', icon: 'home', end: true },
    { to: '/board', label: 'Jobs board', icon: 'board' },
    { to: '/calendar', label: 'Calendar', icon: 'calendar' },
    ...(office
      ? [{ to: '/estimates', label: 'Estimates', icon: 'file' } as Item]
      : [{ to: '/estimates', label: 'Job details', icon: 'file' } as Item]),
    { to: '/contacts', label: 'Customers', icon: 'users' },
    ...(CRM_ENABLED && office ? [{ to: '/today', label: 'Today', icon: 'bell' } as Item] : []),
    { to: '/archive', label: 'Archive', icon: 'archive' },
  ];
  const groups: [string, Item[]][] = [['Work', work]];
  if (office) {
    // Expenses inbox covers the list + receipt photos (type filter on the screen).
    groups.push(['Money', [
      { to: '/invoices', label: 'Invoices', icon: 'dollar' },
      { to: '/expenses', label: 'Expenses', icon: 'wallet' },
      { to: '/reports', label: 'Reports', icon: 'chart' },
    ]]);
  }
  groups.push(['Settings', [
    { to: '/company', label: 'Company', icon: 'building' },
    ...(can.manageTeam(role) ? [{ to: '/team', label: 'Team', icon: 'users' } as Item] : []),
    ...(CRM_ENABLED && office ? [{ to: '/tags', label: 'Tags', icon: 'settings' } as Item] : []),
    { to: '/account', label: 'Account', icon: 'user' },
  ]]);
  return groups;
}

/** Phone tabs: Calendar + Jobs + money for office; Estimates stays in the side Work menu. */
function tabs(role: string): Item[] {
  return can.seePrices(role)
    ? [
        { to: '/', label: 'Home', icon: 'home', end: true },
        { to: '/calendar', label: 'Calendar', icon: 'calendar' },
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

  // Save PDF copies of signed estimates and sent/paid invoices once they're on the
  // server (owner/office only). Runs a few seconds after each sync, a few at a time.
  useEffect(() => {
    if (!can.seePrices(org.role)) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = engine.status.lastSyncedAt;
    const go = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void saveMissingDocuments(engine, org.role).then((n) => { if (n) go(); });
      }, 5_000);
    };
    go();
    const off = engine.subscribe(() => {
      if (engine.status.lastSyncedAt !== last) {
        last = engine.status.lastSyncedAt;
        go();
      }
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [engine, org.role]);
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
        <Bell />
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
