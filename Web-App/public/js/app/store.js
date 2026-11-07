// Saves attempts in IndexedDB. If storage is blocked, the app still works for this session.

const DB = 'ai-challenges';
const STORE = 'attempts';
const memory = new Map();
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run(db, mode, action) {
  return new Promise((resolve) => {
    try {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function saveAttempt(attempt) {
  const copy = JSON.parse(JSON.stringify(attempt));
  memory.set(copy.id, copy);
  const db = await open();
  if (db) await run(db, 'readwrite', (store) => store.put(copy));
}

export async function listAttempts() {
  const db = await open();
  const saved = db ? await run(db, 'readonly', (store) => store.getAll()) : null;
  const byId = new Map((saved ?? []).map((a) => [a.id, a]));
  for (const [id, attempt] of memory) byId.set(id, attempt);
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function deleteAttempt(id) {
  memory.delete(id);
  const db = await open();
  if (db) await run(db, 'readwrite', (store) => store.delete(id));
}
