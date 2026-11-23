import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { EstimateDoc, toCustomerCompany, toCustomerJob } from '../components/EstimateDoc';
import { InvoiceDoc, toCustomerInvoice } from '../components/InvoiceDoc';
import { customerPricing, normalizeJob, round2 } from './estimate';
import { livePayments } from './invoice';
import { elementToPdf } from './pdf';
import { can } from './session';
import { supabase } from './supabase';
import type { SyncEngine } from './sync';
import type { Invoice, Job, JobPricing, Organization, Payment } from './types';

/**
 * Saved document copies.
 *
 * Signed estimates and sent invoices are locked by the server, so drawing them
 * again later gives exactly what the customer signed or received. After each
 * sync, the owner's or office's device draws any copy that isn't saved yet,
 * uploads the PDF to the private "documents" bucket and records it. That covers
 * estimates the customer signed through their link, and older jobs, without
 * anyone pressing a button. Contact Sheet reads these copies.
 */

export const DOCS_BUCKET = 'documents';
export type DocKind = 'estimate' | 'invoice' | 'receipt';

export interface NeededDoc {
  kind: DocKind;
  job: Job;
  invoice?: Invoice;
  version_key: string;
  number: string;
  total: number | null;
}

export interface SavedDocKey {
  job_id: string;
  kind: string;
  version_key: string;
}

const keyOf = (d: { job_id: string; kind: string; version_key: string }) => `${d.job_id}|${d.kind}|${d.version_key}`;

/** Which copies should exist, given this company's rows. Pure, so it's easy to test. */
export function neededDocuments(
  jobs: Job[],
  pricing: JobPricing[],
  invoices: Invoice[],
  payments: Payment[],
  saved: SavedDocKey[],
): NeededDoc[] {
  const have = new Set(saved.map(keyOf));
  const pricingByJob = new Map(pricing.map((p) => [p.job_id, p]));
  const out: NeededDoc[] = [];
  for (const raw of jobs) {
    if (raw.deleted_at) continue;
    const job = normalizeJob(raw);

    // Signed estimate, one copy per signed version (each change order adds one).
    if (job.signed_at) {
      const p = pricingByJob.get(job.id);
      const version_key = `${job.signed_at}|co${job.change_orders.length}`;
      if (!have.has(keyOf({ job_id: job.id, kind: 'estimate', version_key }))) {
        out.push({ kind: 'estimate', job, version_key, number: job.number, total: p ? p.total ?? null : null });
      }
    }

    // Sent invoice (void ones are not filed), and a receipt once it's paid in full.
    const inv = invoices.find((i) => i.job_id === job.id && i.status === 'sent' && i.sent_at && !i.deleted_at);
    if (!inv) continue;
    if (!have.has(keyOf({ job_id: job.id, kind: 'invoice', version_key: inv.sent_at! }))) {
      out.push({ kind: 'invoice', job, invoice: inv, version_key: inv.sent_at!, number: inv.number, total: inv.total ?? null });
    }
    if (job.stage === 'paid') {
      const live = livePayments(payments, job.id);
      const paid = round2(live.reduce((s, p) => s + Number(p.amount), 0));
      const last = live.map((p) => p.received_on).sort().pop() ?? '';
      const version_key = `paid|${paid.toFixed(2)}|${last}`;
      if (!have.has(keyOf({ job_id: job.id, kind: 'receipt', version_key }))) {
        out.push({ kind: 'receipt', job, invoice: inv, version_key, number: inv.number, total: inv.total ?? null });
      }
    }
  }
  return out;
}

/** Draw a document off screen and turn it into a PDF. */
export async function renderPdf(element: React.ReactElement): Promise<Blob> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;background:#fff;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(element));
    // Wait for the logo and signatures to finish loading.
    await Promise.all(
      [...host.querySelectorAll('img')].map((img) =>
        img.complete ? null : new Promise((ok) => { img.onload = img.onerror = () => ok(null); }),
      ),
    );
    await document.fonts?.ready;
    return await elementToPdf(host.firstElementChild as HTMLElement);
  } finally {
    root.unmount();
    host.remove();
  }
}

function docElement(d: NeededDoc, company: Organization, pricing: JobPricing | undefined, payments: Payment[]) {
  if (d.kind === 'estimate') {
    const cp = pricing ? customerPricing(d.job, pricing) : null;
    return createElement(EstimateDoc, { company: toCustomerCompany(company), job: toCustomerJob(d.job), pricing: cp });
  }
  const custCompany = { ...toCustomerCompany(company), payment_instructions: company.payment_instructions ?? '' };
  // The invoice copy is what was sent (no payments after it); the receipt shows everything paid.
  const pays = d.kind === 'receipt'
    ? livePayments(payments, d.job.id)
    : livePayments(payments, d.job.id).filter((p) => !d.invoice?.sent_at || (p.created_at ?? '') <= d.invoice.sent_at);
  return createElement(InvoiceDoc, { data: toCustomerInvoice(custCompany, d.invoice!, { number: d.job.number, client: d.job.client }, pays) });
}

let running: Promise<number> | null = null;

/**
 * Save any missing copies for this company. Owner/office only, online only.
 * Does at most `limit` per run so it never ties up the phone; the next sync
 * picks up the rest. Returns how many were saved.
 */
export function saveMissingDocuments(engine: SyncEngine, role: string | undefined, limit = 4): Promise<number> {
  if (!can.seePrices(role) || (typeof navigator !== 'undefined' && !navigator.onLine)) return Promise.resolve(0);
  running ??= (async () => {
    let done = 0;
    try {
      const { data: saved, error } = await supabase
        .from('documents')
        .select('job_id, kind, version_key')
        .eq('org_id', engine.orgId);
      if (error) return 0; // not set up yet on this project, or offline: try again later
      const [jobs, pricing, invoices, payments, company] = await Promise.all([
        engine.all('jobs'),
        engine.all('job_pricing'),
        engine.all('invoices'),
        engine.all('payments'),
        engine.get('organizations', engine.orgId),
      ]);
      if (!company) return 0;
      // Only rows the server already has: a copy must match what was signed or sent there.
      const pendingIds = new Set(
        ((await engine.db.getAll('outbox')) as { table: string; key: string }[])
          .filter((e) => e.table === 'jobs' || e.table === 'invoices')
          .map((e) => e.key),
      );
      const todo = neededDocuments(
        jobs.filter((j) => !pendingIds.has(j.id)),
        pricing,
        invoices.filter((i) => !pendingIds.has(i.id)),
        payments,
        saved ?? [],
      ).slice(0, limit);
      const pricingByJob = new Map(pricing.map((p) => [p.job_id, p]));

      for (const d of todo) {
        const id = crypto.randomUUID();
        const path = `${engine.orgId}/${d.job.id}/${d.kind}-${id}.pdf`;
        const blob = await renderPdf(docElement(d, company, pricingByJob.get(d.job.id), payments));
        const up = await supabase.storage.from(DOCS_BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
        if (up.error) break;
        const { error: insErr } = await supabase.from('documents').insert({
          id,
          org_id: engine.orgId,
          job_id: d.job.id,
          invoice_id: d.invoice?.id ?? null,
          kind: d.kind,
          version_key: d.version_key,
          number: d.number,
          total: d.total,
          path,
          bytes: blob.size,
        });
        // A duplicate means another device saved it first; that's fine.
        if (insErr && !/duplicate/i.test(insErr.message)) break;
        if (!insErr) done++;
      }
    } catch (e) {
      console.warn('Saving document copies failed; will retry', e);
    } finally {
      running = null;
    }
    return done;
  })();
  return running;
}
