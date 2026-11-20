/**
 * Phase E — crew printouts / labels from Estimate job + CRM property.
 * Builds printable payloads with site/access notes and tree crew notes.
 * Never includes prices (crew must not see money).
 */

import { dayLabel } from './calendar';
import { clientName, hasSeptic, septicLine, treeDetails, treeTitle } from './estimate';
import { parseNotes } from './notes';
import { propertyAddress } from './crmUi';
import type { Client, Customer, CustomerProperty, Job, Site } from './types';

export type CrewSiteInfo = {
  gate: string;
  access: string;
  treeNotes: string;
  hazards: string[];
  conditions: string[];
  parking: string;
  debris: string;
  septic: string;
  septicWarn: boolean;
  other: string;
};

export type CrewTreeLine = {
  title: string;
  details: string;
  /** Customer-facing tree notes (safe / already on estimate). */
  notes: string;
  /** Estimator/crew planning notes — shown on crew sheet only. */
  crewNotes: string;
};

export type CrewSheet = {
  number: string;
  companyName: string;
  clientName: string;
  company: string;
  phone: string;
  addressLines: string[];
  scheduleLabel: string;
  days: number;
  equipment: string[];
  site: CrewSiteInfo;
  trees: CrewTreeLine[];
  teamNotes: { text: string; by: string; when: string }[];
  clientNotes: string;
};

export type CrewLabel = {
  name: string;
  lines: string[];
  phone?: string;
  meta?: string;
};

/** Pull Gate / Access / Trees lines that the picker wrote into internal_notes. */
export function parsePropertyFieldsFromNotes(internalNotes: string | null | undefined): {
  gate: string;
  access: string;
  treeNotes: string;
} {
  let gate = '';
  let access = '';
  let treeNotes = '';
  for (const para of parseNotes(internalNotes)) {
    for (const raw of para.text.split('\n')) {
      const line = raw.trim();
      const m = /^(Gate|Access|Trees):\s*(.*)$/i.exec(line);
      if (!m) continue;
      const kind = m[1]!.toLowerCase();
      const val = m[2]!.trim();
      if (kind === 'gate' && !gate) gate = val;
      else if (kind === 'access' && !access) access = val;
      else if (kind === 'trees' && !treeNotes) treeNotes = val;
    }
  }
  return { gate, access, treeNotes };
}

function clientAddressLines(c: Client): string[] {
  const line1 = (c.street || '').trim();
  const line2 = [c.town, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ').trim();
  return [line1, line2].filter(Boolean);
}

function propertyAddressLines(p: Pick<CustomerProperty, 'street' | 'town' | 'state' | 'zip'>): string[] {
  const line1 = p.street.trim();
  const line2 = [p.town.trim(), [p.state.trim(), p.zip.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [line1, line2].filter(Boolean);
}

function mergeHazards(site: Site, property?: CustomerProperty | null): string[] {
  const fromProp = (property?.hazards ?? []).map((h) => h.trim()).filter(Boolean);
  const other = (site.other || '').trim();
  const out = [...fromProp];
  if (other) {
    for (const part of other.split(/[;,]/).map((s) => s.trim()).filter(Boolean)) {
      if (!out.some((h) => h.toLowerCase() === part.toLowerCase())) out.push(part);
    }
  }
  return out;
}

/** Team notes minus the structured Gate/Access/Trees lines (those show in Site). */
export function teamNotesForCrew(internalNotes: string | null | undefined) {
  return parseNotes(internalNotes).filter((n) => {
    const lines = n.text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return false;
    return !lines.every((l) => /^(Gate|Access|Trees):/i.test(l));
  });
}

export function buildCrewSheet(
  job: Job,
  opts: {
    companyName: string;
    property?: CustomerProperty | null;
    scheduleStart?: string | null;
    scheduleEnd?: string | null;
  },
): CrewSheet {
  const fromNotes = parsePropertyFieldsFromNotes(job.internal_notes);
  const p = opts.property && !opts.property.deleted_at ? opts.property : null;
  const addressLines = p ? propertyAddressLines(p) : clientAddressLines(job.client);
  const allTrees = [...(job.trees ?? []), ...(job.change_orders ?? []).flatMap((c) => c.trees ?? [])];
  const coDays = (job.change_orders ?? []).reduce((s, c) => s + (c.days || 0), 0);
  let scheduleLabel = 'Not on the calendar yet';
  if (opts.scheduleStart) {
    const a = dayLabel(opts.scheduleStart);
    const b = opts.scheduleEnd && opts.scheduleEnd !== opts.scheduleStart ? dayLabel(opts.scheduleEnd) : '';
    scheduleLabel = b ? `${a} – ${b}` : a;
  }

  return {
    number: job.number,
    companyName: opts.companyName,
    clientName: clientName(job.client),
    company: job.client.company || '',
    phone: job.client.phone || '',
    addressLines: addressLines.length ? addressLines : clientAddressLines(job.client),
    scheduleLabel,
    days: (job.days || 0) + coDays,
    equipment: (job.equipment ?? []).map((e) => e.desc).filter(Boolean),
    site: {
      gate: (p?.gate_code || fromNotes.gate).trim(),
      access: (p?.access || fromNotes.access).trim(),
      treeNotes: (p?.tree_notes || fromNotes.treeNotes).trim(),
      hazards: mergeHazards(job.site, p),
      conditions: [...(job.site.conditions ?? [])],
      parking: job.site.parking || '',
      debris: job.site.debris || '',
      septic: septicLine(job.site) || '',
      septicWarn: hasSeptic(job.site.septic),
      other: '',
    },
    trees: allTrees.map((t) => ({
      title: treeTitle(t),
      details: treeDetails(t),
      notes: (t.notes || '').trim(),
      crewNotes: (t.internal_notes || '').trim(),
    })),
    teamNotes: teamNotesForCrew(job.internal_notes),
    clientNotes: (job.client_notes || '').trim(),
  };
}

export function buildJobLabel(job: Job, property?: CustomerProperty | null): CrewLabel {
  const p = property && !property.deleted_at ? property : null;
  const name = clientName(job.client) || job.client.company || job.number;
  const lines = p ? propertyAddressLines(p) : clientAddressLines(job.client);
  return {
    name,
    lines: lines.length ? lines : clientAddressLines(job.client),
    phone: job.client.phone || undefined,
    meta: job.number,
  };
}

/** One label per live property (customer card). Falls back to flat address. */
export function buildCustomerLabels(
  customer: Pick<Customer, 'first_name' | 'last_name' | 'company' | 'phone' | 'street' | 'town' | 'state' | 'zip'>,
  properties: CustomerProperty[],
): CrewLabel[] {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
    || customer.company
    || customer.phone
    || 'Customer';
  const live = properties.filter((p) => !p.deleted_at).sort((a, b) => a.sort - b.sort);
  if (live.length) {
    return live.map((p) => ({
      name,
      lines: propertyAddressLines(p),
      phone: customer.phone || undefined,
      meta: propertyAddress(p) || undefined,
    })).filter((l) => l.lines.length);
  }
  const lines = [customer.street, [customer.town, [customer.state, customer.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')]
    .map((s) => (s || '').trim())
    .filter(Boolean);
  if (!lines.length) return [];
  return [{ name, lines, phone: customer.phone || undefined }];
}

/** Assert sheet payload has no money-looking fields (tests + docs). */
export function crewSheetHasNoPrices(sheet: CrewSheet): boolean {
  const blob = JSON.stringify(sheet);
  return !/\$\s*\d/.test(blob) && !/"total"/.test(blob) && !/"day_rate"/.test(blob);
}

export { hasSeptic };
