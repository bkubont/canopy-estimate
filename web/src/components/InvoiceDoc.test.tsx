import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blankClient } from '../lib/estimate';
import type { Invoice, Payment } from '../lib/types';
import { InvoiceDoc, toCustomerInvoice } from './InvoiceDoc';

const inv: Invoice = {
  id: 'i', org_id: 'o', job_id: 'j', number: 'INV-1001', status: 'sent', issue_date: '2026-11-12', due_date: '2026-11-27',
  lines: [{ id: 'a', desc: 'Tree work — 2 days', qty: 2, unit: 2000, taxable: true }, { id: 'b', desc: 'Travel', qty: 1, unit: 100, taxable: false }],
  tax_rate: 6, notes: 'Thank you!', internal_notes: 'SECRET slow payer', sent_at: 'x', voided_at: null, deleted_at: null,
};
const payment: Payment = {
  id: 'p', org_id: 'o', job_id: 'j', invoice_id: null, amount: 500, method: 'check', reference: 'CHK-77731', received_on: '2026-11-01',
  note: 'SECRET-PAYMENT-NOTE', recorded_by_name: 'Pat', voided_at: null, deleted_at: null,
};
const company = { name: 'Advanced Tree Service', contact_name: '', license: '', address: '', phone: '', email: '', website: '', logo_data: '', payment_instructions: 'Checks payable to Advanced Tree Service' };

describe('InvoiceDoc', () => {
  const html = renderToStaticMarkup(<InvoiceDoc data={toCustomerInvoice(company, inv, { number: 'E-1001', client: { ...blankClient(), firstName: 'Dana' } }, [payment])} />);
  it('shows the balance after payments', () => {
    expect(html).toContain('$4,340.00'); // 4000 + 240 tax + 100 untaxed
    expect(html).toContain('$3,840.00');
    expect(html).toContain('Checks payable to Advanced Tree Service');
  });
  it('never shows internal notes, payment notes or check numbers', () => {
    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('CHK-77731');
  });
});
