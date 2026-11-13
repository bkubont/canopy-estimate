import { clientName, money, niceDate, sizeLabel, totals, treeCount, validUntil, workLabel } from '../lib/estimate';
import type { ChangeOrder, CustomerPricing, Job, Organization, Tree } from '../lib/types';

/** Everything printed comes from these shapes, which have no internal notes and no costs. */
export type CustomerTree = Omit<Tree, 'internal_notes'>;
export type CustomerJob = Pick<
  Job,
  'number' | 'estimate_date' | 'client' | 'site' | 'equipment' | 'days' | 'client_notes' | 'client_sig' | 'client_sig_date' | 'signed_by_name' | 'prepared_by_name' | 'contractor_sig'
> & { trees: CustomerTree[]; change_orders: (Omit<ChangeOrder, 'trees'> & { trees: CustomerTree[] })[]; signed_at?: string | null };
export type CustomerCompany = Pick<Organization, 'name' | 'contact_name' | 'license' | 'address' | 'phone' | 'email' | 'website' | 'logo_data'>;

const stripTree = ({ internal_notes: _drop, ...t }: Tree): CustomerTree => t;

/** The only way a Job reaches a printed document. */
export function toCustomerJob(j: Job): CustomerJob {
  return {
    number: j.number, estimate_date: j.estimate_date, client: j.client, site: j.site, equipment: j.equipment, days: j.days,
    client_notes: j.client_notes, client_sig: j.client_sig, client_sig_date: j.client_sig_date, signed_by_name: j.signed_by_name,
    prepared_by_name: j.prepared_by_name, contractor_sig: j.contractor_sig, signed_at: j.signed_at,
    trees: j.trees.map(stripTree),
    change_orders: j.change_orders.map((co) => ({ ...co, trees: co.trees.map(stripTree) })),
  };
}

export function toCustomerCompany(o: Organization): CustomerCompany {
  return { name: o.name, contact_name: o.contact_name, license: o.license, address: o.address, phone: o.phone, email: o.email, website: o.website, logo_data: o.logo_data };
}

function TreeTable({ trees }: { trees: CustomerTree[] }) {
  return (
    <table className="doc-table">
      <thead>
        <tr><th>#</th><th className="r">Qty</th><th>Tree</th><th>Work</th><th>Location</th><th>DBH</th><th>Condition / notes</th></tr>
      </thead>
      <tbody>
        {trees.length ? trees.map((t, i) => (
          <tr key={t.id ?? i}>
            <td>{i + 1}</td>
            <td className="r">{t.qty || 1}</td>
            <td><b>{t.species || '—'}</b></td>
            <td>{workLabel(t) || '—'}</td>
            <td>{t.location}</td>
            <td>{sizeLabel(t.size)}</td>
            <td>{t.condition}{t.notes ? <div className="doc-note">{t.notes}</div> : null}</td>
          </tr>
        )) : <tr><td colSpan={7} className="none">None</td></tr>}
      </tbody>
    </table>
  );
}

const KV = ({ label, value }: { label: string; value?: string | null }) =>
  value ? <div className="kv"><b>{label}:</b><span>{value}</span></div> : null;

export function EstimateDoc({ company, job, pricing, title = 'Estimate' }: { company: CustomerCompany; job: CustomerJob; pricing: CustomerPricing | null; title?: string }) {
  const t = pricing ? totals(job, pricing) : null;
  const site = job.site;
  const siteRows = [
    site.conditions.length || site.other ? <KV key="s" label="Site" value={[...site.conditions, site.other && `Other: ${site.other}`].filter(Boolean).join(', ')} /> : null,
    site.parking ? <KV key="p" label="Parking" value={site.parking} /> : null,
    site.debris ? <KV key="d" label="Wood & debris" value={site.debris} /> : null,
    job.client_notes ? <KV key="n" label="Notes" value={job.client_notes} /> : null,
  ].filter(Boolean);

  return (
    <article className="doc">
      <header className="doc-head" data-break>
        {company.logo_data ? <img src={company.logo_data} alt="" className="doc-logo" /> : null}
        <div className="doc-brand">
          <div className="doc-brand-name">{company.name}</div>
          <h1>{title}</h1>
          <div className="doc-company">
            {company.contact_name && <div className="doc-contact">{company.contact_name}</div>}
            {company.address && <div className="pre">{company.address}</div>}
            <div>{[company.phone, company.email, company.website, company.license && `Lic. ${company.license}`].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="doc-no"><b>{job.number}</b><br />{niceDate(job.estimate_date)}</div>
      </header>

      <div className="doc-cols" data-break>
        <section className="doc-sec">
          <h3>Client</h3>
          <div className="doc-sec-body">
            <KV label="Name" value={clientName(job.client)} />
            {job.client.company && clientName(job.client) !== job.client.company ? <KV label="Company" value={job.client.company} /> : null}
            <KV label="Phone" value={job.client.phone} />
            <KV label="Email" value={job.client.email} />
            <KV label="Address" value={[job.client.street, job.client.town, [job.client.state, job.client.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')} />
          </div>
        </section>
        <section className="doc-sec">
          <h3>Site details</h3>
          <div className="doc-sec-body">{siteRows.length ? siteRows : <span className="doc-muted">None</span>}</div>
        </section>
      </div>

      <section className="doc-sec" data-break>
        <h3>Trees ({treeCount(job.trees as Tree[])})</h3>
        <div className="doc-sec-body"><TreeTable trees={job.trees} /></div>
      </section>

      {t && pricing && (
        <section className="doc-sec" data-break>
          <h3>Pricing</h3>
          <div className="doc-sec-body">
            <table className="doc-table">
              <thead><tr><th>Description</th><th className="r">Qty / days</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
              <tbody>
                <tr><td>Labor</td><td className="r">{job.days}</td><td className="r">{money(pricing.day_rate)}</td><td className="r">{money(t.baseLabor)}</td></tr>
                {job.change_orders.map((co, i) => (
                  <tr key={co.id}><td>Change order {i + 1}</td><td className="r">{co.days}</td><td className="r">{money(pricing.day_rate)}</td><td className="r">{money(co.days * pricing.day_rate)}</td></tr>
                ))}
                {t.lines.map((l) => (
                  <tr key={l.id}><td>{l.desc || 'Equipment'}</td><td className="r">{l.qty}</td><td className="r">{money(l.unit)}</td><td className="r">{money(l.amount)}</td></tr>
                ))}
              </tbody>
            </table>
            <table className="doc-sum">
              <tbody>
                <tr><th>Subtotal</th><td>{money(t.subtotal)}</td></tr>
                {t.tax ? <tr><th>Tax ({pricing.tax_rate}%)</th><td>{money(t.tax)}</td></tr> : null}
                {t.additional ? <tr><th>Other costs</th><td>{money(t.additional)}</td></tr> : null}
                <tr className="grand"><th>Total</th><td>{money(t.total)}</td></tr>
                {t.deposit ? <tr><th>Deposit due at signing</th><td>{money(t.deposit)}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="doc-sec" data-break>
        <h3>Signatures</h3>
        <div className="doc-sec-body">
          <div className="sig-line"><div className="sig-box">{job.contractor_sig ? <img src={job.contractor_sig} alt="Contractor signature" /> : null}</div><span>{niceDate(job.estimate_date)}</span></div>
          <div className="sig-cap"><span>{job.prepared_by_name ? `${job.prepared_by_name}, ${company.name}` : 'Contractor signature'}</span><span>Date</span></div>
          <div className="sig-line"><div className="sig-box">{job.client_sig ? <img src={job.client_sig} alt="Client signature" /> : null}</div><span>{niceDate(job.client_sig_date)}</span></div>
          <div className="sig-cap"><span>{job.signed_by_name ? `Accepted by ${job.signed_by_name}` : 'Client acceptance signature'}</span><span>Date</span></div>
        </div>
      </section>

      {job.change_orders.map((co, i) => (
        <section key={co.id} className="doc-sec" data-break>
          <h3>Change order {i + 1}</h3>
          <div className="doc-sec-body">
            <div className="doc-cols-inner">
              <KV label="Date" value={niceDate(co.date)} />
              <KV label="Additional days" value={String(co.days)} />
            </div>
            <KV label="Reason" value={co.reason === 'Other' && co.reason_other ? `Other: ${co.reason_other}` : co.reason} />
            {pricing && <KV label="Amount" value={money(co.days * pricing.day_rate)} />}
            {co.trees.length ? <><h4 className="doc-sub">Added trees</h4><TreeTable trees={co.trees} /></> : null}
            <div className="sig-line"><div className="sig-box">{co.client_sig ? <img src={co.client_sig} alt="Client signature" /> : null}</div><span>{niceDate(co.client_sig_date)}</span></div>
            <div className="sig-cap"><span>Client signature</span><span>Date</span></div>
          </div>
        </section>
      ))}

      <footer className="doc-terms" data-break>
        {pricing ? <>This estimate is valid until {niceDate(validUntil(job, pricing))}. </> : null}
        Final costs may vary depending on site conditions and additional work agreed by change order.
      </footer>
    </article>
  );
}
