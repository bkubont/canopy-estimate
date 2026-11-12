import { useMemo, useState } from 'react';
import { Chips, Field, MultiChips, Sheet, Stepper } from '../../components/ui';
import {
  ALL_SPECIES, blankTree, CONDITIONS, DEFAULT_COMMON_SPECIES, LOCATIONS, SIZES, SPECIES_GROUPS, treeCount, treeDetails, treeTitle, uid, WORK,
} from '../../lib/estimate';
import { useReady, useRows } from '../../lib/session';
import type { Tree } from '../../lib/types';

/** The company's 8 most-used species, so the usual ones are one tap away. */
function useCommonSpecies() {
  const { engine } = useReady();
  const jobs = useRows(engine, 'jobs');
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs ?? []) for (const t of j.trees ?? []) if (t.species) counts.set(t.species, (counts.get(t.species) ?? 0) + (t.qty || 1));
    const used = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).filter((s) => ALL_SPECIES.includes(s));
    return [...new Set([...used, ...DEFAULT_COMMON_SPECIES])].slice(0, 8);
  }, [jobs]);
}

export function TreeSheet({ tree, isNew, onSave, onDelete, onClose }: {
  tree: Tree | null; isNew: boolean; onSave: (t: Tree) => void; onDelete?: () => void; onClose: () => void;
}) {
  const [t, setT] = useState<Tree | null>(tree);
  const [more, setMore] = useState(false);
  const common = useCommonSpecies();
  // Reset when a different tree opens.
  const [openedId, setOpenedId] = useState(tree?.id);
  if (tree?.id !== openedId) {
    setOpenedId(tree?.id);
    setT(tree);
    setMore(!!tree?.species && !common.includes(tree.species));
  }
  if (!t) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = <K extends keyof Tree>(k: K, v: Tree[K]) => setT({ ...t, [k]: v });
  const save = () => onSave({ ...t, qty: Math.max(1, t.qty || 1) });

  return (
    <Sheet open={!!tree} onClose={onClose} title={isNew ? 'Add tree' : 'Edit tree'}
      action={<button type="button" className="btn primary sm" onClick={save}>Save</button>}>
      <h4 className="label">Type of tree</h4>
      <Chips label="Common species" options={common} value={common.includes(t.species) ? t.species : ''} onChange={(v) => set('species', v)} />
      {more ? SPECIES_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="chip-group-label">{g.label}</div>
          <Chips label={g.label} options={g.options.filter((s) => !common.includes(s))} value={t.species} onChange={(v) => set('species', v)} />
        </div>
      )) : (
        <button type="button" className="link mt" onClick={() => setMore(true)}>More species…</button>
      )}
      <input className="mt" placeholder="Other type…" aria-label="Other type of tree" autoCapitalize="words"
        value={ALL_SPECIES.includes(t.species) ? '' : t.species} onChange={(e) => set('species', e.target.value)} />

      <h4 className="label">Work <small className="muted">choose all that apply</small></h4>
      <MultiChips label="Work" options={WORK} value={t.work} onChange={(v) => set('work', v)} />
      <h4 className="label">Location</h4>
      <Chips label="Location" options={LOCATIONS} value={t.location} onChange={(v) => set('location', v)} />
      <h4 className="label">Trunk diameter (DBH)</h4>
      <Chips label="Trunk diameter" options={SIZES} value={t.size} onChange={(v) => set('size', v)} />
      <h4 className="label">Condition</h4>
      <Chips label="Condition" options={CONDITIONS} value={t.condition} onChange={(v) => set('condition', v)} />
      <h4 className="label">How many trees like this?</h4>
      <Stepper label="How many" value={t.qty} min={1} onChange={(v) => set('qty', v)} />
      <div className="mt" />
      <Field label="Notes" hint="Printed on the estimate.">
        <textarea rows={2} value={t.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <div className="internal">
        <Field label="Internal notes" hint="For the crew: rigging, hazards, where to drop it.">
          <textarea rows={2} value={t.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} />
        </Field>
      </div>
      <button type="button" className="btn primary block" onClick={save}>Save tree</button>
      {onDelete && <button type="button" className="btn danger block mt" onClick={() => confirm('Delete this tree?') && onDelete()}>Delete this tree</button>}
    </Sheet>
  );
}

export function TreeList({ trees, onChange }: { trees: Tree[]; onChange: (trees: Tree[]) => void }) {
  const [editing, setEditing] = useState<{ tree: Tree; index: number } | null>(null);
  return (
    <>
      <div>
        {trees.length ? trees.map((t, i) => (
          <div className="tree-card" key={t.id}>
            <button type="button" className="list-item" onClick={() => setEditing({ tree: t, index: i })}>
              <b>{i + 1}. {treeTitle(t)}</b>
              <span className="muted small">{treeDetails(t) || 'Tap to add details'}</span>
              {t.notes && <div className="small">{t.notes}</div>}
              {t.internal_notes && <div className="small"><span className="internal-tag">internal</span> {t.internal_notes}</div>}
            </button>
            <button type="button" className="btn sm" aria-label={`Copy tree ${i + 1}`}
              onClick={() => setEditing({ tree: { ...t, id: uid(), notes: '', internal_notes: '' }, index: -1 })}>⧉ Copy</button>
          </div>
        )) : <p className="empty">No trees added yet.</p>}
      </div>
      <button type="button" className="btn primary block" style={{ minHeight: 56 }}
        onClick={() => setEditing({ tree: { ...blankTree(), work: trees.at(-1)?.work ?? [] }, index: -1 })}>
        ＋ Add tree
      </button>
      <TreeSheet
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
    <div>
      <h2 className="step-title">Trees <small className="muted">{treeCount(job.trees)} total</small></h2>
      <p className="hint">One line per kind of tree. Several the same? Use one line and set “How many”. ⧉ Copy starts a similar tree.</p>
      <TreeList trees={job.trees} onChange={(trees) => updateJob((j) => ({ ...j, trees }))} />
    </div>
  );
}
