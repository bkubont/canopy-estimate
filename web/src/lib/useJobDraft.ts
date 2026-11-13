import { useCallback, useEffect, useRef, useState } from 'react';
import { customerPricing, normalizeJob, totals } from './estimate';
import { useRow } from './session';
import type { SyncEngine } from './sync';
import type { Job, JobPricing } from './types';

/**
 * The estimate being edited. Every change is saved to the device shortly after
 * typing stops (and immediately when leaving), then synced like everything else.
 *
 * If the estimate gets signed somewhere else while it's open (for example the
 * customer signs through the link), the screen switches to the signed copy.
 */
export function useJobDraft(engine: SyncEngine, id: string | undefined) {
  const savedJob = useRow(engine, 'jobs', id);
  const savedPricing = useRow(engine, 'job_pricing', id);
  const [job, setJob] = useState<Job | null>(null);
  const [pricing, setPricing] = useState<JobPricing | null>(null);
  const dirty = useRef<{ job: Job | null; pricing: JobPricing | null }>({ job: null, pricing: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { job: j, pricing: p } = dirty.current;
    dirty.current = { job: null, pricing: null };
    if (j) await engine.save('jobs', j);
    if (p) await engine.save('job_pricing', p);
  }, [engine]);

  const queue = useCallback(
    (j: Job | null, p: JobPricing | null) => {
      if (j) dirty.current.job = j;
      if (p) dirty.current.pricing = p;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 400);
    },
    [flush],
  );

  // Keep the stored total in step so lists can show it without recalculating.
  const withTotal = (j: Job, p: JobPricing): JobPricing => ({ ...p, total: totals(j, customerPricing(j, p)).total });

  // Refs hold the latest values so edits never run side effects inside React state updaters.
  const jobRef = useRef<Job | null>(null);
  const pricingRef = useRef<JobPricing | null>(null);
  jobRef.current = job;
  pricingRef.current = pricing;

  const updateJob = useCallback(
    (fn: (j: Job) => Job) => {
      const cur = jobRef.current;
      if (!cur) return;
      const next = fn(cur);
      const p = pricingRef.current ? withTotal(next, pricingRef.current) : null;
      jobRef.current = next;
      pricingRef.current = p;
      setJob(next);
      if (p) setPricing(p);
      queue(next, p);
    },
    [queue],
  );

  const updatePricing = useCallback(
    (fn: (p: JobPricing) => JobPricing) => {
      const cur = pricingRef.current;
      const j = jobRef.current;
      if (!cur || !j) return;
      const next = withTotal(j, fn(cur));
      pricingRef.current = next;
      setPricing(next);
      queue(null, next);
    },
    [queue],
  );

  // Load once; afterwards the draft on screen is the source of truth, except a new
  // signature from elsewhere, which replaces the draft (and drops its unsaved copy).
  useEffect(() => {
    if (!savedJob) return;
    const cur = jobRef.current;
    if (!cur || cur.id !== savedJob.id || (savedJob.signed_at && !cur.signed_at)) {
      if (cur && savedJob.signed_at && !cur.signed_at) dirty.current.job = null;
      setJob(normalizeJob(savedJob));
    }
  }, [savedJob]);
  useEffect(() => {
    if (!savedPricing) return;
    const cur = pricingRef.current;
    if (!cur || cur.job_id !== savedPricing.job_id || (savedPricing.signed_snapshot && !cur.signed_snapshot)) {
      if (cur && savedPricing.signed_snapshot && !cur.signed_snapshot) dirty.current.pricing = null;
      setPricing(savedPricing);
    }
  }, [savedPricing]);

  // Save on leaving the screen or the app going to the background.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      void flush();
    };
  }, [flush]);

  return { job, pricing, loaded: savedJob !== undefined, missing: savedJob === null, updateJob, updatePricing, flush, setJob, setPricing };
}
