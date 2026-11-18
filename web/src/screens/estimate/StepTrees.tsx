import { useState } from 'react';
import { PhotoCount, PhotoStrip } from '../../components/Photos';
import { Icon } from '../../components/Icon';
import { Chips, Field, MultiChips, Sheet, Stepper } from '../../components/ui';
import { blankTree, CONDITIONS, DEBRIS, LOCATIONS, SIZES, SPECIES, treeCount, treeDetails, treeTitle, uid, WORK } from '../../lib/estimate';
import type { Tree } from '../../lib/types';

export function TreeSheet({ tree, isNew, onSave, onDelete, onClose, jobId }: {
  tree: Tree | null; isNew: boolean; onSave: (t: Tree) => void; onDelete?: () => void; onClose: () => void; jobId?: string;
}) {
  const [t, setT] = useState<Tree | null>(tree);
  // Reset when a different tree opens.
  const [openedId, setOpenedId] = useState(tree?.id);
  if (tree?.id !== openedId) {
    setOpenedId(tree?.id);
    setT(tree);
  }
  if (!t) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = <K extends keyof Tree>(k: K, v: Tree[K]) => setT({ ...t, [k]: v });
  const save = () => onSave({ ...t, qty: Math.max(1, t.qty || 1) });
  const extras = [t.location, SIZES.find(([k]) => k === t.size)?.[1], t.condition].filter(Boolean);

  return (
    <Sheet open={!!tree} onClose={onClose} title={isNew ? 'Add tree' : 'Edit tree'}
      action={<button type="button" className="btn primary sm" onClick={save}>Save</button>}>
      <div className="tree-sheet">
        <h4 className="label">Type of tree</h4>
        <Chips label="Type of tree" options={SPECIES} value={SPECIES.includes(t.species) ? t.species : ''} onChange={(v) => set('species', v)} />
        <input className="mt" placeholder="Other type…" aria-label="Other type of tree" autoCapitalize="words"
          value={SPECIES.includes(t.species) ? '' : t.species} onChange={(e) => set('species', e.target.value)} />

        <h4 className="label">Work <small className="muted">choose all that apply</small></h4>
        <MultiChips label="Work" options={WORK} value={t.work} onChange={(v) => set('work', v)} />

        <h4 className="label">How many trees like this?</h4>
        <Stepper label="How many" value={t.qty} min={1} onChange={(v) => set('qty', v)} />

        <details className="more" open={extras.length > 0}>
          <summary>Additional information <span className="muted small">{extras.length ? extras.join(' · ') : 'optional'}</span></summary>
          <h4 className="label">Location</h4>
          <Chips label="Location" options={LOCATIONS} value={t.location} onChange={(v) => set('location', v)} />
          <h4 className="label">Trunk diameter (DBH)</h4>
          <Chips label="Trunk diameter" options={SIZES} value={t.size} onChange={(v) => set('size', v)} />
          <h4 className="label">Condition</h4>
          <Chips label="Condition" options={CONDITIONS} value={t.condition} onChange={(v) => set('condition', v)} />
        </details>

        {jobId && (
          <>
            <h4 className="label">Photo <small className="muted">for planning, never printed</small></h4>
            <PhotoStrip jobId={jobId} treeId={t.id} kind="tree" label="Tree photo" />
          </>
        )}
        <div className="internal mt">
          <Field label="Notes" hint="For the crew: rigging, hazards, where to drop it.">
            <textarea rows={2} value={t.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} />
          </Field>
        </div>
        <button type="button" className="btn primary block mt" onClick={save}>Save tree</button>
        {onDelete && <button type="button" className="btn danger block mt" onClick={() => confirm('Delete this tree?') && onDelete()}>Delete this tree</button>}
      </div>
    </Sheet>
  );
}

export function TreeList({ trees, onChange, jobId }: { trees: Tree[]; onChange: (trees: Tree[]) => void; jobId?: string }) {
  const [editing, setEditing] = useState<{ tree: Tree; index: number } | null>(null);
  return (
    <>
      <div>
        {trees.length ? trees.map((t, i) => (
          <div className="tree-card" key={t.id}>
            <button type="button" className="list-item" onClick={() => setEditing({ tree: t, index: i })}>
              <b>{i + 1}. {treeTitle(t)} {jobId && <PhotoCount jobId={jobId} treeId={t.id} />}</b>
              <span className="muted small">{treeDetails(t) || 'Tap to add details'}</span>
              {t.internal_notes && <div className="small"><span className="internal-tag">internal</span> {t.internal_notes}</div>}
            </button>
            <button type="button" className="btn sm" aria-label={`Copy tree ${i + 1}`}
              onClick={() => setEditing({ tree: { ...t, id: uid(), notes: '', internal_notes: '' }, index: -1 })}>⧉ Copy</button>
          </div>
        )) : <p className="empty">No trees added yet.</p>}
      </div>
      <button type="button" className="btn primary block"
        onClick={() => setEditing({ tree: { ...blankTree(), work: trees.at(-1)?.work ?? [] }, index: -1 })}>
        <Icon name="plus" />Add tree
      </button>
      <TreeSheet
        jobId={jobId}
        tree={editing?.tree ?? null}
        isNew={(editing?.index ?? -1) < 0}
        onClose={() => setEditing(null)}
        onSave={(t) => {
          const next = [...trees];
          if (editing && editing.index >= 0) next[editing.index] = t;
          else next.push(t);
          onChange(next);
          setEditing(null);
        }}
        onDelete={editing && editing.index >= 0 ? () => { onChange(trees.filter((_, i) => i !== editing.index)); setEditing(null); } : undefined}
      />
    </>
  );
}

export function StepTrees({ job, updateJob }: import('./types').StepProps) {
  return (
    <section className="card">
      <div className="sec-head"><h2><Icon name="tree" size={18} />Trees <small className="muted">{treeCount(job.trees)} total</small></h2></div>
      <TreeList jobId={job.id} trees={job.trees} onChange={(trees) => updateJob((j) => ({ ...j, trees }))} />
      <p className="hint">Several the same? Use one line and set “How many”. ⧉ Copy starts a similar tree.</p>
      <h4 className="label">Wood &amp; debris</h4>
      <Chips label="Wood and debris" options={DEBRIS} value={job.site.debris} onChange={(v) => updateJob((j) => ({ ...j, site: { ...j.site, debris: v } }))} />
    </section>
  );
}
