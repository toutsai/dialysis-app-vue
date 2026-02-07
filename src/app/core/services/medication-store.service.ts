// src/app/core/services/medication-store.service.ts
import { Injectable, inject, signal } from '@angular/core';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InjectionRecord {
  id: string;
  patientId: string;
  patientName?: string;
  orderCode?: string;
  orderName?: string;
  dose?: number;
  unit?: string;
  route?: string;
  frequency?: string;
  date: string;
  administeredBy?: string;
  administeredAt?: string;
  status?: string;
  [key: string]: unknown;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const FIRESTORE_IN_LIMIT = 30;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class MedicationStoreService {
  private readonly firebaseService = inject(FirebaseService);

  // -----------------------------------------------------------------------
  // State signals
  // -----------------------------------------------------------------------
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  // -----------------------------------------------------------------------
  // Cache (keyed by "date|patientIdHash")
  // -----------------------------------------------------------------------
  private readonly cache = new Map<string, CacheEntry<InjectionRecord[]>>();

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  /**
   * Fetch daily injection records for a set of patients on a given date.
   * Results are cached per date + patient-set combination.
   *
   * @param date    - YYYY-MM-DD date string
   * @param patientIds - array of patient document IDs to query
   * @returns Array of InjectionRecord
   */
  async fetchDailyInjections(
    date: string,
    patientIds: string[],
  ): Promise<InjectionRecord[]> {
    if (!date || !patientIds || patientIds.length === 0) {
      return [];
    }

    const cacheKey = this.buildCacheKey(date, patientIds);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      this.isLoading.set(true);
      this.error.set(null);

      const db = this.firebaseService.db;
      const colRef = collection(db, 'daily_injections');

      // Firestore 'in' queries are limited to 30 values per clause.
      // Split into chunks and query in parallel.
      const chunks = this.chunkArray(patientIds, FIRESTORE_IN_LIMIT);
      const promises = chunks.map(async (chunk) => {
        const q = query(
          colRef,
          where('date', '==', date),
          where('patientId', 'in', chunk),
        );
        const snapshot = await getDocs(q);
        const records: InjectionRecord[] = [];
        snapshot.forEach((doc) => {
          records.push({
            id: doc.id,
            ...doc.data(),
          } as InjectionRecord);
        });
        return records;
      });

      const results = await Promise.all(promises);
      const allRecords = results.flat();

      this.setCache(cacheKey, allRecords);

      console.log(
        `[MedicationStoreService] Fetched ${allRecords.length} injection records for ${date}`,
      );
      return allRecords;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch injections';
      this.error.set(message);
      console.error('[MedicationStoreService] fetchDailyInjections error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Get cached injection records for a given date, regardless of which
   * patient IDs were used in the original query. Returns all cached records
   * whose key begins with the date prefix.
   */
  getInjectionsForDate(date: string): InjectionRecord[] {
    const prefix = `${date}|`;
    const results: InjectionRecord[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(prefix) && !this.isExpired(entry)) {
        results.push(...entry.data);
      }
    }

    return results;
  }

  /**
   * Clear all cached medication data.
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[MedicationStoreService] Cache cleared');
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildCacheKey(date: string, patientIds: string[]): string {
    // Sort for deterministic key regardless of input order
    const sorted = [...patientIds].sort();
    const hash = sorted.join(',');
    return `${date}|${hash}`;
  }

  private getFromCache(key: string): InjectionRecord[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: InjectionRecord[]): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > CACHE_TTL;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
