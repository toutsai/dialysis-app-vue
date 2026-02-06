// src/hooks/useMyPatientList.ts
// Hook for fetching today's assigned patients for the currently logged-in nurse.

import { useState, useEffect, useCallback } from 'react'
import { where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager'
import { useAuthStore } from '@/hooks/useAuth'
import { getToday } from '@/utils/dateUtils'

interface NurseAssignmentRecord {
  id?: string
  date: string
  teams?: Record<string, string[]>
  names?: Record<string, string[]>
  [key: string]: unknown
}

interface UseMyPatientListReturn {
  /** Patient IDs assigned to the current nurse today */
  todayMyPatientIds: string[]
  /** Whether the data is currently being fetched */
  isLoading: boolean
  /** Re-fetch assignments */
  refresh: () => Promise<void>
}

const nurseAssignmentsApi = ApiManager<NurseAssignmentRecord>('nurse_assignments')

/**
 * Hook that returns the list of patient IDs assigned to the current nurse for
 * today's date.
 *
 * It fetches the `nurse_assignments` collection filtered by today's date and
 * matches the current user's display name against the assignment names to
 * determine which patients belong to the logged-in nurse.
 */
export function useMyPatientList(): UseMyPatientListReturn {
  const [todayMyPatientIds, setTodayMyPatientIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const currentUser = useAuthStore((state) => state.currentUser)

  const fetchMyPatients = useCallback(async () => {
    if (!currentUser?.name) {
      setTodayMyPatientIds([])
      return
    }

    setIsLoading(true)

    try {
      const today = getToday() // 'YYYY-MM-DD'

      // Fetch today's nurse assignment document(s)
      const records = await nurseAssignmentsApi.fetchAll([
        where('date', '==', today),
      ])

      if (!records || records.length === 0) {
        setTodayMyPatientIds([])
        return
      }

      // Typically there is one document per day
      const todayRecord = records[0]
      const nurseName = currentUser.name

      // The assignment document stores teams as { teamName: patientId[] }
      // and names as { teamName: nurseName[] }.
      // We need to find which team(s) this nurse is assigned to, then collect
      // all patient IDs from those teams.
      const teams = todayRecord.teams || {}
      const names = todayRecord.names || {}

      const myPatientIds: string[] = []

      for (const [teamKey, teamNurseNames] of Object.entries(names)) {
        // Check if the current nurse's name appears in this team's nurse list
        const nurseList = Array.isArray(teamNurseNames) ? teamNurseNames : []
        const isAssigned = nurseList.some(
          (name) => name === nurseName || name.includes(nurseName) || nurseName.includes(name),
        )

        if (isAssigned) {
          // Collect patient IDs from the matching team
          const teamPatientIds = teams[teamKey]
          if (Array.isArray(teamPatientIds)) {
            myPatientIds.push(...teamPatientIds)
          }
        }
      }

      // Deduplicate
      setTodayMyPatientIds([...new Set(myPatientIds)])
    } catch (error) {
      console.error('[useMyPatientList] Failed to fetch today\'s assignments:', error)
      setTodayMyPatientIds([])
    } finally {
      setIsLoading(false)
    }
  }, [currentUser?.name])

  // Auto-fetch when the user or date changes
  useEffect(() => {
    fetchMyPatients()
  }, [fetchMyPatients])

  return {
    todayMyPatientIds,
    isLoading,
    refresh: fetchMyPatients,
  }
}

export default useMyPatientList
