import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { RemoteError, type PullResult, type Remote } from './sync';
import { SERVER_COLS, tableSpec, type Role, type TableName } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = !!(url && anonKey);

// PKCE puts the sign-in code in ?code=, which does not clash with the #/ routes.
export const supabase: SupabaseClient = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Network trouble or a server hiccup is temporary; anything else is a refusal. */
function toRemoteError(error: { message: string; code?: string }, status: number): RemoteError {
  const transient = status === 0 || status >= 500 || status === 408 || status === 429 || /fetch|network/i.test(error.message);
  return new RemoteError(friendly(error), !transient);
}

function friendly(error: { message: string; code?: string }) {
  if (error.code === '42501' || /row-level security/i.test(error.message)) return 'You don’t have permission to make this change.';
  return error.message;
}

export const supabaseRemote: Remote = {
  async pull(orgId, cursor): Promise<PullResult> {
    const { data, error, status } = await supabase.rpc('sync_pull', { p_org: orgId, p_since: cursor });
    if (error) throw toRemoteError(error, status);
    const { cursor: next, ...tables } = data as { cursor: string } & PullResult['tables'];
    return { cursor: next, tables };
  },

  async push(table: TableName, row) {
    const spec = tableSpec(table);
    const body: Record<string, unknown> = { ...row };
    for (const c of SERVER_COLS) delete body[c];

    // Update first: it needs only update permission, so crew can change a job's
    // status without also needing permission to create jobs.
    let update = supabase.from(table).update(body);
    for (const c of spec.keyCols) update = update.eq(c, row[c] as string);
    const res = await update.select(spec.keyCols.join(','));
    if (res.error) throw toRemoteError(res.error, res.status);
    if ((res.data?.length ?? 0) > 0) return;
    // Row-level security hides rows you can't change, so "nothing updated" on a
    // row that must exist means the change was refused.
    if (spec.push === 'update') throw new RemoteError('You don’t have permission to make this change.', true);

    const ins = await supabase.from(table).insert(body);
    if (ins.error) throw toRemoteError(ins.error, ins.status);
  },
};

export interface MyOrg {
  org_id: string;
  name: string;
  role: Role;
}

export async function fetchMyOrgs(): Promise<MyOrg[]> {
  const { data, error } = await supabase.rpc('my_organizations');
  if (error) throw new Error(error.message);
  return (data ?? []) as MyOrg[];
}

export async function createOrganization(name: string, displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_organization', { p_name: name, p_display_name: displayName });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function acceptInvite(token: string, displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_invite', { p_token: token, p_display_name: displayName });
  if (error) throw new Error(error.message);
  return data as string;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export async function listInvites(orgId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('id,email,role,token,created_at,expires_at,accepted_at')
    .eq('org_id', orgId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Invite[];
}

export async function createInvite(orgId: string, email: string, role: Role, userId: string): Promise<Invite> {
  const { data, error } = await supabase
    .from('invites')
    .insert({ org_id: orgId, email: email.trim().toLowerCase(), role, invited_by: userId })
    .select('id,email,role,token,created_at,expires_at,accepted_at')
    .single();
  if (error) throw new Error(error.message);
  return data as Invite;
}

export async function revokeInvite(id: string) {
  const { error } = await supabase.from('invites').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** The link a teammate opens to join. Works from any folder the app is hosted in. */
export function inviteLink(token: string) {
  return `${location.origin}${location.pathname}#/invite/${token}`;
}

// ---------------------------------------------------------------- estimates

export const reserveNumbers = async (orgId: string, kind: 'estimate' | 'invoice', count: number): Promise<number> => {
  const { data, error } = await supabase.rpc('reserve_numbers', { p_org: orgId, p_kind: kind, p_count: count });
  if (error) throw new Error(error.message);
  return data as number;
};

export async function createShareLink(jobId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_share_link', { p_job: jobId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function voidSignature(jobId: string) {
  const { error } = await supabase.rpc('void_signature', { p_job: jobId });
  if (error) throw new Error(error.message);
}

/** The customer's link, e.g. https://app.example.com/#/c/<token>. */
export const customerLink = (token: string) => `${location.origin}${location.pathname}#/c/${token}`;

export interface CustomerView {
  company: import('../components/EstimateDoc').CustomerCompany;
  job: import('../components/EstimateDoc').CustomerJob & { stage: string };
  pricing: import('./types').CustomerPricing | null;
}

export async function customerView(token: string): Promise<CustomerView> {
  const { data, error } = await supabase.rpc('customer_view', { p_token: token });
  if (error) throw new Error(error.message);
  return data as CustomerView;
}

export async function customerSign(token: string, sig: string, name: string): Promise<CustomerView> {
  const { data, error } = await supabase.rpc('customer_sign', { p_token: token, p_sig: sig, p_name: name });
  if (error) throw new Error(error.message);
  return data as CustomerView;
}

// ---------------------------------------------------------------- invoices

export async function createInvoiceLink(invoiceId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_invoice_link', { p_invoice: invoiceId });
  if (error) throw new Error(error.message);
  return data as string;
}

export const invoiceLink = (token: string) => `${location.origin}${location.pathname}#/i/${token}`;

export interface InvoiceView extends Omit<import('../components/InvoiceDoc').CustomerInvoice, 'payments'> {
  payments: import('../components/InvoiceDoc').CustomerInvoice['payments'];
  paid: number;
  balance: number;
}

export async function invoiceView(token: string): Promise<InvoiceView> {
  const { data, error } = await supabase.rpc('invoice_view', { p_token: token });
  if (error) throw new Error(error.message);
  return data as InvoiceView;
}
