import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/session';
import { createOrganization } from '../lib/supabase';

/** Signed in, but not part of any company yet. */
export function Onboarding() {
  const { user, reloadOrgs, signOut } = useApp();
  const [name, setName] = useState('Advanced Tree Service');
  const [yourName, setYourName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const orgId = await createOrganization(name, yourName);
      await reloadOrgs(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="center-page">
      <div className="center-card">
        <form className="card" onSubmit={submit}>
          <h2>Set up your company</h2>
          <p className="muted small">You’ll be the owner. You can invite your team next.</p>
          <label className="field">
            <span>Company name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" />
          </label>
          <label className="field">
            <span>Your name</span>
            <input value={yourName} onChange={(e) => setYourName(e.target.value)} autoCapitalize="words" autoComplete="name" />
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>Create company</button>
        </form>
        <div className="card">
          <b>Joining someone else’s company?</b>
          <p className="muted small">Ask the owner for an invite link sent to {user?.email}, then open it on this device.</p>
          <button type="button" className="btn sm" onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
