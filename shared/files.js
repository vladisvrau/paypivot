'use strict';

// Stored résumé files. The list (names, labels, default) lives in the "files" storage area so the
// page helper can read it; the contents live here, in the extension's IndexedDB.
// Loaded by the popup and the background worker. Pages can't reach this database, so the page
// helper asks the background worker for a file's contents.

(function (root) {
  const PayPivot = (root.PayPivot = root.PayPivot || {});

  const DB_NAME = 'paypivot';
  const STORE = 'files';
  const MAX_BYTES = 5 * 1024 * 1024;
  const EXTENSIONS = ['pdf', 'doc', 'docx'];

  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request && request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const putBlob = (id, blob) => run('readwrite', (store) => store.put(blob, id));
  const getBlob = (id) => run('readonly', (store) => store.get(id));
  const deleteBlob = (id) => run('readwrite', (store) => store.delete(id));
  const clearBlobs = () => run('readwrite', (store) => store.clear());

  /** The saved list: { items: [{ id, label, name, type, size, addedAt }], defaultId }. */
  async function list() {
    const saved = await PayPivot.store.get('files');
    const items = saved && Array.isArray(saved.items) ? saved.items : [];
    const defaultId = items.some((f) => f.id === (saved && saved.defaultId)) ? saved.defaultId : (items[0] || {}).id || '';
    return { items, defaultId };
  }

  const saveList = (value) => PayPivot.store.set('files', value);

  /** Returns an error message for a file that can't be stored, or '' if it's fine. */
  function problemWith(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!EXTENSIONS.includes(ext)) return `${file.name} isn't a PDF, DOC or DOCX file.`;
    if (file.size > MAX_BYTES) return `${file.name} is larger than 5 MB.`;
    return '';
  }

  async function add(file) {
    const id = crypto.randomUUID();
    await putBlob(id, file);
    const current = await list();
    const item = {
      id,
      label: file.name.replace(/\.[^.]+$/, ''),
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      addedAt: Date.now(),
    };
    current.items.push(item);
    if (!current.defaultId) current.defaultId = id;
    await saveList(current);
    return item;
  }

  async function replace(id, file) {
    await putBlob(id, file);
    const current = await list();
    const item = current.items.find((f) => f.id === id);
    if (item) Object.assign(item, { name: file.name, type: file.type || item.type, size: file.size, addedAt: Date.now() });
    await saveList(current);
  }

  async function update(id, changes) {
    const current = await list();
    const item = current.items.find((f) => f.id === id);
    if (item) Object.assign(item, changes);
    await saveList(current);
  }

  async function setDefault(id) {
    const current = await list();
    current.defaultId = id;
    await saveList(current);
  }

  async function remove(id) {
    await deleteBlob(id);
    const current = await list();
    current.items = current.items.filter((f) => f.id !== id);
    if (current.defaultId === id) current.defaultId = (current.items[0] || {}).id || '';
    await saveList(current);
  }

  // ---------- base64, for messages and backups ----------

  async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  PayPivot.files = {
    list, add, replace, update, setDefault, remove, getBlob, putBlob, clearBlobs, saveList,
    problemWith, blobToBase64, base64ToBytes, MAX_BYTES,
  };
})(globalThis);
