(() => {
  'use strict';

  // ---------- pick lists (match the paper estimate form) ----------

  // Per-tree choices — northern Lower / eastern UP species
  const SPECIES = [
    'Sugar Maple', 'Red Maple', 'Silver Maple', 'Boxelder', 'Quaking Aspen', 'Bigtooth Aspen',
    'Paper Birch', 'Yellow Birch', 'American Beech', 'Basswood', 'Ironwood',
    'Northern Red Oak', 'White Oak', 'Burr Oak', 'White Pine', 'Red Pine', 'Jack Pine',
    'Eastern Hemlock', 'Balsam Fir', 'White Spruce', 'Black Spruce', 'Tamarack',
    'Black Cherry', 'Serviceberry', 'Willow', 'Cottonwood', 'Ash', 'Elm', 'Cedar',
    'Fruit tree', 'Unknown',
  ];
  const WORK = [
    'Removal', 'Removal + stump grinding', 'Canopy raise', 'Trimming / pruning', 'Crown reduction',
    'Deadwood removal', 'Stump grinding only', 'Cabling / bracing', 'Emergency / storm work', 'Land clearing',
  ];
  const LOCATIONS = ['Front Yard', 'Backyard', 'Side Yard', 'Near Utility Lines', 'Over Structure', 'Over Fence', 'Driveway', 'Tree Line'];
  // Trunk diameter (DBH), not height bands
  const SIZES = [
    ['under12', 'Under 12″'],
    ['12-18', '12–18″'],
    ['18-24', '18–24″'],
    ['24-36', '24–36″'],
    ['over36', 'Over 36″'],
  ];
  const SIZE_KEYS = new Set(SIZES.map((s) => s[0]));
  const LEGACY_SIZE_MAP = { Small: 'under12', Medium: '12-18', Large: '24-36' };
  const CONDITIONS = [
    'Healthy', 'Diseased / decayed', 'Storm-damaged', 'Dead', 'Leaning / hazardous',
    'Pest / EAB', 'Hollow / compromised',
  ];

  // Job-wide choices
  const SITE = [
    'Clear Access', 'Restricted Access', 'Uneven Terrain', 'Sloped Terrain',
    'Soft / wet ground', 'Overhead wires', 'Narrow gate / limited access',
    'Near house or structure', 'Ground protection needed',
  ];
  // Wood & debris — operational info only (not priced)
  const EXTRAS = [
    'Leave wood on site', 'Cut and stack (firewood)', 'Chip on site',
    'Haul chips / debris away', 'Haul logs away', 'Client keeps wood',
  ];

  // Quick-add equipment chips with Smith Equipment day-rate defaults.
  // Prices are remembered in profile.prices after first use / edit.
  const EQUIPMENT = [
    ['Mini skid steer', 245],
    ['Towable boom 55′', 290],
    ['Boom lift 40′', 410],
    ['Boom lift 50′', 425],
    ['Boom lift 60′', 450],
    ['Stump grinder', 285],
    ['High-speed stump grinder', 385],
    ['Wood chipper', 375],
    ['Dump trailer', 150],
    ['Grapple (with machine)', 125],
    ['Log splitter', 75],
  ];
  const EQUIPMENT_DEFAULTS = Object.fromEntries(
    EQUIPMENT.map(([desc, price]) => [desc.toLowerCase(), price])
  );

  const DAYS = [[0.5, '½ day'], [1, '1 day'], [1.5, '1½ days'], [2, '2 days'], [3, '3 days'], [4, '4 days'], [5, '5 days']];
  const ADDITIONAL = [[0, 'None'], [50, '$50'], [100, '$100'], [150, '$150'], [250, '$250']];
  const DEPOSITS = [[0, 'None'], [25, '25%'], [50, '50%']];
  const VALID_DAYS = [[15, '15 days'], [30, '30 days'], [60, '60 days'], [90, '90 days']];

  const STATUSES = ['draft', 'approved', 'scheduled', 'in_progress', 'blocked', 'done'];
  const SCHEDULE_STATUSES = ['approved', 'scheduled', 'in_progress', 'blocked', 'done'];
  const KANBAN_COLS = [
    { id: 'approved', label: 'Approved' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'done', label: 'Done' },
  ];
  const BLOCK_REASONS = ['Weather', 'Equipment rental', 'Access', 'Other'];
  const STATUS_LABEL = {
    draft: 'Draft',
    approved: 'Approved',
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    done: 'Done',
  };

  // Phone keeps one short screen per topic. Tablets combine related screens
  // so there are fewer Next taps across a wider landscape layout.
  const STEP_VIEWS = {
    client: stepClient,
    trees: stepTrees,
    site: stepSite,
    crew: stepCrew,
    equipment: stepEquipment,
    summary: stepSummary,
    sign: stepSign,
    send: stepSend,
  };

  const PHONE_STEPS = [
    { id: 'client', label: 'Client', parts: ['client'] },
    { id: 'trees', label: 'Trees', parts: ['trees'] },
    { id: 'site', label: 'Site', parts: ['site'] },
    { id: 'crew', label: 'Job days', parts: ['crew'] },
    { id: 'equipment', label: 'Equipment', parts: ['equipment'] },
    { id: 'summary', label: 'Summary', parts: ['summary'] },
    { id: 'sign', label: 'Sign', parts: ['sign'] },
    { id: 'send', label: 'Send', parts: ['send'] },
  ];

  const TABLET_STEPS = [
    { id: 'client', label: 'Job', parts: ['client', 'site'] },
    { id: 'trees', label: 'Trees', parts: ['trees'] },
    { id: 'crew', label: 'Pricing', parts: ['crew', 'equipment'] },
    { id: 'summary', label: 'Review', parts: ['summary', 'sign'] },
    { id: 'send', label: 'Send', parts: ['send'] },
  ];

  const tabletMq = window.matchMedia('(min-width: 768px)');
  const isTablet = () => tabletMq.matches;
  const activeSteps = () => (isTablet() ? TABLET_STEPS : PHONE_STEPS);

  function joinParts(parts) {
    return parts.map((id, i) => {
      let html = STEP_VIEWS[id]();
      if (i > 0) html = html.replace('class="step-title"', 'class="step-title continued"');
      return `<div class="step-block" data-part="${id}">${html}</div>`;
    }).join('');
  }

  function findStepIndex(stepId) {
    const steps = activeSteps();
    const i = steps.findIndex((s) => s.id === stepId || s.parts.includes(stepId));
    return i < 0 ? 0 : i;
  }

  // ---------- helpers ----------

  const BRAND = window.BRAND || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const money = (n) => fmt.format(n || 0);
  const num = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => isoLocal(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
  const niceDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
  const setPath = (o, p, v) => {
    const ks = p.split('.');
    const last = ks.pop();
    let t = o;
    for (const k of ks) t = t[k] ?? (t[k] = {});
    t[last] = v;
  };

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------- storage ----------

  const KEYS = {
    profile: 'ats.profile',
    estimates: 'ats.estimates.v4',
    events: 'ats.events.v1',
    restoreSnapshot: 'ats.restore-snapshot',
  };
  // Older app versions wrote these keys; bring them forward so estimates don't vanish after an update.
  const LEGACY_ESTIMATE_KEYS = ['ats.estimates.v3', 'ats.estimates', 'canopy.estimates'];
  const BACKUP_SCHEMA_VERSION = 5;
  const BACKUP_MIN_SCHEMA = 3;

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(err);
      toast('Could not save – phone storage is full or blocked');
      return false;
    }
  }

  function migrateEstimates() {
    let merged = load(KEYS.estimates, {});
    if (!merged || typeof merged !== 'object' || Array.isArray(merged)) merged = {};
    let changed = false;
    for (const key of LEGACY_ESTIMATE_KEYS) {
      const legacy = load(key, null);
      if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) continue;
      for (const [id, est] of Object.entries(legacy)) {
        if (est && typeof est === 'object' && !merged[id]) {
          merged[id] = est;
          changed = true;
        }
      }
    }
    if (changed) store(KEYS.estimates, merged);
  }

  migrateEstimates();

  const DEFAULT_PROFILE = {
    name: '', license: '', address: '', phone: '', email: '', website: '',
    dayRate: 2000, taxRate: 0, depositPct: 0, validDays: 30, nextNumber: 1001,
    logo: '', signature: '', prices: {},
    ...BRAND.company,
    complete: false,
  };
  // Drop legacy crew from brand defaults — pricing is days × day rate only.
  delete DEFAULT_PROFILE.crew;

  let profile = { ...DEFAULT_PROFILE, ...load(KEYS.profile, {}) };
  profile.prices = profile.prices || {};
  const hadCrew = Object.prototype.hasOwnProperty.call(profile, 'crew');
  delete profile.crew;
  // Seed Smith Equipment defaults once so chips prefill without a prior edit.
  let pricesSeeded = false;
  for (const [k, v] of Object.entries(EQUIPMENT_DEFAULTS)) {
    if (profile.prices[k] == null) {
      profile.prices[k] = v;
      pricesSeeded = true;
    }
  }
  const saveProfile = () => store(KEYS.profile, profile);
  if (pricesSeeded || hadCrew) saveProfile();

  const allEstimates = () => load(KEYS.estimates, {});
  const allEvents = () => {
    const events = load(KEYS.events, {});
    return events && typeof events === 'object' && !Array.isArray(events) ? events : {};
  };

  function isProfileIncomplete() {
    return !profile.complete
      || !String(profile.name || '').trim()
      || !String(profile.phone || '').trim();
  }

  function updateSetupBanner() {
    const banner = $('#setup-banner');
    if (!banner) return;
    const incomplete = isProfileIncomplete();
    const onProfile = /^#\/?profile(?:\/|$)/.test(location.hash || '');
    banner.hidden = !incomplete || onProfile;
  }

  // ---------- state ----------

  let current = null;      // estimate open in the wizard
  let profileDraft = null; // profile being edited
  let editingTree = null;  // tree open in the tree sheet
  let editingIndex = -1;
  let installPrompt = null;
  let pendingRestore = null; // parsed backup waiting for merge/replace choice
  let scheduleMode = (() => {
    try { return localStorage.getItem('ats.scheduleMode') === 'kanban' ? 'kanban' : 'list'; }
    catch { return 'list'; }
  })();
  const saveScheduleMode = (mode) => {
    scheduleMode = mode;
    try { localStorage.setItem('ats.scheduleMode', mode); } catch { /* ignore */ }
  };

  const scopeOf = (el) => el.closest('[data-scope]')?.dataset.scope || 'est';
  const objFor = (scope) => ({ profile: profileDraft, tree: editingTree })[scope] || current;

  function blankEstimate() {
    return {
      id: uid(),
      number: 'E-' + profile.nextNumber,
      date: today(),
      client: { name: '', phone: '', email: '', street: '', town: '', csz: '' },
      trees: [],
      site: [], siteOther: '',
      extras: [], extrasOther: '',
      notes: '',
      days: 1,
      dayRate: num(profile.dayRate),
      startDate: '', endDate: '',
      equipment: [],
      taxRate: num(profile.taxRate),
      additional: 0,
      validDays: num(profile.validDays) || 30,
      depositPct: num(profile.depositPct),
      depositAmt: '',
      status: 'draft',
      blockReason: '',
      clientSig: '',
      clientSigDate: '',
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }

  const blankTree = () => ({ species: '', work: '', location: '', size: '', condition: '', qty: 1, notes: '' });

  function normalizeStatus(e) {
    if (e?.status && STATUSES.includes(e.status)) return e.status;
    return e?.clientSig ? 'approved' : 'draft';
  }

  function migrateTreeSize(size) {
    if (!size) return '';
    if (SIZE_KEYS.has(size)) return size;
    if (LEGACY_SIZE_MAP[size]) return LEGACY_SIZE_MAP[size];
    return '';
  }

  // Infer town from a legacy "City, ST ZIP" csz when town is missing.
  function townFromCsz(csz) {
    const s = String(csz || '').trim();
    if (!s) return '';
    const beforeComma = s.split(',')[0].trim();
    return beforeComma || '';
  }

  // True only for a brand-new blank draft. Any client detail, tree, equipment, site
  // choice, notes, date, or signature means we keep it.
  function isEmpty(e) {
    if (!e) return true;
    const c = e.client || {};
    const hasText = (...vals) => vals.some((v) => String(v ?? '').trim());
    if (hasText(c.name, c.phone, c.email, c.street, c.town, c.csz)) return false;
    if ((e.trees || []).length || (e.equipment || []).length) return false;
    if ((e.site || []).length || (e.extras || []).length) return false;
    if (hasText(e.siteOther, e.extrasOther, e.notes, e.startDate, e.clientSig)) return false;
    if (num(e.additional) > 0) return false;
    return true;
  }

  // Pull the latest typed values out of the DOM. Safari autofill and fast
  // Back/Done taps can leave the on-screen fields ahead of the in-memory model.
  function flushBound(scope = 'est') {
    const obj = objFor(scope);
    if (!obj) return;
    const root = scope === 'tree' ? $('#tree-dlg') : $('#view');
    if (!root) return;
    for (const el of $$('[data-bind]', root)) {
      if (scopeOf(el) !== scope || el.classList.contains('chips')) continue;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') v = el.value === '' ? '' : num(el.value);
      setPath(obj, el.dataset.bind, v);
    }
  }

  function hydrateEstimate(saved) {
    const blank = blankEstimate();
    const clientSrc = saved?.client || saved?.customer || {};
    const client = { ...blank.client, ...clientSrc };
    if (!String(client.town || '').trim()) client.town = townFromCsz(client.csz);
    const trees = (Array.isArray(saved?.trees) ? saved.trees : blank.trees).map((t) => ({
      ...blankTree(),
      ...t,
      size: migrateTreeSize(t?.size),
    }));
    const est = {
      ...blank,
      ...saved,
      id: saved?.id || blank.id,
      client,
      trees,
      equipment: Array.isArray(saved?.equipment)
        ? saved.equipment
        : (Array.isArray(saved?.materials) ? saved.materials : blank.equipment),
      site: Array.isArray(saved?.site) ? saved.site : blank.site,
      extras: Array.isArray(saved?.extras) ? saved.extras : blank.extras,
      status: normalizeStatus(saved),
      blockReason: saved?.blockReason || '',
    };
    // Ignore legacy crew field — pricing is days × day rate only.
    delete est.crew;
    return est;
  }

  // One-time field upgrades for estimates already on the device.
  function migrateEstimateFields() {
    const all = allEstimates();
    let changed = false;
    for (const [id, raw] of Object.entries(all)) {
      if (!raw || typeof raw !== 'object') continue;
      const e = hydrateEstimate(raw);
      const before = JSON.stringify(raw);
      const after = { ...e };
      delete after.crew;
      if (JSON.stringify(after) !== before) {
        all[id] = after;
        changed = true;
      }
    }
    if (changed) store(KEYS.estimates, all);
  }
  migrateEstimateFields();

  const treeCount = (e) => (e.trees || []).reduce((n, t) => n + (num(t.qty) || 1), 0);
  const treeTitle = (t) => `${num(t.qty) > 1 ? num(t.qty) + ' × ' : ''}${t.species || 'Tree'}${t.work ? ' — ' + t.work : ''}`;
  const sizeLabel = (size) => SIZES.find((s) => s[0] === size)?.[1] || '';
  const treeDetails = (t) => [t.location, sizeLabel(t.size), t.condition].filter(Boolean).join(' · ');
  const statusBadgeClass = (status) => {
    if (status === 'approved' || status === 'done') return 'ok';
    if (status === 'scheduled' || status === 'in_progress') return 'info';
    if (status === 'blocked') return 'warn';
    return '';
  };

  function totals(e) {
    const equipment = (e.equipment || []).reduce((s, m) => s + num(m.qty) * num(m.price), 0);
    const labor = num(e.days) * num(e.dayRate);
    const subtotal = equipment + labor;
    const tax = (subtotal * num(e.taxRate)) / 100;
    const additional = num(e.additional);
    const total = subtotal + tax + additional;
    const deposit = e.depositAmt !== '' && e.depositAmt != null ? num(e.depositAmt) : (total * Math.min(100, num(e.depositPct))) / 100;
    return { equipment, labor, subtotal, tax, additional, total, deposit };
  }

  let saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    flushBound('est');
    if (!current || isEmpty(current)) return;
    current.status = normalizeStatus(current);
    delete current.crew;
    current.updatedAt = new Date().toISOString();
    current.total = totals(current).total;
    const all = allEstimates();
    all[current.id] = current;
    store(KEYS.estimates, all);
  }

  function setEstimateStatus(e, status, { blockReason } = {}) {
    if (!e || !STATUSES.includes(status)) return;
    e.status = status;
    if (status === 'blocked') {
      if (blockReason != null) e.blockReason = blockReason;
    } else if (status !== 'blocked') {
      e.blockReason = '';
    }
    // Signing / approval path: keep signature as-is; dates drive scheduled.
    if (status === 'scheduled' && !e.startDate) {
      e.startDate = today();
      e.endDate = addDays(e.startDate, Math.max(0, Math.ceil(num(e.days) || 1) - 1));
    }
  }

  function maybeScheduleFromDate(e) {
    if (!e?.startDate) return;
    if (e.status === 'approved' || e.status === 'draft') {
      e.status = 'scheduled';
    }
  }

  // Close the open estimate: save it, or throw it away if nothing was entered.
  function closeCurrent() {
    if (!current) return;
    flushBound('est');
    if (isEmpty(current)) {
      const all = allEstimates();
      if (all[current.id]) {
        delete all[current.id];
        store(KEYS.estimates, all);
      }
      // Give the number back so there are no gaps.
      if (current.number === 'E-' + (profile.nextNumber - 1)) {
        profile.nextNumber -= 1;
        saveProfile();
      }
    } else {
      saveNow();
    }
    current = null;
  }

  // ---------- small UI builders ----------

  function chips(key, options, { multi = false, isNum = false, required = false } = {}) {
    const btns = options.map((o) => {
      const [v, label] = Array.isArray(o) ? o : [o, o];
      return `<button type="button" class="chip" data-v="${esc(v)}">${esc(label)}</button>`;
    }).join('');
    return `<div class="chips" data-bind="${key}"${multi ? ' data-multi' : ''}${isNum ? ' data-num' : ''}${required ? ' data-required' : ''}>${btns}</div>`;
  }

  // A multi-select group with an "Other" text box underneath, like the paper form.
  const checkGroup = (key, options) =>
    `${chips(key, options, { multi: true })}<input class="mt" data-bind="${key}Other" placeholder="Other…">`;

  function field(label, key, attrs = '', textarea = false) {
    const control = textarea
      ? `<textarea data-bind="${key}" ${attrs}></textarea>`
      : `<input data-bind="${key}" ${attrs}>`;
    return `<label class="field"><span>${label}</span>${control}<span class="field-error" data-error-for="${key}" hidden></span></label>`;
  }

  function clearFieldErrors(root = document) {
    for (const el of $$('[data-bind]', root)) {
      el.removeAttribute('aria-invalid');
      el.classList.remove('is-invalid');
    }
    for (const err of $$('[data-error-for]', root)) {
      err.textContent = '';
      err.hidden = true;
    }
  }

  function setFieldError(key, message, root = document) {
    const input = $(`[data-bind="${key}"]`, root);
    const err = $(`[data-error-for="${key}"]`, root);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.classList.add('is-invalid');
    }
    if (err) {
      err.textContent = message;
      err.hidden = false;
    }
    return input;
  }

  function stepper(key, { step = 1, min = 0 } = {}) {
    return `<div class="stepper">
      <button type="button" data-act="step" data-key="${key}" data-d="${-step}" data-min="${min}" aria-label="Less">−</button>
      <input data-bind="${key}" type="number" inputmode="numeric" min="${min}">
      <button type="button" data-act="step" data-key="${key}" data-d="${step}" data-min="${min}" aria-label="More">＋</button>
    </div>`;
  }

  const moneyInput = (key, placeholder = '0') =>
    `<div class="price-input"><span>$</span><input data-bind="${key}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="${placeholder}"></div>`;

  // Push values from the data object into every control bound in this scope.
  function syncAll(root, scope) {
    const obj = objFor(scope);
    for (const el of $$('[data-bind]', root)) {
      if (scopeOf(el) === scope) syncEl(el, getPath(obj, el.dataset.bind));
    }
  }

  function syncKey(scope, key, except) {
    const obj = objFor(scope);
    for (const el of $$(`[data-bind="${key}"]`)) {
      if (el !== except && scopeOf(el) === scope) syncEl(el, getPath(obj, key));
    }
  }

  function syncEl(el, val) {
    if (el.classList.contains('chips')) {
      const multi = el.hasAttribute('data-multi');
      for (const b of $$('.chip', el)) {
        const on = multi ? (val || []).includes(b.dataset.v) : val !== '' && val != null && String(val) === b.dataset.v;
        b.setAttribute('aria-pressed', on);
      }
    } else if (el.type === 'checkbox') {
      el.checked = !!val;
    } else if (el !== document.activeElement) {
      el.value = val ?? '';
    }
  }

  // Completion date follows from the start date and the number of crew days.
  function syncEndDate() {
    if (!current.startDate) return;
    current.endDate = addDays(current.startDate, Math.max(0, Math.ceil(num(current.days) || 1) - 1));
    syncKey('est', 'endDate');
  }

  function onChange(scope, key) {
    if (scope !== 'est') return;
    // Remember equipment prices so they fill in automatically next time.
    const m = key.match(/^equipment\.(\d+)\.(price|desc)$/);
    if (m) {
      const row = current.equipment[m[1]];
      if (row?.desc && row.price !== '') {
        profile.prices[row.desc.trim().toLowerCase()] = num(row.price);
        saveProfile();
      }
    }
    if (key === 'days' || key === 'startDate') syncEndDate();
    if (key === 'startDate') maybeScheduleFromDate(current);
    // A deposit is either a percentage or a fixed amount, not both.
    if (key === 'depositPct') {
      current.depositAmt = '';
      syncKey('est', 'depositAmt');
    }
    if (key === 'depositAmt' && current.depositAmt !== '') {
      current.depositPct = '';
      syncKey('est', 'depositPct');
    }
    updateTotals();
    scheduleSave();
  }

  // ---------- calendar / events ----------

  const TZ = 'America/Detroit';
  const EVENT_TYPES = [
    ['estimate_visit', 'Estimate visit'],
    ['tree_work', 'Tree work'],
    ['equipment_rental', 'Equipment rental'],
    ['dump_run', 'Dump run'],
    ['time_off', 'Time off'],
    ['other', 'Other'],
  ];
  const EVENT_TYPE_LABEL = Object.fromEntries(EVENT_TYPES);
  const EVENT_STATUSES = [
    ['tentative', 'Tentative'],
    ['confirmed', 'Confirmed'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
  ];
  const EVENT_STATUS_LABEL = Object.fromEntries(EVENT_STATUSES);
  const SEED_FLAG = 'ats.events.seeded.v1';
  const DAY_START_HOUR = 6;
  const DAY_END_HOUR = 20;

  function tzParts(date) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    const map = {};
    for (const { type, value } of dtf.formatToParts(date)) {
      if (type !== 'literal') map[type] = value;
    }
    return map;
  }

  function detroitYmd(date = new Date()) {
    const p = tzParts(date);
    return `${p.year}-${p.month}-${p.day}`;
  }

  function detroitHm(date) {
    const p = tzParts(date);
    return `${p.hour}:${p.minute}`;
  }

  function detroitLocalToIso(ymd, hm = '00:00') {
    const [Y, M, D] = ymd.split('-').map(Number);
    const [h, m] = (hm || '00:00').split(':').map(Number);
    let t = Date.UTC(Y, M - 1, D, h, m, 0);
    for (let i = 0; i < 4; i++) {
      const p = tzParts(new Date(t));
      const asIf = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +(p.second || 0));
      const want = Date.UTC(Y, M - 1, D, h, m, 0);
      t += want - asIf;
    }
    return new Date(t).toISOString();
  }

  function parseYmd(ymd) {
    const [Y, M, D] = String(ymd).slice(0, 10).split('-').map(Number);
    return { Y, M, D };
  }

  function ymdAddDays(ymd, n) {
    return addDays(String(ymd).slice(0, 10), n);
  }

  function startOfWeekYmd(ymd) {
    // Sunday-start week in Detroit calendar dates
    const { Y, M, D } = parseYmd(ymd);
    const utc = new Date(Date.UTC(Y, M - 1, D, 12, 0, 0));
    // weekday in Detroit
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(utc);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    // Use a date that displays as ymd in Detroit, then find Sunday
    const noonIso = detroitLocalToIso(ymd, '12:00');
    const d = new Date(noonIso);
    const parts = tzParts(d);
    // get day of week via UTC trick on the Y-M-D
    const tmp = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
    const dow = tmp.getUTCDay();
    return ymdAddDays(ymd, -dow);
  }

  function monthMatrix(ymd) {
    const { Y, M } = parseYmd(ymd);
    const first = `${Y}-${String(M).padStart(2, '0')}-01`;
    const start = startOfWeekYmd(first);
    const cells = [];
    for (let i = 0; i < 42; i++) cells.push(ymdAddDays(start, i));
    return cells;
  }

  function weekDays(ymd) {
    const start = startOfWeekYmd(ymd);
    return Array.from({ length: 7 }, (_, i) => ymdAddDays(start, i));
  }

  function niceMonthYear(ymd) {
    const { Y, M } = parseYmd(ymd);
    return new Date(Date.UTC(Y, M - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function niceWeekRange(ymd) {
    const days = weekDays(ymd);
    const a = niceDate(days[0]);
    const b = niceDate(days[6]);
    return `${a} – ${b}`;
  }

  function eventRangeMs(ev) {
    if (ev.allDay) {
      const s = String(ev.start).slice(0, 10);
      let e = String(ev.end || s).slice(0, 10);
      // treat stored all-day end as exclusive; if equal/before start, single day
      if (e <= s) e = ymdAddDays(s, 1);
      return {
        start: new Date(detroitLocalToIso(s, '00:00')).getTime(),
        end: new Date(detroitLocalToIso(e, '00:00')).getTime(),
      };
    }
    return {
      start: new Date(ev.start).getTime(),
      end: new Date(ev.end).getTime(),
    };
  }

  function eventTouchesDay(ev, ymd) {
    const dayStart = new Date(detroitLocalToIso(ymd, '00:00')).getTime();
    const dayEnd = new Date(detroitLocalToIso(ymdAddDays(ymd, 1), '00:00')).getTime();
    const r = eventRangeMs(ev);
    return r.start < dayEnd && r.end > dayStart; // half-open overlap with day
  }

  function eventDaysSpanned(ev) {
    const r = eventRangeMs(ev);
    const days = [];
    let ymd = detroitYmd(new Date(r.start));
    const endYmd = detroitYmd(new Date(r.end - 1)); // last inclusive day
    for (let i = 0; i < 60; i++) {
      days.push(ymd);
      if (ymd >= endYmd) break;
      ymd = ymdAddDays(ymd, 1);
    }
    return days;
  }

  function formatEventWhen(ev) {
    if (ev.allDay) {
      const s = String(ev.start).slice(0, 10);
      const eEx = String(ev.end || s).slice(0, 10);
      const last = eEx > s ? ymdAddDays(eEx, -1) : s;
      return last === s ? `${niceDate(s)} · All day` : `${niceDate(s)} – ${niceDate(last)} · All day`;
    }
    const a = new Date(ev.start);
    const b = new Date(ev.end);
    const same = detroitYmd(a) === detroitYmd(b);
    const t1 = detroitHm(a);
    const t2 = detroitHm(b);
    if (same) return `${niceDate(detroitYmd(a))} · ${t1}–${t2}`;
    return `${niceDate(detroitYmd(a))} ${t1} – ${niceDate(detroitYmd(b))} ${t2}`;
  }

  function blankEvent(prefill = {}) {
    const ymd = prefill.date || (cal && cal.cursor) || detroitYmd();
    const allDay = !!prefill.allDay;
    const startHm = prefill.startHm || '09:00';
    const endHm = prefill.endHm || '10:00';
    return {
      id: uid(),
      type: prefill.type || 'other',
      title: prefill.title || '',
      start: allDay ? ymd : detroitLocalToIso(ymd, startHm),
      end: allDay ? ymdAddDays(ymd, 1) : detroitLocalToIso(ymd, endHm),
      timezone: TZ,
      allDay,
      status: prefill.status || 'tentative',
      estimateId: prefill.estimateId || '',
      address: prefill.address || '',
      town: prefill.town || '',
      notes: prefill.notes || '',
      crew: prefill.crew || '',
      equipment: Array.isArray(prefill.equipment) ? prefill.equipment : [],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }

  function hydrateEvent(raw) {
    const b = blankEvent();
    const e = { ...b, ...raw };
    e.timezone = e.timezone || TZ;
    e.equipment = Array.isArray(e.equipment) ? e.equipment : [];
    e.crew = e.crew || '';
    e.estimateId = e.estimateId || '';
    if (!EVENT_TYPE_LABEL[e.type]) e.type = 'other';
    if (!EVENT_STATUS_LABEL[e.status]) e.status = 'tentative';
    return e;
  }

  const saveEvents = (map) => store(KEYS.events, map);

  function upsertEvent(ev) {
    const all = allEvents();
    const next = hydrateEvent({ ...ev, updatedAt: new Date().toISOString() });
    all[next.id] = next;
    saveEvents(all);
    return next;
  }

  function deleteEvent(id) {
    const all = allEvents();
    delete all[id];
    saveEvents(all);
  }

  function listEvents() {
    return Object.values(allEvents()).map(hydrateEvent);
  }

  function equipmentTokens(ev) {
    if (Array.isArray(ev.equipment)) {
      return ev.equipment.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
    }
    return String(ev.equipment || '').split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  }

  function rangesOverlap(a, b) {
    return a.start < b.end && b.start < a.end; // half-open
  }

  function findConflicts(candidate, { ignoreId } = {}) {
    const cand = eventRangeMs(candidate);
    const crew = String(candidate.crew || '').trim().toLowerCase();
    const equip = new Set(equipmentTokens(candidate));
    if (!crew && !equip.size) return [];
    const hits = [];
    for (const ev of listEvents()) {
      if (ev.id === ignoreId || ev.id === candidate.id) continue;
      if (ev.status === 'cancelled') continue;
      if (!rangesOverlap(cand, eventRangeMs(ev))) continue;
      const sameCrew = crew && crew === String(ev.crew || '').trim().toLowerCase();
      const sharedEquip = [...equip].some((t) => equipmentTokens(ev).includes(t));
      if (sameCrew || sharedEquip) hits.push(ev);
    }
    return hits;
  }

  function estimateApprovedEnough(est) {
    const st = normalizeStatus(est);
    return st && st !== 'draft';
  }

  function seedEventsFromEstimates() {
    try {
      if (localStorage.getItem(SEED_FLAG) === '1') return;
    } catch { /* ignore */ }
    const dated = Object.values(allEstimates()).map(hydrateEstimate).filter((e) => e.startDate);
    // Wait until at least one dated estimate exists so an empty first launch
    // does not permanently skip seeding.
    if (!dated.length) return;
    const all = allEvents();
    let added = 0;
    for (const e of dated) {
      const already = Object.values(all).some((ev) => ev && ev.estimateId === e.id);
      if (already) continue;
      const end = e.endDate && e.endDate >= e.startDate ? ymdAddDays(e.endDate, 1) : ymdAddDays(e.startDate, 1);
      const status = ['scheduled', 'in_progress', 'done'].includes(normalizeStatus(e)) ? 'confirmed' : 'tentative';
      const ev = hydrateEvent({
        id: uid(),
        type: 'tree_work',
        title: `${e.client?.name || e.number} · tree work`,
        start: e.startDate,
        end,
        timezone: TZ,
        allDay: true,
        status,
        estimateId: e.id,
        address: e.client?.street || '',
        town: e.client?.town || '',
        notes: `Seeded from ${e.number}`,
        crew: '',
        equipment: (e.equipment || []).map((row) => row.desc).filter(Boolean),
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });
      all[ev.id] = ev;
      added++;
    }
    if (added) saveEvents(all);
    try { localStorage.setItem(SEED_FLAG, '1'); } catch { /* ignore */ }
  }

  const defaultCalView = () => (isTablet() ? 'month' : 'agenda');
  let cal = {
    view: (() => {
      try { return localStorage.getItem('ats.calView') || defaultCalView(); }
      catch { return defaultCalView(); }
    })(),
    cursor: detroitYmd(),
    filters: { type: '', crew: '', status: '' },
  };
  if (!['month', 'week', 'day', 'agenda'].includes(cal.view)) cal.view = defaultCalView();

  seedEventsFromEstimates();

  function saveCalView(view) {
    cal.view = view;
    try { localStorage.setItem('ats.calView', view); } catch { /* ignore */ }
  }

  let eventDraft = null;
  let eventOverrideUnapproved = false;

  function filteredCalendarEvents() {
    const { type, crew, status } = cal.filters;
    const crewQ = String(crew || '').trim().toLowerCase();
    return listEvents().filter((ev) => {
      if (type && ev.type !== type) return false;
      if (status && ev.status !== status) return false;
      if (crewQ && !String(ev.crew || '').toLowerCase().includes(crewQ)) return false;
      return true;
    });
  }

  function eventsForDay(ymd) {
    return filteredCalendarEvents()
      .filter((ev) => ev.status !== 'cancelled' && eventTouchesDay(ev, ymd))
      .sort((a, b) => eventRangeMs(a).start - eventRangeMs(b).start);
  }

  function calHeading() {
    if (cal.view === 'month') return niceMonthYear(cal.cursor);
    if (cal.view === 'week') return niceWeekRange(cal.cursor);
    if (cal.view === 'day') return niceDate(cal.cursor);
    return niceMonthYear(cal.cursor);
  }

  function shiftCal(dir) {
    if (cal.view === 'month') {
      const { Y, M } = parseYmd(cal.cursor);
      const d = new Date(Date.UTC(Y, M - 1 + dir, 1));
      cal.cursor = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    } else if (cal.view === 'week') {
      cal.cursor = ymdAddDays(cal.cursor, dir * 7);
    } else if (cal.view === 'day') {
      cal.cursor = ymdAddDays(cal.cursor, dir);
    } else {
      cal.cursor = ymdAddDays(cal.cursor, dir * 7);
    }
    renderCalendar();
  }

  function renderCalendar() {
    setChrome({ title: 'Calendar', back: false, bottombar: false });
    const views = [
      ['agenda', 'Agenda'],
      ['month', 'Month'],
      ['week', 'Week'],
      ['day', 'Day'],
    ];
    const crews = [...new Set(listEvents().map((e) => String(e.crew || '').trim()).filter(Boolean))].sort();
    $('#view').innerHTML = `
      <div class="cal-shell">
        <div class="cal-toolbar">
          <div class="cal-nav">
            <button type="button" class="btn" data-act="cal-today">Today</button>
            <button type="button" class="icon-btn" data-act="cal-prev" aria-label="Previous">‹</button>
            <button type="button" class="icon-btn" data-act="cal-next" aria-label="Next">›</button>
            <h2 class="cal-heading">${esc(calHeading())}</h2>
          </div>
          <div class="chips cal-views" role="tablist" aria-label="Calendar view">
            ${views.map(([id, label]) => `
              <button type="button" class="chip" data-act="cal-view" data-view="${id}" aria-pressed="${cal.view === id}">${label}</button>`).join('')}
          </div>
          <div class="cal-actions">
            <button type="button" class="btn primary" data-act="cal-new">＋ New event</button>
            <button type="button" class="btn" data-act="schedule">Jobs board</button>
          </div>
        </div>
        <details class="cal-filters card">
          <summary>Filters</summary>
          <div class="cal-filter-grid">
            <label class="field"><span>Type</span>
              <select id="cal-filter-type">
                <option value="">All types</option>
                ${EVENT_TYPES.map(([id, label]) => `<option value="${id}" ${cal.filters.type === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}
              </select>
            </label>
            <label class="field"><span>Status</span>
              <select id="cal-filter-status">
                <option value="">All statuses</option>
                ${EVENT_STATUSES.map(([id, label]) => `<option value="${id}" ${cal.filters.status === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}
              </select>
            </label>
            <label class="field"><span>Crew</span>
              <input id="cal-filter-crew" list="cal-crew-list" value="${esc(cal.filters.crew)}" placeholder="Any crew">
              <datalist id="cal-crew-list">${crews.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
            </label>
            <div class="btn-pair">
              <button type="button" class="btn" data-act="cal-filter-apply">Apply</button>
              <button type="button" class="btn" data-act="cal-filter-reset">Reset</button>
            </div>
          </div>
        </details>
        <div id="cal-body" class="cal-body"></div>
      </div>`;
    const body = $('#cal-body');
    if (cal.view === 'month') body.innerHTML = renderMonthView();
    else if (cal.view === 'week') body.innerHTML = renderWeekView();
    else if (cal.view === 'day') body.innerHTML = renderDayView();
    else body.innerHTML = renderAgendaView();
  }

  function eventChipHtml(ev, { compact } = {}) {
    const time = ev.allDay ? 'All day' : detroitHm(new Date(ev.start));
    return `<button type="button" class="cal-event type-${esc(ev.type)} status-${esc(ev.status)}" data-act="cal-open" data-id="${esc(ev.id)}" title="${esc(ev.title)}">
      ${compact ? '' : `<span class="cal-event-time">${esc(time)}</span>`}
      <span class="cal-event-title">${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Event')}</span>
    </button>`;
  }

  function renderMonthView() {
    const cells = monthMatrix(cal.cursor);
    const { M } = parseYmd(cal.cursor);
    const today = detroitYmd();
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `<div class="cal-month">
      <div class="cal-dow">${labels.map((d) => `<div>${d}</div>`).join('')}</div>
      <div class="cal-grid">
        ${cells.map((ymd) => {
          const inMonth = parseYmd(ymd).M === M;
          const dayEvents = eventsForDay(ymd);
          const max = 3;
          const shown = dayEvents.slice(0, max);
          const more = dayEvents.length - shown.length;
          return `<div class="cal-cell ${inMonth ? '' : 'outside'} ${ymd === today ? 'today' : ''} ${ymd === cal.cursor ? 'selected' : ''}" data-act="cal-select-day" data-date="${ymd}">
            <div class="cal-cell-head"><span>${parseYmd(ymd).D}</span></div>
            <div class="cal-cell-events">
              ${shown.map((ev) => eventChipHtml(ev, { compact: true })).join('')}
              ${more > 0 ? `<button type="button" class="cal-more" data-act="cal-select-day" data-date="${ymd}">+${more} more</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="cal-day-agenda">
        <h3>${esc(niceDate(cal.cursor))}</h3>
        ${renderDayEventList(cal.cursor)}
      </div>
    </div>`;
  }

  function renderDayEventList(ymd) {
    const list = eventsForDay(ymd);
    if (!list.length) {
      return `<p class="empty">No events. <button type="button" class="link" data-act="cal-new" data-date="${ymd}">Add one</button></p>`;
    }
    return `<div class="cal-agenda-list">${list.map((ev) => `
      <button type="button" class="cal-agenda-item" data-act="cal-open" data-id="${esc(ev.id)}">
        <div class="row"><b>${esc(ev.title || EVENT_TYPE_LABEL[ev.type])}</b><span class="badge">${esc(EVENT_STATUS_LABEL[ev.status])}</span></div>
        <div class="muted">${esc(formatEventWhen(ev))} · ${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</div>
        <div class="muted one-line">${esc([ev.town, ev.crew].filter(Boolean).join(' · '))}</div>
      </button>`).join('')}</div>`;
  }

  function renderAgendaView() {
    // Show from cursor through ~21 days
    const days = Array.from({ length: 21 }, (_, i) => ymdAddDays(cal.cursor, i));
    const blocks = days.map((ymd) => {
      const list = eventsForDay(ymd);
      if (!list.length) return '';
      return `<section class="cal-agenda-day">
        <h3>${esc(niceDate(ymd))}</h3>
        ${renderDayEventList(ymd)}
      </section>`;
    }).filter(Boolean);
    if (!blocks.length) {
      return `<p class="empty">Nothing scheduled in this stretch. <button type="button" class="link" data-act="cal-new">New event</button></p>`;
    }
    return `<div class="cal-agenda">${blocks.join('')}</div>`;
  }

  function hoursGridHtml(days) {
    const hours = [];
    for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) hours.push(h);
    const allDayRow = days.map((ymd) => {
      const allDay = eventsForDay(ymd).filter((e) => e.allDay);
      return `<div class="cal-allday-cell" data-act="cal-slot" data-date="${ymd}" data-allday="1">
        ${allDay.map((ev) => eventChipHtml(ev, { compact: true })).join('') || '<span class="muted small">All day</span>'}
      </div>`;
    }).join('');
    const rows = hours.map((h) => {
      const label = `${String(h).padStart(2, '0')}:00`;
      const cells = days.map((ymd) => {
        const hm = `${String(h).padStart(2, '0')}:00`;
        const timed = eventsForDay(ymd).filter((e) => {
          if (e.allDay) return false;
          const startH = +detroitHm(new Date(e.start)).slice(0, 2);
          return startH === h;
        });
        return `<div class="cal-slot" data-act="cal-slot" data-date="${ymd}" data-time="${hm}">
          ${timed.map((ev) => eventChipHtml(ev)).join('')}
        </div>`;
      }).join('');
      return `<div class="cal-time-row"><div class="cal-time-label">${label}</div>${cells}</div>`;
    }).join('');
    const head = days.map((ymd) => `<div class="cal-time-dayhead ${ymd === detroitYmd() ? 'today' : ''}" data-act="cal-select-day" data-date="${ymd}">${esc(niceDate(ymd))}</div>`).join('');
    return `<div class="cal-timegrid cols-${days.length}">
      <div class="cal-time-row head"><div class="cal-time-label"></div>${head}</div>
      <div class="cal-time-row allday"><div class="cal-time-label">All day</div>${allDayRow}</div>
      ${rows}
    </div>`;
  }

  function renderWeekView() {
    return hoursGridHtml(weekDays(cal.cursor));
  }

  function renderDayView() {
    return hoursGridHtml([cal.cursor]);
  }

  function estimateOptionsHtml(selected) {
    const opts = Object.values(allEstimates()).map(hydrateEstimate)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return `<option value="">None</option>` + opts.map((e) =>
      `<option value="${esc(e.id)}" ${selected === e.id ? 'selected' : ''}>${esc(e.number)} · ${esc(e.client?.name || 'No name')}</option>`
    ).join('');
  }

  function openEventEditor(ev, { isNew } = {}) {
    eventDraft = hydrateEvent(ev);
    eventOverrideUnapproved = false;
    const d = eventDraft;
    let startDate; let startTime; let endDate; let endTime;
    if (d.allDay) {
      startDate = String(d.start).slice(0, 10);
      const endEx = String(d.end).slice(0, 10);
      endDate = endEx > startDate ? ymdAddDays(endEx, -1) : startDate;
      startTime = '09:00';
      endTime = '10:00';
    } else {
      startDate = detroitYmd(new Date(d.start));
      endDate = detroitYmd(new Date(d.end));
      startTime = detroitHm(new Date(d.start));
      endTime = detroitHm(new Date(d.end));
    }
    const equipStr = Array.isArray(d.equipment) ? d.equipment.join(', ') : String(d.equipment || '');
    $('#event-dlg').innerHTML = `
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="close-dlg" aria-label="Close">✕</button>
        <h3>${isNew ? 'New event' : 'Edit event'}</h3>
        <span></span>
      </div>
      <div class="sheet-body" data-scope="event">
        <label class="field"><span>Title *</span>
          <input id="ev-title" value="${esc(d.title)}" required aria-required="true">
          <span class="field-error" data-error-for="title" hidden></span>
        </label>
        <label class="field"><span>Type</span>
          <select id="ev-type">${EVENT_TYPES.map(([id, label]) =>
            `<option value="${id}" ${d.type === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Status</span>
          <select id="ev-status">${EVENT_STATUSES.map(([id, label]) =>
            `<option value="${id}" ${d.status === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
        </label>
        <label class="switch"><input type="checkbox" id="ev-allday" ${d.allDay ? 'checked' : ''}><span>All day</span></label>
        <div class="two">
          <label class="field"><span>Start date</span><input type="date" id="ev-start-date" value="${esc(startDate)}"></label>
          <label class="field" id="ev-start-time-wrap"><span>Start time</span><input type="time" id="ev-start-time" value="${esc(startTime)}"></label>
        </div>
        <div class="two">
          <label class="field"><span>End date</span><input type="date" id="ev-end-date" value="${esc(endDate)}"></label>
          <label class="field" id="ev-end-time-wrap"><span>End time</span><input type="time" id="ev-end-time" value="${esc(endTime)}"></label>
        </div>
        <label class="field"><span>Linked estimate</span>
          <select id="ev-estimate">${estimateOptionsHtml(d.estimateId)}</select>
        </label>
        <div id="ev-unapproved-warn" class="cal-warn" hidden>
          <p>This estimate is not approved yet. Scheduling tree work needs an explicit override.</p>
          <label class="switch"><input type="checkbox" id="ev-override"><span>Schedule anyway</span></label>
        </div>
        <label class="field"><span>Address</span><input id="ev-address" value="${esc(d.address)}"></label>
        <label class="field"><span>Town</span><input id="ev-town" value="${esc(d.town)}"></label>
        <label class="field"><span>Crew</span><input id="ev-crew" value="${esc(d.crew)}" placeholder="e.g. Crew A"></label>
        <label class="field"><span>Equipment</span><input id="ev-equipment" value="${esc(equipStr)}" placeholder="Comma-separated"></label>
        <label class="field"><span>Notes</span><textarea id="ev-notes" rows="3">${esc(d.notes)}</textarea></label>
        <div id="ev-conflict" class="cal-warn" hidden></div>
        <div class="btn-pair">
          ${isNew ? '<span></span>' : '<button type="button" class="btn danger" data-act="cal-delete">Delete</button>'}
          <button type="button" class="btn primary" data-act="cal-save">Save event</button>
        </div>
        ${d.estimateId ? `<button type="button" class="btn" data-act="open" data-id="${esc(d.estimateId)}">Open linked estimate</button>` : ''}
      </div>`;
    syncEventEditorChrome();
    $('#ev-allday').addEventListener('change', syncEventEditorChrome);
    $('#ev-type').addEventListener('change', syncUnapprovedWarn);
    $('#ev-estimate').addEventListener('change', () => {
      fillFromEstimate($('#ev-estimate').value);
      syncUnapprovedWarn();
    });
    syncUnapprovedWarn();
    $('#event-dlg').showModal();
  }

  function syncEventEditorChrome() {
    const allDay = $('#ev-allday')?.checked;
    $('#ev-start-time-wrap').hidden = !!allDay;
    $('#ev-end-time-wrap').hidden = !!allDay;
  }

  function fillFromEstimate(id) {
    if (!id) return;
    const e = hydrateEstimate(allEstimates()[id] || {});
    if (!$('#ev-title').value.trim()) {
      $('#ev-title').value = `${e.client?.name || e.number || 'Job'}`;
    }
    if (!$('#ev-address').value.trim()) $('#ev-address').value = e.client?.street || '';
    if (!$('#ev-town').value.trim()) $('#ev-town').value = e.client?.town || '';
    if (!$('#ev-equipment').value.trim()) {
      $('#ev-equipment').value = (e.equipment || []).map((r) => r.desc).filter(Boolean).join(', ');
    }
  }

  function syncUnapprovedWarn() {
    const box = $('#ev-unapproved-warn');
    if (!box) return;
    const type = $('#ev-type')?.value;
    const estId = $('#ev-estimate')?.value;
    if (type !== 'tree_work' || !estId) {
      box.hidden = true;
      return;
    }
    const est = allEstimates()[estId];
    if (!est || estimateApprovedEnough(hydrateEstimate(est))) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
  }

  function readEventForm() {
    const allDay = $('#ev-allday').checked;
    const startDate = $('#ev-start-date').value;
    const endDate = $('#ev-end-date').value || startDate;
    const startTime = $('#ev-start-time').value || '09:00';
    const endTime = $('#ev-end-time').value || '10:00';
    const equipment = $('#ev-equipment').value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const base = hydrateEvent(eventDraft || blankEvent());
    base.title = $('#ev-title').value.trim();
    base.type = $('#ev-type').value;
    base.status = $('#ev-status').value;
    base.allDay = allDay;
    base.timezone = TZ;
    base.estimateId = $('#ev-estimate').value || '';
    base.address = $('#ev-address').value.trim();
    base.town = $('#ev-town').value.trim();
    base.crew = $('#ev-crew').value.trim();
    base.equipment = equipment;
    base.notes = $('#ev-notes').value.trim();
    if (allDay) {
      base.start = startDate;
      base.end = ymdAddDays(endDate, 1); // exclusive
    } else {
      base.start = detroitLocalToIso(startDate, startTime);
      base.end = detroitLocalToIso(endDate, endTime);
    }
    return base;
  }

  function saveEventForm() {
    const root = $('[data-scope="event"]');
    clearFieldErrors(root);
    const ev = readEventForm();
    if (!ev.title) {
      const el = $('#ev-title');
      el.setAttribute('aria-invalid', 'true');
      el.classList.add('is-invalid');
      const err = $('[data-error-for="title"]');
      if (err) { err.textContent = 'Title is required'; err.hidden = false; }
      el.focus();
      toast('Title is required');
      return;
    }
    const startMs = eventRangeMs(ev).start;
    const endMs = eventRangeMs(ev).end;
    if (!(endMs > startMs)) {
      toast('End must be after start');
      return;
    }
    if (ev.type === 'tree_work' && ev.estimateId) {
      const est = allEstimates()[ev.estimateId];
      if (est && !estimateApprovedEnough(hydrateEstimate(est))) {
        if (!$('#ev-override')?.checked) {
          $('#ev-unapproved-warn').hidden = false;
          toast('Override required for unapproved tree work');
          return;
        }
      }
    }
    const conflicts = findConflicts(ev, { ignoreId: ev.id });
    const box = $('#ev-conflict');
    if (conflicts.length) {
      box.hidden = false;
      box.innerHTML = `<p><b>Overlap warning</b> (crew/equipment): ${conflicts.map((c) => esc(c.title || EVENT_TYPE_LABEL[c.type])).join(', ')}. Back-to-back is OK; overlapping times are flagged. Save anyway?</p>
        <button type="button" class="btn primary" data-act="cal-save-force">Save anyway</button>`;
      eventDraft = ev;
      return;
    }
    upsertEvent(ev);
    eventDraft = null;
    $('#event-dlg').close();
    toast('Event saved');
    if (/^#\/?(calendar)?\/?$/.test(location.hash || '#/') || (location.hash || '').includes('calendar')) renderCalendar();
    else navigate('#/');
  }


  // ---------- routing ----------

  const go = (hash) => { location.hash = hash; };
  const stepHash = (id, step) => `#/e/${id}/${step}`;

  function closeMenus() {
    for (const d of $$('dialog[open]')) d.close();
  }

  function navigate(hash) {
    closeMenus();
    if ((location.hash || '#/') === hash) {
      route();
      return;
    }
    go(hash);
  }

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (current && (parts[0] !== 'e' || parts[1] !== current.id)) closeCurrent();
    closeMenus();

    if (parts[0] === 'profile') renderProfile();
    else if (parts[0] === 'schedule' || parts[0] === 'jobs') renderSchedule();
    else if (parts[0] === 'estimates' || parts[0] === 'home') renderHome();
    else if (parts[0] === 'e') renderWizard(parts[1], parts[2]);
    else if (parts[0] === 'calendar' || !parts[0]) renderCalendar();
    else renderCalendar();
    updateSetupBanner();
    window.scrollTo(0, 0);
  }

  function setChrome({ title, back, bottombar }) {
    $('#appbar-title').textContent = title;
    $('#appbar-back').hidden = !back;
    $('#appbar-logo').hidden = !!back;
    $('#bottombar').hidden = !bottombar;
    document.body.classList.toggle('has-bottombar', !!bottombar);
  }

  const wizardTitle = () => `${current.number}${current.client.name ? ' · ' + current.client.name : ''}`;

  // ---------- home ----------

  function renderHome() {
    setChrome({ title: 'Estimates', back: true, bottombar: false });
    $('#view').innerHTML = `
      <img class="brand-hero" src="brand/brand-art.jpg" alt="Advanced Tree Service">
      <div class="btn-pair">
        <button type="button" class="btn primary big-ish" data-act="new">＋ New estimate</button>
        <button type="button" class="btn big-ish" data-act="calendar">📅 Calendar</button>
      </div>
      <input type="search" id="home-search" class="search" placeholder="Search estimates">
      <div id="est-list" class="est-list"></div>`;
    renderEstimateList();
    $('#home-search').addEventListener('input', renderEstimateList);
  }

  function renderEstimateList() {
    const q = ($('#home-search')?.value || '').trim().toLowerCase();
    const list = Object.values(allEstimates())
      .map(hydrateEstimate)
      .filter((e) => !q || [e.number, e.client?.name, e.client?.phone, e.client?.street, e.client?.town, e.client?.csz, STATUS_LABEL[e.status]].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    $('#est-list').innerHTML = list.length
      ? list.map((e) => `
        <button type="button" class="est-card" data-act="open" data-id="${esc(e.id)}">
          <div class="row"><b>${esc(e.client?.name || 'No name')}</b><b>${money(e.total)}</b></div>
          <div class="row muted"><span>${esc(e.number)} · ${niceDate(e.date)}</span>
            <span class="badge ${statusBadgeClass(e.status)}">${esc(STATUS_LABEL[e.status] || 'Draft')}</span></div>
          <div class="muted one-line">${esc([e.client?.town || e.client?.street, e.client?.csz].filter(Boolean).join(', '))}</div>
        </button>`).join('')
      : `<p class="empty">${q ? 'No matches.' : 'No estimates yet. Tap “New estimate” to start.'}</p>`;
  }

  // ---------- wizard ----------

  function renderWizard(id, stepId) {
    if (!current || current.id !== id) {
      const saved = allEstimates()[id];
      if (!saved) return location.replace('#/');
      current = hydrateEstimate(saved);
    }
    const steps = activeSteps();
    const i = findStepIndex(stepId);
    const step = steps[i];
    document.body.classList.toggle('is-tablet', isTablet());

    // Keep the hash on the screen's canonical id (e.g. site → client on tablet).
    if (stepId && stepId !== step.id) {
      history.replaceState(null, '', stepHash(current.id, step.id));
    }

    setChrome({ title: wizardTitle(), back: true, bottombar: true });

    $('#view').innerHTML = `
      <nav class="steps" aria-label="Estimate steps">${steps.map((s, n) => `
        <a href="${stepHash(current.id, s.id)}" class="step ${n === i ? 'on' : ''} ${n < i ? 'done' : ''}">
          <span class="dot">${n + 1}</span>${s.label}</a>`).join('')}</nav>
      <div class="step-body ${step.parts.length > 1 ? 'combined' : ''}" data-step="${step.id}" data-parts="${step.parts.join(' ')}">
        ${joinParts(step.parts)}
      </div>`;

    syncAll($('#view'), 'est');
    $('.step.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (step.parts.includes('sign')) {
      initSignature($('#sig-client'), () => current.clientSig, (url) => {
        current.clientSig = url;
        if (url && !current.clientSigDate) current.clientSigDate = today();
        if (url && (current.status === 'draft' || !current.status)) current.status = 'approved';
        syncKey('est', 'clientSigDate');
        scheduleSave();
      });
      const own = $('#sig-contractor');
      if (own) initSignature(own, () => profile.signature, (url) => { profile.signature = url; saveProfile(); });
    }
    updateTotals();

    $('#btn-prev').textContent = i === 0 ? '‹ Estimates' : '‹ Back';
    $('#btn-next').textContent = i === steps.length - 1 ? 'Done ✓' : `Next: ${steps[i + 1].label} ›`;
    $('#btn-prev').dataset.to = i === 0 ? '#/' : stepHash(current.id, steps[i - 1].id);
    $('#btn-next').dataset.to = i === steps.length - 1 ? '#/' : stepHash(current.id, steps[i + 1].id);
  }

  function stepClient() {
    const canPick = 'contacts' in navigator && 'select' in navigator.contacts;
    return `
      <h2 class="step-title">Client information</h2>
      <div class="btn-pair">
        <button type="button" class="btn big-ish" data-act="pick-contact">📇 From contacts</button>
        <button type="button" class="btn big-ish" data-act="pick-previous">↺ Past client</button>
      </div>
      ${canPick ? '' : '<p class="hint">On iPhone: in Contacts, open the person → Share Contact → Save to Files, then tap “From contacts” and pick the file.</p>'}
      <section class="card field-grid">
        ${field('Name', 'client.name', 'autocomplete="name" autocapitalize="words"')}
        ${field('Phone', 'client.phone', 'type="tel" autocomplete="tel" inputmode="tel"')}
        ${field('Email', 'client.email', 'type="email" autocomplete="email" inputmode="email"')}
        ${field('Address', 'client.street', 'autocomplete="address-line1" autocapitalize="words"')}
        ${field('Town', 'client.town', 'autocomplete="address-level2" autocapitalize="words"')}
        ${field('State / ZIP', 'client.csz', 'autocapitalize="characters"')}
      </section>`;
  }

  function stepTrees() {
    const cards = current.trees.map((t, i) => `
      <div class="tree-card">
        <button type="button" class="tree-main" data-act="edit-tree" data-i="${i}">
          <b>${i + 1}. ${esc(treeTitle(t))}</b>
          <span class="muted">${esc(treeDetails(t)) || 'Tap to add details'}</span>
          ${t.notes ? `<span class="muted small">${esc(t.notes)}</span>` : ''}
        </button>
        <button type="button" class="btn sm" data-act="copy-tree" data-i="${i}" aria-label="Add another like this">⧉ Copy</button>
      </div>`).join('');
    return `
      <h2 class="step-title">Trees <small class="muted">${treeCount(current)} total</small></h2>
      <p class="hint">One line per tree. If several trees are the same, use one line and set “How many”. Tap ⧉ Copy to add a similar tree.</p>
      <div class="line-list">${cards || '<p class="empty">No trees added yet.</p>'}</div>
      <button type="button" class="btn primary big" data-act="add-tree">＋ Add tree</button>`;
  }

  function stepSite() {
    return `
      <h2 class="step-title">Site</h2>
      <section class="card">
        <h3>Site conditions</h3>
        ${checkGroup('site', SITE)}
      </section>
      <section class="card">
        <h3>Wood &amp; debris <small>not charged</small></h3>
        ${checkGroup('extras', EXTRAS)}
      </section>
      <section class="card">
        ${field('Notes for the client', 'notes', 'rows="3" placeholder="Optional"', true)}
      </section>`;
  }

  function stepCrew() {
    return `
      <h2 class="step-title">Job days</h2>
      <section class="card">
        <h3>How many days?</h3>
        ${chips('days', DAYS, { isNum: true })}
        <div class="mt">${stepper('days', { step: 0.5, min: 0.5 })}</div>
      </section>
      <section class="card">
        <h3>Day rate</h3>
        ${moneyInput('dayRate')}
        <div class="sum-line grand">Labor total <b data-total="labor"></b></div>
      </section>
      <section class="card">
        <h3>Schedule</h3>
        <div class="chips">
          <button type="button" class="chip" data-act="start-in" data-d="7">Next week</button>
          <button type="button" class="chip" data-act="start-in" data-d="14">In 2 weeks</button>
          <button type="button" class="chip" data-act="start-in" data-d="21">In 3 weeks</button>
        </div>
        <div class="two mt">
          ${field('Estimated start', 'startDate', 'type="date"')}
          ${field('Estimated completion', 'endDate', 'type="date"')}
        </div>
      </section>`;
  }

  function stepEquipment() {
    const rows = current.equipment.map((m, i) => `
      <div class="line-card">
        <div class="line-head">
          <input data-bind="equipment.${i}.desc" placeholder="Description" class="desc">
          <button type="button" class="icon-btn del" data-act="del-row" data-list="equipment" data-i="${i}" aria-label="Remove">✕</button>
        </div>
        <div class="qty-price">
          <div><h4>Qty / days</h4>${stepper(`equipment.${i}.qty`, { min: 1 })}</div>
          <div><h4>Price each</h4>${moneyInput(`equipment.${i}.price`)}</div>
        </div>
        <div class="sum-line">Line total <b data-line="equipment.${i}"></b></div>
      </div>`).join('');
    return `
      <h2 class="step-title">Equipment rentals</h2>
      <section class="card">
        <h3>Tap to add <small>Smith rates · remembered after edit</small></h3>
        <div class="chips">${EQUIPMENT.map(([d]) => `<button type="button" class="chip" data-act="add-equip" data-desc="${esc(d)}">＋ ${esc(d)}</button>`).join('')}</div>
      </section>
      <div class="line-list">${rows || '<p class="empty">No equipment rentals. Skip this step if none are needed.</p>'}</div>
      <button type="button" class="btn big" data-act="add-equip" data-desc="">＋ Other item</button>
      <section class="card"><div class="sum-line grand">Total equipment <b data-total="equipment"></b></div></section>`;
  }

  function stepSummary() {
    const approved = current.status && current.status !== 'draft';
    return `
      <h2 class="step-title">Estimate summary</h2>
      <section class="card totals">
        <div class="sum-line">Labor (${num(current.days)} day${num(current.days) === 1 ? '' : 's'} × ${money(num(current.dayRate))}) <span data-total="labor"></span></div>
        <div class="sum-line">Equipment rentals <span data-total="equipment"></span></div>
        <div class="sum-line"><b>Subtotal</b> <b data-total="subtotal"></b></div>
      </section>
      <section class="card">
        <h3>Tax</h3>
        <div class="row"><label class="mini"><input data-bind="taxRate" type="number" inputmode="decimal" min="0" step="0.001"> %</label><span data-total="tax"></span></div>
      </section>
      <section class="card">
        <h3>Other costs <small>travel, misc — not wood &amp; debris</small></h3>
        ${chips('additional', ADDITIONAL, { isNum: true })}
        <div class="mt">${moneyInput('additional', 'Other amount')}</div>
      </section>
      <section class="card">
        <div class="sum-line grand">Total estimate <b data-total="total"></b></div>
      </section>
      <section class="card">
        <h3>Terms</h3>
        <h4>Estimate is valid for</h4>
        ${chips('validDays', VALID_DAYS, { isNum: true, required: true })}
        <h4>Deposit required</h4>
        ${chips('depositPct', DEPOSITS, { isNum: true })}
        <div class="row mt">${moneyInput('depositAmt', 'or enter amount')}<b data-total="deposit" class="dep"></b></div>
      </section>
      <section class="card">
        <h3>Approval <small>${esc(STATUS_LABEL[normalizeStatus(current)])}</small></h3>
        ${approved
          ? `<p class="muted small">This estimate is marked ${esc(STATUS_LABEL[normalizeStatus(current)])}.${current.clientSig ? ' Client signature on file.' : ''}</p>
             <button type="button" class="btn" data-act="schedule">📅 Open schedule</button>`
          : `<p class="muted small">Mark approved for verbal or email approvals, or collect a signature on the next step.</p>
             <button type="button" class="btn primary big" data-act="mark-approved">✓ Mark approved</button>`}
      </section>`;
  }

  // ---------- tree sheet ----------

  function openTree(i, from) {
    editingIndex = i;
    editingTree = i >= 0 ? clone(current.trees[i]) : from ? { ...clone(from), notes: '' } : blankTree();
    const dlg = $('#tree-dlg');
    dlg.innerHTML = `
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="close-dlg" aria-label="Cancel">✕</button>
        <h3>${i >= 0 ? 'Tree ' + (i + 1) : 'Add tree'}</h3>
        <button type="button" class="btn primary sm" data-act="save-tree">Save</button>
      </div>
      <div class="sheet-body">
        <h4>Type of tree</h4>
        ${chips('species', SPECIES)}
        <input data-bind="species" placeholder="Other type…" class="mt" autocapitalize="words">
        <h4>Work</h4>
        ${chips('work', WORK)}
        <h4>Location</h4>
        ${chips('location', LOCATIONS)}
        <h4>Trunk diameter (DBH)</h4>
        ${chips('size', SIZES)}
        <h4>Condition</h4>
        ${chips('condition', CONDITIONS)}
        <h4>How many trees like this?</h4>
        ${stepper('qty', { min: 1 })}
        <h4>Notes</h4>
        <textarea data-bind="notes" rows="2" placeholder="Anything else about this tree…"></textarea>
        ${i >= 0 ? '<button type="button" class="btn danger big" data-act="delete-tree">Delete this tree</button>' : ''}
        <button type="button" class="btn primary big" data-act="save-tree">Save tree</button>
      </div>`;
    syncAll(dlg, 'tree');
    dlg.showModal();
    $('.sheet-body', dlg).scrollTop = 0;
  }

  function saveTree() {
    editingTree.qty = Math.max(1, num(editingTree.qty) || 1);
    if (editingIndex >= 0) current.trees[editingIndex] = editingTree;
    else current.trees.push(editingTree);
    $('#tree-dlg').close();
    saveNow();
    renderWizard(current.id, 'trees');
  }

  function updateTotals() {
    if (!current) return;
    const t = totals(current);
    for (const el of $$('[data-total]')) el.textContent = money(t[el.dataset.total]);
    for (const el of $$('[data-line]')) {
      const [list, i] = el.dataset.line.split('.');
      const r = current[list][i];
      if (r) el.textContent = money(num(r.qty) * num(r.price));
    }
  }

  function stepSign() {
    const t = totals(current);
    return `
      <h2 class="step-title">Signatures</h2>
      <section class="card">
        <div class="sum-line grand">Total estimate <b>${money(t.total)}</b></div>
        ${t.deposit ? `<div class="sum-line">Deposit required <span>${money(t.deposit)}</span></div>` : ''}
      </section>
      <section class="card">
        <h3>Client acceptance</h3>
        <p class="muted small">By signing, I accept this estimate and authorize the work described.</p>
        <canvas id="sig-client" class="sig" aria-label="Client signs here"></canvas>
        <div class="sig-foot"><span>Client signs above</span><button type="button" class="link" data-act="clear-sig">Clear</button></div>
        ${field('Date', 'clientSigDate', 'type="date"')}
      </section>
      <section class="card">
        <h3>Contractor signature</h3>
        ${profile.signature
          ? `<img src="${profile.signature}" alt="Your signature" class="sig-img"><p class="muted small">Added automatically from your company profile, dated ${niceDate(current.date)}.</p>`
          : `<p class="muted small">Sign once – it’s saved and added to every estimate.</p>
             <canvas id="sig-contractor" class="sig" aria-label="Contractor signs here"></canvas>`}
      </section>`;
  }

  function stepSend() {
    const share = 'share' in navigator ? '<button type="button" class="btn" data-act="share">📤 Share</button>' : '';
    const status = normalizeStatus(current);
    const approved = status !== 'draft';
    return `
      <h2 class="step-title">Send to client</h2>
      <div class="btn-grid">
        <button type="button" class="btn primary" data-act="print">🖨️ Print / PDF</button>
        ${share}
        <button type="button" class="btn" data-act="sms" ${current.client.phone ? '' : 'disabled'}>💬 Text</button>
        <button type="button" class="btn" data-act="email" ${current.client.email ? '' : 'disabled'}>✉️ Email</button>
      </div>
      ${approved
        ? `<p class="hint">Status: <b>${esc(STATUS_LABEL[status])}</b>. Open Schedule to pick work dates.</p>
           <button type="button" class="btn big" data-act="schedule">📅 Open schedule</button>`
        : `<button type="button" class="btn big" data-act="mark-approved">✓ Mark approved</button>
           <p class="hint">Use Mark approved for verbal or email approvals without a signature.</p>`}
      <p class="hint">For a PDF: tap Print / PDF, then choose “Save as PDF” (Android) or use the Share button in the print screen (iPhone).</p>
      <div class="doc-preview">${renderDoc(current)}</div>
      <div class="btn-pair">
        <button type="button" class="btn" data-act="duplicate">⧉ Duplicate</button>
        <button type="button" class="btn danger" data-act="delete-est">🗑 Delete</button>
      </div>`;
  }

  // ---------- signature pad ----------

  function initSignature(canvas, get, set) {
    if (canvas._sigCleanup) canvas._sigCleanup();
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let last = null;
    let dirty = false;

    const paintStyle = () => {
      Object.assign(ctx, { lineWidth: 2.4, lineCap: 'round', lineJoin: 'round', strokeStyle: '#1f2421' });
    };

    const drawSaved = (src, cssW, cssH) => {
      if (!src) return;
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cssW, cssH);
      img.src = src;
    };

    const sizeToDisplay = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      // Keep in-progress ink across orientation changes; otherwise reload saved sig.
      const kept = dirty ? canvas.toDataURL('image/png') : '';
      canvas.width = w;
      canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintStyle();
      drawSaved(kept || get(), r.width, r.height);
    };

    sizeToDisplay();

    const pt = (e) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const onDown = (e) => {
      drawing = true;
      last = pt(e);
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!drawing) return;
      const p = pt(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      dirty = true;
    };
    const end = () => {
      if (!drawing) return;
      drawing = false;
      if (dirty) set(canvas.toDataURL('image/png'));
    };
    const onResize = () => {
      if (drawing) return;
      sizeToDisplay();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    canvas._sigCleanup = () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      delete canvas._sigCleanup;
    };
  }

  // ---------- printable estimate (mirrors the paper form) ----------

  function renderDoc(e) {
    const t = totals(e);
    const p = profile;
    const box = (on, label) => `<span class="cb"><i class="${on ? 'on' : ''}">${on ? '✓' : ''}</i>${label}</span>`;
    const boxes = (opts, sel = [], other = '') =>
      opts.map((o) => box(sel.includes(o), esc(o))).join('') + box(!!other, `Other${other ? ': ' + esc(other) : ''}`);
    const kv = (label, value) => `<div class="kv"><b>${label}:</b><span>${esc(value) || '&nbsp;'}</span></div>`;
    const sec = (title, body) => `<section class="doc-sec"><h3>${title}</h3><div class="doc-sec-body">${body}</div></section>`;
    const tr = (label, body) => `<tr><th>${label}</th><td>${body}</td></tr>`;

    const eqRows = (e.equipment || []).map((m) => `<tr><td>${esc(m.desc)}</td><td class="r">${num(m.qty)}</td><td class="r">${money(num(m.price))}</td><td class="r">${money(num(m.qty) * num(m.price))}</td></tr>`).join('');
    const treeRows = (e.trees || []).map((trItem, i) => `<tr>
        <td>${i + 1}</td><td class="r">${num(trItem.qty) || 1}</td><td><b>${esc(trItem.species) || '—'}</b></td><td>${esc(trItem.work)}</td>
        <td>${esc(trItem.location)}</td><td>${esc(sizeLabel(trItem.size) || trItem.size)}</td><td>${esc(trItem.condition)}${trItem.notes ? `<div class="doc-note">${esc(trItem.notes)}</div>` : ''}</td></tr>`).join('');
    const validUntil = addDays(e.date, num(e.validDays) || 30);
    const townLine = [e.client.town, e.client.csz].filter(Boolean).join(' · ');

    return `
      <article class="doc">
        <header class="doc-head">
          ${p.logo ? `<img src="${esc(p.logo)}" alt="" class="doc-logo">` : ''}
          <h1>Tree Service Estimate</h1>
          <div class="doc-no"><b>${esc(e.number)}</b><br>${niceDate(e.date)}</div>
        </header>

        ${sec('Company information', `
          <div class="grid2">${kv('Company name', p.name)}${kv('License number', p.license)}</div>
          ${kv('Address', p.address)}
          <div class="grid2">${kv('Phone', p.phone)}${kv('Email', p.email)}</div>`)}

        ${sec('Client information', `
          <div class="grid2">${kv('Name', e.client.name)}${kv('Email', e.client.email)}</div>
          <div class="grid2">${kv('Address', e.client.street)}${kv('Town', e.client.town)}</div>
          <div class="grid2">${kv('State / ZIP', e.client.csz)}${e.client.phone ? kv('Phone', e.client.phone) : '<div></div>'}</div>
          ${townLine && !e.client.town ? kv('City / State / ZIP', e.client.csz) : ''}`)}

        ${sec(`Trees (${treeCount(e)})`, `
          <table class="doc-table trees">
            <thead><tr><th>#</th><th class="r">Qty</th><th>Type of tree</th><th>Work</th><th>Location</th><th>DBH</th><th>Condition / notes</th></tr></thead>
            <tbody>${treeRows || '<tr><td colspan="7" class="none">None</td></tr>'}</tbody>
          </table>`)}

        ${sec('Site details', `
          <table class="doc-form">
            ${tr('Site conditions', boxes(SITE, e.site, e.siteOther))}
            ${tr('Wood &amp; debris', boxes(EXTRAS, e.extras, e.extrasOther))}
            ${tr('Estimated dates', `Start: <b>${niceDate(e.startDate) || '—'}</b> &nbsp;&nbsp; Completion: <b>${niceDate(e.endDate) || '—'}</b>`)}
            ${e.notes ? tr('Notes', esc(e.notes).replace(/\n/g, '<br>')) : ''}
          </table>`)}

        <div class="doc-cols">
          ${sec('Job labor', `
            <table class="doc-table">
              <thead><tr><th class="r">Days</th><th class="r">Day rate</th><th class="r">Amount</th></tr></thead>
              <tbody><tr><td class="r">${num(e.days)}</td><td class="r">${money(num(e.dayRate))}</td><td class="r">${money(t.labor)}</td></tr></tbody>
              <tfoot><tr><th colspan="2">Total labor</th><td class="r">${money(t.labor)}</td></tr></tfoot>
            </table>`)}
          ${sec('Equipment rentals', `
            <table class="doc-table">
              <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
              <tbody>${eqRows || '<tr><td colspan="4" class="none">None</td></tr>'}</tbody>
              <tfoot><tr><th colspan="3">Total equipment</th><td class="r">${money(t.equipment)}</td></tr></tfoot>
            </table>`)}
        </div>

        ${sec('Estimate summary', `
          <table class="doc-sum">
            <tr><th>Subtotal (labor + equipment)</th><td>${money(t.subtotal)}</td></tr>
            <tr><th>Tax${num(e.taxRate) ? ` (${num(e.taxRate)}%)` : ''}</th><td>${money(t.tax)}</td></tr>
            <tr><th>Other costs (travel, etc.)</th><td>${money(t.additional)}</td></tr>
            <tr class="grand"><th>Total estimate</th><td>${money(t.total)}</td></tr>
          </table>`)}

        <div class="doc-cols">
          ${sec('Signatures', `
            <div class="sig-line"><div class="sig-box">${p.signature ? `<img src="${p.signature}" alt="">` : ''}</div><span>${niceDate(e.date)}</span></div>
            <div class="sig-cap"><span>Contractor signature</span><span>Date</span></div>
            <div class="sig-line"><div class="sig-box">${e.clientSig ? `<img src="${e.clientSig}" alt="">` : ''}</div><span>${niceDate(e.clientSigDate)}</span></div>
            <div class="sig-cap"><span>Client acceptance signature</span><span>Date</span></div>`)}
          ${sec('Terms', `
            <p>This estimate is valid for <b>${num(e.validDays) || 30}</b> days from the date of issue (until ${niceDate(validUntil)}).</p>
            <p>Final costs may vary depending on site conditions and additional work.</p>
            <p>Deposit required: <b>${money(t.deposit)}</b></p>`)}
        </div>
      </article>`;
  }

  function summaryText(e) {
    const t = totals(e);
    const first = e.client.name.split(' ')[0];
    return [
      `Hi${first ? ' ' + first : ''}, here is your tree service estimate ${e.number} from ${profile.name}:`,
      '',
      ...e.trees.map((trItem) => `• ${treeTitle(trItem)}`),
      '',
      `Job: ${num(e.days)} day${num(e.days) === 1 ? '' : 's'}`,
      e.client.town ? `Town: ${e.client.town}` : '',
      `Total estimate: ${money(t.total)}${t.deposit ? ` (deposit ${money(t.deposit)})` : ''}`,
      `Valid for ${num(e.validDays) || 30} days.`,
      '',
      `Questions? ${[profile.phone, profile.email].filter(Boolean).join(' · ')}`,
    ].filter((l, i, a) => l || (a[i - 1] && a[i + 1])).join('\n');
  }

  // ---------- schedule ----------

  function scheduleJobs() {
    return Object.values(allEstimates())
      .map(hydrateEstimate)
      .filter((e) => SCHEDULE_STATUSES.includes(normalizeStatus(e)))
      .sort((a, b) => {
        const da = a.startDate || '9999';
        const db = b.startDate || '9999';
        if (da !== db) return da.localeCompare(db);
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
  }

  function equipmentSummary(e) {
    const rows = (e.equipment || []).filter((m) => String(m.desc || '').trim());
    if (!rows.length) return { yes: false, text: 'None' };
    const names = rows.map((m) => m.desc.trim());
    const short = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
    return { yes: true, text: short };
  }

  function daysLabel(days) {
    const n = num(days);
    if (n === 0.5) return '½ day';
    if (n === 1) return '1 day';
    if (n === 1.5) return '1½ days';
    return `${n} days`;
  }

  function jobCardHtml(e, { compact = false } = {}) {
    const status = normalizeStatus(e);
    const eq = equipmentSummary(e);
    const phone = String(e.client?.phone || '').trim();
    const tel = phone.replace(/[^\d+]/g, '');
    const reason = status === 'blocked' && e.blockReason
      ? `<div class="muted small">Blocked: ${esc(e.blockReason)}</div>` : '';
    const dates = e.startDate
      ? `<div class="muted small">${niceDate(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ' – ' + niceDate(e.endDate) : ''}</div>`
      : '<div class="muted small">No work date yet</div>';
    return `
      <article class="job-card" data-id="${esc(e.id)}">
        <div class="row">
          <b>${esc(e.client?.name || 'No name')}</b>
          <span class="badge ${statusBadgeClass(status)}">${esc(STATUS_LABEL[status])}</span>
        </div>
        <div class="muted">${esc(e.client?.town || 'No town')} · ${esc(daysLabel(e.days))}</div>
        ${dates}
        <div class="muted small">Equipment: ${eq.yes ? esc(eq.text) : 'None'}</div>
        ${reason}
        <div class="job-actions">
          ${phone ? `<a class="btn sm" href="tel:${esc(tel)}">📞 Call</a>` : ''}
          <button type="button" class="btn sm" data-act="open" data-id="${esc(e.id)}">Open</button>
          <label class="job-date sm-field">
            <span class="sr-only">Work date</span>
            <input type="date" data-act="sched-date" data-id="${esc(e.id)}" value="${esc(e.startDate || '')}">
          </label>
        </div>
        ${compact ? '' : `
        <div class="chips job-status-chips">
          ${status !== 'in_progress' ? `<button type="button" class="chip" data-act="set-status" data-id="${esc(e.id)}" data-status="in_progress">In progress</button>` : ''}
          ${status !== 'blocked' ? `<button type="button" class="chip" data-act="set-status" data-id="${esc(e.id)}" data-status="blocked">Blocked</button>` : ''}
          ${status !== 'done' ? `<button type="button" class="chip" data-act="set-status" data-id="${esc(e.id)}" data-status="done">Done</button>` : ''}
          ${status === 'blocked' ? `<button type="button" class="chip" data-act="set-status" data-id="${esc(e.id)}" data-status="scheduled">Unblock</button>` : ''}
          ${status === 'done' ? `<button type="button" class="chip" data-act="set-status" data-id="${esc(e.id)}" data-status="scheduled">Reopen</button>` : ''}
        </div>
        ${status === 'blocked' ? `
        <div class="chips block-reason-chips">
          ${BLOCK_REASONS.map((r) => `<button type="button" class="chip ${e.blockReason === r ? 'on' : ''}" data-act="set-block-reason" data-id="${esc(e.id)}" data-reason="${esc(r)}" aria-pressed="${e.blockReason === r}">${esc(r)}</button>`).join('')}
        </div>` : ''}`}
      </article>`;
  }

  function renderSchedule() {
    setChrome({ title: 'Jobs', back: true, bottombar: false });
    const jobs = scheduleJobs();
    const mode = scheduleMode;
    $('#view').innerHTML = `
      <div class="sched-toolbar">
        <div class="chips" role="tablist" aria-label="Schedule view">
          <button type="button" class="chip" data-act="sched-mode" data-mode="list" aria-pressed="${mode === 'list'}">List</button>
          <button type="button" class="chip" data-act="sched-mode" data-mode="kanban" aria-pressed="${mode === 'kanban'}">Kanban</button>
        </div>
        <p class="hint">Estimate pipeline (Kanban). Calendar owns dates and times — open it from the menu or Home.</p>
        <div class="btn-pair" style="margin-bottom:12px">
          <button type="button" class="btn primary" data-act="calendar">📅 Calendar</button>
          <button type="button" class="btn" data-act="estimates">📋 Estimates</button>
        </div>
      </div>
      <div id="sched-body"></div>`;
    const body = $('#sched-body');
    if (!jobs.length) {
      body.innerHTML = `<p class="empty">No approved jobs yet. Mark an estimate approved (or collect a signature), then it appears here.</p>`;
      return;
    }
    if (mode === 'kanban') {
      body.innerHTML = `<div class="kanban">${KANBAN_COLS.map((col) => {
        const colJobs = jobs.filter((e) => normalizeStatus(e) === col.id);
        return `<section class="kanban-col" data-col="${col.id}">
          <header class="kanban-head"><h3>${esc(col.label)}</h3><span class="muted">${colJobs.length}</span></header>
          <div class="kanban-list">${colJobs.map((e) => jobCardHtml(e)).join('') || '<p class="empty small-empty">None</p>'}</div>
        </section>`;
      }).join('')}</div>`;
    } else {
      body.innerHTML = `<div class="est-list sched-list">${jobs.map((e) => jobCardHtml(e)).join('')}</div>`;
    }
  }

  function updateStoredEstimate(id, mutator) {
    const all = allEstimates();
    const raw = all[id];
    if (!raw) { toast('Estimate not found'); return null; }
    const e = hydrateEstimate(raw);
    mutator(e);
    e.updatedAt = new Date().toISOString();
    e.total = totals(e).total;
    delete e.crew;
    all[id] = e;
    store(KEYS.estimates, all);
    if (current?.id === id) {
      current = e;
    }
    return e;
  }

  // ---------- company profile ----------

  function renderProfile() {
    const incomplete = isProfileIncomplete();
    profileDraft = clone(profile);
    setChrome({ title: 'Company profile', back: true, bottombar: false });
    $('#view').innerHTML = `
      <div data-scope="profile">
        ${incomplete
          ? '<div class="welcome"><h2>Welcome</h2><p>Set up your company information once. It goes on every estimate automatically. You can still open Calendar, Estimates, and Jobs from the menu.</p></div>'
          : '<h2 class="step-title">Company profile</h2>'}
        <section class="card">
          <h3>Company information</h3>
          <div class="logo-row">
            <img id="logo-preview" alt="">
            <div class="btn-pair">
              <button type="button" class="btn" data-act="logo-pick">Change logo</button>
              <button type="button" class="btn" data-act="logo-remove">Remove</button>
            </div>
          </div>
          ${field('Company name *', 'name', 'autocapitalize="words" required aria-required="true"')}
          ${field('License number', 'license')}
          ${field('Address', 'address', 'rows="2"', true)}
          ${field('Phone *', 'phone', 'type="tel" inputmode="tel" required aria-required="true"')}
          ${field('Email', 'email', 'type="email" inputmode="email"')}
        </section>
        <section class="card">
          <h3>Estimate defaults</h3>
          <h4>Estimates are valid for</h4>
          ${chips('validDays', VALID_DAYS, { isNum: true, required: true })}
          <h4>Default deposit</h4>
          ${chips('depositPct', DEPOSITS, { isNum: true, required: true })}
          <div class="two mt">
            ${field('Day rate ($/day)', 'dayRate', 'type="number" inputmode="decimal" min="0" step="1"')}
            ${field('Sales tax %', 'taxRate', 'type="number" inputmode="decimal" min="0" step="0.001"')}
          </div>
          ${field('Next estimate #', 'nextNumber', 'type="number" inputmode="numeric" min="1"')}
        </section>
        <section class="card">
          <h3>Contractor signature</h3>
          <p class="muted small">Sign once. It’s added to every estimate automatically.</p>
          <canvas id="sig-profile" class="sig" aria-label="Sign here"></canvas>
          <div class="sig-foot"><span>Sign above</span><button type="button" class="link" data-act="clear-profile-sig">Clear</button></div>
        </section>
        <button type="button" class="btn primary big" data-act="save-profile">Save profile</button>
      </div>`;
    syncAll($('#view'), 'profile');
    renderLogoPreview();
    initSignature($('#sig-profile'), () => profileDraft.signature, (url) => { profileDraft.signature = url; });
  }

  function renderLogoPreview() {
    const img = $('#logo-preview');
    if (!img) return;
    img.hidden = !profileDraft.logo;
    img.src = profileDraft.logo || '';
  }

  function saveProfileForm() {
    const root = $('[data-scope="profile"]');
    clearFieldErrors(root);
    const name = String(profileDraft.name || '').trim();
    const phone = String(profileDraft.phone || '').trim();
    let firstInvalid = null;
    if (!name) firstInvalid = setFieldError('name', 'Company name is required', root) || firstInvalid;
    if (!phone) {
      const phoneEl = setFieldError('phone', 'Phone is required', root);
      firstInvalid = firstInvalid || phoneEl;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      toast('Company name and phone are required');
      return;
    }
    const wasFirst = isProfileIncomplete();
    profile = { ...profileDraft, name, phone, nextNumber: Math.max(1, Math.floor(num(profileDraft.nextNumber)) || 1), complete: true };
    delete profile.crew;
    profile.prices = profile.prices || {};
    for (const [k, v] of Object.entries(EQUIPMENT_DEFAULTS)) {
      if (profile.prices[k] == null) profile.prices[k] = v;
    }
    saveProfile();
    toast(wasFirst ? 'All set! Start your first estimate.' : 'Company profile saved');
    navigate('#/');
  }

  // ---------- contacts ----------

  const stateZipOf = (region, zip) => [region, zip].filter(Boolean).join(' ');

  async function pickContact() {
    if ('contacts' in navigator && 'select' in navigator.contacts) {
      try {
        const props = await navigator.contacts.getProperties();
        const [c] = await navigator.contacts.select(props.filter((p) => ['name', 'tel', 'email', 'address'].includes(p)), { multiple: false });
        if (!c) return;
        const a = c.address?.[0];
        fillClient({
          name: c.name?.[0] || '',
          phone: c.tel?.[0] || '',
          email: c.email?.[0] || '',
          street: a?.addressLine?.join(' ') || '',
          town: a?.city || '',
          csz: a ? stateZipOf(a.region, a.postalCode) : '',
        });
      } catch (err) {
        console.warn(err);
      }
    } else {
      $('#vcf-file').click();
    }
  }

  function parseVCard(text) {
    const out = {};
    const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const unesc = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
    for (const line of lines) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0].toUpperCase().replace(/^ITEM\d+\./, '');
      const raw = line.slice(i + 1);
      if (key === 'END' && out.name) break; // first card only
      if (key === 'FN' && !out.name) out.name = unesc(raw);
      if (key === 'N' && !out.nParts) out.nParts = raw.split(';').map(unesc);
      if (key === 'TEL' && !out.phone) out.phone = unesc(raw);
      if (key === 'EMAIL' && !out.email) out.email = unesc(raw);
      if (key === 'ADR' && !out.street) {
        const [, , street, city, region, zip] = raw.replace(/\\;/g, '\u0000').split(';').map((x) => unesc(x.replace(/\u0000/g, ';')));
        out.street = street;
        out.town = city || '';
        out.csz = stateZipOf(region, zip);
      }
    }
    if (!out.name && out.nParts) out.name = [out.nParts[1], out.nParts[0]].filter(Boolean).join(' ');
    return out;
  }

  function fillClient(c) {
    for (const k of ['name', 'phone', 'email', 'street', 'town', 'csz']) {
      if (c[k]) current.client[k] = c[k];
      syncKey('est', 'client.' + k);
    }
    $('#appbar-title').textContent = wizardTitle();
    scheduleSave();
    toast(c.name ? `Added ${c.name}` : 'Contact added');
  }

  function pastClients() {
    const seen = new Map();
    const list = Object.values(allEstimates()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    for (const e of list) {
      const c = hydrateEstimate(e).client || {};
      const k = (c.name + '|' + c.phone).toLowerCase();
      if (c.name && !seen.has(k) && e.id !== current?.id) seen.set(k, c);
    }
    return [...seen.values()];
  }

  function filteredClients() {
    const q = $('#pick-search').value.trim().toLowerCase();
    return pastClients().filter((c) => !q || [c.name, c.phone, c.street, c.town, c.csz].join(' ').toLowerCase().includes(q));
  }

  function renderPickList() {
    const list = filteredClients();
    $('#pick-list').innerHTML = list.length
      ? list.map((c, i) => `<button type="button" class="pick-item" data-act="choose-client" data-i="${i}">
          <b>${esc(c.name)}</b><span class="muted">${esc([c.phone, c.town || c.street].filter(Boolean).join(' · '))}</span></button>`).join('')
      : `<p class="empty">${$('#pick-search').value ? 'No matches.' : 'No past clients yet.'}</p>`;
  }

  // ---------- backup ----------

  function backupSchemaVersion(data) {
    const v = Number(data?.schemaVersion ?? data?.version);
    return Number.isFinite(v) ? v : 0;
  }

  function normalizeBackupMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
  }

  function exportAll() {
    const estimates = {};
    for (const [id, raw] of Object.entries(allEstimates())) {
      const e = hydrateEstimate(raw);
      delete e.crew;
      estimates[id] = e;
    }
    const data = {
      app: 'ats-estimates',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      version: BACKUP_SCHEMA_VERSION, // legacy readers
      exportedAt: new Date().toISOString(),
      profile,
      estimates,
      events: allEvents(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ats-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded — stays on this device');
  }

  function applyProfileFromBackup(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    profile = { ...DEFAULT_PROFILE, ...incoming, complete: true };
    profile.prices = profile.prices || {};
    delete profile.crew;
    for (const [k, v] of Object.entries(EQUIPMENT_DEFAULTS)) {
      if (profile.prices[k] == null) profile.prices[k] = v;
    }
    // Mark complete only when required fields are present.
    profile.complete = !!(String(profile.name || '').trim() && String(profile.phone || '').trim());
    saveProfile();
  }

  function hydrateEstimateMap(rawMap) {
    const out = {};
    for (const [id, raw] of Object.entries(normalizeBackupMap(rawMap))) {
      if (!raw || typeof raw !== 'object') continue;
      const e = hydrateEstimate(raw);
      delete e.crew;
      out[id] = e;
    }
    return out;
  }

  function snapshotBeforeReplace() {
    const snap = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      reason: 'pre-replace',
      profile,
      estimates: allEstimates(),
      events: allEvents(),
    };
    store(KEYS.restoreSnapshot, snap);
  }

  function showRestoreDialog(data) {
    pendingRestore = data;
    const estimates = normalizeBackupMap(data.estimates);
    const events = normalizeBackupMap(data.events);
    const estCount = Object.keys(estimates).length;
    const eventCount = Object.keys(events).length;
    const hasProfile = !!(data.profile && typeof data.profile === 'object');
    const when = data.exportedAt ? niceDate(String(data.exportedAt).slice(0, 10)) : 'unknown date';
    $('#restore-summary').innerHTML = `
      <strong>Import summary</strong><br>
      Exported: ${esc(when)} · schema ${esc(backupSchemaVersion(data))}<br>
      ${estCount} estimate${estCount === 1 ? '' : 's'},
      ${eventCount} calendar event${eventCount === 1 ? '' : 's'},
      company profile: ${hasProfile ? 'yes' : 'no'}.`;
    const opt = $('#restore-include-profile');
    opt.checked = hasProfile;
    opt.disabled = !hasProfile;
    $('#restore-profile-opt').hidden = !hasProfile;
    $('#restore-dlg').showModal();
  }

  function applyRestore(mode) {
    if (!pendingRestore) return;
    const data = pendingRestore;
    const includeProfile = $('#restore-include-profile')?.checked && data.profile;
    const incomingEstimates = hydrateEstimateMap(data.estimates);
    const incomingEvents = normalizeBackupMap(data.events);
    const estCount = Object.keys(incomingEstimates).length;
    const eventCount = Object.keys(incomingEvents).length;

    if (mode === 'replace') {
      snapshotBeforeReplace();
      // Replace only the maps present in the backup. Never wipe estimates
      // when the file has none — leave the current estimate list alone.
      if (estCount) store(KEYS.estimates, incomingEstimates);
      if (data.events != null) store(KEYS.events, incomingEvents);
      if (includeProfile) applyProfileFromBackup(data.profile);
    } else {
      if (estCount) {
        const merged = { ...allEstimates() };
        for (const [id, est] of Object.entries(incomingEstimates)) merged[id] = est;
        store(KEYS.estimates, merged);
      }
      if (eventCount || data.events != null) {
        const mergedEvents = { ...allEvents(), ...incomingEvents };
        store(KEYS.events, mergedEvents);
      }
      if (includeProfile) applyProfileFromBackup(data.profile);
    }

    pendingRestore = null;
    $('#restore-dlg').close();
    const parts = [];
    if (estCount) parts.push(`${estCount} estimate${estCount === 1 ? '' : 's'}`);
    if (eventCount) parts.push(`${eventCount} event${eventCount === 1 ? '' : 's'}`);
    if (includeProfile) parts.push('profile');
    toast(parts.length
      ? `${mode === 'replace' ? 'Replaced' : 'Merged'}: ${parts.join(', ')}`
      : 'Nothing to restore from that file');
    route();
  }

  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        toast('That file is not a valid backup');
        return;
      }
      const schema = backupSchemaVersion(data);
      if (schema < BACKUP_MIN_SCHEMA) {
        toast('Backup schema is too old or missing');
        return;
      }
      if (!data.estimates && !data.profile && data.events == null) {
        toast('That file has no profile, estimates, or events');
        return;
      }
      // Accept legacy backups that used `version` without schemaVersion / events.
      if (data.events == null) data.events = {};
      if (data.estimates == null) data.estimates = {};
      showRestoreDialog(data);
    } catch (err) {
      console.error(err);
      toast('That file could not be read');
    }
  }

  // ---------- actions ----------

  const actions = {
    home: () => navigate('#/'),
    calendar: () => navigate('#/'),
    estimates: () => navigate('#/estimates'),
    schedule: () => navigate('#/schedule'),
    menu: () => {
      $('#menu-install').hidden = !installPrompt;
      $('#menu-dlg').showModal();
    },
    'close-dlg': (el) => el.closest('dialog').close(),
    profile: () => navigate('#/profile'),
    export: () => { closeMenus(); exportAll(); },
    import: () => { closeMenus(); $('#import-file').click(); },
    'restore-merge': () => applyRestore('merge'),
    'restore-replace': () => applyRestore('replace'),
    install: async () => {
      closeMenus();
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
    },

    new: () => {
      current = blankEstimate();
      profile.nextNumber = num(profile.nextNumber) + 1;
      saveProfile();
      go(stepHash(current.id, 'client'));
    },
    open: (el) => go(stepHash(el.dataset.id, 'client')),
    prev: (el) => go(el.dataset.to),
    next: (el) => {
      if (el.dataset.to === '#/' && !isEmpty(current)) toast(`${current.number} saved`);
      go(el.dataset.to);
    },

    'mark-approved': () => {
      if (!current) return;
      flushBound('est');
      setEstimateStatus(current, 'approved');
      if (!current.clientSigDate) current.clientSigDate = today();
      saveNow();
      toast(`${current.number} approved`);
      const hashStep = location.hash.replace(/^#\/?/, '').split('/')[2];
      renderWizard(current.id, hashStep || 'summary');
    },

    'cal-today': () => { cal.cursor = detroitYmd(); renderCalendar(); },
    'cal-prev': () => shiftCal(-1),
    'cal-next': () => shiftCal(1),
    'cal-view': (el) => { saveCalView(el.dataset.view); renderCalendar(); },
    'cal-new': (el) => {
      const date = el.dataset.date || cal.cursor || detroitYmd();
      openEventEditor(blankEvent({ date }), { isNew: true });
    },
    'cal-slot': (el) => {
      const date = el.dataset.date || cal.cursor;
      const allDay = el.dataset.allday === '1';
      const startHm = el.dataset.time || '09:00';
      const [hh, mm] = startHm.split(':').map(Number);
      const endHm = `${String(hh + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      openEventEditor(blankEvent({ date, allDay, startHm, endHm }), { isNew: true });
    },
    'cal-select-day': (el) => {
      cal.cursor = el.dataset.date || cal.cursor;
      if (cal.view === 'month') renderCalendar();
      else { saveCalView('day'); renderCalendar(); }
    },
    'cal-open': (el) => {
      const ev = allEvents()[el.dataset.id];
      if (!ev) { toast('Event not found'); return; }
      openEventEditor(ev, { isNew: false });
    },
    'cal-save': () => saveEventForm(),
    'cal-save-force': () => {
      if (!eventDraft) return;
      upsertEvent(eventDraft);
      eventDraft = null;
      $('#event-dlg').close();
      toast('Event saved');
      renderCalendar();
    },
    'cal-delete': () => {
      if (!eventDraft?.id) return;
      if (!confirm('Delete this event?')) return;
      deleteEvent(eventDraft.id);
      eventDraft = null;
      $('#event-dlg').close();
      toast('Event deleted');
      renderCalendar();
    },
    'cal-filter-apply': () => {
      cal.filters.type = $('#cal-filter-type')?.value || '';
      cal.filters.status = $('#cal-filter-status')?.value || '';
      cal.filters.crew = $('#cal-filter-crew')?.value || '';
      renderCalendar();
    },
    'cal-filter-reset': () => {
      cal.filters = { type: '', crew: '', status: '' };
      renderCalendar();
    },

    'sched-mode': (el) => {
      saveScheduleMode(el.dataset.mode === 'kanban' ? 'kanban' : 'list');
      renderSchedule();
    },

    'set-status': (el) => {
      const status = el.dataset.status;
      const e = updateStoredEstimate(el.dataset.id, (est) => {
        setEstimateStatus(est, status);
        if (status === 'blocked' && !est.blockReason) est.blockReason = '';
      });
      if (!e) return;
      toast(`${e.number}: ${STATUS_LABEL[status]}`);
      renderSchedule();
    },

    'set-block-reason': (el) => {
      const reason = el.dataset.reason;
      const e = updateStoredEstimate(el.dataset.id, (est) => {
        setEstimateStatus(est, 'blocked', { blockReason: reason });
      });
      if (!e) return;
      renderSchedule();
    },

    'pick-contact': pickContact,
    'pick-previous': () => {
      $('#pick-search').value = '';
      renderPickList();
      $('#pick-dlg').showModal();
    },
    'choose-client': (el) => {
      const c = filteredClients()[num(el.dataset.i)];
      $('#pick-dlg').close();
      if (c) fillClient(c);
    },

    step: (el) => {
      const scope = scopeOf(el);
      const obj = objFor(scope);
      const key = el.dataset.key;
      setPath(obj, key, Math.max(num(el.dataset.min), num(getPath(obj, key)) + num(el.dataset.d)));
      syncKey(scope, key);
      onChange(scope, key);
    },
    'start-in': (el) => {
      current.startDate = addDays(today(), num(el.dataset.d));
      syncKey('est', 'startDate');
      syncEndDate();
      maybeScheduleFromDate(current);
      scheduleSave();
    },

    'add-tree': () => openTree(-1, current.trees[current.trees.length - 1] ? { ...blankTree(), species: '', work: current.trees[current.trees.length - 1].work } : null),
    'edit-tree': (el) => openTree(num(el.dataset.i)),
    'copy-tree': (el) => openTree(-1, current.trees[num(el.dataset.i)]),
    'save-tree': saveTree,
    'delete-tree': () => {
      if (!confirm('Delete this tree?')) return;
      current.trees.splice(editingIndex, 1);
      $('#tree-dlg').close();
      saveNow();
      renderWizard(current.id, 'trees');
    },

    'add-equip': (el) => {
      const desc = el.dataset.desc || '';
      const key = desc.trim().toLowerCase();
      const price = key
        ? (profile.prices[key] ?? EQUIPMENT_DEFAULTS[key] ?? '')
        : '';
      current.equipment.push({ desc, qty: 1, price });
      saveNow();
      renderWizard(current.id, 'equipment');
      const row = $$('.line-card').pop();
      row?.scrollIntoView({ block: 'center' });
      // Jump straight to whatever still needs typing.
      const next = !desc ? '.desc' : price === '' ? '.price-input input' : null;
      if (next) $(next, row)?.focus({ preventScroll: true });
    },
    'del-row': (el) => {
      current[el.dataset.list].splice(num(el.dataset.i), 1);
      saveNow();
      renderWizard(current.id, 'equipment');
    },

    'clear-sig': () => {
      current.clientSig = '';
      current.clientSigDate = '';
      scheduleSave();
      renderWizard(current.id, 'sign');
    },
    'clear-profile-sig': () => {
      profileDraft.signature = '';
      const c = $('#sig-profile');
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
    },

    print: () => {
      saveNow();
      window.print();
    },
    share: async () => {
      try {
        await navigator.share({ title: `Estimate ${current.number}`, text: summaryText(current) });
      } catch { /* cancelled */ }
    },
    sms: () => {
      const sep = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) ? '&' : '?';
      location.href = `sms:${current.client.phone.replace(/[^\d+]/g, '')}${sep}body=${encodeURIComponent(summaryText(current))}`;
    },
    email: () => {
      location.href = `mailto:${encodeURIComponent(current.client.email)}?subject=${encodeURIComponent(`Estimate ${current.number} from ${profile.name}`)}&body=${encodeURIComponent(summaryText(current))}`;
    },
    duplicate: () => {
      saveNow();
      const copy = {
        ...clone(current),
        id: uid(),
        number: 'E-' + profile.nextNumber,
        date: today(),
        status: 'draft',
        blockReason: '',
        clientSig: '', clientSigDate: '',
        startDate: '', endDate: '',
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      delete copy.crew;
      profile.nextNumber = num(profile.nextNumber) + 1;
      saveProfile();
      closeCurrent();
      current = copy;
      saveNow();
      toast(`Copied to ${copy.number}`);
      go(stepHash(copy.id, 'client'));
    },
    'delete-est': () => {
      if (!confirm(`Delete ${current.number}? This can't be undone.`)) return;
      const all = allEstimates();
      delete all[current.id];
      store(KEYS.estimates, all);
      current = null;
      toast('Estimate deleted');
      go('#/');
    },

    'logo-pick': () => $('#logo-file').click(),
    'logo-remove': () => {
      profileDraft.logo = '';
      renderLogoPreview();
    },
    'save-profile': saveProfileForm,
  };

  // ---------- events ----------

  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chips[data-bind] .chip');
    if (chip) {
      const group = chip.closest('.chips');
      const scope = scopeOf(group);
      const obj = objFor(scope);
      const key = group.dataset.bind;
      let v = chip.dataset.v;
      if (group.hasAttribute('data-num')) v = num(v);
      if (group.hasAttribute('data-multi')) {
        const arr = [...(getPath(obj, key) || [])];
        const at = arr.indexOf(v);
        if (at >= 0) arr.splice(at, 1);
        else arr.push(v);
        setPath(obj, key, arr);
      } else {
        const cur = getPath(obj, key);
        const off = String(cur) === String(v) && !group.hasAttribute('data-required');
        setPath(obj, key, off ? '' : v);
      }
      syncKey(scope, key);
      onChange(scope, key);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && !act.disabled && actions[act.dataset.act]) actions[act.dataset.act](act, e);
  });

  document.addEventListener('input', (e) => {
    const dateEl = e.target.closest('input[data-act="sched-date"]');
    if (dateEl) {
      const startDate = dateEl.value;
      const est = updateStoredEstimate(dateEl.dataset.id, (job) => {
        job.startDate = startDate;
        if (startDate) {
          job.endDate = addDays(startDate, Math.max(0, Math.ceil(num(job.days) || 1) - 1));
          if (['approved', 'draft', 'scheduled'].includes(normalizeStatus(job))) {
            job.status = 'scheduled';
          }
        }
      });
      if (est) {
        toast(startDate ? `${est.number} scheduled` : 'Date cleared');
        renderSchedule();
      }
      return;
    }
    const el = e.target.closest('[data-bind]');
    if (!el || el.classList.contains('chips')) return;
    const scope = scopeOf(el);
    const obj = objFor(scope);
    if (!obj) return;
    if (el.getAttribute('aria-invalid') === 'true') {
      el.removeAttribute('aria-invalid');
      el.classList.remove('is-invalid');
      const err = el.parentElement?.querySelector(`[data-error-for="${el.dataset.bind}"]`);
      if (err) { err.textContent = ''; err.hidden = true; }
    }
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') v = el.value === '' ? '' : num(el.value);
    setPath(obj, el.dataset.bind, v);
    syncKey(scope, el.dataset.bind, el);
    onChange(scope, el.dataset.bind);
  });

  // Close a sheet by tapping the dark backdrop.
  for (const dlg of $$('dialog')) {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  $('#restore-dlg')?.addEventListener('close', () => { pendingRestore = null; });
  $('#pick-search').addEventListener('input', renderPickList);

  $('#vcf-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const c = parseVCard(await file.text());
    if (c.name || c.phone) fillClient(c);
    else toast('No contact found in that file');
  });

  $('#import-file').addEventListener('change', (e) => {
    $('#menu-dlg').close();
    if (e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = '';
  });

  $('#logo-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !profileDraft) return;
    // Downscale so the logo fits comfortably in phone storage.
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 500 / img.width, 250 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      profileDraft.logo = c.toDataURL('image/png');
      URL.revokeObjectURL(img.src);
      renderLogoPreview();
    };
    img.src = URL.createObjectURL(file);
  });

  // Whatever triggers printing, print the current estimate as a clean document.
  window.addEventListener('beforeprint', () => {
    $('#print-doc').innerHTML = current ? renderDoc(current) : '';
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  // Phone ↔ tablet swaps the step list; re-route so Back/Next and the pills stay in sync.
  let layoutTablet = isTablet();
  const onLayoutMode = () => {
    const now = isTablet();
    if (now === layoutTablet && document.body.classList.contains('is-tablet') === now) return;
    layoutTablet = now;
    document.body.classList.toggle('is-tablet', now);
    if (/^#\/e\//.test(location.hash)) route();
  };
  if (tabletMq.addEventListener) tabletMq.addEventListener('change', onLayoutMode);
  else tabletMq.addListener(onLayoutMode);
  window.addEventListener('resize', onLayoutMode);
  window.addEventListener('orientationchange', onLayoutMode);

  // Installable app + offline support (needs HTTPS, so not when opened as a local file).
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline mode unavailable', err));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
  });

  // ---------- boot ----------

  if (BRAND.appName) document.title = BRAND.appName;
  if (BRAND.colors?.background) $('meta[name=theme-color]').content = BRAND.colors.background;
  else if (BRAND.colors?.primary) $('meta[name=theme-color]').content = BRAND.colors.primary;
  route();
})();
