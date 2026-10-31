(() => {
  'use strict';

  // ---------- pick lists (match the paper estimate form) ----------

  // Per-tree choices
  const SPECIES = ['Oak', 'Maple', 'Pine', 'Ash', 'Elm', 'Spruce', 'Cedar', 'Cottonwood', 'Poplar', 'Birch', 'Walnut',
    'Locust', 'Willow', 'Hackberry', 'Pear', 'Cherry', 'Mulberry', 'Fruit tree', 'Unknown'];
  const WORK = ['Removal', 'Removal + stump grinding', 'Trimming / pruning', 'Crown reduction', 'Deadwood removal',
    'Stump grinding only', 'Emergency / storm work', 'Health assessment', 'Land clearing'];
  const LOCATIONS = ['Front Yard', 'Backyard', 'Side Yard', 'Near Utility Lines', 'Over Structure', 'Over Fence', 'Driveway', 'Tree Line'];
  const SIZES = [['Large', 'Large (over 20 ft)'], ['Medium', 'Medium (10–20 ft)'], ['Small', 'Small (under 10 ft)']];
  const CONDITIONS = ['Healthy', 'Diseased / Decayed', 'Storm-Damaged', 'Dead', 'Leaning'];

  // Job-wide choices
  const SITE = ['Clear Access', 'Restricted Access', 'Uneven Terrain', 'Sloped Terrain'];
  const EXTRAS = ['Wood Chipping / Hauling', 'Firewood Preparation', 'Cleanup / Debris Removal'];

  // Quick-add buttons on the Equipment screen. Prices are remembered after first use.
  const EQUIPMENT = ['Crane rental', 'Bucket truck / lift rental', 'Spider lift rental', 'Stump grinder rental', 'Mini skid steer rental',
    'Dump trailer', 'Dump / disposal fee', 'Traffic control', 'Permit fee'];

  const DAYS = [[0.5, '½ day'], [1, '1 day'], [1.5, '1½ days'], [2, '2 days'], [3, '3 days'], [4, '4 days'], [5, '5 days']];
  const ADDITIONAL = [[0, 'None'], [50, '$50'], [100, '$100'], [150, '$150'], [250, '$250']];
  const DEPOSITS = [[0, 'None'], [25, '25%'], [50, '50%']];
  const VALID_DAYS = [[15, '15 days'], [30, '30 days'], [60, '60 days'], [90, '90 days']];

  const STEPS = [
    { id: 'client', label: 'Client', render: stepClient },
    { id: 'trees', label: 'Trees', render: stepTrees },
    { id: 'site', label: 'Site', render: stepSite },
    { id: 'crew', label: 'Crew days', render: stepCrew },
    { id: 'equipment', label: 'Equipment', render: stepEquipment },
    { id: 'summary', label: 'Summary', render: stepSummary },
    { id: 'sign', label: 'Sign', render: stepSign },
    { id: 'send', label: 'Send', render: stepSend },
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

  const KEYS = { profile: 'ats.profile', estimates: 'ats.estimates.v4' };

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
    name: '', license: '', address: '', phone: '', email: '', website: '',
    dayRate: 2000, crew: '3 regular employees + 1 part-time', taxRate: 0, depositPct: 0, validDays: 30, nextNumber: 1001,
    logo: '', signature: '', prices: {},
    ...BRAND.company,
    complete: false,
  };

  let profile = { ...DEFAULT_PROFILE, ...load(KEYS.profile, {}) };
  profile.prices = profile.prices || {};
  const saveProfile = () => store(KEYS.profile, profile);

  const allEstimates = () => load(KEYS.estimates, {});

  // ---------- state ----------

  let current = null;      // estimate open in the wizard
  let profileDraft = null; // profile being edited
  let editingTree = null;  // tree open in the tree sheet
  let editingIndex = -1;
  let installPrompt = null;

  const scopeOf = (el) => el.closest('[data-scope]')?.dataset.scope || 'est';
  const objFor = (scope) => ({ profile: profileDraft, tree: editingTree })[scope] || current;

  function blankEstimate() {
    return {
      id: uid(),
      number: 'E-' + profile.nextNumber,
      date: today(),
      client: { name: '', phone: '', email: '', street: '', csz: '' },
      trees: [],
      site: [], siteOther: '',
      extras: [], extrasOther: '',
      notes: '',
      days: 1,
      dayRate: num(profile.dayRate),
      crew: profile.crew,
      startDate: '', endDate: '',
      equipment: [],
      taxRate: num(profile.taxRate),
      additional: 0,
      validDays: num(profile.validDays) || 30,
      depositPct: num(profile.depositPct),
      depositAmt: '',
      clientSig: '',
      clientSigDate: '',
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }

  const blankTree = () => ({ species: '', work: '', location: '', size: '', condition: '', qty: 1, notes: '' });

  const isEmpty = (e) => !e.client.name.trim() && !e.client.phone.trim() && !e.trees.length && !e.equipment.length;
  const treeCount = (e) => e.trees.reduce((n, t) => n + (num(t.qty) || 1), 0);
  const treeTitle = (t) => `${num(t.qty) > 1 ? num(t.qty) + ' × ' : ''}${t.species || 'Tree'}${t.work ? ' — ' + t.work : ''}`;
  const treeDetails = (t) => [t.location, t.size && SIZES.find((s) => s[0] === t.size)?.[1], t.condition].filter(Boolean).join(' · ');

  function totals(e) {
    const equipment = e.equipment.reduce((s, m) => s + num(m.qty) * num(m.price), 0);
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

  // A multi-select group with an "Other" text box underneath, like the paper form.
  const checkGroup = (key, options) =>
    `${chips(key, options, { multi: true })}<input class="mt" data-bind="${key}Other" placeholder="Other…">`;

  function field(label, key, attrs = '', textarea = false) {
    const control = textarea
      ? `<textarea data-bind="${key}" ${attrs}></textarea>`
      : `<input data-bind="${key}" ${attrs}>`;
    return `<label class="field"><span>${label}</span>${control}</label>`;
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

  const wizardTitle = () => `${current.number}${current.client.name ? ' · ' + current.client.name : ''}`;

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
      .filter((e) => !q || [e.number, e.client?.name, e.client?.phone, e.client?.street, e.client?.csz].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    $('#est-list').innerHTML = list.length
      ? list.map((e) => `
        <button type="button" class="est-card" data-act="open" data-id="${esc(e.id)}">
          <div class="row"><b>${esc(e.client?.name || 'No name')}</b><b>${money(e.total)}</b></div>
          <div class="row muted"><span>${esc(e.number)} · ${niceDate(e.date)}</span>
            <span class="badge ${e.clientSig ? 'ok' : ''}">${e.clientSig ? 'Signed' : 'Draft'}</span></div>
          <div class="muted one-line">${esc([e.client?.street, e.client?.csz].filter(Boolean).join(', '))}</div>
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

    setChrome({ title: wizardTitle(), back: true, bottombar: true });

    $('#view').innerHTML = `
      <nav class="steps">${STEPS.map((s, n) => `
        <a href="${stepHash(current.id, s.id)}" class="step ${n === i ? 'on' : ''} ${n < i ? 'done' : ''}">
          <span class="dot">${n + 1}</span>${s.label}</a>`).join('')}</nav>
      <div class="step-body" data-step="${step.id}">${step.render()}</div>`;

    syncAll($('#view'), 'est');
    $('.step.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    if (step.id === 'sign') {
      initSignature($('#sig-client'), () => current.clientSig, (url) => {
        current.clientSig = url;
        if (url && !current.clientSigDate) current.clientSigDate = today();
        syncKey('est', 'clientSigDate');
        scheduleSave();
      });
      const own = $('#sig-contractor');
      if (own) initSignature(own, () => profile.signature, (url) => { profile.signature = url; saveProfile(); });
    }
    updateTotals();

    $('#btn-prev').textContent = i === 0 ? '‹ Estimates' : '‹ Back';
    $('#btn-next').textContent = i === STEPS.length - 1 ? 'Done ✓' : `Next: ${STEPS[i + 1].label} ›`;
    $('#btn-prev').dataset.to = i === 0 ? '#/' : stepHash(current.id, STEPS[i - 1].id);
    $('#btn-next').dataset.to = i === STEPS.length - 1 ? '#/' : stepHash(current.id, STEPS[i + 1].id);
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
      <section class="card">
        ${field('Name', 'client.name', 'autocomplete="name" autocapitalize="words"')}
        ${field('Phone', 'client.phone', 'type="tel" autocomplete="tel" inputmode="tel"')}
        ${field('Email', 'client.email', 'type="email" autocomplete="email" inputmode="email"')}
        ${field('Address', 'client.street', 'autocomplete="address-line1" autocapitalize="words"')}
        ${field('City / State / ZIP', 'client.csz', 'autocapitalize="words"')}
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
        <h3>Additional services</h3>
        ${checkGroup('extras', EXTRAS)}
      </section>
      <section class="card">
        ${field('Notes for the client', 'notes', 'rows="3" placeholder="Optional"', true)}
      </section>`;
  }

  function stepCrew() {
    return `
      <h2 class="step-title">Crew days</h2>
      <section class="card">
        <h3>How many days?</h3>
        ${chips('days', DAYS, { isNum: true })}
        <div class="mt">${stepper('days', { step: 0.5, min: 0.5 })}</div>
      </section>
      <section class="card">
        <h3>Day rate</h3>
        ${moneyInput('dayRate')}
        ${field('Crew', 'crew', 'class="mt"')}
        <div class="sum-line grand">Crew total <b data-total="labor"></b></div>
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
        <h3>Tap to add <small>prices are remembered</small></h3>
        <div class="chips">${EQUIPMENT.map((d) => `<button type="button" class="chip" data-act="add-equip" data-desc="${esc(d)}">＋ ${esc(d)}</button>`).join('')}</div>
      </section>
      <div class="line-list">${rows || '<p class="empty">No equipment rentals. Skip this step if none are needed.</p>'}</div>
      <button type="button" class="btn big" data-act="add-equip" data-desc="">＋ Other item</button>
      <section class="card"><div class="sum-line grand">Total equipment <b data-total="equipment"></b></div></section>`;
  }

  function stepSummary() {
    return `
      <h2 class="step-title">Estimate summary</h2>
      <section class="card totals">
        <div class="sum-line">Crew (${num(current.days)} day${num(current.days) === 1 ? '' : 's'} × ${money(num(current.dayRate))}) <span data-total="labor"></span></div>
        <div class="sum-line">Equipment rentals <span data-total="equipment"></span></div>
        <div class="sum-line"><b>Subtotal</b> <b data-total="subtotal"></b></div>
      </section>
      <section class="card">
        <h3>Tax</h3>
        <div class="row"><label class="mini"><input data-bind="taxRate" type="number" inputmode="decimal" min="0" step="0.001"> %</label><span data-total="tax"></span></div>
      </section>
      <section class="card">
        <h3>Additional costs <small>travel, etc.</small></h3>
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
        <h4>Size</h4>
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
    return `
      <h2 class="step-title">Send to client</h2>
      <div class="btn-grid">
        <button type="button" class="btn primary" data-act="print">🖨️ Print / PDF</button>
        ${share}
        <button type="button" class="btn" data-act="sms" ${current.client.phone ? '' : 'disabled'}>💬 Text</button>
        <button type="button" class="btn" data-act="email" ${current.client.email ? '' : 'disabled'}>✉️ Email</button>
      </div>
      <p class="hint">For a PDF: tap Print / PDF, then choose “Save as PDF” (Android) or use the Share button in the print screen (iPhone).</p>
      <div class="doc-preview">${renderDoc(current)}</div>
      <div class="btn-pair">
        <button type="button" class="btn" data-act="duplicate">⧉ Duplicate</button>
        <button type="button" class="btn danger" data-act="delete-est">🗑 Delete</button>
      </div>`;
  }

  // ---------- signature pad ----------

  function initSignature(canvas, get, set) {
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let last = null;
    let dirty = false;

    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Object.assign(ctx, { lineWidth: 2.4, lineCap: 'round', lineJoin: 'round', strokeStyle: '#1f2421' });
    if (get()) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
      img.src = get();
    }

    const pt = (e) => {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      last = pt(e);
      canvas.setPointerCapture?.(e.pointerId);
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
      if (dirty) set(canvas.toDataURL('image/png'));
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
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

    const eqRows = e.equipment.map((m) => `<tr><td>${esc(m.desc)}</td><td class="r">${num(m.qty)}</td><td class="r">${money(num(m.price))}</td><td class="r">${money(num(m.qty) * num(m.price))}</td></tr>`).join('');
    const treeRows = e.trees.map((t, i) => `<tr>
        <td>${i + 1}</td><td class="r">${num(t.qty) || 1}</td><td><b>${esc(t.species) || '—'}</b></td><td>${esc(t.work)}</td>
        <td>${esc(t.location)}</td><td>${esc(t.size)}</td><td>${esc(t.condition)}${t.notes ? `<div class="doc-note">${esc(t.notes)}</div>` : ''}</td></tr>`).join('');
    const validUntil = addDays(e.date, num(e.validDays) || 30);

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
          <div class="grid2">${kv('Address', e.client.street)}${kv('City / State / ZIP', e.client.csz)}</div>
          ${e.client.phone ? kv('Phone', e.client.phone) : ''}`)}

        ${sec(`Trees (${treeCount(e)})`, `
          <table class="doc-table trees">
            <thead><tr><th>#</th><th class="r">Qty</th><th>Type of tree</th><th>Work</th><th>Location</th><th>Size</th><th>Condition / notes</th></tr></thead>
            <tbody>${treeRows || '<tr><td colspan="7" class="none">None</td></tr>'}</tbody>
          </table>`)}

        ${sec('Site details', `
          <table class="doc-form">
            ${tr('Site conditions', boxes(SITE, e.site, e.siteOther))}
            ${tr('Additional services', boxes(EXTRAS, e.extras, e.extrasOther))}
            ${tr('Estimated dates', `Start: <b>${niceDate(e.startDate) || '—'}</b> &nbsp;&nbsp; Completion: <b>${niceDate(e.endDate) || '—'}</b>`)}
            ${e.notes ? tr('Notes', esc(e.notes).replace(/\n/g, '<br>')) : ''}
          </table>`)}

        <div class="doc-cols">
          ${sec('Crew labor', `
            <table class="doc-table">
              <thead><tr><th>Crew</th><th class="r">Days</th><th class="r">Day rate</th><th class="r">Amount</th></tr></thead>
              <tbody><tr><td>${esc(e.crew)}</td><td class="r">${num(e.days)}</td><td class="r">${money(num(e.dayRate))}</td><td class="r">${money(t.labor)}</td></tr></tbody>
              <tfoot><tr><th colspan="3">Total crew labor</th><td class="r">${money(t.labor)}</td></tr></tfoot>
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
            <tr><th>Subtotal (crew labor + equipment)</th><td>${money(t.subtotal)}</td></tr>
            <tr><th>Tax${num(e.taxRate) ? ` (${num(e.taxRate)}%)` : ''}</th><td>${money(t.tax)}</td></tr>
            <tr><th>Additional costs (travel, etc.)</th><td>${money(t.additional)}</td></tr>
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
      ...e.trees.map((t) => `• ${treeTitle(t)}`),
      '',
      `Crew: ${num(e.days)} day${num(e.days) === 1 ? '' : 's'}`,
      `Total estimate: ${money(t.total)}${t.deposit ? ` (deposit ${money(t.deposit)})` : ''}`,
      `Valid for ${num(e.validDays) || 30} days.`,
      '',
      `Questions? ${[profile.phone, profile.email].filter(Boolean).join(' · ')}`,
    ].filter((l, i, a) => l || (a[i - 1] && a[i + 1])).join('\n');
  }

  // ---------- company profile ----------

  function renderProfile() {
    const first = !profile.complete;
    profileDraft = clone(profile);
    setChrome({ title: 'Company profile', back: !first, bottombar: false });
    $('#view').innerHTML = `
      <div data-scope="profile">
        ${first
          ? '<div class="welcome"><h2>Welcome! 👋</h2><p>Set up your company information once. It goes on every estimate automatically.</p></div>'
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
          ${field('Company name *', 'name', 'autocapitalize="words"')}
          ${field('License number', 'license')}
          ${field('Address', 'address', 'rows="2"', true)}
          ${field('Phone *', 'phone', 'type="tel" inputmode="tel"')}
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
          ${field('Crew', 'crew')}
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

  const cszOf = (city, region, zip) => [[city, region].filter(Boolean).join(', '), zip].filter(Boolean).join(' ');

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
          csz: a ? cszOf(a.city, a.region, a.postalCode) : '',
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
        out.csz = cszOf(city, region, zip);
      }
    }
    if (!out.name && out.nParts) out.name = [out.nParts[1], out.nParts[0]].filter(Boolean).join(' ');
    return out;
  }

  function fillClient(c) {
    for (const k of ['name', 'phone', 'email', 'street', 'csz']) {
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
      const c = e.client || {};
      const k = (c.name + '|' + c.phone).toLowerCase();
      if (c.name && !seen.has(k) && e.id !== current?.id) seen.set(k, c);
    }
    return [...seen.values()];
  }

  function filteredClients() {
    const q = $('#pick-search').value.trim().toLowerCase();
    return pastClients().filter((c) => !q || [c.name, c.phone, c.street, c.csz].join(' ').toLowerCase().includes(q));
  }

  function renderPickList() {
    const list = filteredClients();
    $('#pick-list').innerHTML = list.length
      ? list.map((c, i) => `<button type="button" class="pick-item" data-act="choose-client" data-i="${i}">
          <b>${esc(c.name)}</b><span class="muted">${esc([c.phone, c.street].filter(Boolean).join(' · '))}</span></button>`).join('')
      : `<p class="empty">${$('#pick-search').value ? 'No matches.' : 'No past clients yet.'}</p>`;
  }

  // ---------- backup ----------

  function exportAll() {
    const data = { app: 'ats-estimates', version: 3, exportedAt: new Date().toISOString(), profile, estimates: allEstimates() };
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
      const incoming = data.version >= 3 ? data.estimates || {} : {};
      const count = Object.keys(incoming).length;
      if (count) store(KEYS.estimates, { ...allEstimates(), ...incoming });
      if (data.profile && confirm('Also restore the company profile from this backup?')) {
        profile = { ...DEFAULT_PROFILE, ...data.profile, complete: true };
        profile.prices = profile.prices || {};
        saveProfile();
      }
      toast(count ? `Restored ${count} estimate${count === 1 ? '' : 's'}` : 'No estimates found in that file');
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
      go(stepHash(current.id, 'client'));
    },
    open: (el) => go(stepHash(el.dataset.id, 'client')),
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
      const desc = el.dataset.desc;
      const price = profile.prices[desc.toLowerCase()];
      current.equipment.push({ desc, qty: 1, price: price ?? '' });
      saveNow();
      renderWizard(current.id, 'equipment');
      const row = $$('.line-card').pop();
      row?.scrollIntoView({ block: 'center' });
      // Jump straight to whatever still needs typing.
      const next = !desc ? '.desc' : price == null ? '.price-input input' : null;
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
        clientSig: '', clientSigDate: '',
        createdAt: new Date().toISOString(),
      };
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
  route();
})();
