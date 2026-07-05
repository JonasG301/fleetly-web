import { Injectable } from '@angular/core';
import { MASTER_DATA_STORE, getFleetlyDb } from './idb';

/**
 * Spiegelt Stammdaten (Aufträge, Fahrzeuge, Kommissionsnummern, Kunden) in
 * IndexedDB, damit das Stempel-UI nach einem Offline-Start befüllbar ist (E-08).
 */
@Injectable({ providedIn: 'root' })
export class MasterDataCacheService {
  async put<T>(key: string, value: T[]): Promise<void> {
    const db = await getFleetlyDb();
    await db.put(MASTER_DATA_STORE, value, key);
  }

  async get<T>(key: string): Promise<T[] | null> {
    const db = await getFleetlyDb();
    return ((await db.get(MASTER_DATA_STORE, key)) as T[] | undefined) ?? null;
  }
}
