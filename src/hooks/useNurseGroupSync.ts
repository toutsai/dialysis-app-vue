// src/hooks/useNurseGroupSync.ts
// Real-time sync hook for nursing group configuration from Firestore.

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase'
import {
  fetchNursingGroupConfig,
  getDefaultConfig,
} from '@/services/nursingGroupConfigService'
import { formatDateToYYYYMM } from '@/utils/dateUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NursingGroupConfig {
  fixedAssignments: Record<string, string>
  hospitalGroups: {
    dayShift: string[]
    nightShift: string[]
  }
  groupCounts: Record<string, { dayShiftCount: number; nightShiftCount: number }>
  dayShiftRules: Record<string, { shift75Groups: string[] }>
  cannotBeNightLeader: string[]
  nightShiftRestrictions: Record<string, string[]>
  excludedNurses: string[]
  lastModified: {
    date: unknown
    userId: string | null
    userName: string | null
  }
  [key: string]: unknown
}

interface UseNurseGroupSyncReturn {
  /** The current nursing group configuration */
  groupConfig: NursingGroupConfig
  /** Whether the initial load is in progress */
  isLoading: boolean
  /** Error message if loading or listening failed */
  error: string | null
  /** Manually re-fetch the config */
  refresh: () => Promise<void>
}

const CONFIG_COLLECTION = 'nursing_group_config'

/**
 * Hook that subscribes to the nursing group configuration document in Firestore
 * in real-time via `onSnapshot`.
 *
 * On mount it performs an initial fetch using `fetchNursingGroupConfig` (which
 * includes fallback logic for previous months and defaults). It then opens a
 * real-time listener on the resolved document so that any configuration change
 * made by another user is reflected immediately.
 *
 * @param yearMonth  Optional YYYY-MM string. Defaults to the current month.
 */
export function useNurseGroupSync(yearMonth?: string): UseNurseGroupSyncReturn {
  const resolvedMonth = yearMonth || formatDateToYYYYMM(new Date())

  const [groupConfig, setGroupConfig] = useState<NursingGroupConfig>(
    getDefaultConfig() as NursingGroupConfig,
  )
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Manual refresh -- re-runs the service-level fetch with fallback logic
  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { config } = await fetchNursingGroupConfig(resolvedMonth)
      setGroupConfig(config as NursingGroupConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch group config'
      setError(message)
      console.error('[useNurseGroupSync] refresh failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [resolvedMonth])

  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let cancelled = false

    const init = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // 1. Initial fetch (with fallback to previous months / defaults)
        const { config, sourceMonth } = await fetchNursingGroupConfig(resolvedMonth)

        if (cancelled) return

        setGroupConfig(config as NursingGroupConfig)
        setIsLoading(false)

        // 2. Set up real-time listener on the resolved document
        const listenMonth = sourceMonth || resolvedMonth
        const docRef = doc(db, CONFIG_COLLECTION, listenMonth)

        unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            if (cancelled) return
            if (snapshot.exists()) {
              setGroupConfig(snapshot.data() as NursingGroupConfig)
            }
          },
          (err) => {
            if (cancelled) return
            console.error('[useNurseGroupSync] onSnapshot error:', err)
            setError(err.message)
          },
        )
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load group config'
        setError(message)
        console.error('[useNurseGroupSync] init failed:', err)
        setIsLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [resolvedMonth])

  return {
    groupConfig,
    isLoading,
    error,
    refresh,
  }
}

export default useNurseGroupSync
