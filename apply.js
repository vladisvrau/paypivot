'use strict';

// The Apply tab: profile, snippets, résumés, backup, and the page helper switch.
// Uses el(), $(), toggleGroup() and the storage modules from popup.js and shared/.

(function () {
  const { store, files } = PayPivot;
  const hasChrome = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

  // Keys are shared with the page helper (content/helper.js).
  const PROFILE_FIELDS = [
    ['About you', [
      ['firstName', 'First name', 'given-name'],
      ['lastName', 'Last name', 'family-name'],
      ['preferredName', 'Preferred name', 'nickname'],
      ['email', 'Email', 'email', 'email'],
      ['phone', 'Phone', 'tel', 'tel'],
      ['city', 'City', 'address-level2'],
      ['country', 'Country', 'country-name'],
    ]],
    ['Links', [
      ['linkedin', 'LinkedIn', 'url', 'url'],
      ['github', 'GitHub', 'url', 'url'],
      ['website', 'Portfolio / website', 'url', 'url'],
    ]],
    ['Work', [
      ['title', 'Current title', 'organization-title'],
      ['company', 'Current company', 'organization'],
      ['experience', 'Years of experience', 'off'],
      ['workAuth', 'Work authorisation', 'off'],
      ['notice', 'Notice period', 'off'],
      ['salary', 'Salary expectation', 'off'],
    ]],
  ];

  const PLACEHOLDERS = {
    linkedin: 'https://linkedin.com/in/…',
    github: 'https://github.com/…',
    website: 'https://…',
    workAuth: 'EU citizen, no sponsorship needed',
    notice: '30 days',
    salary: '€90,000 a year',
  };

  let profile = {};
  let snippets = [];

  // ---------- small helpers ----------

  function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function copyButton(getText, what) {
    const button = el('button', { type: 'button', className: 'copy', textContent: '⧉', title: `Copy ${what}` });
    button.setAttribute('aria-label', `Copy ${what}`);
    button.addEventListener('click', async () => {
      const text = getText();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = '✓';
        button.classList.add('done');
        button.title = 'Copied';
        setTimeout(() => {
          button.textContent = '⧉';
          button.classList.remove('done');
          button.title = `Copy ${what}`;
        }, 1200);
      } catch {
        button.title = "Couldn't copy";
      }
    });
    return button;
  }

  const formatSize = (bytes) => (bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

  /** Keeps the popup's size in step when a group's content changes height. */
  function resizing(mutate) {
    const old = bodySize();
    mutate();
    animateBody(old);
  }

  // ---------- profile ----------

  const saveProfile = debounce(() => store.set('profile', profile));

  // Which fields stay visible when the profile is collapsed. Kept with the other popup
  // preferences in the "ui" area (popup.js owns the `ui` object).
  const DEFAULT_PINNED = ['email', 'phone', 'linkedin', 'github', 'website'];

  function profileView() {
    if (!ui.profile || !Array.isArray(ui.profile.pinned)) ui.profile = { pinned: [...DEFAULT_PINNED], collapsed: false };
    return ui.profile;
  }

  function saveView() {
    store.set('ui', ui);
  }

  function renderProfile() {
    const view = profileView();
    const container = $('profileFields');
    container.replaceChildren();

    for (const [section, fields] of PROFILE_FIELDS) {
      const shown = view.collapsed ? fields.filter(([key]) => view.pinned.includes(key)) : fields;
      if (shown.length === 0) continue;
      const heading = el('div', { className: 'section', textContent: section });
      heading.dataset.key = `section-${section}`;
      container.append(heading);
      for (const field of shown) container.append(profileRow(field, view));
    }

    if (view.collapsed && container.children.length === 0) {
      const hint = el('p', { className: 'hint', textContent: 'Pin the fields you use most (📌) to keep them here when collapsed.' });
      hint.dataset.key = 'profile-empty';
      container.append(hint);
    }

    const button = $('profileCollapse');
    const hidden = PROFILE_FIELDS.flatMap(([, fields]) => fields).length - view.pinned.length;
    button.textContent = view.collapsed ? `Show all${hidden > 0 ? ` (${hidden} more)` : ''}` : 'Collapse';
    button.title = view.collapsed ? 'Show every profile field' : 'Show only pinned fields';
    button.setAttribute('aria-pressed', String(view.collapsed));
  }

  function profileRow([key, label, autocomplete, type], view) {
    const id = `p-${key}`;
    const pinned = view.pinned.includes(key);
    const pin = el('button', {
      type: 'button', className: 'pin', textContent: '📌',
      title: pinned ? `Unpin ${label.toLowerCase()}` : `Pin ${label.toLowerCase()} (keeps it when collapsed)`,
    });
    pin.setAttribute('aria-pressed', String(pinned));
    pin.addEventListener('click', () => {
      view.pinned = pinned ? view.pinned.filter((k) => k !== key) : [...view.pinned, key];
      saveView();
      animateProfile();
    });

    const input = el('input', {
      id, type: type || 'text', value: profile[key] || '', autocomplete: autocomplete || 'off',
      placeholder: PLACEHOLDERS[key] || '', spellcheck: false,
    });
    input.addEventListener('input', () => {
      profile[key] = input.value.trim();
      saveProfile();
    });

    const row = el('div', { className: 'field-row' },
      pin,
      el('label', { htmlFor: id, textContent: label }),
      input,
      copyButton(() => input.value.trim(), label.toLowerCase()));
    row.dataset.key = `field-${key}`;
    return row;
  }

  /**
   * Re-renders the profile with the same motion as the pay table: rows that stay glide to their
   * new place, new rows fade in, removed rows fade out where they were, and the popup resizes.
   */
  function animateProfile() {
    const container = $('profileFields');
    if (reducedMotion.matches) {
      renderProfile();
      return;
    }
    const before = new Map();
    for (const node of container.children) {
      if (node.dataset.key) before.set(node.dataset.key, { node, rect: node.getBoundingClientRect() });
    }
    const old = bodySize();
    const box = container.getBoundingClientRect();

    renderProfile();

    for (const node of container.children) {
      const was = before.get(node.dataset.key);
      if (!was) {
        node.animate({ opacity: [0, 1], transform: ['translateY(-8px)', 'none'] }, ANIM);
        continue;
      }
      before.delete(node.dataset.key);
      const dy = was.rect.top - node.getBoundingClientRect().top;
      if (dy) node.animate({ transform: [`translateY(${dy}px)`, 'none'] }, ANIM);
    }

    // Removed rows stay as ghosts at their old spot while they fade out.
    for (const { node, rect } of before.values()) {
      node.removeAttribute('data-key');
      node.inert = true;
      Object.assign(node.style, {
        position: 'absolute', left: '0', right: '0',
        top: `${rect.top - box.top}px`, height: `${rect.height}px`,
      });
      container.append(node);
      node.animate({ opacity: [1, 0], transform: ['none', 'translateY(-8px)'] }, ANIM)
        .finished.then(() => node.remove(), () => node.remove());
    }

    animateBody(old);
  }

  // ---------- snippets ----------

  const saveSnippets = debounce(() => store.set('snippets', snippets));

  function renderSnippets() {
    const list = $('snippetList');
    list.replaceChildren(...snippets.map(snippetCard));
  }

  function snippetCard(snippet) {
    const title = el('input', { type: 'text', value: snippet.title, placeholder: 'Title', spellcheck: false });
    title.setAttribute('aria-label', 'Snippet title');
    const body = el('textarea', { value: snippet.body, placeholder: 'Text to reuse', rows: 3 });
    body.setAttribute('aria-label', 'Snippet text');
    title.addEventListener('input', () => { snippet.title = title.value; saveSnippets(); });
    body.addEventListener('input', () => { snippet.body = body.value; saveSnippets(); });

    const remove = el('button', { type: 'button', className: 'icon-button', textContent: '×', title: 'Delete snippet' });
    remove.setAttribute('aria-label', 'Delete snippet');
    remove.addEventListener('click', () => {
      resizing(() => {
        snippets = snippets.filter((s) => s !== snippet);
        renderSnippets();
      });
      store.set('snippets', snippets);
    });

    const handle = el('button', { type: 'button', className: 'handle', textContent: '⠿', title: 'Drag to reorder' });
    handle.setAttribute('aria-label', 'Drag to reorder');
    const card = el('div', { className: 'snippet' },
      el('div', { className: 'snippet-top' }, handle, title, copyButton(() => body.value, 'snippet'), remove),
      body);
    makeDraggable(card, handle, snippet);
    return card;
  }

  function makeDraggable(card, handle, snippet) {
    handle.addEventListener('pointerdown', () => { card.draggable = true; });
    handle.addEventListener('pointerup', () => { card.draggable = false; });
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', snippet.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.draggable = false;
      card.classList.remove('dragging');
      for (const c of document.querySelectorAll('.snippet')) c.classList.remove('drop-before', 'drop-after');
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      const after = event.offsetY > card.offsetHeight / 2;
      card.classList.toggle('drop-after', after);
      card.classList.toggle('drop-before', !after);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      const id = event.dataTransfer.getData('text/plain');
      const moving = snippets.find((s) => s.id === id);
      if (!moving || moving === snippet) return;
      const after = card.classList.contains('drop-after');
      snippets = snippets.filter((s) => s !== moving);
      snippets.splice(snippets.indexOf(snippet) + (after ? 1 : 0), 0, moving);
      renderSnippets();
      store.set('snippets', snippets);
    });
  }

  function addSnippet() {
    const snippet = { id: crypto.randomUUID(), title: '', body: '' };
    resizing(() => {
      snippets.push(snippet);
      renderSnippets();
    });
    store.set('snippets', snippets);
    const cards = $('snippetList').children;
    cards[cards.length - 1].querySelector('input').focus();
  }

  // ---------- résumés ----------

  let replacingId = '';

  async function renderFiles() {
    const { items, defaultId } = await files.list();
    const list = $('fileList');
    list.replaceChildren(...items.map((item) => fileRow(item, item.id === defaultId)));
  }

  function fileRow(item, isDefault) {
    const radio = el('input', { type: 'radio', name: 'defaultFile', checked: isDefault, title: 'Use by default' });
    radio.setAttribute('aria-label', `Use ${item.label} by default`);
    radio.addEventListener('change', async () => {
      await files.setDefault(item.id);
      renderFiles();
    });

    const label = el('input', { type: 'text', value: item.label, spellcheck: false });
    label.setAttribute('aria-label', 'File label');
    const saveLabel = debounce(() => files.update(item.id, { label: label.value.trim() || item.name }));
    label.addEventListener('input', saveLabel);

    const download = el('button', { type: 'button', className: 'icon-button', textContent: '↓', title: 'Download' });
    download.setAttribute('aria-label', `Download ${item.name}`);
    download.addEventListener('click', async () => {
      const blob = await files.getBlob(item.id);
      if (blob) saveAs(blob, item.name);
    });

    const replace = el('button', { type: 'button', className: 'icon-button', textContent: '↻', title: 'Replace with another file' });
    replace.setAttribute('aria-label', `Replace ${item.name}`);
    replace.addEventListener('click', () => {
      replacingId = item.id;
      $('fileInput').multiple = false;
      $('fileInput').click();
    });

    const remove = el('button', { type: 'button', className: 'icon-button', textContent: '×', title: 'Delete' });
    remove.setAttribute('aria-label', `Delete ${item.name}`);
    remove.addEventListener('click', async () => {
      await files.remove(item.id);
      const old = bodySize();
      await renderFiles();
      animateBody(old);
    });

    const added = new Date(item.addedAt).toLocaleDateString();
    return el('div', { className: `file${isDefault ? ' default' : ''}` },
      radio, label, el('span', { className: 'buttons' }, download, replace, remove),
      el('div', { className: 'meta', textContent: `${item.name} · ${formatSize(item.size)} · ${added}${isDefault ? ' · default' : ''}` }));
  }

  async function onFilesChosen() {
    const input = $('fileInput');
    const chosen = [...input.files];
    input.value = '';
    input.multiple = true;
    const hint = $('fileHint');
    const problems = chosen.map(files.problemWith).filter(Boolean);
    const ok = chosen.filter((f) => !files.problemWith(f));

    if (replacingId && ok[0]) await files.replace(replacingId, ok[0]);
    else for (const file of ok) await files.add(file);
    replacingId = '';

    const old = bodySize();
    hint.classList.toggle('error', problems.length > 0);
    hint.textContent = problems.length
      ? problems.join(' ')
      : 'PDF, DOC or DOCX, up to 5 MB each. The selected one is used by default.';
    await renderFiles();
    animateBody(old);
  }

  function saveAs(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---------- backup ----------

  async function exportData() {
    const status = $('backupStatus');
    status.textContent = 'Preparing…';
    const list = await files.list();
    const stored = [];
    for (const item of list.items) {
      const blob = await files.getBlob(item.id);
      if (blob) stored.push({ ...item, data: await files.blobToBase64(blob) });
    }
    const backup = {
      app: 'PayPivot',
      version: 1,
      exportedAt: new Date().toISOString(),
      calculator: (await store.get('calculator')) || null,
      profile: (await store.get('profile')) || {},
      snippets: (await store.get('snippets')) || [],
      files: { defaultId: list.defaultId, items: stored },
    };
    const day = new Date().toISOString().slice(0, 10);
    saveAs(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `paypivot-backup-${day}.json`);
    status.textContent = `Exported ${stored.length} file${stored.length === 1 ? '' : 's'}, your profile, snippets and settings.`;
  }

  let pendingImport = null;

  async function onImportChosen() {
    const input = $('importInput');
    const file = input.files[0];
    input.value = '';
    const status = $('backupStatus');
    status.classList.remove('error');
    pendingImport = null;
    $('importConfirm').hidden = true;
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!backup || backup.app !== 'PayPivot' || backup.version !== 1) throw new Error('not a backup');
      pendingImport = backup;
      const count = (backup.files && backup.files.items || []).length;
      status.textContent = `Backup from ${String(backup.exportedAt).slice(0, 10)} with ${count} file${count === 1 ? '' : 's'}. ` +
        'Importing replaces everything stored now.';
      resizing(() => { $('importConfirm').hidden = false; });
    } catch {
      status.classList.add('error');
      status.textContent = "That file isn't a PayPivot backup.";
    }
  }

  async function confirmImport() {
    const backup = pendingImport;
    if (!backup) return;
    const status = $('backupStatus');
    status.textContent = 'Importing…';
    await files.clearBlobs();
    const items = [];
    for (const { data, ...item } of backup.files.items || []) {
      const blob = new Blob([files.base64ToBytes(data)], { type: item.type });
      await files.putBlob(item.id, blob);
      items.push(item);
    }
    await files.saveList({ items, defaultId: backup.files.defaultId });
    await store.set('profile', backup.profile || {});
    await store.set('snippets', Array.isArray(backup.snippets) ? backup.snippets : []);
    if (backup.calculator) await store.set('calculator', backup.calculator);
    location.reload();
  }

  // ---------- page helper switch ----------

  const ALL_SITES = { origins: ['<all_urls>'] };

  function setHelperHint(on) {
    $('helperHint').textContent = !hasChrome
      ? 'Available when PayPivot runs as an extension.'
      : on
        ? 'On. Application forms show PayPivot buttons on fields it can fill. Reload pages that were already open.'
        : 'Adds buttons that fill application forms with your profile and résumé. Chrome will ask for access to all sites.';
  }

  async function wireHelper() {
    const toggle = $('helperToggle');
    if (!hasChrome) {
      toggle.disabled = true;
      setHelperHint(false);
      return;
    }
    toggle.checked = await chrome.permissions.contains(ALL_SITES);
    setHelperHint(toggle.checked);
    toggle.addEventListener('change', async () => {
      // Must stay inside the click for Chrome to show its permission prompt.
      const on = toggle.checked
        ? await chrome.permissions.request(ALL_SITES).catch(() => false)
        : !(await chrome.permissions.remove(ALL_SITES).catch(() => false));
      toggle.checked = on;
      setHelperHint(on);
      chrome.runtime.sendMessage({ type: 'helper-changed' }).catch(() => {});
    });
  }

  // ---------- start ----------

  async function init() {
    await popupReady; // popup.js loads the saved `ui` preferences first
    profile = (await store.get('profile')) || {};
    snippets = (await store.get('snippets')) || [];
    renderProfile();
    renderSnippets();
    await renderFiles();
    wireHelper();

    $('profileCollapse').addEventListener('click', (event) => {
      event.preventDefault();  // don't open or close the group
      event.stopPropagation();
      const view = profileView();
      view.collapsed = !view.collapsed;
      saveView();
      animateProfile();
    });
    $('addSnippet').addEventListener('click', addSnippet);
    $('uploadFile').addEventListener('click', () => {
      replacingId = '';
      $('fileInput').click();
    });
    $('fileInput').addEventListener('change', onFilesChosen);
    $('exportData').addEventListener('click', exportData);
    $('importData').addEventListener('click', () => $('importInput').click());
    $('importInput').addEventListener('change', onImportChosen);
    $('importConfirm').addEventListener('click', confirmImport);
    $('openTab').addEventListener('click', (event) => {
      event.preventDefault();
      const url = 'popup.html?tab=apply&page=1';
      if (hasChrome && chrome.tabs) {
        chrome.tabs.create({ url: chrome.runtime.getURL(url) });
        window.close();
      } else {
        open(url, '_blank');
      }
    });
    if (document.body.classList.contains('page')) $('openTab').hidden = true;
  }

  init();
})();
