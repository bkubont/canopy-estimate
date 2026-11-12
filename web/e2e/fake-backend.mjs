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
        t.organizations.push(touch({ id, name: body.p_name, contact_name: '', license: '', address: '', phone: '', email: '', website: '', logo_path: '', next_estimate_no: 1001, next_invoice_no: 1001, created_at: now(), deleted_at: null }, user));
        t.org_pricing.push(touch({ org_id: id, day_rate: 2000, tax_rate: 0, deposit_pct: 0, valid_days: 30, equipment_markup: 1.2, equipment_costs: {}, created_at: now(), deleted_at: null }, user));
        t.members.push(touch({ org_id: id, user_id: user.id, role: 'owner', display_name: body.p_display_name ?? '', created_at: now(), deleted_at: null }, user));
        return json(200, id);
      }
      if (fn === 'accept_invite') {
        const inv = t.invites.find((i) => i.token === body.p_token);
        if (!inv) return json(400, { code: 'P0001', message: 'Invite not found' });
        if (inv.accepted_at) return json(400, { code: 'P0001', message: 'Invite already used' });
        if (inv.email.toLowerCase() !== user.email.toLowerCase()) return json(400, { code: 'P0001', message: 'This invite was sent to a different email address' });
        t.members.push(touch({ org_id: inv.org_id, user_id: user.id, role: inv.role, display_name: body.p_display_name ?? '', created_at: now(), deleted_at: null }, user));
        inv.accepted_at = now();
        return json(200, inv.org_id);
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
