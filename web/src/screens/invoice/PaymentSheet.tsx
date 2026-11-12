import { useState } from 'react';
import { Chips, Field, MoneyInput, Sheet } from '../../components/ui';
import { money, todayYmd, uid } from '../../lib/estimate';
import { METHOD_LABEL } from '../../lib/invoice';
import type { Payment, PaymentMethod } from '../../lib/types';

const METHODS = (['check', 'cash', 'other'] as PaymentMethod[]).map((m) => [m, METHOD_LABEL[m]] as [PaymentMethod, string]);

/** Record a deposit or a payment received by check, cash or other. Card payments arrive automatically once Stripe is connected. */
export function PaymentSheet({ open, onClose, onSave, title, suggested, base }: {
  open: boolean; onClose: () => void; onSave: (p: Payment) => void; title: string; suggested: number;
  base: Pick<Payment, 'org_id' | 'job_id' | 'invoice_id' | 'recorded_by_name'>;
}) {
  const [amount, setAmount] = useState<number | null>(suggested || null);
  const [method, setMethod] = useState<PaymentMethod>('check');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAmount(suggested || null);
      setMethod('check');
      setReference('');
      setDate(todayYmd());
      setNote('');
      setError('');
    }
  }

  function save() {
    if (!amount || amount <= 0) return setError('Enter the amount received.');
    onSave({ id: uid(), ...base, amount, method, reference: reference.trim(), received_on: date, note: note.trim(), voided_at: null, deleted_at: null });
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <Field label="Amount received"><MoneyInput label="Amount received" value={amount} onChange={setAmount} /></Field>
      {suggested > 0 && amount !== suggested && (
        <button type="button" className="link small" onClick={() => setAmount(suggested)}>Use {money(suggested)}</button>
      )}
      <h4 className="label">How was it paid?</h4>
      <Chips label="Payment method" options={METHODS} value={method} onChange={(v) => v && setMethod(v)} required />
      {method === 'check' && <div className="mt"><Field label="Check number"><input value={reference} onChange={(e) => setReference(e.target.value)} inputMode="numeric" /></Field></div>}
      <Field label="Date received"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Note (internal)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="button" className="btn primary block" onClick={save}>Save payment</button>
      <p className="hint">Card payments will be recorded automatically once online card payments are turned on.</p>
    </Sheet>
  );
}
