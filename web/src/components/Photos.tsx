import { useMemo, useRef, useState } from 'react';
import { dayLabel, ymdOf } from '../lib/calendar';
import { addPhoto, usePhotoSrc } from '../lib/photos';
import { useReady, useRow, useRows } from '../lib/session';
import type { Photo, PhotoKind } from '../lib/types';
import { Icon } from './Icon';
import { Sheet } from './ui';

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = { tree: 'Tree', before: 'Before', during: 'During', after: 'After', receipt: 'Receipt' };

/** Live photos for a job (optionally one tree or one kind), oldest first. */
export function usePhotos(filter: { jobId?: string | null; treeId?: string; kind?: PhotoKind }) {
  const { engine } = useReady();
  const photos = useRows(engine, 'photos');
  return useMemo(() => (photos ?? [])
    .filter((p) => !p.deleted_at && (filter.jobId === undefined || p.job_id === filter.jobId) && (!filter.treeId || p.tree_id === filter.treeId) && (!filter.kind || p.kind === filter.kind))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')), [photos, filter.jobId, filter.treeId, filter.kind]);
}

function Thumb({ photo, onOpen }: { photo: Photo; onOpen: () => void }) {
  const { engine } = useReady();
  const src = usePhotoSrc(engine.db, photo);
  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label={`${PHOTO_KIND_LABEL[photo.kind]} photo${photo.taken_by_name ? ` by ${photo.taken_by_name}` : ''}`}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className="thumb-wait">Uploading…</span>}
    </button>
  );
}

/** Full-size view with who took it and when; anyone on the team can remove it. */
function PhotoViewer({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  const { engine } = useReady();
  const src = usePhotoSrc(engine.db, photo);
  return (
    <Sheet open={!!photo} onClose={onClose} title={photo ? `${PHOTO_KIND_LABEL[photo.kind]} photo` : ''}>
      {photo && (
        <>
          {src ? <img className="photo-full" src={src} alt={`${PHOTO_KIND_LABEL[photo.kind]} photo`} /> : <p className="muted">This photo is still uploading from {photo.taken_by_name || 'another phone'}.</p>}
          <p className="muted small">{[photo.taken_by_name, photo.created_at ? dayLabel(ymdOf(new Date(photo.created_at))) : ''].filter(Boolean).join(' · ')}</p>
          <button type="button" className="btn danger block" onClick={async () => {
            if (!confirm('Remove this photo for everyone?')) return;
            await engine.save('photos', { ...photo, deleted_at: new Date().toISOString() });
            onClose();
          }}><Icon name="trash" />Remove photo</button>
        </>
      )}
    </Sheet>
  );
}

/**
 * A row of thumbnails plus a camera button. On a phone the button offers
 * "Take Photo" or the photo library; several can be picked at once.
 */
export function PhotoStrip({ jobId, treeId, kind, label, readOnly }: { jobId: string; treeId?: string; kind: PhotoKind; label: string; readOnly?: boolean }) {
  const { engine, org, user } = useReady();
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const photos = usePhotos({ jobId, treeId, kind });
  const [open, setOpen] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    try {
      for (const f of Array.from(files)) {
        await addPhoto(engine, f, { org_id: org.org_id, job_id: jobId, tree_id: treeId ?? null, kind, taken_by: user.id, taken_by_name: me?.display_name ?? '' });
      }
    } catch (e) {
      setError((e as Error).message || 'That picture couldn’t be added.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="photo-strip">
      {photos.map((p) => <Thumb key={p.id} photo={p} onOpen={() => setOpen(p)} />)}
      {!readOnly && <label className={`thumb add ${busy ? 'busy' : ''}`}>
        <Icon name="camera" size={22} />
        <span>{busy ? 'Adding…' : photos.length ? 'Add' : label}</span>
        <input ref={input} type="file" accept="image/*" multiple className="sr-only" aria-label={`Add ${label.toLowerCase()}`} onChange={(e) => void add(e.target.files)} disabled={busy} />
      </label>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <PhotoViewer photo={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Before / During / After for a job, plus how many tree photos it has. */
export function JobPhotos({ jobId }: { jobId: string }) {
  const trees = usePhotos({ jobId, kind: 'tree' });
  return (
    <section className="card">
      <h3 className="row-icon"><Icon name="camera" />Photos</h3>
      {(['before', 'during', 'after'] as const).map((k) => (
        <div key={k} className="photo-group">
          <h4 className="label">{PHOTO_KIND_LABEL[k]}</h4>
          <PhotoStrip jobId={jobId} kind={k} label={`${PHOTO_KIND_LABEL[k]} photo`} />
        </div>
      ))}
      {trees.length > 0 && (
        <div className="photo-group">
          <h4 className="label">Trees <small className="muted">from the estimate, for planning</small></h4>
          <PhotoStrip jobId={jobId} kind="tree" label="Tree photo" readOnly />
        </div>
      )}
    </section>
  );
}

/** "📷 2" style count, for lists. */
export function PhotoCount({ jobId, treeId, kinds }: { jobId: string; treeId?: string; kinds?: PhotoKind[] }) {
  const photos = usePhotos({ jobId, treeId });
  const n = photos.filter((p) => p.kind !== 'receipt' && (!kinds || kinds.includes(p.kind))).length;
  if (!n) return null;
  return <span className="photo-count" aria-label={`${n} photo${n > 1 ? 's' : ''}`}><Icon name="camera" size={14} />{n}</span>;
}
