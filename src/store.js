// Local storage of works in IndexedDB. Nothing is uploaded anywhere.
const DB_NAME = 'gesture-pottery';
const STORE = 'works';
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no-indexeddb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export const newId = () =>
  (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function listWorks() {
  try {
    const all = (await run('readonly', (s) => s.getAll())) || [];
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    console.warn('[store] listWorks failed', e);
    return [];
  }
}
export const getWork = (id) => run('readonly', (s) => s.get(id));
export const putWork = (w) => run('readwrite', (s) => s.put(w));
export const deleteWork = (id) => run('readwrite', (s) => s.delete(id));

// ---- export / import (JSON) ------------------------------------------------------------------
function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export async function exportAll() {
  const works = await listWorks();
  const out = works.map((w) => {
    const r = w.radii instanceof Float32Array ? w.radii : Float32Array.from(w.radii);
    const o = {
      id: w.id, name: w.name, createdAt: w.createdAt, updatedAt: w.updatedAt, v: w.v || 1, rows: w.rows, segs: w.segs,
      thick: w.thick, radii: toB64(new Uint8Array(r.buffer, r.byteOffset, r.byteLength)), thumb: w.thumb
    };
    if (w.v >= 2) Object.assign(o, { paint: w.paint, innerColor: w.innerColor, finish: w.finish, ornaments: w.ornaments });
    else o.colors = toB64(w.colors);
    return o;
  });
  return JSON.stringify({ app: 'gesture-pottery', version: 2, works: out });
}

export async function importAll(text) {
  const obj = JSON.parse(text);
  if (!obj || obj.app !== 'gesture-pottery' || !Array.isArray(obj.works)) throw new Error('bad-file');
  let n = 0;
  for (const w of obj.works) {
    const rb = fromB64(w.radii);
    const radii = Float32Array.from(new Float32Array(rb.buffer, rb.byteOffset, rb.byteLength / 4));
    const rows = w.rows | 0;
    if (rows < 8 || rows > 66 || radii.length !== rows * 64) continue;
    const rec = {
      id: String(w.id || newId()), name: String(w.name || '').slice(0, 24), createdAt: +w.createdAt || Date.now(),
      updatedAt: +w.updatedAt || Date.now(), rows, segs: 64, thick: +w.thick || 0.07, radii, thumb: String(w.thumb || '')
    };
    if ((w.v | 0) >= 2 && w.paint) {
      Object.assign(rec, { v: 2, paint: String(w.paint), innerColor: String(w.innerColor || '#d9b99b'), finish: w.finish || { id: 'glaze', color: '#8fb8ae' }, ornaments: Array.isArray(w.ornaments) ? w.ornaments : [] });
    } else if (w.colors) {
      const colors = fromB64(w.colors);
      if (rows !== 49 || colors.length !== 49 * 64 * 3) continue;
      Object.assign(rec, { v: 1, colors });
    } else continue;
    await putWork(rec);
    n++;
  }
  return n;
}
