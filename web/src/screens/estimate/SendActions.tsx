import { useRef, useState } from 'react';
import { EstimateDoc, toCustomerCompany, toCustomerJob } from '../../components/EstimateDoc';
import { PrintOnly } from '../../components/ui';
import { customerPricing, summaryText } from '../../lib/estimate';
import { elementToPdf, shareOrDownload } from '../../lib/pdf';
import { useReady } from '../../lib/session';
import { createShareLink, customerLink } from '../../lib/supabase';
import type { Job, JobPricing, Organization } from '../../lib/types';

/** Print, PDF file, customer link, text and email. Everything here is customer-safe. */
export function SendActions({ job, pricing, company, flush }: { job: Job; pricing: JobPricing; company: Organization; flush: () => Promise<void> }) {
  const { engine } = useReady();
  const cp = customerPricing(job, pricing);
  const docRef = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState(pricing.share_token ? customerLink(pricing.share_token) : '');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const doc = <EstimateDoc company={toCustomerCompany(company)} job={toCustomerJob(job)} pricing={cp} />;
  const text = (withLink: string) => summaryText(job, cp, company, withLink || undefined);

  async function getLink() {
    if (link) return link;
    setBusy('link');
    setMsg('');
    try {
      // The server needs the estimate before it can make a link for it.
      await flush();
      await engine.sync();
      const token = await createShareLink(job.id);
      const url = customerLink(token);
      setLink(url);
      return url;
    } catch (e) {
      setMsg(navigator.onLine ? `Couldn’t make the link: ${(e as Error).message}` : 'Customer links need a connection. Try again when you have signal.');
      return '';
    } finally {
      setBusy('');
    }
  }

  async function pdf() {
    if (!docRef.current) return;
    setBusy('pdf');
    try {
      const blob = await elementToPdf(docRef.current);
      await shareOrDownload(blob, `${company.name} ${job.number}.pdf`, text(link));
    } catch {
      setMsg('Couldn’t make the PDF on this device. Use Print and choose “Save as PDF” instead.');
    } finally {
      setBusy('');
    }
  }

  async function sms() {
    const url = await getLink();
    const sep = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) ? '&' : '?';
    location.href = `sms:${job.client.phone.replace(/[^\d+]/g, '')}${sep}body=${encodeURIComponent(text(url))}`;
  }

  async function email() {
    const url = await getLink();
    location.href = `mailto:${encodeURIComponent(job.client.email)}?subject=${encodeURIComponent(`Estimate ${job.number} from ${company.name}`)}&body=${encodeURIComponent(text(url))}`;
  }

  async function shareLink() {
    const url = await getLink();
    if (!url) return;
    if (navigator.share) await navigator.share({ title: `Estimate ${job.number}`, text: text(url) }).catch(() => undefined);
    else {
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setMsg('Link copied.');
    }
  }

  return (
    <>
      <div className="btn-grid">
        <button type="button" className="btn primary" onClick={() => void sms()} disabled={!job.client.phone || !!busy}>💬 Text</button>
        <button type="button" className="btn" onClick={() => void email()} disabled={!job.client.email || !!busy}>✉️ Email</button>
        <button type="button" className="btn" onClick={() => void pdf()} disabled={!!busy}>{busy === 'pdf' ? 'Making PDF…' : '📄 PDF file'}</button>
        <button type="button" className="btn" onClick={() => window.print()}>🖨️ Print</button>
        <button type="button" className="btn" onClick={() => void shareLink()} disabled={!!busy}>🔗 Customer link</button>
      </div>
      <p className="hint">Text and email include a link where the customer can view{job.signed_at ? '' : ' and sign'} the estimate on their phone.</p>
      {link && (
        <div className="copy-box">
          <input readOnly value={link} aria-label="Customer link" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      {msg && <p className="hint" role="status">{msg}</p>}
      <div className="doc-preview" ref={docRef}>{doc}</div>
      <PrintOnly>{doc}</PrintOnly>
    </>
  );
}
