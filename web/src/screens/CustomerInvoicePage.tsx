import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { InvoiceDoc } from '../components/InvoiceDoc';
import { money, niceDate } from '../lib/estimate';
import { elementToPdf, shareOrDownload } from '../lib/pdf';
import { invoiceView, type InvoiceView } from '../lib/supabase';

/** What the customer sees when they open an invoice link. No account needed. */
export function CustomerInvoicePage() {
  const { token = '' } = useParams();
  const [view, setView] = useState<InvoiceView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoiceView(token).then(setView).catch((e: Error) => setError(e.message));
  }, [token]);

  if (error && !view) return <div className="center-page"><div className="card center-card"><h2>Invoice unavailable</h2><p>{error}</p></div></div>;
  if (!view) return <div className="center-page muted">Loading your invoice…</div>;
  const paidInFull = view.balance <= 0;

  async function pdf() {
    if (!docRef.current) return;
    setBusy(true);
    try {
      await shareOrDownload(await elementToPdf(docRef.current), `${view!.company.name} ${view!.invoice.number}.pdf`, `Invoice ${view!.invoice.number}`);
    } catch {
      setError('Couldn’t make the PDF on this device. You can print this page instead.');
    }
    setBusy(false);
  }

  return (
    <div className="customer-page">
      <div className="page">
        {view.invoice.status === 'void' ? (
          <div className="card notice warn"><b>This invoice was cancelled.</b> Please contact {view.company.name} with any questions.</div>
        ) : paidInFull ? (
          <div className="card notice ok" role="status"><b>Paid in full. Thank you!</b></div>
        ) : (
          <div className="card">
            <div className="row"><b>Balance due</b><b style={{ fontSize: 22 }}>{money(view.balance)}</b></div>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Due {niceDate(view.invoice.due_date)}</p>
            {view.company.payment_instructions && <p className="small pre" style={{ marginBottom: 0 }}>{view.company.payment_instructions}</p>}
            {/* Stripe goes here: a "Pay by card" button once online payments are approved. */}
          </div>
        )}
        <div className="doc-preview" ref={docRef}><InvoiceDoc data={view} /></div>
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row" style={{ marginBottom: 24 }}>
          <button type="button" className="btn" onClick={() => void pdf()} disabled={busy}>Download PDF</button>
          {view.company.phone && <a className="btn" href={`tel:${view.company.phone.replace(/[^\d+]/g, '')}`}>Call {view.company.name}</a>}
        </div>
      </div>
    </div>
  );
}
