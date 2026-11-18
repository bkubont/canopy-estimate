import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Chips, Field, MultiChips } from '../../components/ui';
import { clientName, DEBRIS, hasSeptic, SEPTIC, SITE_CONDITIONS } from '../../lib/estimate';
import type { Client } from '../../lib/types';
import { ClientPicker } from './ClientPicker';
import type { StepProps } from './types';

export function StepClient({ job, updateJob }: StepProps) {
  const [picking, setPicking] = useState(false);
  const setClient = (k: keyof Client, v: string) => updateJob((j) => ({ ...j, client: { ...j.client, [k]: v } }));
  const setSite = <K extends keyof typeof job.site>(k: K, v: (typeof job.site)[K]) => updateJob((j) => ({ ...j, site: { ...j.site, [k]: v } }));
  const input = (k: keyof Client, label: string, attrs: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label}><input {...attrs} value={job.client[k]} onChange={(e) => setClient(k, e.target.value)} /></Field>
  );

  return (
    <div className="wizard-grid two-col">
      <section className="card">
        <div className="sec-head">
          <h2><Icon name="user" size={18} />Client</h2>
          <button type="button" className="btn sm" onClick={() => setPicking(true)}>
            <Icon name="contact" size={16} />{clientName(job.client) ? 'Change' : 'Pick from contacts'}
          </button>
        </div>
        <div className="grid-2">
          {input('firstName', 'First name', { autoCapitalize: 'words', autoComplete: 'given-name' })}
          {input('lastName', 'Last name', { autoCapitalize: 'words', autoComplete: 'family-name' })}
          {input('phone', 'Phone', { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
          {input('email', 'Email', { type: 'email', inputMode: 'email', autoComplete: 'email' })}
        </div>
        {input('company', 'Company', { autoCapitalize: 'words', autoComplete: 'organization' })}
        {input('street', 'Address', { autoCapitalize: 'words', autoComplete: 'address-line1' })}
        <div className="grid-town">
          {input('town', 'Town', { autoCapitalize: 'words', autoComplete: 'address-level2' })}
          <Field label="State"><input value={job.client.state} maxLength={2} autoCapitalize="characters" onChange={(e) => setClient('state', e.target.value.toUpperCase())} /></Field>
          {input('zip', 'ZIP', { inputMode: 'numeric', autoComplete: 'postal-code' })}
        </div>
      </section>

      <div>
        <section className="card">
          <div className="sec-head"><h2><Icon name="pin" size={18} />Site</h2></div>
          <h4 className="label">Conditions</h4>
          <MultiChips label="Site conditions" options={SITE_CONDITIONS} value={job.site.conditions} onChange={(v) => setSite('conditions', v)} />
          <input className="mt" placeholder="Other conditions…" aria-label="Other site conditions" value={job.site.other} onChange={(e) => setSite('other', e.target.value)} />

          <h4 className="label">Septic &amp; drain field</h4>
          <Chips label="Septic and drain field" options={SEPTIC} value={job.site.septic} onChange={(v) => setSite('septic', v)} />
          {hasSeptic(job.site.septic) && (
            <input className="mt" placeholder="Where is it? e.g. back yard, flagged" aria-label="Where the septic or drain field is"
              value={job.site.septic_where} onChange={(e) => setSite('septic_where', e.target.value)} />
          )}

          <h4 className="label">Wood &amp; debris</h4>
          <Chips label="Wood and debris" options={DEBRIS} value={job.site.debris} onChange={(v) => setSite('debris', v)} />

          <div className="mt" />
          <Field label="Parking"><input placeholder="Street, driveway, yard…" value={job.site.parking} onChange={(e) => setSite('parking', e.target.value)} /></Field>
        </section>

        <section className="card">
          <Field label="Notes for the client" hint="Printed on the estimate.">
            <textarea rows={2} value={job.client_notes} onChange={(e) => updateJob((j) => ({ ...j, client_notes: e.target.value }))} />
          </Field>
          <div className="internal">
            <Field label="Internal notes" hint="Gate codes, dogs, access, pricing reasoning. Never on the estimate, PDF, texts or customer link.">
              <textarea rows={2} value={job.internal_notes} onChange={(e) => updateJob((j) => ({ ...j, internal_notes: e.target.value }))} />
            </Field>
          </div>
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
