import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { can, useReady } from '../lib/session';
import { useCreateEstimate } from '../lib/useCreateEstimate';
import { Icon } from './Icon';

/** The blue "+" in the top bar: start the common things from anywhere. */
export function QuickAdd() {
  const { org } = useReady();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const newEstimate = useCreateEstimate();

  useEffect(() => setOpen(false), [pathname]);
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

  const estimate = async () => {
    setError('');
    try {
      await newEstimate();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="quick-add" ref={wrap}>
      <button type="button" className="btn primary quick-add-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Quick add">
        <Icon name="plus" />
        <span className="quick-add-label">Quick Add</span>
      </button>
      {open && (
        <div className="popover quick-add-menu" role="menu" aria-label="Quick add">
          {can.seePrices(org.role) && (
            <button type="button" role="menuitem" className="pop-item row-item" onClick={() => void estimate()}>
              <Icon name="file" /><span><b>New estimate</b></span>
            </button>
          )}
          <button type="button" role="menuitem" className="pop-item row-item" onClick={() => nav('/calendar', { state: { add: true } })}>
            <Icon name="calendar" /><span><b>Calendar entry</b></span>
          </button>
          <button type="button" role="menuitem" className="pop-item row-item" onClick={() => nav('/contacts/new')}>
            <Icon name="users" /><span><b>New customer</b></span>
          </button>
          {error && <p className="error-text" role="alert" style={{ margin: 10 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
