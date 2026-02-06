// src/stores/medicationStore.ts
// Zustand store for daily injection / medication record management (migrated from Pinia)

import { create } from 'zustand'
import { functions } from '@/firebase'
import { httpsCallable } from 'firebase/functions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InjectionRecord {
  patientId: string
  orderCode: string
  [key: string]: unknown
}

interface MedicationState {
  // State
  dailyInjectionsCache: Record<string, InjectionRecord[]>
  isLoading: boolean
  error: string | null

  // Actions
  fetchDailyInjections: (
    targetDate: string,
    patientIds: string[]
  ) => Promise<InjectionRecord[]>
  clearCache: (targetDate?: string) => void
  getInjectionsForDate: (targetDate: string) => InjectionRecord[] | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of patient IDs per Cloud Function call */
const BATCH_SIZE = 30

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMedicationStore = create<MedicationState>((set, get) => ({
  dailyInjectionsCache: {},
  isLoading: false,
  error: null,

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  fetchDailyInjections: async (
    targetDate: string,
    patientIds: string[]
  ): Promise<InjectionRecord[]> => {
    // Return cached data if available
    const cached = get().dailyInjectionsCache[targetDate]
    if (cached) return cached

    if (!patientIds || patientIds.length === 0) return []

    set({ isLoading: true, error: null })

    try {
      const getDailyInjections = httpsCallable<
        { targetDate: string; patientIds: string[] },
        InjectionRecord[]
      >(functions, 'getDailyInjections')

      // Split patientIds into batches of BATCH_SIZE
      const batches: string[][] = []
      for (let i = 0; i < patientIds.length; i += BATCH_SIZE) {
        batches.push(patientIds.slice(i, i + BATCH_SIZE))
      }

      // Execute all batches in parallel
      const batchResults = await Promise.all(
        batches.map((batchIds) =>
          getDailyInjections({ targetDate, patientIds: batchIds })
        )
      )

      // Flatten results from all batches
      const allRecords: InjectionRecord[] = []
      for (const result of batchResults) {
        if (Array.isArray(result.data)) {
          allRecords.push(...result.data)
        }
      }

      // Deduplicate using a Map keyed by `${patientId}-${orderCode}`
      const deduplicationMap = new Map<string, InjectionRecord>()
      for (const record of allRecords) {
        const key = `${record.patientId}-${record.orderCode}`
        if (!deduplicationMap.has(key)) {
          deduplicationMap.set(key, record)
        }
      }
      const deduplicated = Array.from(deduplicationMap.values())

      // Cache by date
      set((state) => ({
        dailyInjectionsCache: {
          ...state.dailyInjectionsCache,
          [targetDate]: deduplicated,
        },
        isLoading: false,
      }))

      return deduplicated
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch daily injections'
      console.error('[MedicationStore] fetchDailyInjections error:', err)
      set({ error: message, isLoading: false })
      return []
    }
  },

  clearCache: (targetDate?: string) => {
    if (targetDate) {
      set((state) => {
        const newCache = { ...state.dailyInjectionsCache }
        delete newCache[targetDate]
        return { dailyInjectionsCache: newCache }
      })
    } else {
      set({ dailyInjectionsCache: {} })
    }
  },

  getInjectionsForDate: (targetDate: string): InjectionRecord[] | null => {
    return get().dailyInjectionsCache[targetDate] ?? null
  },
}))

// ---------------------------------------------------------------------------
// Standalone selectors
// ---------------------------------------------------------------------------

export const selectIsLoading = (state: MedicationState) => state.isLoading
export const selectError = (state: MedicationState) => state.error
