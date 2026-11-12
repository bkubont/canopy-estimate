import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export function SignIn({ note }: { note?: string }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const redirectTo = `${location.origin}${location.pathname}${location.hash}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const res =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    if (mode === 'signup' && !res.data.session) setMessage('Check your email to confirm your account, then come back here.');
  }

  async function magicLink() {
    if (!email) return setError('Enter your email first.');
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setBusy(false);
    if (err) return setError(err.message);
    setMessage(`We emailed a sign-in link to ${email}. Open it on this device.`);
  }

  return (
    <div className="center-page">
      <form className="card center-card" onSubmit={submit}>
        <div className="brand">
          <img src="brand/logo.svg" alt="" />
          <div>
            <h2>Advanced Tree Service</h2>
            <span className="muted small">Estimates · Jobs · Invoices</span>
          </div>
        </div>
        {note && <p className="hint">{note}</p>}
        <div className="tabs" role="group" aria-label="Sign in or create account">
          <button type="button" aria-pressed={mode === 'signin'} onClick={() => setMode('signin')}>Sign in</button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => setMode('signup')}>Create account</button>
        </div>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        {message && <p className="hint" role="status">{message}</p>}
        <button type="submit" className="btn primary block" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <p className="small" style={{ textAlign: 'center', marginBottom: 0 }}>
          <button type="button" className="link" onClick={magicLink} disabled={busy}>
            Email me a sign-in link instead
          </button>
        </p>
      </form>
    </div>
  );
}
