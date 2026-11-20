import { useMemo, useRef, useState } from 'react';
import { buildCrewSheet, buildCustomerLabels, buildJobLabel, type CrewLabel } from '../lib/crewPrint';
import { elementToPdf, shareOrDownload } from '../lib/pdf';
import { jobSchedule } from '../lib/calendar';
import { useReady, useRow, useRows } from '../lib/session';
import type { Customer, CustomerProperty, Job } from '../lib/types';
import { Icon } from './Icon';
import { CrewDoc } from './CrewDoc';
import { CrewLabelDoc } from './CrewLabelDoc';
import { PrintOnly, printDoc } from './ui';

type Mode = 'sheet' | 'labels';

/** Print / PDF crew sheet and address labels from a job (+ linked property). */
export function CrewPrintActions({ job, compact }: { job: Job; compact?: boolean }) {
  const { engine, org } = useReady();
  const company = useRow(engine, 'organizations', org.org_id);
  const property = useRow(engine, 'customer_properties', job.property_id || undefined);
  const events = useRows(engine, 'events');
  const sched = jobSchedule(job.id, events ?? []);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState<Mode>('sheet');
  const sheetRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);

  const sheet = useMemo(
    () => buildCrewSheet(job, {
      companyName: company?.name || 'Canopy',
      property: property && !property.deleted_at ? property : null,
      scheduleStart: sched.start,
      scheduleEnd: sched.end,
    }),
    [job, company, property, sched.start, sched.end],
  );
  const labels = useMemo(
    () => expandLabels([buildJobLabel(job, property && !property.deleted_at ? property : null)]),
    [job, property],
  );

  async function pdf(which: Mode) {
    const el = which === 'sheet' ? sheetRef.current : labelsRef.current;
    if (!el) return;
    setBusy(which);
    setMsg('');
    const wasHidden = el.hidden;
    el.hidden = false;
    try {
      const blob = await elementToPdf(el);
      const name = which === 'sheet'
        ? `${company?.name || 'Canopy'} ${job.number} crew.pdf`
        : `${company?.name || 'Canopy'} ${job.number} labels.pdf`;
      await shareOrDownload(blob, name, `${job.number} crew ${which}`);
    } catch {
      setMsg('Couldn’t make the PDF on this device. Use Print and choose “Save as PDF” instead.');
    } finally {
      el.hidden = wasHidden;
      setBusy('');
    }
  }

  return (
    <div className="crew-print">
      {!compact && <h4 className="label">Crew printouts</h4>}
      <div className="btn-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={`btn sm${mode === 'sheet' ? ' primary' : ''}`} onClick={() => setMode('sheet')}>
          Crew sheet
        </button>
        <button type="button" className={`btn sm${mode === 'labels' ? ' primary' : ''}`} onClick={() => setMode('labels')}>
          Labels
        </button>
      </div>
      <div className="btn-grid mt">
        <button type="button" className="btn" onClick={() => printDoc(mode === 'sheet' ? 'crew' : 'labels')}>
          <Icon name="printer" />Print {mode === 'sheet' ? 'sheet' : 'labels'}
        </button>
        <button type="button" className="btn" onClick={() => void pdf(mode)} disabled={!!busy}>
          {busy === mode ? 'Making PDF…' : <><Icon name="download" />PDF {mode === 'sheet' ? 'sheet' : 'labels'}</>}
        </button>
      </div>
      <p className="hint">
        {mode === 'sheet'
          ? 'Gate, access, hazards, trees, and team notes — no prices.'
          : 'Address labels (Avery 5160). Print at 100% / actual size.'}
      </p>
      {msg && <p className="hint" role="status">{msg}</p>}
      <div className="doc-preview" ref={sheetRef} hidden={mode !== 'sheet'}>
        <CrewDoc sheet={sheet} />
      </div>
      <div className="doc-preview label-preview" ref={labelsRef} hidden={mode !== 'labels'}>
        <CrewLabelDoc labels={labels} title={`${job.number} labels`} />
      </div>
      <PrintOnly doc="crew"><CrewDoc sheet={sheet} /></PrintOnly>
      <PrintOnly doc="labels"><CrewLabelDoc labels={labels} title={`${job.number} labels`} /></PrintOnly>
    </div>
  );
}

/** Print property address labels from a customer card. */
export function CustomerLabelActions({
  customer,
  properties,
}: {
  customer: Customer;
  properties: CustomerProperty[];
}) {
  const labels = useMemo(
    () => expandLabels(buildCustomerLabels(customer, properties)),
    [customer, properties],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  if (!labels.some((l) => l.name || l.lines.length)) {
    return <p className="hint">Add a property address to print labels.</p>;
  }

  async function pdf() {
    if (!ref.current) return;
    setBusy(true);
    setMsg('');
    try {
      const blob = await elementToPdf(ref.current);
      await shareOrDownload(blob, `${customer.last_name || customer.company || 'customer'}-labels.pdf`, 'Address labels');
    } catch {
      setMsg('Couldn’t make the PDF on this device. Use Print and choose “Save as PDF” instead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crew-print">
      <div className="btn-grid">
        <button type="button" className="btn" onClick={() => printDoc('labels')}>
          <Icon name="printer" />Print labels
        </button>
        <button type="button" className="btn" onClick={() => void pdf()} disabled={busy}>
          {busy ? 'Making PDF…' : <><Icon name="download" />PDF labels</>}
        </button>
      </div>
      <p className="hint">Avery 5160 address labels. Print at 100% / actual size.</p>
      {msg && <p className="hint" role="status">{msg}</p>}
      <div className="doc-preview label-preview" ref={ref}>
        <CrewLabelDoc labels={labels} />
      </div>
      <PrintOnly doc="labels"><CrewLabelDoc labels={labels} /></PrintOnly>
    </div>
  );
}

/** Repeat the first label across a sheet so one job fills printable labels. */
function expandLabels(base: CrewLabel[]): CrewLabel[] {
  const live = base.filter((l) => l.name || l.lines.length);
  if (!live.length) return [];
  if (live.length >= 30) return live.slice(0, 30);
  const out: CrewLabel[] = [];
  while (out.length < 30) {
    for (const l of live) {
      if (out.length >= 30) break;
      out.push(l);
    }
  }
  return out;
}
