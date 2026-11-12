import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { can, useReady, useRows } from '../lib/session';
import { createInvite, inviteLink, listInvites, revokeInvite, type Invite } from '../lib/supabase';
import type { Member, Role } from '../lib/types';

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including company settings, payments and the team',
  office: 'Estimates, invoices, payments and the calendar',
  crew: 'Calendar, jobs and notes. Cannot see prices.',
};

export function Team() {
  const { engine, org, user } = useReady();
  const members = useRows(engine, 'members');
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('crew');
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<Invite | null>(null);

  const load = useCallback(() => {
    listInvites(org.org_id).then(setInvites).catch((e: Error) => setError(`Couldn’t load invites (${e.message}). Are you online?`));
  }, [org.org_id]);
  useEffect(load, [load]);

  if (!can.manageTeam(org.role)) return <Navigate to="/account" replace />;

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const inv = await createInvite(org.org_id, email, role, user.id);
      setFresh(inv);
      setEmail('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function changeRole(m: Member, next: Role) {
    await engine.save('members', { ...m, role: next });
  }

  async function removeMember(m: Member) {
    if (!confirm(`Remove ${m.display_name || 'this person'} from ${org.name}? They will lose access right away.`)) return;
    await engine.remove('members', m);
  }

  const share = async (link: string) => {
    if (navigator.share) await navigator.share({ title: `Join ${org.name}`, text: `You're invited to join ${org.name}:`, url: link }).catch(() => undefined);
    else await navigator.clipboard.writeText(link);
  };

  return (
    <div className="page">
      <div className="page-head"><h2>Team</h2></div>

      <form className="card" onSubmit={invite}>
        <h3>Invite someone</h3>
        <label className="field"><span>Their email</span>
          <input type="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field"><span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="crew">Crew</option>
            <option value="office">Office</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <p className="muted small">{ROLE_HELP[role]}</p>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn primary">Create invite link</button>
        {fresh && (
          <div className="card" style={{ marginTop: 12, marginBottom: 0 }}>
            <b>Send this link to {fresh.email}</b>
            <p className="muted small">They sign in with that email address and they’re in. The link works once and expires in 14 days.</p>
            <div className="copy-box">
              <input readOnly value={inviteLink(fresh.token)} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
              <button type="button" className="btn sm" onClick={() => void share(inviteLink(fresh.token))}>Share</button>
            </div>
          </div>
        )}
      </form>

      <section className="card">
        <h3>People</h3>
        <div className="list">
          {(members ?? []).map((m) => (
            <div key={m.user_id} className="list-item">
              <div className="row">
                <b>{m.display_name || 'No name'}{m.user_id === user.id ? ' (you)' : ''}</b>
                <span className={`badge ${m.role === 'owner' ? 'owner' : ''}`}>{m.role}</span>
              </div>
              {m.user_id !== user.id && (
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <select value={m.role} onChange={(e) => void changeRole(m, e.target.value as Role)} aria-label="Role" style={{ maxWidth: 160 }}>
                    <option value="crew">Crew</option>
                    <option value="office">Office</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button type="button" className="btn sm danger" onClick={() => void removeMember(m)}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Waiting to join</h3>
        {invites === null ? <p className="muted small">Loading…</p> : invites.length === 0 ? <p className="muted small">No open invites.</p> : (
          <div className="list">
            {invites.map((inv) => (
              <div key={inv.id} className="list-item">
                <div className="row"><b>{inv.email}</b><span className="badge">{inv.role}</span></div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn sm" onClick={() => void share(inviteLink(inv.token))}>Share link again</button>
                  <button type="button" className="btn sm danger" onClick={() => void revokeInvite(inv.id).then(load)}>Cancel invite</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
