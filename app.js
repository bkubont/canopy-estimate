(() => {
  'use strict';

  const SERVICES = [
    'Tree removal',
    'Crown reduction',
    'Crown thinning',
    'Crown raising',
    'Crown cleaning / deadwood',
    'Structural pruning',
    'Hazard / risk pruning',
    'Line clearance',
    'Cabling & bracing',
    'Stump grinding',
    'Storm / emergency work',
    'Hedge / shrub trimming',
    'Tree planting',
    'Plant health care',
    'Root collar excavation',
    'Tree risk assessment',
    'Land / lot clearing',
    'Other',
  ];

  const SPECIES = [
    'Red maple', 'Silver maple', 'Sugar maple', 'Norway maple', 'Japanese maple',
    'Red oak', 'White oak', 'Pin oak', 'Live oak', 'Bur oak', 'Water oak',
    'White pine', 'Loblolly pine', 'Ponderosa pine', 'Scots pine',
    'Eastern red cedar', 'Western red cedar', 'Douglas fir', 'Blue spruce', 'Norway spruce',
    'Eastern hemlock', 'Arborvitae', 'Leyland cypress',
    'American elm', 'Siberian elm', 'Green ash', 'White ash', 'Honey locust', 'Black locust',
    'Tulip poplar', 'Cottonwood', 'Lombardy poplar', 'Quaking aspen', 'River birch', 'Paper birch',
    'Black walnut', 'Pecan', 'Hickory', 'Sweetgum', 'Sycamore', 'Linden / basswood',
    'Bradford pear', 'Crabapple', 'Cherry', 'Dogwood', 'Redbud', 'Magnolia', 'Crape myrtle',
    'Willow', 'Hackberry', 'Mulberry', 'Palm', 'Eucalyptus', 'Unknown',
  ];

  const DEFAULT_TERMS =
    'Pricing valid for the period shown above. A deposit may be required to schedule work. ' +
    'Client is responsible for identifying property lines and any underground irrigation, ' +
    'invisible fences or private utilities. We are not responsible for damage to lawns from ' +
    'equipment travel beyond reasonable care. Fully insured; certificate available on request. ' +
    'Balance due upon completion.';

  const KEYS = {
    settings: 'canopy.settings',
    estimates: 'canopy.estimates',
    draft: 'canopy.draft',
  };

  const DEFAULT_SETTINGS = {
    coName: '', coAddress: '', coPhone: '', coEmail: '', coWebsite: '', coLicense: '',
    coTax: 0, coDeposit: 0, coValidDays: 30, coNextNumber: 1001, coTerms: DEFAULT_TERMS, logo: '',
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const sheet = $('#estimate');
  const itemsBody = $('#items');
  const rowTpl = $('#item-row');
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

  // ---------- storage ----------

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
      toast('Could not save — storage is full or blocked');
      console.error(err);
      return false;
    }
  }

  let settings = { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) };
  let current = null; // the estimate being edited

  // ---------- helpers ----------

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const num = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
  const today = () => new Date().toISOString().slice(0, 10);

  function addDays(isoDate, days) {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function emptyItem() {
    return { service: SERVICES[0], species: '', dbh: '', height: '', description: '', qty: 1, price: '' };
  }

  function blankEstimate() {
    const date = today();
    return {
      id: uid(),
      number: 'E-' + settings.coNextNumber,
      date,
      validUntil: addDays(date, num(settings.coValidDays) || 30),
      arborist: '',
      clientName: '', clientPhone: '', clientEmail: '', clientAddress: '',
      siteSameAsBilling: false, siteAddress: '', accessNotes: '',
      wood: 'haul', chips: 'haul', stumps: 'flush', raking: true,
      discount: '', discountType: 'pct',
      taxRate: settings.coTax || '',
      depositPct: settings.coDeposit || '',
      notes: '',
      terms: settings.coTerms || DEFAULT_TERMS,
      sigName: '', sigDate: '', signature: '',
      items: [emptyItem()],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }

  // ---------- form <-> estimate ----------

  function namedFields() {
    return $$('[name]', sheet);
  }

  function writeForm(est) {
    for (const el of namedFields()) {
      const v = est[el.name];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
    }
    syncSiteAddress();
    renderItems(est.items);
    $$('textarea', sheet).forEach(autoGrow);
    sig.load(est.signature);
    calc();
  }

  function readForm() {
    const est = { ...current };
    for (const el of namedFields()) {
      est[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    est.items = $$('tr', itemsBody).map((tr) => {
      const item = {};
      for (const el of $$('[data-f]', tr)) item[el.dataset.f] = el.value;
      return item;
    });
    est.signature = sig.data();
    return est;
  }

  // ---------- line items ----------

  function renderItems(items) {
    itemsBody.innerHTML = '';
    (items.length ? items : [emptyItem()]).forEach(addRow);
    renumber();
  }

  function addRow(item = emptyItem()) {
    const tr = rowTpl.content.firstElementChild.cloneNode(true);
    const select = $('[data-f=service]', tr);
    const services = SERVICES.includes(item.service) || !item.service ? SERVICES : [item.service, ...SERVICES];
    for (const s of services) select.add(new Option(s, s));
    for (const el of $$('[data-f]', tr)) el.value = item[el.dataset.f] ?? '';
    $('.c-del button', tr).addEventListener('click', () => {
      tr.remove();
      if (!itemsBody.children.length) addRow();
      renumber();
      calc();
      autosave();
    });
    itemsBody.appendChild(tr);
    autoGrow($('textarea', tr));
    return tr;
  }

  function renumber() {
    $$('tr', itemsBody).forEach((tr, i) => ($('.c-num', tr).textContent = i + 1));
  }

  function autoGrow(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 2 + 'px';
  }

  // ---------- totals ----------

  function calc() {
    let subtotal = 0;
    for (const tr of $$('tr', itemsBody)) {
      const amount = num($('[data-f=qty]', tr).value) * num($('[data-f=price]', tr).value);
      subtotal += amount;
      $('.amount', tr).textContent = amount ? money.format(amount) : '';
    }

    const val = (name) => $(`[name="${name}"]`, sheet).value;
    const discountRaw = num(val('discount'));
    const discount = Math.min(
      subtotal,
      val('discountType') === 'pct' ? (subtotal * discountRaw) / 100 : discountRaw
    );
    const taxable = subtotal - discount;
    const tax = (taxable * num(val('taxRate'))) / 100;
    const total = taxable + tax;
    const deposit = (total * Math.min(100, num(val('depositPct')))) / 100;

    $('#t-subtotal').textContent = money.format(subtotal);
    $('#t-discount').textContent = '−' + money.format(discount);
    $('#t-tax').textContent = money.format(tax);
    $('#t-total').textContent = money.format(total);
    $('#t-deposit').textContent = money.format(deposit);
    $('#t-balance').textContent = money.format(total - deposit);

    return { subtotal, discount, tax, total, deposit };
  }

  // ---------- site address sync ----------

  function syncSiteAddress() {
    const same = $('[name=siteSameAsBilling]', sheet).checked;
    const site = $('[name=siteAddress]', sheet);
    site.readOnly = same;
    if (same) {
      site.value = $('[name=clientAddress]', sheet).value;
      autoGrow(site);
    }
  }

  // ---------- signature pad ----------

  const sig = (() => {
    const canvas = $('#sig');
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let dirty = false;
    let last = null;
    let saved = '';

    function size() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1f2421';
      if (saved) paint(saved);
    }

    function paint(dataUrl) {
      const img = new Image();
      img.onload = () => {
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = dataUrl;
    }

    function point(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      last = point(e);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = point(e);
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
      if (dirty) {
        saved = canvas.toDataURL('image/png');
        const date = $('[name=sigDate]', sheet);
        if (!date.value) date.value = today();
        autosave();
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    window.addEventListener('resize', size);

    return {
      init: size,
      data: () => saved,
      load(dataUrl) {
        saved = dataUrl || '';
        dirty = false;
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
        if (saved) paint(saved);
      },
      clear() {
        this.load('');
        autosave();
      },
    };
  })();

  // ---------- company letterhead ----------

  function renderLetterhead() {
    $('#co-name-display').textContent = settings.coName || 'Your Tree Service';
    const lines = [
      settings.coAddress,
      [settings.coPhone, settings.coEmail, settings.coWebsite].filter(Boolean).join('  ·  '),
      settings.coLicense && 'License / Insurance: ' + settings.coLicense,
    ].filter(Boolean);
    $('#co-details-display').textContent = lines.join('\n');
    const logo = $('#logo-preview');
    logo.hidden = !settings.logo;
    logo.src = settings.logo || '';
  }

  // ---------- save / load ----------

  let autosaveTimer;
  function autosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      current = readForm();
      store(KEYS.draft, current);
    }, 400);
  }

  function allEstimates() {
    return load(KEYS.estimates, {});
  }

  function saveEstimate() {
    current = readForm();
    const all = allEstimates();
    const isNew = !all[current.id];
    current.updatedAt = new Date().toISOString();
    current.total = calc().total;
    all[current.id] = current;
    if (!store(KEYS.estimates, all)) return;
    store(KEYS.draft, current);

    // Advance the counter when a fresh auto-numbered estimate is saved for the first time.
    if (isNew && current.number === 'E-' + settings.coNextNumber) {
      settings.coNextNumber = num(settings.coNextNumber) + 1;
      store(KEYS.settings, settings);
    }
    toast(`Saved ${current.number}`);
  }

  function openEstimate(est) {
    current = { ...blankEstimate(), ...est };
    writeForm(current);
    store(KEYS.draft, current);
  }

  function newEstimate() {
    const draft = readForm();
    const saved = allEstimates()[draft.id];
    const hasUnsavedWork =
      JSON.stringify({ ...draft, updatedAt: null, total: null }) !==
      JSON.stringify({ ...(saved || blankEstimateLike(draft)), updatedAt: null, total: null });
    if (hasUnsavedWork && !confirm('Start a new estimate? Unsaved changes to this one will be lost.')) return;
    openEstimate(blankEstimate());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // A blank estimate with the same id/number/dates, so an untouched new form doesn't count as "unsaved".
  function blankEstimateLike(est) {
    const b = blankEstimate();
    return { ...b, id: est.id, number: est.number, date: est.date, validUntil: est.validUntil, createdAt: est.createdAt };
  }

  function renderSavedList() {
    const list = $('#saved-list');
    const q = $('#saved-search').value.trim().toLowerCase();
    const all = Object.values(allEstimates())
      .filter((e) =>
        !q ||
        [e.number, e.clientName, e.clientAddress, e.siteAddress, e.clientPhone]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    list.innerHTML = '';
    if (!all.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = q ? 'No matches' : 'No saved estimates yet';
      list.appendChild(li);
      return;
    }

    for (const e of all) {
      const li = document.createElement('li');
      const info = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = `${e.number} — ${e.clientName || 'No client name'}`;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = [e.date, e.siteAddress || e.clientAddress, money.format(e.total || 0)]
        .filter(Boolean)
        .join(' · ');
      info.append(title, meta);

      const btns = document.createElement('div');
      btns.className = 'btns';
      const mk = (label, cls, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link ' + cls;
        b.textContent = label;
        b.addEventListener('click', fn);
        btns.appendChild(b);
      };
      mk('Open', '', () => {
        openEstimate(e);
        $('#dlg-saved').close();
      });
      mk('Copy', '', () => {
        const copy = {
          ...e,
          id: uid(),
          number: 'E-' + settings.coNextNumber,
          date: today(),
          validUntil: addDays(today(), num(settings.coValidDays) || 30),
          signature: '', sigName: '', sigDate: '',
          createdAt: new Date().toISOString(),
          updatedAt: null,
        };
        openEstimate(copy);
        $('#dlg-saved').close();
        toast(`Copied to ${copy.number} — not saved yet`);
      });
      mk('Delete', 'danger', () => {
        if (!confirm(`Delete ${e.number}? This can't be undone.`)) return;
        const all = allEstimates();
        delete all[e.id];
        store(KEYS.estimates, all);
        renderSavedList();
      });
      li.append(info, btns);
      list.appendChild(li);
    }
  }

  function exportAll() {
    const data = { app: 'canopy-estimate', version: 1, exportedAt: new Date().toISOString(), settings, estimates: allEstimates() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `canopy-estimates-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const incoming = data.estimates || {};
      const count = Object.keys(incoming).length;
      if (!count) return toast('No estimates found in that file');
      const all = { ...allEstimates(), ...incoming };
      store(KEYS.estimates, all);
      if (data.settings && confirm('Also import company details from this file?')) {
        settings = { ...DEFAULT_SETTINGS, ...data.settings };
        store(KEYS.settings, settings);
        renderLetterhead();
      }
      renderSavedList();
      toast(`Imported ${count} estimate${count === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(err);
      toast('That file could not be read');
    }
  }

  // ---------- settings dialog ----------

  const settingsForm = $('#settings-form');
  let pendingLogo = null;

  function openSettings() {
    for (const el of $$('[name]', settingsForm)) el.value = settings[el.name] ?? '';
    pendingLogo = settings.logo;
    $('#logo-file').value = '';
    $('#dlg-settings').showModal();
  }

  $('#logo-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Downscale so the logo fits comfortably in localStorage.
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 400 / img.width, 200 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      pendingLogo = c.toDataURL('image/png');
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });

  $('#btn-remove-logo').addEventListener('click', () => {
    pendingLogo = '';
    $('#logo-file').value = '';
    toast('Logo will be removed when you save');
  });

  $('#dlg-settings').addEventListener('close', () => {
    if ($('#dlg-settings').returnValue !== 'save') return;
    for (const el of $$('[name]', settingsForm)) {
      settings[el.name] = el.type === 'number' ? num(el.value) : el.value;
    }
    settings.coNextNumber = Math.max(1, Math.floor(num(settings.coNextNumber)) || 1);
    settings.logo = pendingLogo;
    store(KEYS.settings, settings);
    renderLetterhead();
    toast('Company details saved');
  });

  // ---------- printing ----------

  // Form controls clip their content when printed, so swap them for plain text blocks.
  window.addEventListener('beforeprint', () => {
    if ($('.print-text', sheet)) return; // already prepared
    const controls = [...$$('textarea', sheet), ...$$('select', sheet), ...$$('.items input', sheet)];
    for (const el of controls) {
      const div = document.createElement('div');
      div.className = 'print-text';
      if (el.tagName === 'SELECT') div.textContent = el.selectedOptions[0]?.text ?? '';
      else if (el.dataset.f === 'price' && el.value) div.textContent = money.format(num(el.value));
      else div.textContent = el.value;
      el.after(div);
      el.classList.add('print-swapped');
    }
    for (const input of $$('input', sheet)) input.classList.toggle('print-empty', !input.value);
  });
  window.addEventListener('afterprint', () => {
    $$('.print-text', sheet).forEach((d) => d.remove());
    $$('.print-swapped', sheet).forEach((el) => el.classList.remove('print-swapped'));
    $$('.print-empty', sheet).forEach((el) => el.classList.remove('print-empty'));
  });

  // ---------- events ----------

  sheet.addEventListener('input', (e) => {
    if (e.target.matches('textarea')) autoGrow(e.target);
    if (e.target.name === 'clientAddress' || e.target.name === 'siteSameAsBilling') syncSiteAddress();
    calc();
    autosave();
  });
  sheet.addEventListener('change', (e) => {
    if (e.target.name === 'siteSameAsBilling') syncSiteAddress();
    calc();
    autosave();
  });

  $('#btn-add-item').addEventListener('click', () => {
    const tr = addRow();
    renumber();
    $('[data-f=service]', tr).focus();
    autosave();
  });
  $('#btn-clear-sig').addEventListener('click', () => sig.clear());
  $('#btn-new').addEventListener('click', newEstimate);
  $('#btn-save').addEventListener('click', saveEstimate);
  $('#btn-print').addEventListener('click', () => window.print());
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-open').addEventListener('click', () => {
    $('#saved-search').value = '';
    renderSavedList();
    $('#dlg-saved').showModal();
  });
  $('#saved-search').addEventListener('input', renderSavedList);
  $('#btn-export').addEventListener('click', exportAll);
  $('#file-import').addEventListener('change', (e) => {
    if (e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = '';
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveEstimate();
    }
  });

  // ---------- boot ----------

  const speciesList = $('#species-list');
  for (const s of SPECIES) speciesList.appendChild(new Option(s));

  renderLetterhead();
  sig.init();
  openEstimate(load(KEYS.draft, null) || blankEstimate());
})();
