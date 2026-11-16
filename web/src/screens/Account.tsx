import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { CalendarLink } from '../components/CalendarLink';
import { SignaturePad } from '../components/SignaturePad';
import { useInstall } from '../lib/install';
import { can, useReady, useRow } from '../lib/session';

export function Account() {
  const { engine, org, orgs, user, switchOrg, signOut } = useReady();
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const [name, setName] = useState('');
  useEffect(() => { if (me) setName(me.display_name); }, [me]);
  const app = useInstall();

  return (
    <div className="page">
      <div className="page-head"><h2>Account</h2></div>
      <section className="card install-card">
        <h3 className="row-icon"><Icon name="download" />Install the app</h3>
        {app.installed ? (
          <p className="muted" style={{ margin: 0 }}>You’re using the installed app on this device.</p>
        ) : app.canPrompt ? (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>Gets its own window and icon (Start menu, taskbar or Dock on a computer; home screen on a phone), works offline, and updates itself.</p>
            <button type="button" className="btn primary" onClick={() => void app.install()}><Icon name="download" />Install app</button>
          </>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>Gets its own icon, works offline, and updates itself. On this browser:</p>
            {app.platform === 'iphone' && <p style={{ margin: 0 }}>In Safari, tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.</p>}
            {app.platform === 'mac-safari' && <p style={{ margin: 0 }}>In Safari’s menu bar, choose <b>File → Add to Dock</b>.</p>}
            {app.platform === 'firefox' && <p style={{ margin: 0 }}>Firefox can’t install apps. Open this page in <b>Chrome</b> or <b>Edge</b> and install it from there.</p>}
            {app.platform === 'chromium' && <p style={{ margin: 0 }}>Click the <b>install</b> icon at the right end of the address bar (a small screen with an arrow). In Edge it can also be under <b>⋯ → Apps → Install this site as an app</b>.</p>}
          </>
        )}
      </section>
      <CalendarLink />
      <section className="card">
        <h3>You</h3>
        <p className="muted small" style={{ marginTop: 0 }}>{user.email} · {org.role} at {org.name}</p>
        <label className="field"><span>Your name (shown to your team)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => me && name !== me.display_name && void engine.save('members', { ...me, display_name: name })} />
        </label>
      </section>
      {can.seePrices(org.role) && me && (
        <section className="card">
          <h3>Your signature</h3>
          <p className="muted small" style={{ marginTop: 0 }}>Goes on every estimate you prepare as the contractor signature.</p>
          <SignaturePad value={me.signature_data} onChange={(v) => void engine.save('members', { ...me, signature_data: v })} label="Sign above" />
        </section>
      )}
      <nav className="list" style={{ marginBottom: 12 }}>
        <Link className="list-item" to="/board"><b>Jobs board</b><span className="muted small">Approved, scheduled, in progress, done</span></Link>
        <Link className="list-item" to="/contacts"><b>Contacts</b><span className="muted small">Your team’s shared client list</span></Link>
        <Link className="list-item" to="/company"><b>Company</b><span className="muted small">Details on estimates{can.seePrices(org.role) ? ', day rate, markup' : ''}</span></Link>
        {can.manageTeam(org.role) && <Link className="list-item" to="/team"><b>Team</b><span className="muted small">Invite people and set roles</span></Link>}
      </nav>
      {orgs.length > 1 && (
        <section className="card">
          <h3>Company</h3>
          <select value={org.org_id} onChange={(e) => void switchOrg(e.target.value)} aria-label="Switch company">
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
        </section>
      )}
      <button type="button" className="btn danger block" onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}
