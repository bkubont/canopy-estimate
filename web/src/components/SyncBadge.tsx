import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useReady, useSyncStatus } from '../lib/session';

function ago(iso: string | null) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString();
}

/** Always-visible answer to "is my work saved to the server yet?" */
export function SyncBadge() {
  const { engine } = useReady();
  const st = useSyncStatus(engine);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  let label = 'Synced';
  if (st.failed.length) label = `${st.failed.length} not saved`;
  else if (st.state === 'syncing') label = 'Syncing…';
  else if (st.pending) label = `${st.pending} waiting`;
  else if (st.state === 'offline') label = 'Offline';
  const cls = st.failed.length || st.state === 'error' ? 'error' : st.state === 'offline' ? 'offline' : st.state;

  return (
    <span ref={wrap}>
      <button type="button" className={`sync-pill ${cls}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="dot" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <div className="sync-popover" role="dialog" aria-label="Sync status" style={{ position: 'absolute', right: 12, top: 'calc(var(--appbar-h) + 4px)', width: 'min(340px, calc(100vw - 24px))', zIndex: 30 }}>
          <div className={`card ${st.failed.length ? 'sync-panel' : ''}`}>
            <p style={{ marginTop: 0 }}>
              {st.state === 'offline'
                ? 'No connection. Everything is saved on this device and will upload when you’re back online.'
                : st.pending
                  ? `${st.pending} change(s) waiting to upload.`
                  : 'Everything on this device is saved to the server.'}
            </p>
            <p className="muted small">Last synced: {ago(st.lastSyncedAt)}</p>
            {st.failed.map((f) => (
              <div key={f.id} className="card" style={{ marginBottom: 8 }}>
                <b className="small">A change to {f.table.replace('_', ' ')} was refused</b>
                <p className="error-text">{f.error}</p>
                <button type="button" className="btn sm" onClick={() => void engine.discardFailed(f.id)}>
                  Discard it and restore the saved version
                </button>
              </div>
            ))}
            <div className="btn-row">
              <button type="button" className="btn sm primary" onClick={() => void engine.sync()}>Sync now</button>
              <button type="button" className="btn sm" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
