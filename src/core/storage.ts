// A small IndexedDB store for custom parts and the saved board.
// Data stays in this browser only. A private window or blocked storage makes every call fail;
// the callers catch that, and the app still works without saving.

const DB_NAME = 'ramble';
const DB_VERSION = 1;

export type StoreName = 'parts' | 'boards';

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      // Parts use their id as the key. Boards have a name as the key, for example "current".
      request.result.createObjectStore('parts', { keyPath: 'id' });
      request.result.createObjectStore('boards');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const storage = {
  all: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll()),
  get: <T>(store: StoreName, key: string) =>
    run<T | undefined>(store, 'readonly', (s) => s.get(key)),
  put: (store: StoreName, value: unknown, key?: string) =>
    run(store, 'readwrite', (s) => s.put(value, key)),
  delete: (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key)),
};
