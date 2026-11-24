'use strict';

// One place for every read and write of saved data.
// Loaded by the popup, the background worker and the page helper.
//
// Everything is stored on this device today. Each area says whether it could sync; adding sync
// means returning chrome.storage.sync from backendFor() for those areas behind a setting.
// Files can't sync (Chrome's sync storage holds about 100 KB in total), so their contents live
// in IndexedDB (see files.js) and only their list is kept here.

(function (root) {
  const PayPivot = (root.PayPivot = root.PayPivot || {});

  const AREAS = {
    calculator: { key: 'state2', syncable: true },
    profile: { key: 'profile', syncable: true },
    snippets: { key: 'snippets', syncable: true },
    files: { key: 'files', syncable: false },   // list of stored files; contents in IndexedDB
    helper: { key: 'helper', syncable: false }, // page helper preferences
    ui: { key: 'ui', syncable: false },         // last open tab
    pending: { key: 'pending', syncable: false }, // a figure sent from a page, waiting for the popup
  };

  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  function keyOf(area) {
    const def = AREAS[area];
    if (!def) throw new Error(`Unknown storage area: ${area}`);
    return def.key;
  }

  // eslint-disable-next-line no-unused-vars
  function backendFor(area) {
    return chrome.storage.local;
  }

  async function get(area) {
    const key = keyOf(area);
    try {
      if (hasChrome) return (await backendFor(area).get(key))[key];
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return undefined;
    }
  }

  async function set(area, value) {
    const key = keyOf(area);
    try {
      if (hasChrome) await backendFor(area).set({ [key]: value });
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: things still work, they just won't be remembered */
    }
  }

  async function remove(area) {
    const key = keyOf(area);
    try {
      if (hasChrome) await backendFor(area).remove(key);
      else localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  }

  /** Calls `callback(newValue)` whenever the area changes, from any part of the extension. */
  function onChange(area, callback) {
    const key = keyOf(area);
    if (hasChrome) {
      chrome.storage.onChanged.addListener((changes) => {
        if (key in changes) callback(changes[key].newValue);
      });
    } else if (typeof addEventListener === 'function') {
      addEventListener('storage', (event) => {
        if (event.key === key) callback(event.newValue === null ? undefined : JSON.parse(event.newValue));
      });
    }
  }

  PayPivot.store = { get, set, remove, onChange, AREAS };
})(globalThis);
