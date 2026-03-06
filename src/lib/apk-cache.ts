/**
 * APK Cache - IndexedDB-based cache for parsed APK data
 * Stores parsed results so re-uploading the same APK skips parsing.
 */

const DB_NAME = 'apkman-cache';
const DB_VERSION = 1;
const STORE_NAME = 'apk-files';

interface CachedApk {
  hash: string;
  fileName: string;
  fileSize: number;
  timestamp: number;
  manifestXml: string;
  manifest: unknown;
  dexFiles: Array<{ name: string; data: unknown }>;
  resourceTable: unknown;
  signatureInfo: unknown;
  signatureScheme: string;
  zipBuffer: ArrayBuffer;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getCachedApk(hash: string): Promise<CachedApk | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function cacheApk(data: CachedApk): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Cache failures are non-fatal
    console.warn('Failed to cache APK data');
  }
}

export async function listCachedApks(): Promise<Array<{ hash: string; fileName: string; fileSize: number; timestamp: number }>> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = (request.result as CachedApk[]).map(r => ({
          hash: r.hash,
          fileName: r.fileName,
          fileSize: r.fileSize,
          timestamp: r.timestamp,
        }));
        resolve(results.sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function deleteCachedApk(hash: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(hash);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Non-fatal
  }
}
