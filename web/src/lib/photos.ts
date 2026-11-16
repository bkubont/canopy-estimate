import { useEffect, useState } from 'react';
import type { LocalDb } from './localdb';
import { supabase } from './supabase';
import type { SyncEngine } from './sync';
import type { Photo, PhotoKind } from './types';

/**
 * Photos: shrunk on the phone, kept on the device until they reach file
 * storage (so pictures taken with no signal upload later), then shown from
 * storage through short-lived private links.
 */
const STORE = 'photo_blobs';
const BUCKET = 'org-files';
type Pending = { blob: Blob; path: string };

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());
export function onPhotosChanged(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Longest side 1600 px, JPEG: about 300 KB from a 3–5 MB phone photo. */
export async function shrink(file: Blob, max = 1600, quality = 0.72): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error('Could not read that picture.'))), 'image/jpeg', quality));
  return { blob, width, height };
}

export async function addPhoto(engine: SyncEngine, file: Blob, meta: {
  org_id: string; job_id: string | null; tree_id?: string | null; expense_id?: string | null; kind: PhotoKind; taken_by: string; taken_by_name: string;
}): Promise<Photo> {
  const id = crypto.randomUUID();
  const { blob, width, height } = await shrink(file);
  const path = `${meta.org_id}/${meta.kind === 'receipt' ? 'receipts' : 'photos'}/${id}.jpg`;
  await engine.db.put(STORE, { blob, path } satisfies Pending, id);
  const photo: Photo = { id, ...meta, tree_id: meta.tree_id ?? null, expense_id: meta.expense_id ?? null, path, width, height, bytes: blob.size, note: '', deleted_at: null };
  await engine.save('photos', photo);
  changed();
  void uploadPending(engine.db);
  return photo;
}

let running: Promise<void> | null = null;
/** Upload every photo still waiting on this device. Safe to call often. */
export function uploadPending(db: LocalDb): Promise<void> {
  running ??= (async () => {
    try {
      for (const key of await db.getAllKeys(STORE)) {
        const p = (await db.get(STORE, key)) as Pending | undefined;
        if (!p) continue;
        const { error } = await supabase.storage.from(BUCKET).upload(p.path, p.blob, { contentType: 'image/jpeg', upsert: true });
        if (error) break; // offline or refused: try again later
        await db.delete(STORE, key);
        changed();
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

export const pendingPhotoCount = async (db: LocalDb) => (await db.getAllKeys(STORE)).length;

const links = new Map<string, { url: string; until: number }>();
/** Where to show a photo from: this device if it hasn't uploaded yet, otherwise a private link. */
export function usePhotoSrc(db: LocalDb, photo: Pick<Photo, 'id' | 'path'> | null) {
  const [src, setSrc] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => onPhotosChanged(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    if (!photo) return setSrc(null);
    let objectUrl = '';
    let cancelled = false;
    (async () => {
      const local = (await db.get(STORE, photo.id)) as Pending | undefined;
      if (local) {
        objectUrl = URL.createObjectURL(local.blob);
        if (!cancelled) setSrc(objectUrl);
        return;
      }
      const hit = links.get(photo.path);
      if (hit && hit.until > Date.now()) return !cancelled && setSrc(hit.url);
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(photo.path, 3600);
      if (data?.signedUrl) links.set(photo.path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
      if (!cancelled) setSrc(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [db, photo?.id, photo?.path, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return src;
}

/** The picture itself: from this device if it hasn't uploaded yet, otherwise downloaded from storage. */
export async function photoBlob(db: LocalDb, photo: Pick<Photo, 'id' | 'path'>): Promise<Blob | null> {
  const local = (await db.get(STORE, photo.id)) as Pending | undefined;
  if (local) return local.blob;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(photo.path, 600);
  if (!data?.signedUrl) return null;
  const res = await fetch(data.signedUrl);
  return res.ok ? res.blob() : null;
}
