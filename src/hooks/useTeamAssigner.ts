// src/hooks/useTeamAssigner.ts
// Hook for assigning nurses to teams based on schedule and nursing group config.

import { useState, useCallback } from 'react'
import { SHIFT_CODES } from '@/constants/scheduleConstants'
import { getDayOfWeek } from '@/utils/dateUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NurseUser {
  id: string
  uid?: string
  name: string
  role?: string
  title?: string
  [key: string]: unknown
}

export interface NursingGroupConfig {
  cannotBeNightLeader: string[]
  nightShiftRestrictions: Record<string, string[]>
  excludedNurses: string[]
  [key: string]: unknown
}

export interface TeamAssignment {
  /** Group letter -> array of assigned nurse IDs */
  teams: Record<string, string[]>
  /** Group letter -> array of assigned nurse names (parallel to teams) */
  names: Record<string, string[]>
  /** Group letter -> leader nurse ID */
  leaders: Record<string, string | null>
}

export interface TeamAssignmentResult {
  /** The computed team assignments */
  assignment: TeamAssignment
  /** Nurses that could not be assigned */
  unassigned: NurseUser[]
  /** Warnings generated during assignment */
  warnings: string[]
}

interface UseTeamAssignerReturn {
  /** Run the team assignment algorithm */
  assignTeams: (
    availableNurses: NurseUser[],
    groups: string[],
    config: NursingGroupConfig,
    options?: AssignTeamsOptions,
  ) => TeamAssignmentResult
  /** Latest assignment result */
  result: TeamAssignmentResult | null
  /** Whether the assigner is currently running */
  isProcessing: boolean
}

interface AssignTeamsOptions {
  /** The date being assigned (YYYY-MM-DD). Used to determine day/night logic. */
  date?: string
  /** The shift type. Defaults to EARLY. */
  shiftType?: string
  /** Target number of nurses per group. If not given, computed automatically. */
  nursesPerGroup?: number
  /** Existing partial assignment to preserve and fill in around. */
  existingAssignment?: Partial<TeamAssignment>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for assigning nurses to teams/groups.
 *
 * Given a list of available nurses, a list of group letters, and the nursing
 * group configuration, `assignTeams` distributes nurses across groups while
 * respecting the following constraints:
 *
 * - Excluded nurses (config.excludedNurses) are skipped.
 * - Night-shift leader restrictions (config.cannotBeNightLeader) are honoured.
 * - Night-shift group restrictions (config.nightShiftRestrictions) prevent
 *   specific nurses from being placed in specific groups.
 * - Groups are filled as evenly as possible, and one nurse per group is
 *   designated as leader.
 */
export function useTeamAssigner(): UseTeamAssignerReturn {
  const [result, setResult] = useState<TeamAssignmentResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const assignTeams = useCallback(
    (
      availableNurses: NurseUser[],
      groups: string[],
      config: NursingGroupConfig,
      options: AssignTeamsOptions = {},
    ): TeamAssignmentResult => {
      setIsProcessing(true)

      try {
        const {
          shiftType = SHIFT_CODES.EARLY,
          nursesPerGroup,
          existingAssignment,
        } = options

        const isNightShift = shiftType === SHIFT_CODES.LATE
        const warnings: string[] = []

        // Filter out excluded nurses
        const excludedSet = new Set(config.excludedNurses || [])
        const eligibleNurses = availableNurses.filter((n) => {
          const nurseId = n.id || n.uid || ''
          if (excludedSet.has(nurseId)) {
            return false
          }
          return true
        })

        // Build initial team structure (preserving existing assignments if any)
        const teams: Record<string, string[]> = {}
        const names: Record<string, string[]> = {}
        const leaders: Record<string, string | null> = {}
        const alreadyAssigned = new Set<string>()

        for (const group of groups) {
          teams[group] = []
          names[group] = []
          leaders[group] = null
        }

        // Merge existing partial assignments
        if (existingAssignment) {
          for (const group of groups) {
            const existingIds = existingAssignment.teams?.[group] || []
            const existingNames = existingAssignment.names?.[group] || []
            const existingLeader = existingAssignment.leaders?.[group] || null

            for (let i = 0; i < existingIds.length; i++) {
              teams[group].push(existingIds[i])
              names[group].push(existingNames[i] || '')
              alreadyAssigned.add(existingIds[i])
            }

            if (existingLeader) {
              leaders[group] = existingLeader
            }
          }
        }

        // Nurses still needing assignment
        const unassignedNurses = eligibleNurses.filter((n) => {
          const nurseId = n.id || n.uid || ''
          return !alreadyAssigned.has(nurseId)
        })

        // Night-shift restriction lookup: nurseId -> Set of forbidden group letters
        const nightRestrictions = new Map<string, Set<string>>()
        if (isNightShift && config.nightShiftRestrictions) {
          for (const [nurseId, forbiddenGroups] of Object.entries(config.nightShiftRestrictions)) {
            nightRestrictions.set(nurseId, new Set(forbiddenGroups))
          }
        }

        // Determine target size per group
        const totalNeeded = groups.reduce(
          (sum, g) => sum + Math.max(0, (nursesPerGroup || 0) - teams[g].length),
          0,
        )
        const targetPerGroup =
          nursesPerGroup ||
          (groups.length > 0
            ? Math.ceil(
                (unassignedNurses.length +
                  groups.reduce((s, g) => s + teams[g].length, 0)) /
                  groups.length,
              )
            : 1)

        // Assign nurses using a greedy approach: always fill the smallest group first
        const remainingNurses: NurseUser[] = [...unassignedNurses]
        const finalUnassigned: NurseUser[] = []

        for (const nurse of remainingNurses) {
          const nurseId = nurse.id || nurse.uid || ''

          // Find eligible groups (sorted by current size ascending)
          const sortedGroups = [...groups].sort(
            (a, b) => teams[a].length - teams[b].length,
          )

          let assigned = false

          for (const group of sortedGroups) {
            // Skip if group is already full
            if (teams[group].length >= targetPerGroup) continue

            // Check night shift restrictions
            if (isNightShift) {
              const forbidden = nightRestrictions.get(nurseId)
              if (forbidden && forbidden.has(group)) continue
            }

            teams[group].push(nurseId)
            names[group].push(nurse.name)
            assigned = true
            break
          }

          if (!assigned) {
            // All groups are either full or restricted -- try to fit in the
            // smallest group regardless of target (overflow)
            const fallbackGroup = [...groups].sort(
              (a, b) => teams[a].length - teams[b].length,
            )[0]

            if (fallbackGroup) {
              // Re-check restriction even for fallback
              const forbidden = nightRestrictions.get(nurseId)
              if (!isNightShift || !forbidden || !forbidden.has(fallbackGroup)) {
                teams[fallbackGroup].push(nurseId)
                names[fallbackGroup].push(nurse.name)
              } else {
                warnings.push(
                  `Nurse ${nurse.name} could not be assigned due to night shift restrictions`,
                )
                finalUnassigned.push(nurse)
              }
            } else {
              finalUnassigned.push(nurse)
            }
          }
        }

        // ---- Leader selection ----
        const cannotBeLeaderSet = new Set(config.cannotBeNightLeader || [])

        for (const group of groups) {
          if (leaders[group]) continue // already set from existing assignment
          if (teams[group].length === 0) continue

          // Pick the first nurse who is allowed to be a leader
          let leaderPicked = false
          for (const nurseId of teams[group]) {
            if (isNightShift && cannotBeLeaderSet.has(nurseId)) continue
            leaders[group] = nurseId
            leaderPicked = true
            break
          }

          if (!leaderPicked) {
            // Fall back to the first nurse even if technically restricted
            leaders[group] = teams[group][0]
            warnings.push(
              `Group ${group}: no eligible leader found, defaulting to first nurse`,
            )
          }
        }

        const finalResult: TeamAssignmentResult = {
          assignment: { teams, names, leaders },
          unassigned: finalUnassigned,
          warnings,
        }

        setResult(finalResult)
        return finalResult
      } finally {
        setIsProcessing(false)
      }
    },
    [],
  )

  return {
    assignTeams,
    result,
    isProcessing,
  }
}

export default useTeamAssigner
