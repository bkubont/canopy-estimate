(() => {
  'use strict';

  // ---------- pick lists ----------

  // Each service has its own quick-pick work details.
  const SERVICES = {
    'Tree removal': ['Remove to ground level', 'Section down with ropes', 'Crane-assisted removal', 'Bucket truck removal', 'Fell in open area', 'Leave 10–15 ft wildlife snag'],
    'Crown reduction': ['Reduce crown 10–15%', 'Reduce crown 15–25%', 'Reduce away from house', 'Reduce over roof', 'Reduce from power lines', 'Reduce end weight on heavy limbs'],
    'Crown thinning': ['Thin crown 10–15%', 'Thin crown 15–25%', 'Remove crossing / rubbing limbs', 'Remove water sprouts', 'Improve light & airflow'],
    'Crown raising': ['Raise to 8 ft over lawn', 'Raise to 10 ft over sidewalk', 'Raise to 14 ft over driveway / street', 'Clear sight lines', 'Clear house / roof by 6 ft'],
    'Deadwood removal': ['Remove deadwood 1"+', 'Remove deadwood 2"+', 'Remove broken / hanging limbs', 'Remove storm-damaged limbs'],
    'Clearance pruning': ['Clear roof by 6 ft', 'Clear from house siding', 'Clear service drop to house', 'Clear fence line', 'Clear driveway / street'],
    'Structural pruning': ['Establish central leader', 'Subordinate competing stems', 'Remove included-bark unions', 'Young tree training prune'],
    'Cabling & bracing': ['Install dynamic cable system', 'Install static cable', 'Install through-bolt brace', 'Inspect existing cables'],
    'Stump grinding': ['Grind 6–8" below grade', 'Grind 10–12" below grade', 'Grind surface roots', 'Backfill with grindings', 'Haul grindings, backfill with topsoil', 'Seed and straw'],
    'Storm / emergency': ['Remove tree from structure', 'Remove fallen tree', 'Remove hanging limbs', 'After-hours response', 'Tarp roof damage'],
    'Hedge / shrub trimming': ['Shape and shear', 'Reduce height', 'Reduce width', 'Remove shrubs to ground'],
    'Plant health care': ['Deep root fertilization', 'Insect treatment', 'Disease treatment', 'EAB trunk injection', 'Dormant oil spray'],
    'Tree planting': ['Supply and plant', 'Plant customer-supplied tree', 'Stake and mulch', 'Install watering bag'],
    'Land / lot clearing': ['Clear brush and small trees', 'Forestry mulching', 'Clear fence line', 'Remove invasive species'],
    'Tree risk assessment': ['Visual assessment', 'Written report', 'Resistograph testing'],
    'Other': [],
  };

  const SPECIES_COMMON = ['Oak', 'Maple', 'Pine', 'Ash', 'Elm', 'Spruce', 'Cedar', 'Cottonwood', 'Poplar', 'Birch', 'Walnut', 'Locust', 'Willow', 'Hackberry', 'Pear', 'Unknown'];
  const SPECIES_ALL = [
    'Red maple', 'Silver maple', 'Sugar maple', 'Norway maple', 'Boxelder', 'Red oak', 'White oak', 'Pin oak', 'Bur oak',
    'Live oak', 'White pine', 'Scots pine', 'Austrian pine', 'Ponderosa pine', 'Blue spruce', 'Norway spruce', 'Eastern red cedar',
    'Arborvitae', 'Douglas fir', 'Hemlock', 'American elm', 'Siberian elm', 'Green ash', 'White ash', 'Honey locust', 'Black locust',
    'Tulip poplar', 'Aspen', 'River birch', 'Paper birch', 'Black walnut', 'Hickory', 'Pecan', 'Sycamore', 'Sweetgum', 'Linden',
    'Bradford pear', 'Crabapple', 'Cherry', 'Mulberry', 'Catalpa', 'Russian olive', 'Magnolia', 'Dogwood', 'Redbud',
  ];
  const LOCATIONS = ['Front yard', 'Back yard', 'Side yard', 'Near house', 'Over roof', 'Driveway', 'Fence line', 'Street / ROW', 'Tree line'];
  const DBH = ['< 6"', '6–12"', '12–18"', '18–24"', '24–30"', '30–36"', '36"+'];
  const HEIGHTS = ['< 20 ft', '20–40 ft', '40–60 ft', '60–80 ft', '80 ft+'];

  const CONDITIONS = ['Overhead power lines', 'Near house / structure', 'Over roof', 'Over fence', 'Crane required', 'Bucket truck access',
    'Climb only (no truck access)', 'Steep slope', 'Wet / soft ground', 'Permit required', 'Call 811 before grinding', 'HOA approval needed'];
  const ACCESS = ['Gate access', 'Gate code needed', 'Narrow gate (under 36")', 'Dogs on property', 'Back yard only', 'Must cross lawn',
    'Septic / leach field', 'Irrigation system', 'Park on street', 'Customer must be home'];

  const WOOD = ['Haul away all wood', 'Leave wood in rounds', 'Cut to firewood length & stack', 'Leave logs full length'];
  const BRUSH = ['Chip and haul away', 'Leave chips on site', 'Leave chips in a pile'];
  const STUMPS = ['Cut flush to ground', 'Grind stumps', 'Leave stump (customer request)', 'Stumps not included'];
  const EXTRAS = ['Rake & blow work area', 'Ground protection mats', 'Clean gutters of debris', 'Customer to move vehicles'];

  const NOTE_CHIPS = ['Tree shows signs of decay', 'Dead / dying – removal recommended', 'Leaning toward structure', 'Storm damage present',
    'Emerald ash borer signs', 'Recommend follow-up inspection in 1 year', 'Work scheduled 2–3 weeks after acceptance', 'Price includes all cleanup'];

  const DISCOUNTS = [[0, 'None'], [5, '5%'], [10, '10%'], [15, '15%']];
  const DEPOSITS = [[0, 'None'], [25, '25%'], [50, '50%']];
  const VALID_DAYS = [[15, '15 days'], [30, '30 days'], [60, '60 days'], [90, '90 days']];

  const DEFAULT_TERMS =
    'Pricing valid for the period shown above. A deposit may be required to schedule work. ' +
    'Customer is responsible for identifying property lines and any underground irrigation, ' +
    'invisible fences or private utilities. We are not responsible for damage to lawns from ' +
    'equipment travel beyond reasonable care. Fully insured; certificate available on request. ' +
    'Balance due upon completion.';

  const STEPS = [
    { id: 'customer', label: 'Customer', render: stepCustomer },
    { id: 'site', label: 'Site', render: stepSite },
    { id: 'work', label: 'Work', render: stepWork },
    { id: 'cleanup', label: 'Cleanup', render: stepCleanup },
    { id: 'price', label: 'Price', render: stepPrice },
    { id: 'notes', label: 'Notes', render: stepNotes },
    { id: 'sign', label: 'Sign', render: stepSign },
    { id: 'review', label: 'Send', render: stepReview },
  ];

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

  const KEYS = { profile: 'ats.profile', estimates: 'ats.estimates' };

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

  const DEFAULT_PROFILE = {
    name: '', owner: '', isa: '', phone: '', email: '', website: '', address: '', license: '',
    taxRate: 0, depositPct: 0, validDays: 30, nextNumber: 1001, terms: '', logo: '',
    ...BRAND.company,
    complete: false,
  };
  if (!DEFAULT_PROFILE.terms) DEFAULT_PROFILE.terms = DEFAULT_TERMS;

  let profile = { ...DEFAULT_PROFILE, ...load(KEYS.profile, {}) };
  const saveProfile = () => store(KEYS.profile, profile);

  const allEstimates = () => load(KEYS.estimates, {});

  // ---------- state ----------

  let current = null;      // estimate open in the wizard
  let editingItem = null;  // item open in the item sheet
  let editingIndex = -1;
  let profileDraft = null; // profile being edited
  let installPrompt = null;

  const scopeOf = (el) => el.closest('[data-scope]')?.dataset.scope || 'est';
  const objFor = (scope) => ({ est: current, item: editingItem, profile: profileDraft })[scope];

  function blankEstimate() {
    const date = today();
    return {
      id: uid(),
      number: 'E-' + profile.nextNumber,
      date,
      validUntil: addDays(date, num(profile.validDays) || 30),
      customer: { name: '', phone: '', email: '', address: '' },
      siteSame: true,
      siteAddress: '',
      conditions: [],
      access: [],
      accessNotes: '',
      items: [],
      wood: WOOD[0],
      brush: BRUSH[0],
      stumps: STUMPS[0],
      extras: [EXTRAS[0]],
      discountPct: 0,
      taxRate: num(profile.taxRate),
      depositPct: num(profile.depositPct),
      noteChips: [],
      notes: '',
      terms: profile.terms || DEFAULT_TERMS,
      signature: '',
      sigName: '',
      sigDate: '',
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }

  function blankItem() {
    return { service: '', details: [], species: '', location: '', dbh: '', height: '', description: '', qty: 1, price: '' };
  }

  const isEmpty = (e) => !e.customer.name.trim() && !e.customer.phone.trim() && !e.items.length;

  function totals(e) {
    const subtotal = e.items.reduce((s, i) => s + (num(i.qty) || 1) * num(i.price), 0);
    const discount = (subtotal * Math.min(100, num(e.discountPct))) / 100;
    const taxable = subtotal - discount;
    const tax = (taxable * num(e.taxRate)) / 100;
    const total = taxable + tax;
    const deposit = (total * Math.min(100, num(e.depositPct))) / 100;
    return { subtotal, discount, tax, total, deposit, balance: total - deposit };
  }

  let saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    if (!current || isEmpty(current)) return;
    current.updatedAt = new Date().toISOString();
    current.total = totals(current).total;
    const all = allEstimates();
    all[current.id] = current;
    store(KEYS.estimates, all);
  }

  // Close the open estimate: save it, or throw it away if nothing was entered.
  function closeCurrent() {
    if (!current) return;
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

  function field(label, key, attrs = '', textarea = false) {
    const control = textarea
      ? `<textarea data-bind="${key}" ${attrs}></textarea>`
      : `<input data-bind="${key}" ${attrs}>`;
    return `<label class="field"><span>${label}</span>${control}</label>`;
  }

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
        const on = multi ? (val || []).includes(b.dataset.v) : String(val ?? '') === b.dataset.v;
        b.setAttribute('aria-pressed', on);
      }
    } else if (el.type === 'checkbox') {
      el.checked = !!val;
    } else if (el !== document.activeElement) {
      el.value = val ?? '';
    }
  }

  function onChange(scope, key) {
    if (scope === 'est') {
      if (key === 'siteSame') $('#site-wrap')?.toggleAttribute('hidden', current.siteSame);
      if (key === 'customer.name' && current.signature === '') current.sigName = current.customer.name;
      updateTotals();
      scheduleSave();
    } else if (scope === 'item') {
      if (key === 'service') {
        editingItem.details = [];
        renderDetails();
      }
      updateItemTotal();
    } else if (scope === 'profile' && key === 'logo') {
      renderLogoPreview();
    }
  }

  // ---------- routing ----------

  const go = (hash) => { location.hash = hash; };
  const stepHash = (id, step) => `#/e/${id}/${step}`;

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (current && (parts[0] !== 'e' || parts[1] !== current.id)) closeCurrent();
    for (const d of $$('dialog[open]')) d.close();

    if (!profile.complete && parts[0] !== 'profile') return location.replace('#/profile');

    if (parts[0] === 'profile') renderProfile();
    else if (parts[0] === 'e') renderWizard(parts[1], parts[2]);
    else renderHome();
    window.scrollTo(0, 0);
  }

  function setChrome({ title, back, bottombar }) {
    $('#appbar-title').textContent = title;
    $('#appbar-back').hidden = !back;
    $('#appbar-logo').hidden = !!back;
    $('#bottombar').hidden = !bottombar;
    document.body.classList.toggle('has-bottombar', !!bottombar);
  }

  // ---------- home ----------

  function renderHome() {
    setChrome({ title: BRAND.appName || profile.name, back: false, bottombar: false });
    $('#view').innerHTML = `
      <button type="button" class="btn primary big" data-act="new">＋ New estimate</button>
      <input type="search" id="home-search" class="search" placeholder="Search estimates">
      <div id="est-list" class="est-list"></div>`;
    renderEstimateList();
    $('#home-search').addEventListener('input', renderEstimateList);
  }

  function renderEstimateList() {
    const q = ($('#home-search')?.value || '').trim().toLowerCase();
    const list = Object.values(allEstimates())
      .filter((e) => !q || [e.number, e.customer?.name, e.customer?.phone, e.customer?.address, e.siteAddress].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    $('#est-list').innerHTML = list.length
      ? list.map((e) => `
        <button type="button" class="est-card" data-act="open" data-id="${esc(e.id)}">
          <div class="row"><b>${esc(e.customer?.name || 'No name')}</b><b>${money(e.total)}</b></div>
          <div class="row muted"><span>${esc(e.number)} · ${niceDate(e.date)}</span>
            <span class="badge ${e.signature ? 'ok' : ''}">${e.signature ? 'Signed' : 'Draft'}</span></div>
          <div class="muted one-line">${esc((e.siteSame ? e.customer?.address : e.siteAddress) || '')}</div>
        </button>`).join('')
      : `<p class="empty">${q ? 'No matches.' : 'No estimates yet. Tap “New estimate” to start.'}</p>`;
  }

  // ---------- wizard ----------

  function renderWizard(id, stepId) {
    if (!current || current.id !== id) {
      const saved = allEstimates()[id];
      if (!saved) return location.replace('#/');
      current = { ...blankEstimate(), ...saved };
    }
    let i = STEPS.findIndex((s) => s.id === stepId);
    if (i < 0) i = 0;
    const step = STEPS[i];

    setChrome({ title: `${current.number}${current.customer.name ? ' · ' + current.customer.name : ''}`, back: true, bottombar: true });

    $('#view').innerHTML = `
      <nav class="steps">${STEPS.map((s, n) => `
        <a href="${stepHash(current.id, s.id)}" class="step ${n === i ? 'on' : ''} ${n < i ? 'done' : ''}">
          <span class="dot">${n + 1}</span>${s.label}</a>`).join('')}</nav>
      <div class="step-body" data-step="${step.id}">${step.render()}</div>`;

    syncAll($('#view'), 'est');
    $('.step.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (step.id === 'site') $('#site-wrap')?.toggleAttribute('hidden', current.siteSame);
    if (step.id === 'sign') initSignature($('#sig'));
    updateTotals();

    $('#btn-prev').textContent = i === 0 ? '‹ Estimates' : '‹ Back';
    $('#btn-next').textContent = i === STEPS.length - 1 ? 'Done ✓' : `Next: ${STEPS[i + 1].label} ›`;
    $('#btn-prev').dataset.to = i === 0 ? '#/' : stepHash(current.id, STEPS[i - 1].id);
    $('#btn-next').dataset.to = i === STEPS.length - 1 ? '#/' : stepHash(current.id, STEPS[i + 1].id);
  }

  function stepCustomer() {
    const canPick = 'contacts' in navigator && 'select' in navigator.contacts;
    return `
      <h2 class="step-title">Customer</h2>
      <div class="btn-pair">
        <button type="button" class="btn big-ish" data-act="pick-contact">📇 From contacts</button>
        <button type="button" class="btn big-ish" data-act="pick-previous">↺ Past customer</button>
      </div>
      ${canPick ? '' : '<p class="hint">On iPhone: in Contacts, open the person → Share Contact → Save to Files, then tap “From contacts” and pick the file.</p>'}
      <section class="card">
        ${field('Name', 'customer.name', 'autocomplete="name" autocapitalize="words"')}
        ${field('Phone', 'customer.phone', 'type="tel" autocomplete="tel" inputmode="tel"')}
        ${field('Email', 'customer.email', 'type="email" autocomplete="email" inputmode="email"')}
        ${field('Address', 'customer.address', 'rows="2" autocomplete="street-address"', true)}
      </section>`;
  }

  function stepSite() {
    return `
      <h2 class="step-title">Job site</h2>
      <section class="card">
        <label class="switch"><input type="checkbox" data-bind="siteSame"><span>Job site is the customer’s address</span></label>
        <div id="site-wrap">${field('Job site address', 'siteAddress', 'rows="2"', true)}</div>
      </section>
      <section class="card">
        <h3>Site conditions <small>tap all that apply</small></h3>
        ${chips('conditions', CONDITIONS, { multi: true })}
      </section>
      <section class="card">
        <h3>Access</h3>
        ${chips('access', ACCESS, { multi: true })}
        ${field('Access notes', 'accessNotes', 'rows="2" placeholder="Gate code, where to park…"', true)}
      </section>`;
  }

  function stepWork() {
    const items = current.items.map((it, i) => `
      <button type="button" class="item-card" data-act="edit-item" data-i="${i}">
        <div class="row"><b>${i + 1}. ${esc(it.service)}${num(it.qty) > 1 ? ` × ${num(it.qty)}` : ''}</b><b>${money((num(it.qty) || 1) * num(it.price))}</b></div>
        <div class="muted">${esc(itemSubline(it))}</div>
        ${it.details.length || it.description ? `<div class="muted small">${esc([...it.details, it.description].filter(Boolean).join('; '))}</div>` : ''}
      </button>`).join('');
    return `
      <h2 class="step-title">Work to be performed</h2>
      <div class="item-list">${items || '<p class="empty">No trees or work added yet.</p>'}</div>
      <button type="button" class="btn primary big" data-act="add-item">＋ Add tree / work</button>
      <div class="sum-line">Subtotal <b data-total="subtotal"></b></div>`;
  }

  const itemSubline = (it) => [it.species, it.location, it.dbh && it.dbh + ' DBH', it.height].filter(Boolean).join(' · ');

  function stepCleanup() {
    return `
      <h2 class="step-title">Cleanup</h2>
      <section class="card"><h3>Wood</h3>${chips('wood', WOOD)}</section>
      <section class="card"><h3>Brush &amp; chips</h3>${chips('brush', BRUSH)}</section>
      <section class="card"><h3>Stumps</h3>${chips('stumps', STUMPS)}</section>
      <section class="card"><h3>Also included</h3>${chips('extras', EXTRAS, { multi: true })}</section>`;
  }

  function stepPrice() {
    return `
      <h2 class="step-title">Price</h2>
      <section class="card">
        <div class="sum-line">Subtotal (${current.items.length} item${current.items.length === 1 ? '' : 's'}) <b data-total="subtotal"></b></div>
      </section>
      <section class="card">
        <h3>Discount</h3>
        <div class="chips-plus">${chips('discountPct', DISCOUNTS, { isNum: true, required: true })}
          <label class="mini"><input data-bind="discountPct" type="number" inputmode="decimal" min="0" max="100"> %</label></div>
      </section>
      <section class="card">
        <h3>Deposit to schedule</h3>
        <div class="chips-plus">${chips('depositPct', DEPOSITS, { isNum: true, required: true })}
          <label class="mini"><input data-bind="depositPct" type="number" inputmode="decimal" min="0" max="100"> %</label></div>
      </section>
      <section class="card">
        <h3>Sales tax</h3>
        <label class="mini"><input data-bind="taxRate" type="number" inputmode="decimal" min="0" step="0.001"> %</label>
      </section>
      ${totalsCard()}`;
  }

  function totalsCard() {
    return `
      <section class="card totals">
        <div class="sum-line">Subtotal <span data-total="subtotal"></span></div>
        <div class="sum-line">Discount <span data-total="discount"></span></div>
        <div class="sum-line">Tax <span data-total="tax"></span></div>
        <div class="sum-line grand">Total <b data-total="total"></b></div>
        <div class="sum-line">Deposit <span data-total="deposit"></span></div>
        <div class="sum-line">Balance on completion <span data-total="balance"></span></div>
      </section>`;
  }

  function updateTotals() {
    if (!current) return;
    const t = totals(current);
    for (const el of $$('[data-total]')) {
      const k = el.dataset.total;
      el.textContent = (k === 'discount' && t[k] ? '−' : '') + money(t[k]);
    }
  }

  function stepNotes() {
    return `
      <h2 class="step-title">Notes</h2>
      <section class="card">
        <h3>Quick notes <small>tap all that apply</small></h3>
        ${chips('noteChips', NOTE_CHIPS, { multi: true })}
        ${field('Other notes for the customer', 'notes', 'rows="3"', true)}
      </section>
      <details class="card">
        <summary>Terms &amp; conditions</summary>
        <textarea data-bind="terms" rows="6"></textarea>
      </details>`;
  }

  function stepSign() {
    return `
      <h2 class="step-title">Customer signature</h2>
      <section class="card">
        <div class="sum-line grand">Total <b data-total="total"></b></div>
        ${num(current.depositPct) ? '<div class="sum-line">Deposit to schedule <span data-total="deposit"></span></div>' : ''}
      </section>
      <section class="card">
        <p class="muted">By signing, I authorize the work described at the prices and terms stated.</p>
        <canvas id="sig" class="sig" aria-label="Sign here"></canvas>
        <div class="sig-foot"><span>Sign above</span><button type="button" class="link" data-act="clear-sig">Clear</button></div>
        ${field('Printed name', 'sigName', 'autocapitalize="words"')}
        ${field('Date', 'sigDate', 'type="date"')}
      </section>`;
  }

  function stepReview() {
    const share = 'share' in navigator ? '<button type="button" class="btn" data-act="share">📤 Share</button>' : '';
    return `
      <h2 class="step-title">Send to customer</h2>
      <div class="btn-grid">
        <button type="button" class="btn primary" data-act="print">🖨️ Print / PDF</button>
        ${share}
        <button type="button" class="btn" data-act="sms" ${current.customer.phone ? '' : 'disabled'}>💬 Text</button>
        <button type="button" class="btn" data-act="email" ${current.customer.email ? '' : 'disabled'}>✉️ Email</button>
      </div>
      <p class="hint">For a PDF: tap Print / PDF, then choose “Save as PDF” (Android) or use the Share button in the print screen (iPhone).</p>
      <div class="doc-preview">${renderDoc(current)}</div>
      <div class="btn-pair">
        <button type="button" class="btn" data-act="duplicate">⧉ Duplicate</button>
        <button type="button" class="btn danger" data-act="delete-est">🗑 Delete</button>
      </div>`;
  }

  // ---------- item sheet ----------

  function openItem(i) {
    editingIndex = i;
    editingItem = i >= 0 ? clone(current.items[i]) : blankItem();
    const dlg = $('#item-dlg');
    dlg.innerHTML = `
      <div class="sheet-head">
        <button type="button" class="icon-btn" data-act="close-dlg" aria-label="Cancel">✕</button>
        <h3>${i >= 0 ? 'Edit item ' + (i + 1) : 'Add tree / work'}</h3>
        <button type="button" class="btn primary sm" data-act="save-item">Save</button>
      </div>
      <div class="sheet-body">
        <h4>Service</h4>
        ${chips('service', Object.keys(SERVICES), { required: true })}
        <div id="details-wrap"></div>
        <h4>Tree species</h4>
        ${chips('species', SPECIES_COMMON)}
        <input data-bind="species" list="species-list" placeholder="Other species…" class="mt">
        <h4>Location on property</h4>
        ${chips('location', LOCATIONS)}
        <h4>Trunk diameter (DBH)</h4>
        ${chips('dbh', DBH)}
        <h4>Height</h4>
        ${chips('height', HEIGHTS)}
        <h4>Extra notes</h4>
        <textarea data-bind="description" rows="2" placeholder="Anything else about this tree…"></textarea>
        <div class="qty-price">
          <div>
            <h4>Quantity</h4>
            <div class="stepper">
              <button type="button" data-act="qty" data-d="-1" aria-label="Less">−</button>
              <input data-bind="qty" type="number" inputmode="numeric" min="1">
              <button type="button" data-act="qty" data-d="1" aria-label="More">＋</button>
            </div>
          </div>
          <div>
            <h4>Price each</h4>
            <div class="price-input"><span>$</span><input data-bind="price" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"></div>
          </div>
        </div>
        <div class="sum-line grand">Line total <b id="item-total"></b></div>
        ${i >= 0 ? '<button type="button" class="btn danger big" data-act="delete-item">Delete this item</button>' : ''}
        <button type="button" class="btn primary big" data-act="save-item">Save item</button>
      </div>`;
    renderDetails();
    syncAll(dlg, 'item');
    updateItemTotal();
    dlg.showModal();
    $('.sheet-body', dlg).scrollTop = 0;
  }

  function renderDetails() {
    const wrap = $('#details-wrap');
    const opts = SERVICES[editingItem.service] || [];
    wrap.innerHTML = opts.length ? `<h4>Work details <small>tap all that apply</small></h4>${chips('details', opts, { multi: true })}` : '';
    syncAll(wrap, 'item');
  }

  function updateItemTotal() {
    const el = $('#item-total');
    if (el && editingItem) el.textContent = money((num(editingItem.qty) || 1) * num(editingItem.price));
  }

  function saveItem() {
    if (!editingItem.service) {
      toast('Pick a service first');
      return;
    }
    editingItem.qty = Math.max(1, num(editingItem.qty) || 1);
    if (editingIndex >= 0) current.items[editingIndex] = editingItem;
    else current.items.push(editingItem);
    $('#item-dlg').close();
    saveNow();
    renderWizard(current.id, 'work');
  }

  // ---------- signature ----------

  function initSignature(canvas) {
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let last = null;
    let dirty = false;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Object.assign(ctx, { lineWidth: 2.4, lineCap: 'round', lineJoin: 'round', strokeStyle: '#1f2421' });
      if (current.signature) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
        img.src = current.signature;
      }
    };
    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      last = pt(e);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pt(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      dirty = true;
    });
    const end = () => {
      if (!drawing) return;
      drawing = false;
      if (!dirty) return;
      current.signature = canvas.toDataURL('image/png');
      if (!current.sigDate) current.sigDate = today();
      if (!current.sigName) current.sigName = current.customer.name;
      syncKey('est', 'sigDate');
      syncKey('est', 'sigName');
      scheduleSave();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    size();
  }

  // ---------- printable estimate ----------

  function renderDoc(e) {
    const t = totals(e);
    const p = profile;
    const site = e.siteSame ? e.customer.address : e.siteAddress;
    const lines = (arr) => arr.filter(Boolean).map((t) => esc(t).replace(/\n/g, '<br>')).join('<br>');
    const preparer = [p.owner, p.isa && `ISA Certified Arborist #${p.isa}`].filter(Boolean).join(', ');
    const cleanup = [e.wood, e.brush, e.stumps, ...(e.extras || [])].filter(Boolean);
    const notes = [...(e.noteChips || []), e.notes].filter(Boolean);
    const access = [...(e.access || []), e.accessNotes].filter(Boolean);

    return `
      <article class="doc">
        <header class="doc-head">
          ${p.logo ? `<img src="${esc(p.logo)}" alt="" class="doc-logo">` : ''}
          <div class="doc-co">
            <h1>${esc(p.name)}</h1>
            <div>${lines([p.address, [p.phone, p.email].filter(Boolean).join(' · '), p.website, p.license])}</div>
          </div>
          <div class="doc-title">
            <h2>ESTIMATE</h2>
            <table>
              <tr><th>Estimate #</th><td>${esc(e.number)}</td></tr>
              <tr><th>Date</th><td>${niceDate(e.date)}</td></tr>
              <tr><th>Valid until</th><td>${niceDate(e.validUntil)}</td></tr>
              ${preparer ? `<tr><th>Prepared by</th><td>${esc(preparer)}</td></tr>` : ''}
            </table>
          </div>
        </header>

        <section class="doc-parties">
          <div><h4>Customer</h4>${lines([e.customer.name, e.customer.address, e.customer.phone, e.customer.email]) || '—'}</div>
          <div><h4>Job site</h4>${lines([site]) || '—'}
            ${access.length ? `<div class="doc-small">Access: ${esc(access.join('; '))}</div>` : ''}</div>
        </section>
        ${e.conditions?.length ? `<p class="doc-small"><b>Site conditions:</b> ${esc(e.conditions.join(' · '))}</p>` : ''}

        <table class="doc-items">
          <thead><tr><th>#</th><th>Work to be performed</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
          <tbody>
            ${e.items.map((it, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><b>${esc(it.service)}</b>${itemSubline(it) ? ` — ${esc(itemSubline(it))}` : ''}
                  ${it.details?.length || it.description ? `<div class="doc-small">${esc([...(it.details || []), it.description].filter(Boolean).join('; '))}</div>` : ''}</td>
                <td class="r">${num(it.qty) || 1}</td>
                <td class="r">${money(num(it.price))}</td>
                <td class="r">${money((num(it.qty) || 1) * num(it.price))}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="doc-small">No items yet</td></tr>'}
          </tbody>
        </table>

        <section class="doc-bottom">
          <div>
            <h4>Cleanup</h4>
            <ul>${cleanup.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
            ${notes.length ? `<h4>Notes</h4><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
          </div>
          <table class="doc-totals">
            <tr><th>Subtotal</th><td>${money(t.subtotal)}</td></tr>
            ${t.discount ? `<tr><th>Discount (${num(e.discountPct)}%)</th><td>−${money(t.discount)}</td></tr>` : ''}
            ${t.tax ? `<tr><th>Tax (${num(e.taxRate)}%)</th><td>${money(t.tax)}</td></tr>` : ''}
            <tr class="grand"><th>Total</th><td>${money(t.total)}</td></tr>
            ${t.deposit ? `<tr><th>Deposit (${num(e.depositPct)}%)</th><td>${money(t.deposit)}</td></tr>
              <tr><th>Balance on completion</th><td>${money(t.balance)}</td></tr>` : ''}
          </table>
        </section>

        ${e.terms ? `<section class="doc-terms"><h4>Terms &amp; conditions</h4><p>${esc(e.terms)}</p></section>` : ''}

        <section class="doc-sign">
          <h4>Acceptance</h4>
          <p class="doc-small">By signing below, I authorize the work described above at the prices and terms stated.</p>
          <div class="doc-sign-row">
            <div class="doc-sig">${e.signature ? `<img src="${e.signature}" alt="Customer signature">` : ''}<div>Customer signature</div></div>
            <div class="doc-sig"><span>${esc(e.sigName)}</span><div>Printed name</div></div>
            <div class="doc-sig"><span>${niceDate(e.sigDate)}</span><div>Date</div></div>
          </div>
        </section>
      </article>`;
  }

  function summaryText(e) {
    const t = totals(e);
    const first = e.customer.name.split(' ')[0];
    return [
      `Hi${first ? ' ' + first : ''}, here is your estimate ${e.number} from ${profile.name}:`,
      '',
      ...e.items.map((it, i) => `${i + 1}. ${it.service}${it.species ? ' – ' + it.species : ''}: ${money((num(it.qty) || 1) * num(it.price))}`),
      '',
      `Total: ${money(t.total)}${t.deposit ? ` (deposit ${money(t.deposit)})` : ''}`,
      `Valid until ${niceDate(e.validUntil)}.`,
      '',
      `Questions? ${[profile.phone, profile.email].filter(Boolean).join(' · ')}`,
    ].join('\n');
  }

  // ---------- company profile ----------

  function renderProfile() {
    const first = !profile.complete;
    profileDraft = clone(profile);
    setChrome({ title: 'Company profile', back: !first, bottombar: false });
    $('#view').innerHTML = `
      <div data-scope="profile">
        ${first
          ? '<div class="welcome"><h2>Welcome! 👋</h2><p>Set up your company profile once. It goes on every estimate automatically.</p></div>'
          : '<h2 class="step-title">Company profile</h2>'}
        <section class="card">
          <div class="logo-row">
            <img id="logo-preview" alt="">
            <div class="btn-pair">
              <button type="button" class="btn" data-act="logo-pick">Change logo</button>
              <button type="button" class="btn" data-act="logo-remove">Remove</button>
            </div>
          </div>
          ${field('Company name *', 'name', 'autocapitalize="words"')}
          ${field('Your name (estimator)', 'owner', 'autocapitalize="words"')}
          ${field('ISA certification #', 'isa')}
          ${field('Phone *', 'phone', 'type="tel" inputmode="tel"')}
          ${field('Email', 'email', 'type="email" inputmode="email"')}
          ${field('Website', 'website', 'inputmode="url"')}
          ${field('Business address', 'address', 'rows="2"', true)}
          ${field('License / insurance', 'license', 'placeholder="e.g. Licensed & insured · Lic #12345"')}
        </section>
        <section class="card">
          <h3>Estimate defaults</h3>
          <h4>Estimates are valid for</h4>
          ${chips('validDays', VALID_DAYS, { isNum: true, required: true })}
          <h4>Default deposit</h4>
          ${chips('depositPct', DEPOSITS, { isNum: true, required: true })}
          <div class="two">
            ${field('Sales tax %', 'taxRate', 'type="number" inputmode="decimal" min="0" step="0.001"')}
            ${field('Next estimate #', 'nextNumber', 'type="number" inputmode="numeric" min="1"')}
          </div>
        </section>
        <details class="card">
          <summary>Terms &amp; conditions</summary>
          <textarea data-bind="terms" rows="7"></textarea>
        </details>
        <button type="button" class="btn primary big" data-act="save-profile">Save profile</button>
      </div>`;
    syncAll($('#view'), 'profile');
    renderLogoPreview();
  }

  function renderLogoPreview() {
    const img = $('#logo-preview');
    if (!img) return;
    img.hidden = !profileDraft.logo;
    img.src = profileDraft.logo || '';
  }

  function saveProfileForm() {
    if (!String(profileDraft.name).trim() || !String(profileDraft.phone).trim()) {
      toast('Company name and phone are required');
      return;
    }
    const wasFirst = !profile.complete;
    profile = { ...profileDraft, nextNumber: Math.max(1, Math.floor(num(profileDraft.nextNumber)) || 1), complete: true };
    saveProfile();
    toast(wasFirst ? 'All set! Start your first estimate.' : 'Company profile saved');
    go('#/');
  }

  // ---------- contacts ----------

  async function pickContact() {
    if ('contacts' in navigator && 'select' in navigator.contacts) {
      try {
        const props = await navigator.contacts.getProperties();
        const [c] = await navigator.contacts.select(props.filter((p) => ['name', 'tel', 'email', 'address'].includes(p)), { multiple: false });
        if (!c) return;
        const a = c.address?.[0];
        fillCustomer({
          name: c.name?.[0] || '',
          phone: c.tel?.[0] || '',
          email: c.email?.[0] || '',
          address: a ? [a.addressLine?.join(' '), [a.city, a.region].filter(Boolean).join(', ') + (a.postalCode ? ' ' + a.postalCode : '')].filter((s) => s && s.trim()).join('\n') : '',
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
      if (key === 'ADR' && !out.address) {
        const [, , street, city, region, postal] = raw.split(/(?<!\\);/).map(unesc);
        out.address = [street, [[city, region].filter(Boolean).join(', '), postal].filter(Boolean).join(' ')].filter(Boolean).join('\n');
      }
    }
    if (!out.name && out.nParts) out.name = [out.nParts[1], out.nParts[0]].filter(Boolean).join(' ');
    return out;
  }

  function fillCustomer(c) {
    for (const k of ['name', 'phone', 'email', 'address']) {
      if (c[k]) current.customer[k] = c[k];
      syncKey('est', 'customer.' + k);
    }
    if (!current.signature) current.sigName = current.customer.name;
    setChrome({ title: `${current.number} · ${current.customer.name}`, back: true, bottombar: true });
    scheduleSave();
    toast(c.name ? `Added ${c.name}` : 'Contact added');
  }

  function pastCustomers() {
    const seen = new Map();
    const list = Object.values(allEstimates()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    for (const e of list) {
      const c = e.customer || {};
      const k = (c.name + '|' + c.phone).toLowerCase();
      if (c.name && !seen.has(k) && e.id !== current?.id) seen.set(k, c);
    }
    return [...seen.values()];
  }

  function renderPickList() {
    const q = $('#pick-search').value.trim().toLowerCase();
    const list = pastCustomers().filter((c) => !q || [c.name, c.phone, c.address].join(' ').toLowerCase().includes(q));
    $('#pick-list').innerHTML = list.length
      ? list.map((c, i) => `<button type="button" class="pick-item" data-act="choose-customer" data-i="${i}">
          <b>${esc(c.name)}</b><span class="muted">${esc([c.phone, c.address?.split('\n')[0]].filter(Boolean).join(' · '))}</span></button>`).join('')
      : `<p class="empty">${q ? 'No matches.' : 'No past customers yet.'}</p>`;
    $('#pick-list').dataset.q = q;
  }

  // ---------- backup ----------

  function exportAll() {
    const data = { app: 'ats-estimates', version: 2, exportedAt: new Date().toISOString(), profile, estimates: allEstimates() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `estimates-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const incoming = data.estimates || {};
      const count = Object.keys(incoming).length;
      if (!count) return toast('No estimates found in that file');
      store(KEYS.estimates, { ...allEstimates(), ...incoming });
      if (data.profile && confirm('Also restore the company profile from this backup?')) {
        profile = { ...DEFAULT_PROFILE, ...data.profile, complete: true };
        saveProfile();
      }
      toast(`Restored ${count} estimate${count === 1 ? '' : 's'}`);
      route();
    } catch (err) {
      console.error(err);
      toast('That file could not be read');
    }
  }

  // ---------- actions ----------

  const actions = {
    home: () => go('#/'),
    menu: () => {
      $('#menu-install').hidden = !installPrompt;
      $('#menu-dlg').showModal();
    },
    'close-dlg': (el) => el.closest('dialog').close(),
    profile: () => go('#/profile'),
    export: () => { $('#menu-dlg').close(); exportAll(); },
    import: () => $('#import-file').click(),
    install: async () => {
      $('#menu-dlg').close();
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
    },

    new: () => {
      current = blankEstimate();
      profile.nextNumber = num(profile.nextNumber) + 1;
      saveProfile();
      go(stepHash(current.id, 'customer'));
    },
    open: (el) => go(stepHash(el.dataset.id, 'customer')),
    prev: (el) => go(el.dataset.to),
    next: (el) => {
      if (el.dataset.to === '#/' && !isEmpty(current)) toast(`${current.number} saved`);
      go(el.dataset.to);
    },

    'pick-contact': pickContact,
    'pick-previous': () => {
      $('#pick-search').value = '';
      renderPickList();
      $('#pick-dlg').showModal();
    },
    'choose-customer': (el) => {
      const q = $('#pick-list').dataset.q;
      const list = pastCustomers().filter((c) => !q || [c.name, c.phone, c.address].join(' ').toLowerCase().includes(q));
      const c = list[num(el.dataset.i)];
      $('#pick-dlg').close();
      if (c) fillCustomer(c);
    },

    'add-item': () => openItem(-1),
    'edit-item': (el) => openItem(num(el.dataset.i)),
    'save-item': saveItem,
    'delete-item': () => {
      if (!confirm('Delete this item?')) return;
      current.items.splice(editingIndex, 1);
      $('#item-dlg').close();
      saveNow();
      renderWizard(current.id, 'work');
    },
    qty: (el) => {
      editingItem.qty = Math.max(1, (num(editingItem.qty) || 1) + num(el.dataset.d));
      syncKey('item', 'qty');
      updateItemTotal();
    },

    'clear-sig': () => {
      current.signature = '';
      current.sigDate = '';
      syncKey('est', 'sigDate');
      scheduleSave();
      renderWizard(current.id, 'sign');
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
      location.href = `sms:${current.customer.phone.replace(/[^\d+]/g, '')}${sep}body=${encodeURIComponent(summaryText(current))}`;
    },
    email: () => {
      location.href = `mailto:${encodeURIComponent(current.customer.email)}?subject=${encodeURIComponent(`Estimate ${current.number} from ${profile.name}`)}&body=${encodeURIComponent(summaryText(current))}`;
    },
    duplicate: () => {
      saveNow();
      const copy = {
        ...clone(current),
        id: uid(),
        number: 'E-' + profile.nextNumber,
        date: today(),
        validUntil: addDays(today(), num(profile.validDays) || 30),
        signature: '', sigName: '', sigDate: '',
        createdAt: new Date().toISOString(),
      };
      profile.nextNumber = num(profile.nextNumber) + 1;
      saveProfile();
      closeCurrent();
      current = copy;
      saveNow();
      toast(`Copied to ${copy.number}`);
      go(stepHash(copy.id, 'customer'));
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
    const chip = e.target.closest('.chip');
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
    const el = e.target.closest('[data-bind]');
    if (!el || el.classList.contains('chips')) return;
    const scope = scopeOf(el);
    const obj = objFor(scope);
    if (!obj) return;
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
  $('#pick-search').addEventListener('input', renderPickList);

  $('#vcf-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const c = parseVCard(await file.text());
    if (c.name || c.phone) fillCustomer(c);
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
  if (BRAND.colors?.primary) $('meta[name=theme-color]').content = BRAND.colors.primary;
  for (const s of SPECIES_ALL) $('#species-list').appendChild(new Option(s));
  route();
})();
