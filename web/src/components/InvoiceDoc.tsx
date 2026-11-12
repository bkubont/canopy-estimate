import { clientName, money, niceDate } from '../lib/estimate';
import { invoiceTotals, METHOD_LABEL } from '../lib/invoice';
import type { Client, Invoice, Payment } from '../lib/types';
import type { CustomerCompany } from './EstimateDoc';

/** Exactly what the customer may see. No internal notes, no check numbers, no costs. */
export interface CustomerInvoice {
  company: CustomerCompany & { payment_instructions?: string };
  invoice: Pick<Invoice, 'number' | 'status' | 'issue_date' | 'due_date' | 'lines' | 'tax_rate' | 'notes'>;
  job: { number: string; client: Client };
  payments: Pick<Payment, 'received_on' | 'amount' | 'method'>[];
}

export function toCustomerInvoice(company: CustomerInvoice['company'], inv: Invoice, job: { number: string; client: Client }, payments: Payment[]): CustomerInvoice {
  return {
    company,
    invoice: { number: inv.number, status: inv.status, issue_date: inv.issue_date, due_date: inv.due_date, lines: inv.lines, tax_rate: inv.tax_rate, notes: inv.notes },
    job,
    payments: payments.map((p) => ({ received_on: p.received_on, amount: p.amount, method: p.method })),
  };
}

export function InvoiceDoc({ data }: { data: CustomerInvoice }) {
  const { company, invoice, job, payments } = data;
  const t = invoiceTotals(invoice.lines, invoice.tax_rate);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, Math.round((t.total - paid) * 100) / 100);
  const c = job.client;

  return (
    <article className="doc">
      <header className="doc-head" data-break>
        {company.logo_data ? <img src={company.logo_data} alt="" className="doc-logo" /> : null}
        <div className="doc-brand">
          <div className="doc-brand-name">{company.name}</div>
          <h1>{invoice.status === 'void' ? 'Invoice (void)' : 'Invoice'}</h1>
          <div className="doc-company">
            {company.contact_name && <div className="doc-contact">{company.contact_name}</div>}
            {company.address && <div className="pre">{company.address}</div>}
            <div>{[company.phone, company.email, company.website, company.license && `Lic. ${company.license}`].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="doc-no">
          <b>{invoice.number}</b><br />
          Issued {niceDate(invoice.issue_date)}<br />
          Due {niceDate(invoice.due_date)}<br />
          <span className="doc-muted">For estimate {job.number}</span>
        </div>
      </header>

      <section className="doc-sec" data-break>
        <h3>Bill to</h3>
        <div className="doc-sec-body">
          <div className="kv"><b>Name:</b><span>{clientName(c)}</span></div>
          {c.street || c.town ? <div className="kv"><b>Address:</b><span>{[c.street, c.town, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span></div> : null}
          {c.phone ? <div className="kv"><b>Phone:</b><span>{c.phone}</span></div> : null}
          {c.email ? <div className="kv"><b>Email:</b><span>{c.email}</span></div> : null}
        </div>
      </section>

      <section className="doc-sec" data-break>
        <h3>Work completed</h3>
        <div className="doc-sec-body">
          <table className="doc-table">
            <thead><tr><th>Description</th><th className="r">Qty / days</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={l.id}><td>{l.desc}</td><td className="r">{l.qty}</td><td className="r">{money(l.unit)}</td><td className="r">{money(t.amounts[i]!)}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="doc-sum">
            <tbody>
              <tr><th>Subtotal</th><td>{money(t.subtotal)}</td></tr>
              {t.tax ? <tr><th>Tax ({invoice.tax_rate}%)</th><td>{money(t.tax)}</td></tr> : null}
              <tr><th><b>Total</b></th><td><b>{money(t.total)}</b></td></tr>
              {payments.map((p, i) => (
                <tr key={i}><th>Paid {niceDate(p.received_on)} ({METHOD_LABEL[p.method]})</th><td>−{money(Number(p.amount))}</td></tr>
              ))}
              <tr className="grand"><th>{balance > 0 ? 'Balance due' : 'Paid in full'}</th><td>{money(balance)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {(company.payment_instructions || invoice.notes) && (
        <section className="doc-sec" data-break>
          <h3>Payment</h3>
          <div className="doc-sec-body">
            {company.payment_instructions && <p className="pre" style={{ margin: '0 0 6px' }}>{company.payment_instructions}</p>}
            {invoice.notes && <p className="pre doc-muted" style={{ margin: 0 }}>{invoice.notes}</p>}
          </div>
        </section>
      )}
    </article>
  );
}
