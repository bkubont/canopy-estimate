import type { ChangeOrder, Client, CustomerPricing, Job, JobPricing, Organization, OrgPricing, Site, Tree } from './types';

// ---------------------------------------------------------------- pick lists
// Carried over unchanged from the original app (northern Michigan work).

export const SPECIES_GROUPS = [
  {
    label: 'Hardwoods',
    options: [
      'Sugar Maple', 'Red Maple', 'Silver Maple', 'Ash', 'Northern Red Oak', 'White Oak', 'Burr Oak',
      'American Beech', 'Basswood', 'Birch', 'Aspen', 'Black Cherry', 'Elm', 'Cottonwood', 'Willow',
      'Boxelder', 'Ironwood', 'Serviceberry', 'Fruit tree',
    ],
  },
  { label: 'Softwoods', options: ['White Pine', 'Red Pine', 'Cedar', 'Eastern Hemlock', 'Balsam Fir', 'Spruce', 'Jack Pine', 'Tamarack'] },
  { label: 'Other', options: ['Unknown'] },
];
export const ALL_SPECIES = SPECIES_GROUPS.flatMap((g) => g.options);
/** Shown first in the tree sheet until the company's own history takes over. */
export const DEFAULT_COMMON_SPECIES = ['Sugar Maple', 'Red Maple', 'Ash', 'Northern Red Oak', 'White Pine', 'Birch', 'Aspen', 'Spruce'];

export const WORK = [
  'Removal', 'Removal + stump grinding', 'Canopy raise', 'Trimming / pruning', 'Crown reduction',
  'Deadwood removal', 'Stump grinding only', 'Cabling / bracing', 'Emergency / storm work', 'Land clearing',
];
export const LOCATIONS = ['Front Yard', 'Backyard', 'Side Yard', 'Near Utility Lines', 'Over Structure', 'Driveway', 'Tree Line'];
export const SIZES: [string, string][] = [
  ['under12', 'Under 12″'], ['12-18', '12–18″'], ['18-24', '18–24″'], ['24-36', '24–36″'], ['over36', 'Over 36″'],
];
export const sizeLabel = (key: string) => SIZES.find(([k]) => k === key)?.[1] ?? '';
export const CONDITIONS = ['Healthy', 'Diseased', 'Storm-damaged', 'Dead', 'Leaning', 'Pest', 'Hollow'];
export const SITE_CONDITIONS = ['Clear Access', 'Restricted Access', 'Uneven Terrain', 'Hillside', 'Overhead wires', 'Ground protection needed'];
export const DEBRIS = ['Leave all', 'Leave wood (haul brush)', 'Haul all', 'Cut and stack', 'Hide it'];
export const CHANGE_REASONS = [
  'Unforeseen circumstances / hazards', 'Access worse than expected', 'Weather delay', 'Equipment needed', 'Client request', 'Other',
];
/** Smith Equipment day-rate costs. The company's own remembered costs override these. */
export const EQUIPMENT: [string, number][] = [
  ['Mini skid steer', 245], ['Towable boom 55′', 290], ['Boom lift 40′', 410], ['Boom lift 50′', 425],
  ['Boom lift 60′', 450], ['Stump grinder', 285], ['High-speed stump grinder', 385], ['Wood chipper', 375],
  ['Dump trailer', 150], ['Grapple (with machine)', 125], ['Log splitter', 75],
];
export const DAY_CHOICES: [number, string][] = [[0.5, '½ day'], [1, '1 day'], [1.5, '1½ days'], [2, '2 days'], [3, '3 days'], [4, '4 days'], [5, '5 days']];
export const OTHER_COST_CHOICES: [number, string][] = [[0, 'None'], [50, '$50'], [100, '$100'], [150, '$150'], [250, '$250']];
export const DEPOSIT_CHOICES: [number, string][] = [[0, 'None'], [25, '25%'], [50, '50%']];
export const VALID_CHOICES: [number, string][] = [[15, '15 days'], [30, '30 days'], [60, '60 days'], [90, '90 days']];

export const STATUS_LABEL: Record<Job['status'], string> = {
  pending: 'Pending', approved: 'Approved', scheduled: 'Scheduled', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done',
};

// ---------------------------------------------------------------- helpers

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n: number) => fmt.format(n || 0);
export const daysLabel = (d: number) => (d === 0.5 ? '½ day' : d === 1 ? '1 day' : d === 1.5 ? '1½ days' : `${d} days`);

/** Today's date in Michigan, as YYYY-MM-DD. */
export function todayYmd(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p;
}
export function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const niceDate = (ymd: string | null | undefined) =>
  ymd ? new Date(`${ymd.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';

export const clientName = (c: Partial<Client> | undefined) =>
  [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() || c?.company || '';

export const workLabel = (t: Pick<Tree, 'work'>) => (t.work ?? []).join(', ');
export const treeTitle = (t: Tree) => `${t.qty > 1 ? `${t.qty} × ` : ''}${t.species || 'Tree'}${t.work?.length ? ` — ${workLabel(t)}` : ''}`;
export const treeDetails = (t: Tree) => [t.location, sizeLabel(t.size), t.condition].filter(Boolean).join(' · ');
export const treeCount = (trees: Tree[]) => trees.reduce((n, t) => n + (num(t.qty) || 1), 0);

// ---------------------------------------------------------------- blanks

export const uid = () => crypto.randomUUID();

export function blankClient(): Client {
  return { firstName: '', lastName: '', company: '', phone: '', email: '', street: '', town: '', state: 'MI', zip: '' };
}
export function blankSite(): Site {
  return { conditions: [], other: '', parking: '', debris: '' };
}
export function blankTree(): Tree {
  return { id: uid(), species: '', work: [], location: '', size: '', condition: '', qty: 1, notes: '', internal_notes: '' };
}
export function blankChangeOrder(): ChangeOrder {
  return { id: uid(), date: todayYmd(), days: 1, reason: '', reason_other: '', trees: [], client_sig: '', client_sig_date: '', signed_by_name: '' };
}

export function blankJob(opts: { org: Organization; number: string; preparedBy: string; contractorSig: string }): Job {
  return {
    id: uid(), org_id: opts.org.id, number: opts.number, stage: 'estimate', status: 'pending', block_reason: '',
    customer_id: null, client: blankClient(), trees: [], site: blankSite(), equipment: [], days: 1, change_orders: [],
    client_notes: '', internal_notes: '', estimate_date: todayYmd(), client_sig: '', client_sig_date: null,
    signed_at: null, signed_by_name: '', signed_via: '', prepared_by_name: opts.preparedBy, contractor_sig: opts.contractorSig,
    assigned_crew: '', deleted_at: null,
  };
}

export function blankPricing(job: Job, defaults: OrgPricing | null | undefined): JobPricing {
  return {
    job_id: job.id, org_id: job.org_id,
    day_rate: num(defaults?.day_rate ?? 2000),
    equipment_markup: num(defaults?.equipment_markup ?? 1.2) || 1,
    equipment_costs: {},
    tax_rate: num(defaults?.tax_rate),
    additional: 0,
    deposit_pct: num(defaults?.deposit_pct),
    deposit_amt: null,
    valid_days: num(defaults?.valid_days) || 30,
    total: 0,
    signed_snapshot: null,
    deleted_at: null,
  };
}

/** Rows saved by older code or partially synced get every field filled in. */
export function normalizeJob(j: Job): Job {
  return {
    ...j,
    client: { ...blankClient(), ...(j.client ?? {}) },
    site: { ...blankSite(), ...(j.site ?? {}) },
    trees: (j.trees ?? []).map((t) => ({ ...blankTree(), ...t })),
    equipment: (j.equipment ?? []).map((e) => ({ id: e.id ?? uid(), desc: e.desc ?? '', qty: num(e.qty) || 1, qty_manual: !!e.qty_manual })),
    change_orders: (j.change_orders ?? []).map((co) => ({ ...blankChangeOrder(), ...co, trees: (co.trees ?? []).map((t) => ({ ...blankTree(), ...t })) })),
    days: num(j.days) || 1,
  };
}

// ---------------------------------------------------------------- pricing

/**
 * Customer-facing prices. Equipment unit price = rental cost × markup, rounded
 * to the cent, exactly as the server computes it for the customer link
 * (public.customer_pricing), so every copy of the estimate agrees.
 */
export function customerPricing(job: Job, p: JobPricing): CustomerPricing {
  if (p.signed_snapshot) return p.signed_snapshot;
  const markup = num(p.equipment_markup) || 1;
  const unit_prices: Record<string, number> = {};
  for (const line of job.equipment) unit_prices[line.id] = round2(num(p.equipment_costs?.[line.id]) * markup);
  return {
    day_rate: num(p.day_rate), unit_prices, tax_rate: num(p.tax_rate), additional: num(p.additional),
    deposit_pct: num(p.deposit_pct), deposit_amt: p.deposit_amt == null ? null : num(p.deposit_amt), valid_days: num(p.valid_days) || 30,
  };
}

export interface Totals {
  baseLabor: number;
  changeLabor: number;
  labor: number;
  equipment: number;
  lines: { id: string; desc: string; qty: number; unit: number; amount: number }[];
  subtotal: number;
  tax: number;
  additional: number;
  total: number;
  deposit: number;
  balance: number;
}

/** Same rules as the original app: tax on labor + equipment; other costs untaxed; deposit is a fixed amount or a % of the total. */
export function totals(job: Pick<Job, 'days' | 'equipment'> & { change_orders: { days: number }[] }, cp: CustomerPricing): Totals {
  const baseLabor = round2(num(job.days) * cp.day_rate);
  const changeLabor = round2((job.change_orders ?? []).reduce((s, co) => s + num(co.days), 0) * cp.day_rate);
  const labor = round2(baseLabor + changeLabor);
  const lines = job.equipment.map((l) => {
    const unit = num(cp.unit_prices[l.id]);
    return { id: l.id, desc: l.desc, qty: num(l.qty), unit, amount: round2(num(l.qty) * unit) };
  });
  const equipment = round2(lines.reduce((s, l) => s + l.amount, 0));
  const subtotal = round2(labor + equipment);
  const tax = round2((subtotal * cp.tax_rate) / 100);
  const additional = round2(cp.additional);
  const total = round2(subtotal + tax + additional);
  const deposit = round2(cp.deposit_amt != null ? Math.min(cp.deposit_amt, total) : (total * Math.min(100, cp.deposit_pct)) / 100);
  return { baseLabor, changeLabor, labor, equipment, lines, subtotal, tax, additional, total, deposit, balance: round2(total - deposit) };
}

/** Owner/office view: what the rentals cost the company and what the markup earns. Never shown to customers. */
export function internalEquipmentSummary(job: Job, p: JobPricing) {
  const cost = round2(job.equipment.reduce((s, l) => s + num(l.qty) * num(p.equipment_costs?.[l.id]), 0));
  const charged = totals(job, customerPricing(job, p)).equipment;
  return { cost, charged, markupEarned: round2(charged - cost) };
}

/** Equipment rental days follow the job days unless someone typed a number. */
export function syncEquipmentDays(job: Job): Job {
  return { ...job, equipment: job.equipment.map((l) => (l.qty_manual ? l : { ...l, qty: num(job.days) || 1 })) };
}

export const isSigned = (j: Pick<Job, 'signed_at'>) => !!j.signed_at;
export const validUntil = (j: Pick<Job, 'estimate_date'>, cp: Pick<CustomerPricing, 'valid_days'>) => addDays(j.estimate_date, cp.valid_days || 30);

// ---------------------------------------------------------------- text summary for texts / emails

export function summaryText(job: Job, cp: CustomerPricing, company: Pick<Organization, 'name' | 'phone' | 'email'>, link?: string) {
  const t = totals(job, cp);
  const first = job.client.firstName || clientName(job.client).split(' ')[0];
  return [
    `Hi${first ? ` ${first}` : ''}, here is your tree service estimate ${job.number} from ${company.name}:`,
    '',
    ...job.trees.map((tr) => `• ${treeTitle(tr)}`),
    '',
    `Total: ${money(t.total)}${t.deposit ? ` (deposit ${money(t.deposit)})` : ''}`,
    `Valid until ${niceDate(validUntil(job, cp))}.`,
    link ? `\nView and sign online: ${link}` : '',
    '',
    `Questions? ${[company.phone, company.email].filter(Boolean).join(' · ')}`,
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
