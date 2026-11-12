import { useState } from 'react';
import { Chips, Field, MultiChips } from '../../components/ui';
import { clientName, DEBRIS, SITE_CONDITIONS } from '../../lib/estimate';
import type { Client } from '../../lib/types';
import { ClientPicker } from './ClientPicker';
import type { StepProps } from './types';

const CLIENT_FIELDS: [keyof Client, string, React.InputHTMLAttributes<HTMLInputElement>][] = [
  ['company', 'Company', { autoCapitalize: 'words', autoComplete: 'organization' }],
  ['phone', 'Phone', { type: 'tel', inputMode: 'tel', autoComplete: 'tel' }],
  ['email', 'Email', { type: 'email', inputMode: 'email', autoComplete: 'email' }],
  ['street', 'Address', { autoCapitalize: 'words', autoComplete: 'address-line1' }],
  ['town', 'Town', { autoCapitalize: 'words', autoComplete: 'address-level2' }],
];

export function StepClient({ job, updateJob }: StepProps) {
  const [picking, setPicking] = useState(false);
  const setClient = (k: keyof Client, v: string) => updateJob((j) => ({ ...j, client: { ...j.client, [k]: v } }));
  const setSite = <K extends keyof typeof job.site>(k: K, v: (typeof job.site)[K]) => updateJob((j) => ({ ...j, site: { ...j.site, [k]: v } }));

  return (
    <div className="wizard-grid two-col">
      <div>
        <h2 className="step-title">Client</h2>
        <button type="button" className="btn block" onClick={() => setPicking(true)} style={{ marginBottom: 12 }}>
          👤 {clientName(job.client) ? 'Choose a different client' : 'Choose client'}
        </button>
        <section className="card">
          <div className="two">
            <Field label="First name"><input value={job.client.firstName} onChange={(e) => setClient('firstName', e.target.value)} autoCapitalize="words" autoComplete="given-name" /></Field>
            <Field label="Last name"><input value={job.client.lastName} onChange={(e) => setClient('lastName', e.target.value)} autoCapitalize="words" autoComplete="family-name" /></Field>
          </div>
          {CLIENT_FIELDS.map(([k, label, attrs]) => (
            <Field key={k} label={label}><input {...attrs} value={job.client[k]} onChange={(e) => setClient(k, e.target.value)} /></Field>
          ))}
          <div className="two">
            <Field label="State"><input value={job.client.state} maxLength={2} autoCapitalize="characters" onChange={(e) => setClient('state', e.target.value.toUpperCase())} /></Field>
            <Field label="ZIP"><input value={job.client.zip} inputMode="numeric" autoComplete="postal-code" onChange={(e) => setClient('zip', e.target.value)} /></Field>
          </div>
        </section>
      </div>

      <div>
        <h2 className="step-title">Site</h2>
        <section className="card">
          <h4 className="label">Site conditions</h4>
          <MultiChips label="Site conditions" options={SITE_CONDITIONS} value={job.site.conditions} onChange={(v) => setSite('conditions', v)} />
          <input className="mt" placeholder="Other…" aria-label="Other site conditions" value={job.site.other} onChange={(e) => setSite('other', e.target.value)} />
          <h4 className="label">Parking</h4>
          <textarea rows={2} aria-label="Parking" placeholder="Street, driveway, yard…" value={job.site.parking} onChange={(e) => setSite('parking', e.target.value)} />
          <h4 className="label">Wood &amp; debris</h4>
          <Chips label="Wood and debris" options={DEBRIS} value={job.site.debris} onChange={(v) => setSite('debris', v)} />
        </section>

        <section className="card">
          <Field label="Notes for the client" hint="Printed on the estimate.">
            <textarea rows={3} value={job.client_notes} onChange={(e) => updateJob((j) => ({ ...j, client_notes: e.target.value }))} />
          </Field>
        </section>
        <section className="internal">
          <Field label="Internal notes" hint="For your team only: gate codes, dogs, access, pricing reasoning. Never on the estimate, PDF, texts or customer link.">
            <textarea rows={3} value={job.internal_notes} onChange={(e) => updateJob((j) => ({ ...j, internal_notes: e.target.value }))} />
          </Field>
        </section>
      </div>

      <ClientPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(client, customerId) => {
          updateJob((j) => ({ ...j, client, customer_id: customerId }));
          setPicking(false);
        }}
      />
    </div>
  );
}
