import { useState } from 'react';
import { todayMi, dayLabel } from '../lib/calendar';
import { addNote, noteSummary, parseNotes, removeNote, treeNotes } from '../lib/notes';
import { useReady, useRow } from '../lib/session';
import type { Job } from '../lib/types';
import { Icon } from './Icon';
import { Sheet } from './ui';

/** The notes count in its own color (used for nothing else), so everyone sees there's something to read. */
export function NotesBadge({ count, label }: { count: number; label?: string }) {
  if (!count) return null;
  return <span className="notes-badge" aria-label={label ?? `${count} work-order note${count > 1 ? 's' : ''}`}>{count}</span>;
}

/** Notes button + panel for a signed job. `onChange` gets the job's new internal notes text. */
export function WorkOrderNotes({ job, onChange }: { job: Job; onChange: (internalNotes: string) => void }) {
  const { engine, org, user } = useReady();
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const notes = parseNotes(job.internal_notes);
  const fromTrees = treeNotes(job);
  const { count } = noteSummary(job);

  const add = () => {
    if (!draft.trim()) return;
    onChange(addNote(job.internal_notes, draft, me?.display_name ?? '', dayLabel(todayMi(), { month: 'short', day: 'numeric' })));
    setDraft('');
  };

  return (
    <>
      <button type="button" className={`btn notes-btn ${count ? 'has-notes' : ''}`} onClick={() => setOpen(true)}
        aria-label={count ? `Notes, ${count}` : 'Notes'}>
        <Icon name="message" />
        <span>Notes</span>
        <NotesBadge count={count} label="" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Work-order notes">
        <p className="hint" style={{ marginTop: 0 }}>For the team only. Never printed or sent to the customer.</p>
        {notes.length > 0 ? (
          <ol className="note-list">
            {notes.map((n, i) => (
              <li key={i} className="note">
                <p className="pre">{n.text}</p>
                <div className="note-foot">
                  <span className="muted small">{n.by ? `${n.by} · ${n.when}` : 'From the estimate'}</span>
                  <button type="button" className="icon-btn" aria-label={`Remove note: ${n.text.slice(0, 40)}`} onClick={() => {
                    if (confirm('Remove this note for everyone?')) onChange(removeNote(job.internal_notes, i));
                  }}><Icon name="trash" size={17} /></button>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="muted">No notes yet.</p>}
        {fromTrees.length > 0 && (
          <>
            <h4 className="label">On the trees</h4>
            <ul className="note-list">
              {fromTrees.map((n, i) => (
                <li key={i} className="note"><b>{n.tree}</b><p className="pre">{n.text}</p></li>
              ))}
            </ul>
          </>
        )}
        <label className="field mt">
          <span>Add a note</span>
          <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Gate code, dog in the yard, where to park the chipper…" />
        </label>
        <button type="button" className="btn primary block" onClick={add} disabled={!draft.trim()}>Add note</button>
      </Sheet>
    </>
  );
}
