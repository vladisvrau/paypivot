'use strict';

// Background worker: right-click menus, figures sent from pages, the page helper's registration,
// and handing stored files to the page helper.

importScripts('shared/storage.js', 'shared/parse.js', 'shared/files.js');

const { store, files, parseSalary } = PayPivot;

const MENU = {
  convert: 'convert',
  snippets: 'snippets',
  noSnippets: 'snippets-empty',
};
const HELPER_SCRIPT_ID = 'paypivot-helper';
const ALL_SITES = { origins: ['<all_urls>'] };

// ---------- menus ----------

let menuQueue = Promise.resolve();

/** Rebuilds the right-click menus. Calls are queued so rebuilds never overlap. */
function buildMenus() {
  menuQueue = menuQueue.then(async () => {
    await chrome.contextMenus.removeAll();
    const create = (props) => new Promise((resolve) => {
      chrome.contextMenus.create(props, () => {
        void chrome.runtime.lastError; // a duplicate id after a race is harmless
        resolve();
      });
    });

    await create({ id: MENU.convert, title: 'Convert “%s” with PayPivot', contexts: ['selection'] });
    await create({ id: MENU.snippets, title: 'Insert snippet', contexts: ['editable'] });
    const snippets = ((await store.get('snippets')) || []).filter((s) => s.body && s.body.trim());
    if (snippets.length === 0) {
      await create({
        id: MENU.noSnippets, parentId: MENU.snippets, enabled: false, contexts: ['editable'],
        title: 'No snippets yet — add them in PayPivot',
      });
    }
    for (const snippet of snippets) {
      const title = (snippet.title || snippet.body).trim().replace(/\s+/g, ' ');
      await create({
        id: `snippet:${snippet.id}`, parentId: MENU.snippets, contexts: ['editable'],
        title: title.length > 50 ? `${title.slice(0, 47)}…` : title,
      });
    }
  }).catch(() => {});
  return menuQueue;
}

store.onChange('snippets', buildMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU.convert) convertSelection(info, tab);
  else if (String(info.menuItemId).startsWith('snippet:')) insertSnippet(info, tab, String(info.menuItemId).slice(8));
});

// ---------- right-click → Convert with PayPivot ----------

function convertSelection(info, tab) {
  // Open the popup straight away, while Chrome still treats this as the user's click.
  // The popup picks the figure up when it arrives in storage.
  const opened = typeof chrome.action.openPopup === 'function'
    ? chrome.action.openPopup().then(() => true, () => false)
    : Promise.resolve(false);

  (async () => {
    const lang = await pageLanguage(tab, info.frameId);
    const result = parseSalary(info.selectionText, lang);
    await store.set('pending', { text: info.selectionText, result, at: Date.now() });
    if (!(await opened)) {
      // Chrome wouldn't open the popup: flag the icon so the figure is applied on the next click.
      chrome.action.setBadgeBackgroundColor({ color: result ? '#0F6E56' : '#A32D2D' });
      chrome.action.setBadgeText({ text: result ? '1' : '?' });
    }
  })();
}

/** The page's language (e.g. "en-CA"), used to tell which dollar a bare "$" means. */
async function pageLanguage(tab, frameId) {
  if (!tab || tab.id === undefined) return '';
  try {
    const [first] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frameId || 0] },
      func: () => document.documentElement.lang || navigator.language,
    });
    return (first && first.result) || '';
  } catch {
    return ''; // pages the extension can't read (e.g. the Web Store)
  }
}

// ---------- right-click → Insert snippet ----------

async function insertSnippet(info, tab, id) {
  const snippet = ((await store.get('snippets')) || []).find((s) => s.id === id);
  if (!snippet || !tab) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId || 0] },
      func: insertIntoFocusedField,
      args: [snippet.body],
    });
  } catch {
    /* the field is in a frame the extension can't reach */
  }
}

/** Runs in the page: inserts text at the cursor of the focused field. */
function insertIntoFocusedField(text) {
  let field = document.activeElement;
  while (field && field.shadowRoot && field.shadowRoot.activeElement) field = field.shadowRoot.activeElement;
  if (!field) return false;
  if (field.isContentEditable) {
    document.execCommand('insertText', false, text);
    return true;
  }
  if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.setRangeText(text, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

// ---------- page helper ----------

/** Registers the page helper when all-sites access is granted, and removes it when it isn't. */
async function syncHelper() {
  const granted = await chrome.permissions.contains(ALL_SITES);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [HELPER_SCRIPT_ID] });
  if (granted && registered.length === 0) {
    await chrome.scripting.registerContentScripts([{
      id: HELPER_SCRIPT_ID,
      matches: ['<all_urls>'],
      js: ['shared/storage.js', 'content/helper.js'],
      allFrames: true,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }]);
  } else if (!granted && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [HELPER_SCRIPT_ID] });
  }
}

chrome.permissions.onAdded.addListener(() => syncHelper().catch(() => {}));
chrome.permissions.onRemoved.addListener(() => syncHelper().catch(() => {}));

// ---------- messages ----------

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'helper-changed') {
    syncHelper().then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  }

  if (message.type === 'get-file') {
    // The page helper attaches a stored résumé; pages can't read the extension's database.
    (async () => {
      const { items } = await files.list();
      const item = items.find((f) => f.id === message.id);
      const blob = item && (await files.getBlob(item.id));
      if (!blob) return reply({ error: 'missing' });
      reply({ name: item.name, type: item.type, data: await files.blobToBase64(blob) });
    })().catch(() => reply({ error: 'failed' }));
    return true;
  }

  return false;
});

// ---------- start ----------

function setUp() {
  buildMenus();
  syncHelper().catch(() => {});
}

chrome.runtime.onInstalled.addListener(setUp);
chrome.runtime.onStartup.addListener(setUp);
