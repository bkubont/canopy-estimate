import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EstimateDoc } from '../components/EstimateDoc';
import { SignaturePad } from '../components/SignaturePad';
import { money, niceDate, normalizeJob, totals } from '../lib/estimate';
import { elementToPdf, shareOrDownload } from '../lib/pdf';
import { customerSign, customerView, type CustomerView } from '../lib/supabase';
import type { Job } from '../lib/types';

/** What the customer sees when they open the link. No account needed. */
export function CustomerPage() {
  const { token = '' } = useParams();
  const [view, setView] = useState<CustomerView | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [sig, setSig] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    customerView(token).then(setView).catch((e: Error) => setError(e.message));
  }, [token]);

  if (error && !view) {
    return <div className="center-page"><div className="card center-card"><h2>Estimate unavailable</h2><p>{error}</p></div></div>;
  }
  if (!view) return <div className="center-page muted">Loading your estimate…</div>;

  const job = normalizeJob(view.job as unknown as Job);
  const signed = !!view.job.signed_at;
  const t = view.pricing ? totals(job, view.pricing) : null;

  async function sign() {
    setError('');
    if (!name.trim()) return setError('Please type your full name.');
    if (!sig) return setError('Please sign in the box.');
    if (!agree) return setError('Please check the box to accept the estimate.');
    setBusy(true);
    try {
      setView(await customerSign(token, sig, name));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function pdf() {
    if (!docRef.current) return;
    setBusy(true);
    try {
      const blob = await elementToPdf(docRef.current);
      await shareOrDownload(blob, `${view!.company.name} ${job.number}.pdf`, `Estimate ${job.number}`);
    } catch {
      setError('Couldn’t make the PDF on this device. You can still print this page or save it as a PDF from the browser’s menu.');
    }
    setBusy(false);
  }

  return (
    <div className="customer-page">
      <div className="page">
        {signed ? (
          <div className="card notice ok" role="status">
            <b>Signed{view.job.signed_by_name ? ` by ${view.job.signed_by_name}` : ''} on {niceDate(view.job.client_sig_date)}.</b>
            <p className="small" style={{ margin: '4px 0 0' }}>Thank you! {view.company.name} will be in touch to schedule the work.</p>
          </div>
        ) : t ? (
          <div className="card">
            <div className="row"><b>Total</b><b style={{ fontSize: 20 }}>{money(t.total)}</b></div>
            {t.deposit ? <p className="muted small" style={{ margin: '4px 0 0' }}>Deposit due at signing: {money(t.deposit)}</p> : null}
          </div>
        ) : null}

        <div className="doc-preview" ref={docRef}>
          <EstimateDoc company={view.company} job={view.job} pricing={view.pricing} />
        </div>

        {!signed && (
          <section className="card">
            <h3>Accept this estimate</h3>
            <label className="field"><span>Your full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoCapitalize="words" />
            </label>
            <SignaturePad value={sig} onChange={setSig} label="Sign above with your finger or mouse" />
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I accept this estimate and authorize {view.company.name} to do the work described.</span>
            </label>
            {error && <p className="error-text" role="alert">{error}</p>}
            <button type="button" className="btn primary block" onClick={sign} disabled={busy}>Sign and accept</button>
          </section>
        )}

        <div className="btn-row" style={{ marginBottom: 24 }}>
          <button type="button" className="btn" onClick={pdf} disabled={busy}>Download PDF</button>
          {view.company.phone && <a className="btn" href={`tel:${view.company.phone.replace(/[^\d+]/g, '')}`}>Call {view.company.name}</a>}
        </div>
      </div>
    </div>
  );
}
