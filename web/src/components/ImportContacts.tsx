import { useMemo, useRef, useState } from 'react';
import { planImport, toCustomer, type ImportRow } from '../lib/contactsImport';
import { useReady, useRows } from '../lib/session';
import { parseVCards } from '../lib/vcard';
import { Icon } from './Icon';
import { Sheet } from './ui';

/** Customers → Import: pick a contacts file from the iPhone, check the list, import. */
export function ImportContacts() {
  const { engine, org } = useReady();
  const customers = useRows(engine, 'customers');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState('');
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const fresh = useMemo(() => (rows ?? []).filter((r) => !r.already), [rows]);

  async function read(f: File) {
    setMsg('');
    const cards = parseVCards(await f.text());
    if (!cards.length) return setMsg('No contacts found in that file. It should be a contact card (.vcf) file.');
    const plan = planImport(cards, customers ?? []);
    setRows(plan);
    setPicked(new Set(plan.filter((r) => !r.already).map((r) => r.key)));
  }
  async function importNow() {
    if (saving) return; // a second tap while saving would add everyone twice
    setSaving(true);
    try {
      const chosen = (rows ?? []).filter((r) => picked.has(r.key));
      for (const r of chosen) await engine.save('customers', toCustomer(r.client, org.org_id));
      setDone(`${chosen.length} contact${chosen.length === 1 ? '' : 's'} added to Customers.`);
      setRows(null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }
  const name = (r: ImportRow) => [r.client.firstName, r.client.lastName].filter(Boolean).join(' ') || r.client.company || 'No name';
  const toggle = (k: number) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <>
      <button type="button" className="btn" onClick={() => { setOpen(true); setRows(null); setDone(''); }}><Icon name="contact" />Import</button>
      {done && <p className="hint" role="status" style={{ flexBasis: '100%' }}>{done}</p>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Import contacts">
        {!rows ? (
          <>
            <p style={{ marginTop: 0 }}>On your iPhone:</p>
            <ol className="steps-list">
              <li>Open <b>Contacts</b> and tap <b>Lists</b> (top left).</li>
              <li>Press and hold a list (for example <b>All Contacts</b>, or one you made for customers) and choose <b>Export</b>.</li>
              <li>Save the file to <b>Files</b>.</li>
              <li>Come back here, tap <b>Choose contacts file</b> and pick that file.</li>
            </ol>
            <p className="hint">For one person: open them in Contacts → Share Contact → Save to Files. Anyone already in Customers is skipped.</p>
            <button type="button" className="btn primary block" onClick={() => file.current?.click()}><Icon name="contact" />Choose contacts file</button>
            <input ref={file} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden aria-label="Contacts file"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f); }} />
            {msg && <p className="error-text" role="alert">{msg}</p>}
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}><b>{rows.length}</b> in the file · <b>{fresh.length}</b> new · <b>{rows.length - fresh.length}</b> already in Customers</p>
            <div className="btn-row" style={{ marginBottom: 8 }}>
              <button type="button" className="btn sm" onClick={() => setPicked(new Set(fresh.map((r) => r.key)))}>Select all new</button>
              <button type="button" className="btn sm" onClick={() => setPicked(new Set())}>Select none</button>
            </div>
            <ul className="import-list">
              {rows.map((r) => (
                <li key={r.key} className={r.already ? 'is-dup' : ''}>
                  <label className="check" style={{ margin: 0 }}>
                    <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} aria-label={`Import ${name(r)}`} />
                    <span>
                      <b>{name(r)}</b>
                      <span className="muted small" style={{ display: 'block' }}>{[r.client.phone, r.client.email, r.client.town].filter(Boolean).join(' · ') || 'No phone or email'}</span>
                      {r.already && <span className="small dup-note">Already in Customers as {r.already}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" className="btn primary block mt" onClick={() => void importNow()} disabled={!picked.size || saving}>
              {saving ? 'Importing…' : `Import ${picked.size} contact${picked.size === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="btn block mt" onClick={() => setRows(null)}>Choose a different file</button>
          </>
        )}
      </Sheet>
    </>
  );
}
