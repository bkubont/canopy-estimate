import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { num } from '../lib/estimate';

type Opt<T> = T | [T, string];
const optVal = <T,>(o: Opt<T>) => (Array.isArray(o) ? o[0] : o);
const optLabel = <T,>(o: Opt<T>) => String(Array.isArray(o) ? o[1] : o);

/** Big tap targets for one choice. Tapping the chosen chip again clears it unless required. */
export function Chips<T extends string | number>({ options, value, onChange, required, label }: {
  options: Opt<T>[]; value: T | '' | null; onChange: (v: T | '') => void; required?: boolean; label?: string;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const v = optVal(o);
        const on = value !== '' && value != null && String(value) === String(v);
        return (
          <button key={String(v)} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on && !required ? '' : v)}>
            {optLabel(o)}
          </button>
        );
      })}
    </div>
  );
}

export function MultiChips({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; label?: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; label: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, num(value) - step))}>−</button>
      <input type="number" inputMode="decimal" aria-label={label} min={min} step={step} value={value}
        onChange={(e) => onChange(e.target.value === '' ? min : Math.max(min, num(e.target.value)))} />
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(num(value) + step)}>＋</button>
    </div>
  );
}

export function MoneyInput({ value, onChange, label, placeholder = '0' }: { value: number | null | ''; onChange: (v: number | null) => void; label: string; placeholder?: string }) {
  return (
    <div className="price-input">
      <span>$</span>
      <input type="number" inputMode="decimal" min={0} step="0.01" aria-label={label} placeholder={placeholder}
        value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : num(e.target.value))} />
    </div>
  );
}

/** Bottom sheet on phones, centered dialog on bigger screens. */
export function Sheet({ open, onClose, title, children, action }: { open: boolean; onClose: () => void; title: string; children: ReactNode; action?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <>
          <div className="sheet-head">
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
            <h3>{title}</h3>
            {action ?? <span />}
          </div>
          <div className="sheet-body">{children}</div>
        </>
      )}
    </dialog>
  );
}

/** Renders children only when printing (the app itself is hidden). */
export function PrintOnly({ children }: { children: ReactNode }) {
  return createPortal(<div className="print-only">{children}</div>, document.body);
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
