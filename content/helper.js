'use strict';

// Page helper: shows PayPivot buttons on application-form fields it can fill from the profile,
// attaches stored résumés to upload fields, and offers "Fill with PayPivot" for the whole form.
// Registered on all sites only after the user turns it on in the popup (see background.js).
// It never fills anything without a click, never submits, and skips passwords and payment fields.

(() => {
  if (window.__payPivotHelper) return;
  window.__payPivotHelper = true;

  const { store } = globalThis.PayPivot;

  // ---------- what a field is ----------

  // Lower-case text without accents, with names like "first_name" or "firstName" split into words.
  function normalise(text) {
    return String(text || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[_\-[\].:*?()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const AUTOCOMPLETE = {
    'given-name': 'firstName', 'family-name': 'lastName', name: 'fullName', nickname: 'preferredName',
    email: 'email', tel: 'phone', 'tel-national': 'phone', 'address-level2': 'city',
    country: 'country', 'country-name': 'country', organization: 'company',
    'organization-title': 'title', url: 'website',
  };

  // Checked in order; the first match wins. Patterns work on normalise()d text.
  const RULES = [
    ['linkedin', /linked ?in/],
    ['github', /git ?hub/],
    ['website', /portfolio|personal (web ?)?site|\bwebsite\b|\bweb site\b|\bsite pessoal\b|\bsitio web\b|\bpagina web\b|\bblog\b|\bother (link|url)\b/],
    ['email', /e ?mail|\bcorreo\b/],
    ['phone', /phone|mobile|telefone|telefono|celular|whats ?app|\bcell\b/],
    ['salary', /salary|compensation expectation|expected (pay|compensation)|desired (pay|salary|compensation)|pretensao|expectativa (salarial|de salario)|salario|remuneracao/],
    ['notice', /notice period|aviso previo|periodo de aviso|preaviso|when can you start|earliest start|available to start|disponibilidade para inicio|start date/],
    ['workAuth', /authori[sz]ed to work|work authori[sz]ation|right to work|sponsorship|\bvisa\b|work permit|autorizacao de trabalho|permiso de trabajo/],
    ['experience', /years of (professional |relevant )?experience|anos de experiencia|years experience/],
    ['company', /current (company|employer)|\bemployer\b|company name|empresa atual|empresa actual|\bcompany\b|\bempresa\b/],
    ['title', /(current|job|present) (job )?title|current (role|position)|cargo atual|cargo actual|\bheadline\b/],
    ['lastName', /last name|surname|family name|sobrenome|apellido/],
    ['preferredName', /preferred (first )?name|nickname|nome social|como (prefere|gostaria de) ser chamad/],
    ['firstName', /first name|given name|forename|primeiro nome|^nome$|^nombre$/],
    ['fullName', /full name|your name|nome completo|nombre completo|^name$|^nome$|^nombre$|^name /],
    ['location', /\blocation\b|where are you (based|located)|localizacao|ubicacion|current city/],
    ['city', /\bcity\b|\bcidade\b|\bciudad\b|\btown\b/],
    ['country', /\bcountry\b|\bpais\b/],
  ];

  const RESUME = /resume|\bcv\b|curricul/;
  const NOT_RESUME = /cover letter|carta de (apresentacao|presentacion)|motivation letter|transcript|portfolio/;
  const NEVER = /password|senha|contrasena|card ?number|credit card|cvv|cvc|security code|iban|routing|account number|\bssn\b|social security|\bcpf\b|\bcnpj\b|\brg\b|passport/;
  const TEXT_TYPES = ['', 'text', 'email', 'tel', 'url', 'search', 'number'];

  /** Text describing a field: its labels, ARIA names, nearby label, name, id and placeholder. */
  function describe(field) {
    const parts = [];
    if (field.labels) for (const label of field.labels) parts.push(label.innerText);
    const labelledBy = field.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) parts.push(node.innerText);
      }
    }
    parts.push(field.getAttribute('aria-label'));
    if (parts.every((p) => !p || !p.trim())) {
      // No proper label: use the text of the surrounding container, as long as that container
      // holds no other form field (so another field's label is never borrowed).
      let node = field.parentElement;
      for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
        if (node.querySelectorAll('input:not([type="hidden"]), select, textarea').length > 1) break;
        const label = node.querySelector('label, legend, [class*="label" i], [class*="question" i]');
        const text = (label && !label.contains(field) ? label.innerText : node.innerText) || '';
        if (text.trim()) {
          parts.push(text.slice(0, 120));
          break;
        }
      }
    }
    return {
      label: normalise(parts.filter(Boolean).join(' ')).slice(0, 200),
      attrs: normalise([field.name, field.id, field.placeholder, field.title,
        field.getAttribute('data-automation-id'), field.getAttribute('data-qa')].filter(Boolean).join(' ')),
    };
  }

  const classified = new WeakMap();

  /** Returns the profile key a field should be filled with, 'resume', or '' for none. */
  function classify(field) {
    if (classified.has(field)) return classified.get(field);
    const kind = classifyUncached(field);
    // Labels can appear after the field does, so only remember fields that were recognised.
    if (kind) classified.set(field, kind);
    return kind;
  }

  function classifyUncached(field) {
    const type = (field.getAttribute('type') || '').toLowerCase();
    const auto = (field.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).pop();
    if (field.disabled || field.readOnly) return '';
    if (type === 'password' || /^cc-/.test(auto) || auto === 'new-password' || auto === 'current-password') return '';

    const { label, attrs } = describe(field);
    const text = `${label} ${attrs}`;
    if (NEVER.test(text)) return '';

    if (type === 'file') return RESUME.test(text) && !NOT_RESUME.test(label || attrs) ? 'resume' : '';
    if (field.tagName === 'INPUT' && !TEXT_TYPES.includes(type)) return '';

    if (AUTOCOMPLETE[auto]) return AUTOCOMPLETE[auto];
    if (type === 'email') return 'email';
    if (type === 'tel') return 'phone';
    // The visible label is more reliable than names and ids, so try it first.
    for (const source of [label, attrs]) {
      if (!source) continue;
      for (const [key, pattern] of RULES) if (pattern.test(source)) return key;
    }
    return '';
  }

  // ---------- values ----------

  let profile = {};
  let fileList = { items: [], defaultId: '' };

  function valueFor(key) {
    const p = profile;
    if (key === 'fullName') return [p.firstName, p.lastName].filter(Boolean).join(' ');
    if (key === 'location') return [p.city, p.country].filter(Boolean).join(', ');
    if (key === 'preferredName') return p.preferredName || p.firstName || '';
    return p[key] || '';
  }

  const isEmpty = (field) => (field.type === 'file' ? field.files.length === 0 : !String(field.value || '').trim());

  /** For a <select>, the option matching the value, or null. */
  function matchingOption(select, value) {
    const want = normalise(value);
    if (!want) return null;
    const options = [...select.options].filter((o) => !o.disabled && o.value !== '');
    return options.find((o) => normalise(o.text) === want || normalise(o.value) === want) ||
      options.find((o) => normalise(o.text).startsWith(want)) || null;
  }

  /** Whether a field can be filled right now (it's empty and the profile has a value for it). */
  function fillable(field, kind) {
    if (!kind || !isEmpty(field)) return false;
    if (kind === 'resume') return fileList.items.length > 0;
    const value = valueFor(kind);
    if (!value) return false;
    if (field.tagName === 'SELECT') return Boolean(matchingOption(field, value));
    if (field.type === 'number') return Number.isFinite(parseFloat(value));
    return true;
  }

  // ---------- filling ----------

  const setters = {
    INPUT: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set,
    TEXTAREA: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set,
    SELECT: Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set,
  };

  /** Sets a value the way typing does, so React, Vue and Angular forms notice it. */
  function setValue(field, value) {
    field.focus({ preventScroll: true });
    setters[field.tagName].call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('blur'));
  }

  function fillText(field, kind) {
    let value = valueFor(kind);
    if (field.tagName === 'SELECT') value = matchingOption(field, value).value;
    else if (field.type === 'number') value = String(parseFloat(value));
    const before = field.value;
    setValue(field, value);
    return () => setValue(field, before);
  }

  async function attachFile(field, id) {
    const reply = await chrome.runtime.sendMessage({ type: 'get-file', id });
    if (!reply || reply.error) throw new Error('file unavailable');
    const binary = atob(reply.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], reply.name, { type: reply.type }));
    field.files = transfer.files;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return () => {
      field.value = '';
      field.dispatchEvent(new Event('change', { bubbles: true }));
    };
  }

  // ---------- on-page buttons ----------

  const host = document.createElement('paypivot-helper');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      [hidden] { display: none !important; }
      .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
        font: 12px/1.4 system-ui, "Segoe UI", sans-serif; color: #1c1f24; }
      .chip { position: fixed; width: 18px; height: 18px; padding: 0; border: none; border-radius: 5px;
        background: #2C2C2A; cursor: pointer; pointer-events: auto; opacity: .85;
        box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: opacity .15s, transform .15s; }
      .chip::after { content: ""; position: absolute; right: 3px; bottom: 3px; width: 8px; height: 8px;
        border-radius: 2px; background: #5DCAA5; }
      .chip::before { content: ""; position: absolute; left: 3px; top: 3px; width: 12px; height: 3px;
        border-radius: 1px; background: #888780; box-shadow: 0 0 0 0 transparent; }
      .chip:hover, .chip:focus-visible { opacity: 1; transform: scale(1.1); outline: none; }
      .menu, .toast, .fill-all { pointer-events: auto; background: #fff; border: 1px solid #d5d9e0;
        border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.18); }
      .menu { position: fixed; min-width: 200px; max-width: 280px; padding: 4px; }
      .menu .title { padding: 4px 8px; color: #6b7280; font-size: 11px; }
      .menu button { display: block; width: 100%; padding: 6px 8px; border: none; border-radius: 5px;
        background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
      .menu button:hover, .menu button:focus-visible { background: #eaf1ff; outline: none; }
      .menu small { color: #6b7280; }
      .fill-all { position: fixed; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px;
        padding: 8px 12px 8px 8px; font: inherit; font-weight: 600; color: inherit; cursor: pointer; }
      .fill-all:hover { border-color: #0F6E56; }
      .fill-all .chip { position: relative; display: inline-block; pointer-events: none; opacity: 1; box-shadow: none; }
      .fill-all .close { margin-left: 4px; padding: 0 4px; border: none; background: none; color: #6b7280;
        font: inherit; font-size: 14px; cursor: pointer; }
      .toast { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 12px; align-items: center;
        padding: 8px 12px; }
      .toast button { border: none; background: none; color: #0F6E56; font: inherit; font-weight: 600;
        cursor: pointer; padding: 0; }
      @media (prefers-color-scheme: dark) {
        .layer { color: #e8eaed; }
        .menu, .toast, .fill-all { background: #1e2026; border-color: #3a3e48; }
        .menu button:hover, .menu button:focus-visible { background: #25324d; }
        .toast button { color: #5DCAA5; }
      }
    </style>
    <div class="layer"></div>`;
  const layer = root.querySelector('.layer');

  const chips = new Map(); // field -> chip button
  let tracked = [];        // [{ field, kind, anchor }]
  let menu = null;
  let fillAll = null;
  let toast = null;
  let dismissedFillAll = false;

  const LABELS = {
    firstName: 'first name', lastName: 'last name', fullName: 'name', preferredName: 'preferred name',
    email: 'email', phone: 'phone', city: 'city', country: 'country', location: 'location',
    linkedin: 'LinkedIn', github: 'GitHub', website: 'website', title: 'current title',
    company: 'current company', experience: 'years of experience', workAuth: 'work authorisation',
    notice: 'notice period', salary: 'salary expectation',
  };

  function makeChip(title) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.title = title;
    chip.setAttribute('aria-label', title);
    // Keep focus in the field the chip belongs to.
    chip.addEventListener('mousedown', (event) => event.preventDefault());
    return chip;
  }

  /** The element a chip sits on: the field, or for hidden file inputs, their visible drop zone. */
  function anchorFor(field) {
    if (isVisible(field)) return field;
    if (field.type !== 'file') return null;
    let node = field.parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= 60 && rect.height >= 20) return node;
    }
    return null;
  }

  function isVisible(node) {
    const rect = node.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const style = getComputedStyle(node);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  }

  function showResumeMenu(field, chip) {
    closeMenu();
    menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Attach from PayPivot';
    menu.append(title);
    for (const item of fileList.items) {
      const option = document.createElement('button');
      option.type = 'button';
      option.setAttribute('role', 'menuitem');
      option.textContent = item.label;
      const note = document.createElement('small');
      note.textContent = ` ${item.name}${item.id === fileList.defaultId ? ' · default' : ''}`;
      option.append(note);
      option.addEventListener('click', (event) => {
        if (!event.isTrusted) return;
        closeMenu();
        attachFile(field, item.id).then(scan, () => {});
      });
      menu.append(option);
    }
    const rect = chip.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.right - 200, innerWidth - 290))}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    layer.append(menu);
    const below = menu.getBoundingClientRect();
    if (below.bottom > innerHeight - 8) menu.style.top = `${rect.top - below.height - 4}px`;
    menu.querySelector('button').focus();
  }

  function closeMenu() {
    if (menu) menu.remove();
    menu = null;
  }

  function chipFor(field, kind) {
    let chip = chips.get(field);
    if (chip) return chip;
    chip = makeChip(kind === 'resume' ? 'Attach a résumé from PayPivot' : `Fill with your ${LABELS[kind]} (PayPivot)`);
    chip.addEventListener('click', (event) => {
      if (!event.isTrusted) return; // only real clicks, never ones a page script fakes
      if (kind === 'resume') {
        showResumeMenu(field, chip);
      } else {
        fillText(field, kind);
        scan();
      }
    });
    chips.set(field, chip);
    layer.append(chip);
    return chip;
  }

  function position() {
    for (const { field, anchor } of tracked) {
      const chip = chips.get(field);
      if (!chip) continue;
      const rect = anchor.getBoundingClientRect();
      const onScreen = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      chip.hidden = !onScreen;
      // Leave room for a <select>'s arrow.
      chip.style.left = `${rect.right - (field.tagName === 'SELECT' ? 44 : 24)}px`;
      chip.style.top = `${rect.top + Math.max(2, (Math.min(rect.height, 40) - 18) / 2)}px`;
    }
  }

  let positionQueued = false;
  function queuePosition() {
    if (positionQueued) return;
    positionQueued = true;
    requestAnimationFrame(() => {
      positionQueued = false;
      position();
    });
  }

  // ---------- fill all ----------

  async function fillEverything() {
    const undo = [];
    for (const { field, kind } of tracked) {
      if (!fillable(field, kind)) continue;
      if (kind === 'resume') {
        if (!fileList.defaultId) continue;
        try {
          undo.push(await attachFile(field, fileList.defaultId));
        } catch {
          /* skip a file that can't be read */
        }
      } else {
        undo.push(fillText(field, kind));
      }
    }
    scan();
    showToast(undo);
  }

  function showToast(undo) {
    if (toast) toast.remove();
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = undo.length ? `Filled ${undo.length} field${undo.length === 1 ? '' : 's'}` : 'Nothing left to fill';
    toast.append(text);
    if (undo.length) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Undo';
      button.addEventListener('click', (event) => {
        if (!event.isTrusted) return;
        for (const restore of undo.reverse()) restore();
        toast.remove();
        toast = null;
        scan();
      });
      toast.append(button);
    }
    layer.append(toast);
    if (fillAll) fillAll.hidden = true;
    setTimeout(() => {
      if (toast && toast.contains(text)) {
        toast.remove();
        toast = null;
        scan();
      }
    }, 8000);
  }

  function renderFillAll(count) {
    const show = count >= 3 && !dismissedFillAll && !toast;
    if (!show) {
      if (fillAll) fillAll.hidden = true;
      return;
    }
    if (!fillAll) {
      fillAll = document.createElement('div');
      fillAll.className = 'fill-all';
      fillAll.setAttribute('role', 'button');
      fillAll.tabIndex = 0;
      const icon = document.createElement('span');
      icon.className = 'chip';
      const label = document.createElement('span');
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'close';
      close.textContent = '×';
      close.title = 'Hide on this page';
      close.setAttribute('aria-label', 'Hide on this page');
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!event.isTrusted) return;
        dismissedFillAll = true;
        fillAll.hidden = true;
      });
      fillAll.append(icon, label, close);
      const go = (event) => {
        if (!event.isTrusted) return;
        fillEverything();
      };
      fillAll.addEventListener('click', go);
      fillAll.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') go(event);
      });
      layer.append(fillAll);
    }
    fillAll.hidden = false;
    fillAll.querySelector('span:not(.chip)').textContent = `Fill ${count} fields with PayPivot`;
  }

  // ---------- scanning ----------

  function scan() {
    const next = [];
    for (const field of document.querySelectorAll('input, textarea, select')) {
      const kind = classify(field);
      if (!kind || !fillable(field, kind)) continue;
      const anchor = anchorFor(field);
      if (anchor) next.push({ field, kind, anchor });
    }

    const keep = new Set(next.map((t) => t.field));
    for (const [field, chip] of chips) {
      if (!keep.has(field)) {
        chip.remove();
        chips.delete(field);
      }
    }
    tracked = next;
    for (const { field, kind } of tracked) chipFor(field, kind);
    position();
    renderFillAll(tracked.length);
    if (!host.isConnected && (tracked.length || toast)) document.documentElement.append(host);
  }

  // At most one scan every 400ms, even on pages that change all the time.
  let scanTimer = 0;
  function queueScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 400);
  }

  function start() {
    scan();
    new MutationObserver((records) => {
      if (records.every((r) => host.contains(r.target) || r.target === host)) return;
      queueScan();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'disabled', 'readonly', 'style', 'class', 'hidden'] });
    document.addEventListener('input', queueScan, true);
    addEventListener('scroll', queuePosition, true);
    addEventListener('resize', queuePosition);
    document.addEventListener('mousedown', (event) => {
      if (menu && !event.composedPath().includes(menu)) closeMenu();
    }, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    }, true);
  }

  async function load() {
    profile = (await store.get('profile')) || {};
    const saved = await store.get('files');
    fileList = saved && Array.isArray(saved.items) ? saved : { items: [], defaultId: '' };
    if (!fileList.items.some((f) => f.id === fileList.defaultId)) fileList.defaultId = (fileList.items[0] || {}).id || '';
  }

  store.onChange('profile', () => load().then(scan));
  store.onChange('files', () => load().then(scan));

  load().then(start);
})();
