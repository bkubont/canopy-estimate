/**
 * Settings → Tags: manage CRM tag groups and tags.
 * Slugs stay frozen after create so People / Today / smart lists keep working.
 */

import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Field, Sheet } from '../../components/ui';
import { CRM_ENABLED } from '../../lib/features';
import {
  createTag,
  createTagGroup,
  deleteTag,
  deleteTagGroup,
  groupModeLabel,
  isProtectedGroup,
  isProtectedTag,
  liveGroups,
  liveTagsForGroup,
  moveTag,
  recolorTag,
  renameTag,
  renameTagGroup,
  TAG_COLOR_OPTIONS,
  updateTagGroupSettings,
} from '../../lib/crmTagEditor';
import { can, useReady, useRows } from '../../lib/session';
import type { Tag, TagGroup, TagGroupMode } from '../../lib/types';

export function TagEditor() {
  const { engine, org } = useReady();
  const groupsRows = useRows(engine, 'tag_groups');
  const tagsRows = useRows(engine, 'tags');
  const groups = useMemo(() => liveGroups(groupsRows), [groupsRows]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editGroup, setEditGroup] = useState<TagGroup | null>(null);
  const [editTag, setEditTag] = useState<{ tag: Tag; group: TagGroup } | null>(null);
  const [addGroup, setAddGroup] = useState(false);
  const [addTagFor, setAddTagFor] = useState<TagGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!CRM_ENABLED || !can.seePrices(org.role)) return <Navigate to="/account" replace />;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message || 'Couldn’t save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Tags</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            Customer stages, types, and flags. Renaming keeps filters and Today working.
          </p>
        </div>
        <button type="button" className="btn sm" onClick={() => setAddGroup(true)} disabled={busy}>
          <Icon name="plus" size={16} /> New group
        </button>
      </div>

      {err && <p className="error-text" role="alert">{err}</p>}

      {groups.map((g) => {
        const tags = liveTagsForGroup(tagsRows, g.id);
        const open = openId === g.id;
        return (
          <section className="card tag-ed-group" key={g.id}>
            <button
              type="button"
              className="tag-ed-head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : g.id)}
            >
              <div>
                <b>{g.name}</b>
                <span className="muted small">{groupModeLabel(g)}{g.allow_new ? ' · crew can add' : ''}</span>
              </div>
              <Icon name={open ? 'chevronUp' : 'chevronDown'} />
            </button>

            <div className="chips tag-ed-preview" aria-hidden={open}>
              {tags.map((t) => (
                <span key={t.id} className="chip" style={{ pointerEvents: 'none' }}>
                  {t.color ? <i className="tag-ed-dot" style={{ background: t.color }} /> : null}
                  {t.name}
                </span>
              ))}
              {!tags.length && <span className="muted small">No tags yet</span>}
            </div>

            {open && (
              <div className="tag-ed-body">
                <div className="btn-row" style={{ marginBottom: 10 }}>
                  <button type="button" className="btn sm" onClick={() => setEditGroup(g)} disabled={busy}>
                    Edit group
                  </button>
                  <button type="button" className="btn sm" onClick={() => setAddTagFor(g)} disabled={busy}>
                    <Icon name="plus" size={14} /> Add tag
                  </button>
                  {!isProtectedGroup(g) && (
                    <button
                      type="button"
                      className="btn sm danger"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Delete group “${g.name}” and its tags?`)) return;
                        void run(async () => {
                          await deleteTagGroup(engine, g, tagsRows ?? []);
                          setOpenId(null);
                        });
                      }}
                    >
                      Delete group
                    </button>
                  )}
                </div>

                <ul className="tag-ed-list">
                  {tags.map((t, i) => (
                    <li key={t.id} className="tag-ed-row">
                      <button
                        type="button"
                        className="tag-ed-tag"
                        onClick={() => setEditTag({ tag: t, group: g })}
                        disabled={busy}
                      >
                        {t.color ? <i className="tag-ed-dot" style={{ background: t.color }} /> : <i className="tag-ed-dot empty" />}
                        <span>{t.name}</span>
                        {isProtectedTag(t, g) && <span className="badge">Locked</span>}
                      </button>
                      <div className="tag-ed-move">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Move ${t.name} up`}
                          disabled={busy || i === 0}
                          onClick={() => void run(() => moveTag(engine, t, -1, tags))}
                        >
                          <Icon name="chevronUp" size={18} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Move ${t.name} down`}
                          disabled={busy || i === tags.length - 1}
                          onClick={() => void run(() => moveTag(engine, t, 1, tags))}
                        >
                          <Icon name="chevronDown" size={18} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      {!groups.length && (
        <p className="empty">No tag groups yet. Sync once, or add a group.</p>
      )}

      {editGroup && (
        <GroupSheet
          group={editGroup}
          busy={busy}
          onClose={() => setEditGroup(null)}
          onSave={(name, mode, allowNew) => run(async () => {
            const renamed = await renameTagGroup(engine, editGroup, name);
            await updateTagGroupSettings(engine, renamed, { mode, allow_new: allowNew });
            setEditGroup(null);
          })}
        />
      )}

      {editTag && (
        <TagSheet
          tag={editTag.tag}
          group={editTag.group}
          busy={busy}
          onClose={() => setEditTag(null)}
          onSave={(name, color) => run(async () => {
            const renamed = await renameTag(engine, editTag.tag, name);
            await recolorTag(engine, renamed, color);
            setEditTag(null);
          })}
          onDelete={() => run(async () => {
            await deleteTag(engine, editTag.tag, editTag.group);
            setEditTag(null);
          })}
        />
      )}

      {addGroup && (
        <NewGroupSheet
          busy={busy}
          onClose={() => setAddGroup(false)}
          onSave={(name, mode, allowNew) => run(async () => {
            const row = await createTagGroup(engine, org.org_id, {
              name, mode, allow_new: allowNew, existing: groupsRows ?? [],
            });
            setAddGroup(false);
            setOpenId(row.id);
          })}
        />
      )}

      {addTagFor && (
        <NewTagSheet
          group={addTagFor}
          busy={busy}
          onClose={() => setAddTagFor(null)}
          onSave={(name, color) => run(async () => {
            await createTag(engine, org.org_id, {
              group: addTagFor, name, color, existing: tagsRows ?? [],
            });
            setAddTagFor(null);
          })}
        />
      )}
    </div>
  );
}

function GroupSheet({
  group, busy, onClose, onSave,
}: {
  group: TagGroup;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, mode: TagGroupMode, allowNew: boolean) => void;
}) {
  const locked = isProtectedGroup(group);
  const [name, setName] = useState(group.name);
  const [mode, setMode] = useState<TagGroupMode>(group.mode);
  const [allowNew, setAllowNew] = useState(group.allow_new);

  return (
    <Sheet
      open
      onClose={onClose}
      title={locked ? 'Edit Stage group' : 'Edit group'}
      action={(
        <button
          type="button"
          className="btn primary sm"
          disabled={busy || !name.trim()}
          onClick={() => onSave(name, mode, allowNew)}
        >
          Save
        </button>
      )}
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      {locked ? (
        <p className="muted small">Stage stays pick-one (pipeline). Slug stays <code>{group.slug}</code> so Today and smart lists keep working.</p>
      ) : (
        <>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Mode</div>
          <div className="chips" role="group" aria-label="Mode">
            <button type="button" className="chip" aria-pressed={mode === 'one'} onClick={() => setMode('one')}>Pick one</button>
            <button type="button" className="chip" aria-pressed={mode === 'many'} onClick={() => setMode('many')}>Pick many</button>
          </div>
          <label className="crm-check">
            <input type="checkbox" checked={allowNew} onChange={(e) => setAllowNew(e.target.checked)} />
            Allow adding new tags from a customer card
          </label>
          <p className="muted small" style={{ marginTop: 12 }}>Slug <code>{group.slug}</code> is fixed (used by smart lists).</p>
        </>
      )}
    </Sheet>
  );
}

function TagSheet({
  tag, group, busy, onClose, onSave, onDelete,
}: {
  tag: Tag;
  group: TagGroup;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
  onDelete: () => void;
}) {
  const locked = isProtectedTag(tag, group);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color || '');

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit tag"
      action={(
        <button
          type="button"
          className="btn primary sm"
          disabled={busy || !name.trim()}
          onClick={() => onSave(name, color)}
        >
          Save
        </button>
      )}
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Color</div>
      <div className="chips tag-ed-colors" role="group" aria-label="Color">
        {TAG_COLOR_OPTIONS.map((c) => (
          <button
            key={c || 'none'}
            type="button"
            className="tag-ed-swatch"
            aria-pressed={color === c}
            aria-label={c || 'No color'}
            style={c ? { background: c } : undefined}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        Slug <code>{tag.slug}</code> is fixed{locked ? ' (People / Today depend on it)' : ' (smart lists use it)'}.
      </p>
      {!locked && (
        <button
          type="button"
          className="btn danger block"
          style={{ marginTop: 16 }}
          disabled={busy}
          onClick={() => {
            if (!confirm(`Delete tag “${tag.name}”?`)) return;
            onDelete();
          }}
        >
          Delete tag
        </button>
      )}
    </Sheet>
  );
}

function NewGroupSheet({
  busy, onClose, onSave,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, mode: TagGroupMode, allowNew: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<TagGroupMode>('many');
  const [allowNew, setAllowNew] = useState(false);

  return (
    <Sheet
      open
      onClose={onClose}
      title="New tag group"
      action={(
        <button
          type="button"
          className="btn primary sm"
          disabled={busy || !name.trim()}
          onClick={() => onSave(name, mode, allowNew)}
        >
          Add
        </button>
      )}
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Referral partners" autoFocus />
      </Field>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Mode</div>
      <div className="chips" role="group" aria-label="Mode">
        <button type="button" className="chip" aria-pressed={mode === 'one'} onClick={() => setMode('one')}>Pick one</button>
        <button type="button" className="chip" aria-pressed={mode === 'many'} onClick={() => setMode('many')}>Pick many</button>
      </div>
      <label className="crm-check">
        <input type="checkbox" checked={allowNew} onChange={(e) => setAllowNew(e.target.checked)} />
        Allow adding new tags from a customer card
      </label>
    </Sheet>
  );
}

function NewTagSheet({
  group, busy, onClose, onSave,
}: {
  group: TagGroup;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(group.pipeline ? '#2a72d4' : '');

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Add to ${group.name}`}
      action={(
        <button
          type="button"
          className="btn primary sm"
          disabled={busy || !name.trim()}
          onClick={() => onSave(name, color)}
        >
          Add
        </button>
      )}
    >
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Color</div>
      <div className="chips tag-ed-colors" role="group" aria-label="Color">
        {TAG_COLOR_OPTIONS.map((c) => (
          <button
            key={c || 'none'}
            type="button"
            className="tag-ed-swatch"
            aria-pressed={color === c}
            aria-label={c || 'No color'}
            style={c ? { background: c } : undefined}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
    </Sheet>
  );
}
