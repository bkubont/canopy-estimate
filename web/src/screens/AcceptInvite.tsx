import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../lib/session';
import { acceptInvite } from '../lib/supabase';
import { SignIn } from './SignIn';

export function AcceptInvite() {
  const { token = '' } = useParams();
  const { phase, user, reloadOrgs } = useApp();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!token) return <Navigate to="/" replace />;
  if (phase === 'signedOut') {
    return <SignIn note="You’ve been invited to join a company. Sign in, or create an account with the email address the invite was sent to." />;
  }

  async function join() {
    setBusy(true);
    setError('');
    try {
      const orgId = await acceptInvite(token, displayName);
      await reloadOrgs(orgId);
      nav('/calendar', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="center-page">
      <div className="card center-card">
        <h2>Join your team</h2>
        <p className="muted small">Signed in as {user?.email}. The invite must have been sent to this address.</p>
        <label className="field">
          <span>Your name (shown to your team)</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoCapitalize="words" autoComplete="name" />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button type="button" className="btn primary block" onClick={join} disabled={busy}>Join company</button>
      </div>
    </div>
  );
}
