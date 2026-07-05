import { IDBPDatabase, openDB } from 'idb';

/**
 * Zentrale IndexedDB der App (E-08):
 * - offline_queue: gepufferte Events bis zur Supabase-Bestätigung
 * - master_data: Stammdaten-Spiegel (Aufträge, Fahrzeuge, Kommissionsnummern),
 *   damit das Stempel-UI offline befüllbar ist
 * - stamp_state: aktive Stempelungen (überleben Reload/Offline)
 */
const DB_NAME = 'fleetly-web';
const DB_VERSION = 2;

export const QUEUE_STORE = 'offline_queue';
export const MASTER_DATA_STORE = 'master_data';
export const STAMP_STATE_STORE = 'stamp_state';

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getFleetlyDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-created', 'created_at');
      }
      if (oldVersion < 2) {
        db.createObjectStore(MASTER_DATA_STORE);
        db.createObjectStore(STAMP_STATE_STORE, { keyPath: 'entryId' });
      }
    },
  });
  return dbPromise;
}
