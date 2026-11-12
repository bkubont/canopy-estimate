import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toCustomerCompany } from '../../components/EstimateDoc';
import { InvoiceDoc, toCustomerInvoice } from '../../components/InvoiceDoc';
import { Field, MoneyInput, PrintOnly } from '../../components/ui';
import { addDays, clientName, money, niceDate, normalizeJob, num, uid } from '../../lib/estimate';
import { balanceDue, INVOICE_STATUS_LABEL, invoiceStatus, invoiceTotals, livePayments, METHOD_LABEL, paidForJob } from '../../lib/invoice';
import { elementToPdf, shareOrDownload } from '../../lib/pdf';
import { can, useReady, useRow, useRows } from '../../lib/session';
import { createInvoiceLink, invoiceLink } from '../../lib/supabase';
import type { Invoice, InvoiceLine, Payment } from '../../lib/types';
import { PaymentSheet } from './PaymentSheet';

/** Local copy of the invoice being edited, saved shortly after typing stops. */
function useInvoiceDraft(id: string | undefined) {
  const { engine } = useReady();
  const saved = useRow(engine, 'invoices', id);
  const [inv, setInv] = useState<Invoice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Invoice | null>(null);
  useEffect(() => {
    // Take the server copy on first load, and whenever it's no longer a draft we're editing.
    if (saved && (!inv || inv.id !== saved.id || saved.status !== 'draft' || inv.status !== 'draft')) setInv(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) await engine.save('invoices', p);
  }, [engine]);
  const update = useCallback((fn: (i: Invoice) => Invoice) => {
    setInv((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      pending.current = next;
      return next;
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 400);
  }, [flush]);
  useEffect(() => () => void flush(), [flush]);
  return { inv, missing: saved === null, update, flush, setInv };
}

export function InvoiceScreen() {
  const { id } = useParams();
  const { engine, org, user } = useReady();
  const { inv, missing, update, flush, setInv } = useInvoiceDraft(id);
  const company = useRow(engine, 'organizations', org.org_id);
  const job = useRow(engine, 'jobs', inv?.job_id);
  const payments = useRows(engine, 'payments');
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const [paying, setPaying] = useState(false);
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  if (!can.seePrices(org.role)) return <Navigate to="/board" replace />;
  if (missing) return <Navigate to="/invoices" replace />;
  if (!inv || !job || !company || payments === null) return <div className="page"><p className="empty">Loading…</p></div>;

  const j = normalizeJob(job);
  const paid = paidForJob(payments, inv.job_id);
  const status = invoiceStatus(inv, paid);
  const t = invoiceTotals(inv.lines, inv.tax_rate);
  const balance = balanceDue(inv, paid);
  const draft = inv.status === 'draft';
  const custCompany = { ...toCustomerCompany(company), payment_instructions: company.payment_instructions ?? '' };
  const docData = toCustomerInvoice(custCompany, inv, { number: j.number, client: j.client }, livePayments(payments, inv.job_id));
  const setLine = (lineId: string, patch: Partial<InvoiceLine>) => update((i) => ({ ...i, lines: i.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));

  async function send() {
    if (!inv!.lines.length) return setMsg('Add at least one line first.');
    await flush();
    const next = { ...inv!, status: 'sent' as const, sent_at: new Date().toISOString() };
    setInv(next);
    await engine.save('invoices', next);
    void engine.sync();
  }

  async function getLink() {
    if (link) return link;
    setBusy(true);
    setMsg('');
    try {
      await flush();
      await engine.sync();
      const url = invoiceLink(await createInvoiceLink(inv!.id));
      setLink(url);
      return url;
    } catch (e) {
      setMsg(navigator.onLine ? (e as Error).message : 'Invoice links need a connection. Try again when you have signal.');
      return '';
    } finally {
      setBusy(false);
    }
  }

  const message = (url: string) =>
    `Hi${j.client.firstName ? ` ${j.client.firstName}` : ''}, here is invoice ${inv!.number} from ${company!.name} for ${money(t.total)}. ` +
    `${balance < t.total ? `Balance due: ${money(balance)}. ` : ''}Due ${niceDate(inv!.due_date)}.${url ? `\n\nView it here: ${url}` : ''}`;

  async function sms() {
    const url = await getLink();
    const sep = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) ? '&' : '?';
    location.href = `sms:${j.client.phone.replace(/[^\d+]/g, '')}${sep}body=${encodeURIComponent(message(url))}`;
  }
  async function email() {
    const url = await getLink();
    location.href = `mailto:${encodeURIComponent(j.client.email)}?subject=${encodeURIComponent(`Invoice ${inv!.number} from ${company!.name}`)}&body=${encodeURIComponent(message(url))}`;
  }
  async function pdf() {
    if (!docRef.current) return;
    setBusy(true);
    try {
      await shareOrDownload(await elementToPdf(docRef.current), `${company!.name} ${inv!.number}.pdf`, message(link));
    } catch {
      setMsg('Couldn’t make the PDF on this device. Use Print and choose “Save as PDF” instead.');
    }
    setBusy(false);
  }

  async function voidInvoice() {
    if (!confirm(`Void ${inv!.number}? It can’t be un-voided; you’d create a new invoice instead.`)) return;
    await flush();
    const next = { ...inv!, status: 'void' as const, voided_at: new Date().toISOString() };
    setInv(next);
    await engine.save('invoices', next);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{inv.number}</h2>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            <span className={`status inv-${status}`}>{INVOICE_STATUS_LABEL[status]}</span>{' '}
            {clientName(j.client)} · <Link to={`/estimates/${j.id}`}>{j.number}</Link>
          </p>
        </div>
      </div>

      <section className="card">
        <div className="sum-line"><span>Total</span><b>{money(t.total)}</b></div>
        <div className="sum-line"><span>Paid</span><span>{money(paid)}</span></div>
        <div className="sum-line grand"><span>Balance due</span><span>{money(balance)}</span></div>
        {!draft && inv.status !== 'void' && (
          <button type="button" className="btn primary block mt" onClick={() => setPaying(true)}>＋ Record payment</button>
        )}
      </section>

      {draft && (
        <section className="card">
          <h3>Draft. Check it, then send.</h3>
          <div className="two">
            <Field label="Invoice date"><input type="date" value={inv.issue_date} onChange={(e) => update((i) => ({ ...i, issue_date: e.target.value }))} /></Field>
            <Field label="Due date"><input type="date" value={inv.due_date} onChange={(e) => update((i) => ({ ...i, due_date: e.target.value }))} /></Field>
          </div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {[0, 15, 30].map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={inv.due_date === addDays(inv.issue_date, d)}
                onClick={() => update((i) => ({ ...i, due_date: addDays(i.issue_date, d) }))}>
                {d === 0 ? 'Due on receipt' : `Net ${d}`}
              </button>
            ))}
          </div>
          {inv.lines.map((l, idx) => (
            <div className="line-card" key={l.id}>
              <div className="line-head">
                <input aria-label="Line description" value={l.desc} onChange={(e) => setLine(l.id, { desc: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={`Remove ${l.desc}`} onClick={() => update((i) => ({ ...i, lines: i.lines.filter((x) => x.id !== l.id) }))}>✕</button>
              </div>
              <div className="qty-price">
                <Field label="Qty / days"><input type="number" inputMode="decimal" step="0.5" min={0} aria-label={`${l.desc} quantity`} value={l.qty} onChange={(e) => setLine(l.id, { qty: num(e.target.value) })} /></Field>
                <Field label="Rate"><MoneyInput label={`${l.desc} rate`} value={l.unit} onChange={(v) => setLine(l.id, { unit: v ?? 0 })} /></Field>
              </div>
              <div className="row">
                <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={l.taxable} onChange={(e) => setLine(l.id, { taxable: e.target.checked })} /><span className="small">Taxable</span></label>
                <b>{money(t.amounts[idx]!)}</b>
              </div>
            </div>
          ))}
          <button type="button" className="btn block" onClick={() => update((i) => ({ ...i, lines: [...i.lines, { id: uid(), desc: '', qty: 1, unit: 0, taxable: true }] }))}>＋ Add line</button>
          <div className="row mt">
            <span>Tax rate</span>
            <div className="price-input" style={{ maxWidth: 140 }}>
              <input type="number" inputMode="decimal" min={0} step="0.001" aria-label="Tax rate" value={inv.tax_rate} onChange={(e) => update((i) => ({ ...i, tax_rate: num(e.target.value) }))} /><span>%</span>
            </div>
          </div>
          <Field label="Note to the customer"><textarea rows={2} value={inv.notes} onChange={(e) => update((i) => ({ ...i, notes: e.target.value }))} /></Field>
          {msg && <p className="error-text">{msg}</p>}
          <button type="button" className="btn primary block" onClick={() => void send()}>Send invoice ({money(t.total)})</button>
          <p className="hint">Sending locks the invoice. If something’s wrong after that, void it and make a new one.</p>
        </section>
      )}

      <section className="internal">
        <Field label="Internal notes" hint="For your team only. Never on the invoice or the customer’s link.">
          <textarea rows={2} value={inv.internal_notes} onChange={(e) => update((i) => ({ ...i, internal_notes: e.target.value }))} />
        </Field>
      </section>

      {!draft && (
        <>
          <div className="btn-grid">
            <button type="button" className="btn primary" onClick={() => void sms()} disabled={!j.client.phone || busy}>💬 Text</button>
            <button type="button" className="btn" onClick={() => void email()} disabled={!j.client.email || busy}>✉️ Email</button>
            <button type="button" className="btn" onClick={() => void pdf()} disabled={busy}>📄 PDF file</button>
            <button type="button" className="btn" onClick={() => window.print()}>🖨️ Print</button>
            <button type="button" className="btn" onClick={() => void getLink()} disabled={busy || inv.status === 'void'}>🔗 Customer link</button>
          </div>
          {link && <div className="copy-box mt"><input readOnly value={link} aria-label="Invoice link" onFocus={(e) => e.currentTarget.select()} /></div>}
          {msg && <p className="hint" role="status">{msg}</p>}
        </>
      )}

      <section className="card mt">
        <h3>Payments</h3>
        {livePayments(payments, inv.job_id).length === 0 ? <p className="muted small">None yet.</p> : (
          payments.filter((p) => p.job_id === inv.job_id && !p.deleted_at).map((p) => (
            <div key={p.id} className="sum-line" style={{ opacity: p.voided_at ? 0.5 : 1 }}>
              <span>
                {niceDate(p.received_on)} · {METHOD_LABEL[p.method]}{p.reference ? ` #${p.reference.replace(/^#/, '')}` : ''}
                {p.invoice_id ? '' : ' (deposit)'}{p.voided_at ? ' · voided' : ''}
                {p.note && <span className="muted small"> · {p.note}</span>}
              </span>
              <span>
                {money(p.amount)}{' '}
                {!p.voided_at && (
                  <button type="button" className="link small" onClick={() => {
                    if (confirm(`Void this ${money(p.amount)} payment (e.g. a bounced check)?`)) void engine.save('payments', { ...p, voided_at: new Date().toISOString() });
                  }}>void</button>
                )}
              </span>
            </div>
          ))
        )}
      </section>

      <div className="doc-preview" ref={docRef}><InvoiceDoc data={docData} /></div>
      <PrintOnly><InvoiceDoc data={docData} /></PrintOnly>

      {inv.status !== 'void' && !draft && (
        <button type="button" className="btn danger" onClick={() => void voidInvoice()}>Void invoice</button>
      )}

      <PaymentSheet
        open={paying}
        onClose={() => setPaying(false)}
        title={`Payment on ${inv.number}`}
        suggested={balance}
        base={{ org_id: inv.org_id, job_id: inv.job_id, invoice_id: inv.id, recorded_by_name: me?.display_name ?? '' }}
        onSave={(p: Payment) => {
          void engine.save('payments', p);
          setPaying(false);
        }}
      />
    </div>
  );
}
