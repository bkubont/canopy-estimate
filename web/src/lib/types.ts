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
  phone: string;
  email: string;
  street: string;
  town: string;
  state: string;
  zip: string;
  notes: string;
}

export interface Job extends SyncCols {
  id: string;
  org_id: string;
  number: string;
  stage: 'estimate' | 'work_order' | 'invoice' | 'paid' | 'archived';
  status: 'pending' | 'approved' | 'scheduled' | 'in_progress' | 'blocked' | 'done';
  block_reason: string;
  customer_id: string | null;
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
}

export interface TableRows {
  organizations: Organization;
  org_pricing: OrgPricing;
  members: Member;
  customers: Customer;
  jobs: Job;
  job_pricing: JobPricing;
  events: CalEvent;
}
export type TableName = keyof TableRows;

/**
 * How each table is keyed and pushed. Order matters: rows are pushed in this
 * order so a job never reaches the server before its customer.
 *  - update: the row always exists on the server already (created by an RPC)
 *  - upsert: try update, insert if the server has no such row yet
 */
export const TABLES: { name: TableName; keyCols: string[]; push: 'update' | 'upsert' }[] = [
  { name: 'organizations', keyCols: ['id'], push: 'update' },
  { name: 'org_pricing', keyCols: ['org_id'], push: 'update' },
  { name: 'members', keyCols: ['org_id', 'user_id'], push: 'update' },
  { name: 'customers', keyCols: ['id'], push: 'upsert' },
  { name: 'jobs', keyCols: ['id'], push: 'upsert' },
  { name: 'job_pricing', keyCols: ['job_id'], push: 'upsert' },
  { name: 'events', keyCols: ['id'], push: 'upsert' },
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
