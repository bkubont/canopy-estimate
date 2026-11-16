import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { todayMi, ymdOf } from '../lib/calendar';
import { bellItems, type NoteKind } from '../lib/notifications';
import { can, useReady, useRow, useRows } from '../lib/session';
import { Icon, type IconName } from './Icon';

const ICON: Record<NoteKind, IconName> = { signed: 'pen', change_order: 'pen', payment: 'dollar', overdue: 'alert', blocked: 'alert', hours: 'clock' };
const seenKey = (userId: string) => `canopy.bellSeen.${userId}`;
const readSeen = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeSeen = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

function when(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
  if (ymdOf(new Date(iso)) === todayMi()) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Detroit' });
}

/** The bell in the top bar: a dot and a count for anything new since you last looked. */
export function Bell() {
  const { engine, org, user } = useReady();
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const jobs = useRows(engine, 'jobs');
  const payments = useRows(engine, 'payments');
  const invoices = useRows(engine, 'invoices');
  const events = useRows(engine, 'events');
  const timeEntries = useRows(engine, 'time_entries');
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0); // re-check every minute (the 4 pm reminder)
  const key = seenKey(user.id);
  // First time on this device: start fresh rather than ring for the last two weeks.
  const [seen, setSeen] = useState(() => readSeen(key) ?? (writeSeen(key, new Date().toISOString()), new Date().toISOString()));
  const wrap = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const items = useMemo(() => bellItems({
    jobs, payments, invoices, events, timeEntries, me: { id: user.id, name: me?.display_name ?? '' }, office: can.seePrices(org.role), today: todayMi(),
    // Whatever just synced counts as now, even if this device's clock is a little behind.
    nowIso: new Date(Date.now() + 5 * 60_000).toISOString(),
  }), [jobs, payments, invoices, events, timeEntries, user.id, me?.display_name, org.role, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const unread = items.filter((i) => i.at > seen).length;

  const toggle = () => {
    if (!open) {
      // Opening the list counts as having seen everything in it.
      const t = new Date().toISOString();
      writeSeen(key, t);
      setTimeout(() => setSeen(t), 4000); // keep the "new" marks visible while the list is open
    }
    setOpen(!open);
  };

  return (
    <div className="bell" ref={wrap}>
      <button type="button" className="top-icon" onClick={toggle} aria-expanded={open} aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}>
        <Icon name="bell" size={21} />
        {unread > 0 && <span className="bell-dot" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover bell-pop" role="dialog" aria-label="Notifications">
          <div className="bell-head"><b>Notifications</b><span className="muted small">Last two weeks</span></div>
          {items.length ? items.map((n) => (
            <button key={n.id} type="button" className={`pop-item bell-item ${n.at > seen ? 'new' : ''}`} onClick={() => { setOpen(false); nav(n.to); }}>
              <span className={`bell-ico k-${n.kind}`}><Icon name={ICON[n.kind]} size={16} /></span>
              <span className="bell-text"><span>{n.text}</span><span className="muted small">{when(n.at)}</span></span>
            </button>
          )) : <p className="muted small" style={{ margin: 12 }}>Nothing new. Signed estimates, payments, overdue invoices and blocked jobs show up here.</p>}
        </div>
      )}
    </div>
  );
}
