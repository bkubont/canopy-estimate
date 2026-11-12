// A small in-memory stand-in for Supabase, for running the end-to-end script
// without a real project (E2E_FAKE=1). It speaks the same HTTP the app uses:
// auth sign-up/sign-in, the RPCs, and PATCH/POST on tables. It mimics the role
// rules that matter to the UI (crew get no pricing rows), but it is NOT a
// substitute for the database tests in supabase/tests, which check real RLS.

export const FAKE_URL = 'http://fake-supabase.test';

const uuid = () => crypto.randomUUID();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function createFakeBackend() {
  const users = new Map(); // email -> {id,email,password}
  const tokens = new Map(); // access token -> user
  const t = { organizations: [], org_pricing: [], members: [], customers: [], jobs: [], job_pricing: [], events: [], invites: [] };
  let seq = 1;
  const keyCols = { organizations: ['id'], org_pricing: ['org_id'], members: ['org_id', 'user_id'], job_pricing: ['job_id'] };
  const keysOf = (table) => keyCols[table] ?? ['id'];
  const now = () => new Date().toISOString();
  const touch = (row, user) => Object.assign(row, { updated_at: now(), updated_by: user?.id ?? null, _seq: seq++ });

  function session(user) {
    const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
    tokens.set(access, user);
    const u = { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now() };
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: uuid(), user: u };
  }
  const roleOf = (orgId, user) => t.members.find((m) => m.org_id === orgId && m.user_id === user?.id && !m.deleted_at)?.role;
  const visible = (table, row, user) => {
    const orgId = row.org_id ?? row.id;
    const role = roleOf(orgId, user);
    if (!role) return false;
    if ((table === 'org_pricing' || table === 'job_pricing') && role === 'crew') return false;
    return true;
  };
  const strip = ({ _seq, ...r }) => r;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Same as public.customer_pricing: unit prices include the markup; cost never leaves.
  const customerPricing = (p, j) => ({
    day_rate: p.day_rate,
    unit_prices: Object.fromEntries((j.equipment ?? []).map((l) => [l.id, round2((p.equipment_costs?.[l.id] ?? 0) * p.equipment_markup)])),
    tax_rate: p.tax_rate, additional: p.additional, deposit_pct: p.deposit_pct, deposit_amt: p.deposit_amt, valid_days: p.valid_days,
  });

  const offline = new WeakSet();

  async function handle(route, context) {
    // Playwright still routes requests for an "offline" context; drop them like a real network would.
    if (offline.has(context)) return route.abort('internetdisconnected');
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : undefined;
    const auth = (await req.allHeaders())['authorization']?.replace(/^Bearer /, '');
    const user = tokens.get(auth);
    const json = (status, data, headers = {}) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: data === undefined ? '' : JSON.stringify(data) });

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    const p = url.pathname;

    // ---- auth
    if (p === '/auth/v1/signup') {
      if (users.has(body.email)) return json(422, { code: 'user_already_exists', msg: 'User already registered' });
      const u = { id: uuid(), email: body.email, password: body.password };
      users.set(body.email, u);
      return json(200, session(u));
    }
    if (p === '/auth/v1/token') {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return json(200, session(u));
    }
    if (p === '/auth/v1/user') return user ? json(200, session(user).user) : json(401, { msg: 'no user' });
    if (p === '/auth/v1/logout') return json(204);

    // ---- customer link (no account)
    if (p === '/rest/v1/rpc/customer_view' || p === '/rest/v1/rpc/customer_sign') {
      const pr = t.job_pricing.find((x) => x.share_token && x.share_token === body.p_token);
      const j = pr && t.jobs.find((x) => x.id === pr.job_id && !x.deleted_at);
      if (!j) return json(400, { code: 'P0001', message: 'This link is no longer valid' });
      if (p.endsWith('customer_sign')) {
        if (j.signed_at) return json(400, { code: 'P0001', message: 'This estimate has already been signed' });
        if (!String(body.p_sig).startsWith('data:image/png;base64,')) return json(400, { code: 'P0001', message: 'Please sign in the box' });
        if (!String(body.p_name || '').trim()) return json(400, { code: 'P0001', message: 'Please type your name' });
        Object.assign(j, { client_sig: body.p_sig, client_sig_date: now().slice(0, 10), signed_at: now(), signed_via: 'link', signed_by_name: body.p_name.trim(), status: 'approved' });
        touch(j, null);
        pr.signed_snapshot = customerPricing(pr, j);
        touch(pr, null);
      }
      const o = t.organizations.find((x) => x.id === j.org_id);
      const noInternal = (trees) => (trees ?? []).map(({ internal_notes, ...rest }) => rest);
      return json(200, {
        company: { name: o.name, contact_name: o.contact_name, license: o.license, address: o.address, phone: o.phone, email: o.email, website: o.website, logo_data: o.logo_data ?? '' },
        job: {
          number: j.number, stage: j.stage, estimate_date: j.estimate_date, client: j.client, trees: noInternal(j.trees), site: j.site,
          equipment: j.equipment, days: j.days, client_notes: j.client_notes,
          change_orders: (j.change_orders ?? []).map((co) => ({ ...co, trees: noInternal(co.trees) })),
          client_sig: j.client_sig, client_sig_date: j.client_sig_date, signed_at: j.signed_at, signed_by_name: j.signed_by_name,
          prepared_by_name: j.prepared_by_name, contractor_sig: j.contractor_sig,
        },
        pricing: pr.signed_snapshot ?? customerPricing(pr, j),
      });
    }

    // ---- rpc
    if (p.startsWith('/rest/v1/rpc/')) {
      if (!user) return json(401, { message: 'JWT required' });
      const fn = p.split('/').pop();
      if (fn === 'my_organizations') {
        return json(200, t.members.filter((m) => m.user_id === user.id && !m.deleted_at).map((m) => ({
          org_id: m.org_id, name: t.organizations.find((o) => o.id === m.org_id).name, role: m.role,
        })));
      }
      if (fn === 'create_organization') {
        const id = uuid();
        t.organizations.push(touch({ id, name: body.p_name, contact_name: '', license: '', address: '', phone: '', email: '', website: '', logo_path: '', logo_data: '', next_estimate_no: 1001, next_invoice_no: 1001, created_at: now(), deleted_at: null }, user));
        t.org_pricing.push(touch({ org_id: id, day_rate: 2000, tax_rate: 0, deposit_pct: 0, valid_days: 30, equipment_markup: 1.2, equipment_costs: {}, created_at: now(), deleted_at: null }, user));
        t.members.push(touch({ org_id: id, user_id: user.id, role: 'owner', display_name: body.p_display_name ?? '', signature_data: '', created_at: now(), deleted_at: null }, user));
        return json(200, id);
      }
      if (fn === 'accept_invite') {
        const inv = t.invites.find((i) => i.token === body.p_token);
        if (!inv) return json(400, { code: 'P0001', message: 'Invite not found' });
        if (inv.accepted_at) return json(400, { code: 'P0001', message: 'Invite already used' });
        if (inv.email.toLowerCase() !== user.email.toLowerCase()) return json(400, { code: 'P0001', message: 'This invite was sent to a different email address' });
        t.members.push(touch({ org_id: inv.org_id, user_id: user.id, role: inv.role, display_name: body.p_display_name ?? '', signature_data: '', created_at: now(), deleted_at: null }, user));
        inv.accepted_at = now();
        return json(200, inv.org_id);
      }
      if (fn === 'reserve_numbers') {
        const o = t.organizations.find((x) => x.id === body.p_org);
        const key = body.p_kind === 'invoice' ? 'next_invoice_no' : 'next_estimate_no';
        const first = o[key];
        o[key] += body.p_count;
        return json(200, first);
      }
      if (fn === 'create_share_link') {
        const p = t.job_pricing.find((x) => x.job_id === body.p_job);
        if (!p || !['owner', 'office'].includes(roleOf(p.org_id, user))) return json(400, { code: 'P0001', message: 'Not allowed' });
        p.share_token ??= uuid();
        touch(p, user);
        return json(200, p.share_token);
      }
      if (fn === 'void_signature') {
        const j = t.jobs.find((x) => x.id === body.p_job);
        Object.assign(j, { signed_at: null, client_sig: '', client_sig_date: null, signed_by_name: '', signed_via: '', status: 'pending', change_orders: [] });
        touch(j, user);
        const p = t.job_pricing.find((x) => x.job_id === body.p_job);
        if (p) touch(Object.assign(p, { signed_snapshot: null }), user);
        return json(200, null);
      }
      if (fn === 'sync_pull') {
        if (!roleOf(body.p_org, user)) return json(400, { code: 'P0001', message: 'Not a member of this company' });
        const since = Number(body.p_since ?? 0);
        const out = { cursor: String(seq) };
        for (const table of ['organizations', 'org_pricing', 'members', 'customers', 'jobs', 'job_pricing', 'events']) {
          out[table] = t[table].filter((r) => (r.org_id ?? r.id) === body.p_org && r._seq >= since && visible(table, r, user)).map(strip);
        }
        return json(200, out);
      }
      return json(404, { message: `unknown rpc ${fn}` });
    }

    // ---- tables
    const table = p.replace('/rest/v1/', '');
    if (!t[table]) return json(404, { message: `unknown table ${table}` });
    if (!user) return json(401, { message: 'JWT required' });
    const filters = [...url.searchParams.entries()].filter(([k]) => !['select', 'order', 'columns'].includes(k));
    const match = (r) => filters.every(([k, v]) => (v === 'is.null' ? r[k] == null : String(r[k]) === v.replace(/^eq\./, '')));
    const single = ((await req.allHeaders())['accept'] ?? '').includes('vnd.pgrst.object');

    if (table === 'invites') {
      const orgOk = (orgId) => roleOf(orgId, user) === 'owner';
      if (method === 'GET') return json(200, t.invites.filter((i) => orgOk(i.org_id) && match(i)));
      if (method === 'POST') {
        if (!orgOk(body.org_id)) return json(403, { code: '42501', message: 'new row violates row-level security policy for table "invites"' });
        const inv = { id: uuid(), token: uuid(), created_at: now(), expires_at: now(), accepted_at: null, ...body };
        t.invites.push(inv);
        return json(201, single ? inv : [inv]);
      }
      if (method === 'DELETE') {
        t.invites = t.invites.filter((i) => !(orgOk(i.org_id) && match(i)));
        return json(204);
      }
    }
    if (method === 'PATCH') {
      const rows = t[table].filter((r) => match(r) && visible(table, r, user));
      for (const r of rows) touch(Object.assign(r, body), user);
      return json(200, rows.map((r) => Object.fromEntries(keysOf(table).map((k) => [k, r[k]]))));
    }
    if (method === 'POST') {
      const role = roleOf(body.org_id, user);
      const allowed = role && !(['jobs', 'job_pricing'].includes(table) && role === 'crew');
      if (!allowed) return json(403, { code: '42501', message: `new row violates row-level security policy for table "${table}"` });
      t[table].push(touch({ created_at: now(), ...body }, user));
      return json(201, null);
    }
    return json(405, { message: `${method} not supported` });
  }

  return {
    install: (context) => context.route(`${FAKE_URL}/**`, (route) => handle(route, context)),
    setOffline: async (context, value) => {
      if (value) offline.add(context);
      else offline.delete(context);
      await context.setOffline(value);
    },
    tables: t,
  };
}
