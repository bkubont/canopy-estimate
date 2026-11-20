export type Role = 'owner' | 'office' | 'crew';

/** Columns every synced row carries. The server owns updated_at / updated_by. */
export interface SyncCols {
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
  deleted_at: string | null;
}

export interface Organization extends SyncCols {
  id: string;
  name: string;
  contact_name: string;
  license: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_path: string;
  logo_data: string;
  payment_instructions?: string;
  next_estimate_no?: number;
  next_invoice_no?: number;
}

/** Owner/office only. Crew devices never receive this table. */
export interface OrgPricing extends SyncCols {
  org_id: string;
  day_rate: number;
  tax_rate: number;
  deposit_pct: number;
  valid_days: number;
  equipment_markup: number;
  equipment_costs: Record<string, number>;
  invoice_due_days?: number;
}

export interface Member extends SyncCols {
  org_id: string;
  user_id: string;
  role: Role;
  display_name: string;
  signature_data: string;
}

export interface Customer extends SyncCols {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  company: string;
  /** Denormalized primary phone — mirror of first customer_phones row. */
  phone: string;
  /** Denormalized primary email — mirror of first customer_emails row. */
  email: string;
  /** Denormalized primary property address parts — mirror of first property. */
  street: string;
  town: string;
  state: string;
  zip: string;
  notes: string;
}

/** Labeled phone on a customer (CRM). Flat customers.phone stays the primary mirror. */
export interface CustomerPhone extends SyncCols {
  id: string;
  org_id: string;
  customer_id: string;
  label: string;
  value: string;
  sort: number;
}

/** Labeled email on a customer (CRM). Flat customers.email stays the primary mirror. */
export interface CustomerEmail extends SyncCols {
  id: string;
  org_id: string;
  customer_id: string;
  label: string;
  value: string;
  sort: number;
}

/**
 * Structured site (D8): street / town / state / ZIP plus access notes.
 * Flat customers.street/town/state/zip mirror the primary property.
 */
export interface CustomerProperty extends SyncCols {
  id: string;
  org_id: string;
  customer_id: string;
  street: string;
  town: string;
  state: string;
  zip: string;
  gate_code: string;
  access: string;
  hazards: string[];
  tree_notes: string;
  sort: number;
}

export type TagGroupMode = 'one' | 'many';

export interface TagGroup extends SyncCols {
  id: string;
  org_id: string;
  name: string;
  /** Stable key within the org (e.g. stage, type, source). */
  slug: string;
  mode: TagGroupMode;
  pipeline: boolean;
  allow_new: boolean;
  sort: number;
}

export interface Tag extends SyncCols {
  id: string;
  org_id: string;
  tag_group_id: string;
  name: string;
  /** Stable key within the group (e.g. past, booked). */
  slug: string;
  color: string;
  sort: number;
}

/** Composite key: customer_id + tag_id (same pattern as members). */
export interface CustomerTag extends SyncCols {
  org_id: string;
  customer_id: string;
  tag_id: string;
}

export type CustomerActivityType = 'note' | 'call' | 'text' | 'stage' | 'created' | 'imported';

export interface CustomerActivity extends SyncCols {
  id: string;
  org_id: string;
  customer_id: string;
  type: CustomerActivityType;
  body: string;
  at: string;
  created_by: string | null;
}

/** Tag filter on a smart list — stable group/tag slugs (not UUIDs). */
export interface SmartListTagRef {
  group: string;
  tag: string;
}

/** Saved CRM filter (Phase E / D7). Org-scoped; syncs like other CRM tables. */
export interface SmartList extends SyncCols {
  id: string;
  org_id: string;
  name: string;
  query: string;
  /** Pipeline stage slugs; empty = any stage. */
  stage_slugs: string[];
  /** Extra tags the customer must have (AND). */
  tag_refs: SmartListTagRef[];
  /** Estimate-sent and last stage change older than 7 days. */
  cold_only: boolean;
  /** Show as a section on Today. */
  pin_today: boolean;
  sort: number;
  created_by: string | null;
}

export interface Job extends SyncCols {
  id: string;
  org_id: string;
  number: string;
  stage: 'estimate' | 'work_order' | 'invoice' | 'paid' | 'archived';
  status: 'pending' | 'approved' | 'scheduled' | 'in_progress' | 'blocked' | 'done';
  block_reason: string;
  customer_id: string | null;
  /** Optional CRM property used for this estimate's site snapshot (Phase C). */
  property_id?: string | null;
  client: Client;
  trees: Tree[];
  site: Site;
  equipment: EquipLine[];
  days: number;
  change_orders: ChangeOrder[];
  /** Printed on the estimate. */
  client_notes: string;
  /** Never printed or sent to the customer. */
  internal_notes: string;
  estimate_date: string;
  client_sig: string;
  client_sig_date: string | null;
  signed_at: string | null;
  signed_by_name: string;
  signed_via: '' | 'device' | 'link';
  /** Set when the customer said no or backed out; the job keeps its record and can be reopened. */
  cancelled_at?: string | null;
  cancel_reason?: string;
  prepared_by_name: string;
  contractor_sig: string;
  assigned_crew: string;
}

export interface JobPricing extends SyncCols {
  job_id: string;
  org_id: string;
  day_rate: number;
  equipment_markup: number;
  equipment_costs: Record<string, number>;
  tax_rate: number;
  additional: number;
  deposit_pct: number;
  deposit_amt: number | null;
  valid_days: number;
  total: number;
  /** Customer-facing prices at the moment of signing. */
  signed_snapshot: CustomerPricing | null;
  share_token?: string | null;
}

export interface Client {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  email: string;
  street: string;
  town: string;
  state: string;
  zip: string;
}

export interface Tree {
  id: string;
  species: string;
  work: string[];
  location: string;
  size: string;
  condition: string;
  qty: number;
  /** Printed. */
  notes: string;
  /** Never printed. */
  internal_notes: string;
}

export interface Site {
  conditions: string[];
  other: string;
  parking: string;
  debris: string;
  /** Septic tank / drain field on the property: keep heavy equipment and log drops off it. */
  septic: string;
  /** Where the tank or drain field is, e.g. "back yard, flagged". */
  septic_where: string;
}

export interface EquipLine {
  id: string;
  desc: string;
  qty: number;
  /** True once someone typed a quantity; otherwise it follows the job days. */
  qty_manual: boolean;
}

export interface ChangeOrder {
  id: string;
  date: string;
  days: number;
  reason: string;
  reason_other: string;
  trees: Tree[];
  client_sig: string;
  client_sig_date: string;
  signed_by_name: string;
  /** When the client signed it (exact time; older change orders have only the date). */
  signed_at?: string;
}

/** What the customer is charged: equipment as marked-up unit prices, never cost. */
export interface CustomerPricing {
  day_rate: number;
  unit_prices: Record<string, number>;
  tax_rate: number;
  additional: number;
  deposit_pct: number;
  deposit_amt: number | null;
  valid_days: number;
}

export interface CalEvent extends SyncCols {
  id: string;
  org_id: string;
  type: string;
  title: string;
  status: string;
  all_day: boolean;
  unscheduled: boolean;
  starts: string;
  ends: string;
  job_id: string | null;
  address: string;
  town: string;
  crew: string;
  equipment: string[];
  notes: string;
  /** User ids of the crew members on this entry. */
  assigned_to: string[];
  /** Position within its day; lower comes first. */
  sort_order: number;
}

export interface InvoiceLine {
  id: string;
  desc: string;
  qty: number;
  unit: number;
  /** Other costs (travel, misc.) are not taxed, matching the estimate. */
  taxable: boolean;
}

export interface Invoice extends SyncCols {
  id: string;
  org_id: string;
  job_id: string;
  number: string;
  status: 'draft' | 'sent' | 'void';
  issue_date: string;
  due_date: string;
  lines: InvoiceLine[];
  tax_rate: number;
  /** Computed by the server from the lines; the app shows its own matching calculation. */
  subtotal?: number;
  tax?: number;
  total?: number;
  notes: string;
  internal_notes: string;
  sent_at: string | null;
  voided_at: string | null;
  share_token?: string | null;
}

export type PaymentMethod = 'cash' | 'check' | 'card' | 'other';

export interface Payment extends SyncCols {
  id: string;
  org_id: string;
  job_id: string;
  invoice_id: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string;
  received_on: string;
  note: string;
  recorded_by_name: string;
  voided_at: string | null;
}

export type PhotoKind = 'tree' | 'before' | 'during' | 'after' | 'receipt';
/** A picture's details; the picture itself is a file in storage at `path`. */
export interface Photo extends SyncCols {
  id: string;
  org_id: string;
  job_id: string | null;
  tree_id: string | null;
  kind: PhotoKind;
  path: string;
  width: number;
  height: number;
  bytes: number;
  taken_by: string | null;
  taken_by_name: string;
  note: string;
  /** Set for a receipt: the expense it belongs to. */
  expense_id?: string | null;
}

export type PaidWith = 'cash' | 'card' | 'check' | 'other';
export interface Expense extends SyncCols {
  id: string;
  org_id: string;
  spent_on: string;
  vendor: string;
  amount: number;
  category: string;
  paid_with: PaidWith;
  job_id: string | null;
  note: string;
  entered_by: string | null;
  entered_by_name: string;
}

/** One crew total for a job on a day (drive time included), for job costing. */
export interface TimeEntry extends SyncCols {
  id: string;
  org_id: string;
  job_id: string;
  work_date: string;
  /** Empty while the person is still on the clock. */
  hours: number | null;
  note: string;
  entered_by: string | null;
  entered_by_name: string;
  /** Whose hours these are. Empty on older entries, which were crew totals. */
  worker_id?: string | null;
  worker_name?: string;
  clock_in?: string | null;
  clock_out?: string | null;
}

export interface TableRows {
  organizations: Organization;
  org_pricing: OrgPricing;
  members: Member;
  customers: Customer;
  tag_groups: TagGroup;
  tags: Tag;
  customer_phones: CustomerPhone;
  customer_emails: CustomerEmail;
  customer_properties: CustomerProperty;
  customer_tags: CustomerTag;
  customer_activities: CustomerActivity;
  smart_lists: SmartList;
  jobs: Job;
  job_pricing: JobPricing;
  invoices: Invoice;
  payments: Payment;
  events: CalEvent;
  photos: Photo;
  expenses: Expense;
  time_entries: TimeEntry;
}
export type TableName = keyof TableRows;

/**
 * How each table is keyed and pushed. Order matters: rows are pushed in this
 * order so a job never reaches the server before its customer, and CRM child
 * rows never reach the server before their customer / tag group.
 *  - update: the row always exists on the server already (created by an RPC)
 *  - upsert: try update, insert if the server has no such row yet
 */
export const TABLES: { name: TableName; keyCols: string[]; push: 'update' | 'upsert' }[] = [
  { name: 'organizations', keyCols: ['id'], push: 'update' },
  { name: 'org_pricing', keyCols: ['org_id'], push: 'update' },
  { name: 'members', keyCols: ['org_id', 'user_id'], push: 'update' },
  { name: 'customers', keyCols: ['id'], push: 'upsert' },
  { name: 'tag_groups', keyCols: ['id'], push: 'upsert' },
  { name: 'tags', keyCols: ['id'], push: 'upsert' },
  { name: 'customer_phones', keyCols: ['id'], push: 'upsert' },
  { name: 'customer_emails', keyCols: ['id'], push: 'upsert' },
  { name: 'customer_properties', keyCols: ['id'], push: 'upsert' },
  { name: 'customer_tags', keyCols: ['customer_id', 'tag_id'], push: 'upsert' },
  { name: 'customer_activities', keyCols: ['id'], push: 'upsert' },
  { name: 'smart_lists', keyCols: ['id'], push: 'upsert' },
  { name: 'jobs', keyCols: ['id'], push: 'upsert' },
  { name: 'job_pricing', keyCols: ['job_id'], push: 'upsert' },
  { name: 'invoices', keyCols: ['id'], push: 'upsert' },
  { name: 'payments', keyCols: ['id'], push: 'upsert' },
  { name: 'events', keyCols: ['id'], push: 'upsert' },
  { name: 'expenses', keyCols: ['id'], push: 'upsert' }, // before photos: a receipt points at its expense
  { name: 'photos', keyCols: ['id'], push: 'upsert' },
  { name: 'time_entries', keyCols: ['id'], push: 'upsert' },
];

export const TABLE_NAMES = TABLES.map((t) => t.name);

export function tableSpec(name: TableName) {
  const spec = TABLES.find((t) => t.name === name);
  if (!spec) throw new Error(`Unknown table ${name}`);
  return spec;
}

/** Stable local key for a row, e.g. "org-uuid|user-uuid" for members. */
export function rowKey(table: TableName, row: Record<string, unknown>): string {
  return tableSpec(table).keyCols.map((c) => String(row[c] ?? '')).join('|');
}

/** Columns the server sets itself; never sent from a device. */
export const SERVER_COLS = ['updated_at', 'updated_by', 'sync_txid'];
