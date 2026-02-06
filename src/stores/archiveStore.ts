// src/stores/archiveStore.ts
// Zustand store for cached archived schedule data (migrated from Pinia)

import { create } from 'zustand'
import { where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleRecord {
  id?: string
  date: string
  schedule: Record<string, unknown>
}

interface ArchiveState {
  // State
  schedulesCache: Map<string, ScheduleRecord>
  isLoading: boolean

  // Actions
  fetchScheduleByDate: (dateStr: string) => Promise<ScheduleRecord | null>
  clearCache: () => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  schedulesCache: new Map<string, ScheduleRecord>(),
  isLoading: false,

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  fetchScheduleByDate: async (
    dateStr: string
  ): Promise<ScheduleRecord | null> => {
    // Return from cache if available (including empty results that were cached)
    const cached = get().schedulesCache.get(dateStr)
    if (cached !== undefined) {
      return cached
    }

    set({ isLoading: true })

    try {
      const api = ApiManager<ScheduleRecord>('expired_schedules')
      const results = await api.fetchAll([where('date', '==', dateStr)])

      const record: ScheduleRecord =
        results.length > 0
          ? results[0]
          : { date: dateStr, schedule: {} }

      // Cache result (even empty ones to avoid redundant fetches)
      set((state) => {
        const newCache = new Map(state.schedulesCache)
        newCache.set(dateStr, record)
        return { schedulesCache: newCache, isLoading: false }
      })

      return record
    } catch (err) {
      console.error(
        `[ArchiveStore] fetchScheduleByDate error for ${dateStr}:`,
        err
      )
      set({ isLoading: false })
      return null
    }
  },

  clearCache: () => {
    set({ schedulesCache: new Map<string, ScheduleRecord>() })
  },
}))

// ---------------------------------------------------------------------------
// Standalone selectors
// ---------------------------------------------------------------------------

export const selectSchedulesCache = (state: ArchiveState) =>
  state.schedulesCache
export const selectIsLoading = (state: ArchiveState) => state.isLoading
