import { useMemo, useState } from 'react';
import {
  blankSmartList, deleteSmartList, filterEquals, filterIsMeaningful, liveSmartLists,
  saveSmartList, togglePinToday,
} from '../lib/crmSmartLists';
import { useReady, useRows } from '../lib/session';
import type { SmartList } from '../lib/types';
import { Field, Sheet } from './ui';
import { Icon } from './Icon';

export interface ActiveFilter {
  query: string;
  stage_slugs: string[];
  tag_refs: SmartList['tag_refs'];
  cold_only: boolean;
}

type Props = {
  active: ActiveFilter;
  activeListId: string | null;
  onApply: (list: SmartList | null) => void;
  /** Hide pin/manage when only picking a list (optional). */
  compact?: boolean;
};

export function SmartListsBar({ active, activeListId, onApply, compact }: Props) {
  const { engine, org, user } = useReady();
  const rows = useRows(engine, 'smart_lists');
  const lists = useMemo(() => liveSmartLists(rows), [rows]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [pinToday, setPinToday] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const matchingSaved = lists.find((l) => filterEquals(l, active));
  const canSave = filterIsMeaningful(active) && !matchingSaved;

  const manage = manageId ? lists.find((l) => l.id === manageId) : null;

  async function onSave() {
    setBusy(true);
    setErr('');
    try {
      const maxSort = lists.reduce((n, l) => Math.max(n, l.sort), -1);
      await saveSmartList(engine, blankSmartList(org.org_id, {
        name,
        query: active.query,
        stage_slugs: active.stage_slugs,
        tag_refs: active.tag_refs,
        cold_only: active.cold_only,
        pin_today: pinToday,
        sort: maxSort + 1,
        created_by: user.id,
      }));
      setSaveOpen(false);
      setName('');
      setPinToday(false);
    } catch (e) {
      setErr((e as Error).message || 'Couldn’t save');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(list: SmartList) {
    if (!confirm(`Delete smart list “${list.name}”?`)) return;
    setBusy(true);
    try {
      await deleteSmartList(engine, list);
      if (activeListId === list.id) onApply(null);
      setManageId(null);
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePin(list: SmartList) {
    setBusy(true);
    try {
      await togglePinToday(engine, list);
    } finally {
      setBusy(false);
    }
  }

  if (!lists.length && !canSave) return null;

  return (
    <div className="crm-smart-lists">
      <div className="chips scroll-x crm-smart-chips" role="group" aria-label="Smart lists">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            className="chip crm-smart-chip"
            aria-pressed={activeListId === l.id || (!!matchingSaved && matchingSaved.id === l.id)}
            onClick={() => onApply(activeListId === l.id ? null : l)}
            onContextMenu={(e) => {
              if (compact) return;
              e.preventDefault();
              setManageId(l.id);
            }}
          >
            {l.pin_today ? <Icon name="pin" size={14} /> : null}
            {l.name}
          </button>
        ))}
        {canSave && (
          <button
            type="button"
            className="chip add"
            onClick={() => {
              setName('');
              setPinToday(false);
              setErr('');
              setSaveOpen(true);
            }}
          >
            <Icon name="plus" size={14} />Save list
          </button>
        )}
        {!compact && lists.length > 0 && (
          <button
            type="button"
            className="chip"
            onClick={() => setManageId(lists[0]!.id)}
            aria-label="Manage smart lists"
          >
            <Icon name="more" size={14} />
          </button>
        )}
      </div>

      <Sheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save smart list"
        action={(
          <button type="button" className="btn primary sm" disabled={busy || !name.trim()} onClick={() => void onSave()}>
            Save
          </button>
        )}
      >
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Annual trim due"
            autoFocus
          />
        </Field>
        <label className="crm-check">
          <input type="checkbox" checked={pinToday} onChange={(e) => setPinToday(e.target.checked)} />
          <span>Pin on Today</span>
        </label>
        {err && <p className="error-text">{err}</p>}
      </Sheet>

      <Sheet
        open={!!manage}
        onClose={() => setManageId(null)}
        title="Smart lists"
      >
        <div className="crm-smart-manage">
          {lists.map((l) => (
            <div key={l.id} className="crm-smart-manage-row">
              <button
                type="button"
                className="btn"
                style={{ flex: 1, justifyContent: 'flex-start' }}
                onClick={() => {
                  onApply(l);
                  setManageId(null);
                }}
              >
                {l.name}
                {l.pin_today ? <span className="muted small"> · Today</span> : null}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={l.pin_today ? 'Unpin from Today' : 'Pin on Today'}
                disabled={busy}
                onClick={() => void onTogglePin(l)}
              >
                <Icon name="pin" size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${l.name}`}
                disabled={busy}
                onClick={() => void onDelete(l)}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
