import { useState } from 'react';
import { platform } from '../lib/install';
import { useReady } from '../lib/session';
import { calendarFeedUrls, myCalendarFeed } from '../lib/supabase';
import { Icon } from './Icon';

/**
 * Account → Calendar on your phone: subscribe to the schedule from the iPhone or
 * Mac Calendar app, or Google Calendar. Each person has their own private link.
 */
export function CalendarLink() {
  const { org } = useReady();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const urls = token ? calendarFeedUrls(token) : null;

  async function get(reset = false) {
    if (busy) return;
    if (reset && !confirm('Make a new link? The old one stops working, so any calendar using it will need the new link.')) return;
    setBusy(true);
    setMsg('');
    try {
      setToken(await myCalendarFeed(org.org_id, reset));
      if (reset) setMsg('New link made. The old one no longer works.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!urls) return;
    try { await navigator.clipboard.writeText(urls.https); setMsg('Link copied.'); } catch { setMsg(urls.https); }
  }

  return (
    <section className="card">
      <h3 className="row-icon"><Icon name="calendar" />Calendar on your phone</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        See the work days, bid visits and rentals in your iPhone or Mac Calendar app (or Google Calendar). It updates by itself,
        usually within the hour. Changes are made here in the app, not in the Calendar app. No prices are included.
      </p>
      {!urls ? (
        <button type="button" className="btn primary" disabled={busy} onClick={() => void get()}><Icon name="calendar" />{busy ? 'Getting your link…' : 'Set up calendar link'}</button>
      ) : (
        <>
          <div className="btn-row">
            <a className="btn primary" href={urls.webcal}><Icon name="calendar" />Add to {platform() === 'iphone' ? 'iPhone' : 'Apple'} Calendar</a>
            <button type="button" className="btn" onClick={() => void copy()}><Icon name="link" />Copy link</button>
          </div>
          <ul className="steps-list small mt">
            <li><b>iPhone or Mac:</b> tap <b>Add to Calendar</b>, then <b>Subscribe</b>.</li>
            <li><b>Google Calendar:</b> on a computer, open Google Calendar → <b>Other calendars</b> → <b>+</b> → <b>From URL</b>, and paste the link. Google updates it more slowly (a few hours).</li>
          </ul>
          <p className="hint">This link is just for you: anyone who has it can see the schedule. If it gets shared, make a new one.</p>
          <button type="button" className="btn sm" disabled={busy} onClick={() => void get(true)}>Make a new link</button>
        </>
      )}
      {msg && <p className="hint" role="status">{msg}</p>}
    </section>
  );
}
