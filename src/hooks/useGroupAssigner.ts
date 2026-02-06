// src/hooks/useGroupAssigner.ts
// Hook that assigns patients to nursing groups based on bed allocation,
// shift type, and the nursing group configuration.

import { useState, useCallback } from 'react'
import {
  generateDayShiftGroups,
  generateNightShiftGroups,
  calculate74Groups,
} from '@/services/nursingGroupConfigService'
import { SHIFT_CODES } from '@/constants/scheduleConstants'
import { getDayOfWeek } from '@/utils/dateUtils'

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
  [key: string]: unknown
}

export interface SlotData {
  shiftId: string
  patientId: string | null
  autoNote?: string
  manualNote?: string
  nurseTeam?: string | null
  nurseTeamIn?: string | null
  nurseTeamOut?: string | null
  [key: string]: unknown
}

export interface GroupAssignmentResult {
  /** slotId -> assigned group letter (e.g. 'B', 'C', 'H', ...) */
  assignments: Record<string, string>
  /** Summary of patients per group */
  groupSummary: Record<string, string[]>
  /** Any warnings produced during assignment */
  warnings: string[]
}

interface UseGroupAssignerReturn {
  /** Run the group assignment algorithm */
  assignGroups: (
    schedule: Record<string, SlotData>,
    date: string,
    config: NursingGroupConfig,
    shiftType?: string,
  ) => GroupAssignmentResult
  /** Latest assignment result */
  result: GroupAssignmentResult | null
  /** Whether the assigner is currently running */
  isProcessing: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the day-category key ('135' or '246') from a date string.
 */
function getDayCategory(date: string): '135' | '246' {
  const dow = getDayOfWeek(date) // 0=Sun ... 6=Sat
  // Mon=1, Wed=3, Fri=5 => '135'; Tue=2, Thu=4, Sat=6 => '246'; Sun defaults to '135'
  if ([2, 4, 6].includes(dow)) return '246'
  return '135'
}

/**
 * Parse a shiftId like "bed-32-early" -> { bed: '32', shift: 'early' }
 */
function parseShiftId(shiftId: string): { bed: string; shift: string } | null {
  const match = shiftId.match(/^bed-(\w+)-(\w+)$/)
  if (!match) return null
  return { bed: match[1], shift: match[2] }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook providing patient-to-group assignment logic.
 *
 * Given a daily schedule, a date, and a nursing group configuration, the
 * `assignGroups` function distributes patients across groups following:
 *
 * 1. **Fixed assignments** -- beds with pre-defined group mappings (e.g. 74/L -> A).
 * 2. **Hospital groups** -- specific groups reserved for hospitalised patients.
 * 3. **Balanced distribution** -- remaining patients are spread evenly across
 *    available groups, respecting the day-category (135 vs 246) group counts.
 */
export function useGroupAssigner(): UseGroupAssignerReturn {
  const [result, setResult] = useState<GroupAssignmentResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const assignGroups = useCallback(
    (
      schedule: Record<string, SlotData>,
      date: string,
      config: NursingGroupConfig,
      shiftType: string = SHIFT_CODES.EARLY,
    ): GroupAssignmentResult => {
      setIsProcessing(true)

      try {
        const assignments: Record<string, string> = {}
        const groupSummary: Record<string, string[]> = {}
        const warnings: string[] = []

        const dayCategory = getDayCategory(date)
        const counts = config.groupCounts?.[dayCategory]

        if (!counts) {
          warnings.push(`No group count configuration found for day category "${dayCategory}"`)
          const emptyResult: GroupAssignmentResult = { assignments, groupSummary, warnings }
          setResult(emptyResult)
          return emptyResult
        }

        // Determine available groups for the shift
        const isNightShift = shiftType === SHIFT_CODES.LATE
        const availableGroups = isNightShift
          ? generateNightShiftGroups(counts.nightShiftCount)
          : generateDayShiftGroups(counts.dayShiftCount)

        // Initialise summary buckets
        for (const g of availableGroups) {
          groupSummary[g] = []
        }
        // Always include the fixed groups (e.g. 'A' for 74/L, 'outer' for 816)
        const fixedAssignments = config.fixedAssignments || {}
        for (const groupLetter of Object.values(fixedAssignments)) {
          if (!groupSummary[groupLetter]) {
            groupSummary[groupLetter] = []
          }
        }

        // ---- 1. Fixed assignments ----
        const unassignedSlots: Array<{ slotId: string; slot: SlotData }> = []

        for (const [slotId, slot] of Object.entries(schedule)) {
          if (!slot?.patientId) continue

          const parsed = parseShiftId(slotId)
          if (!parsed) {
            unassignedSlots.push({ slotId, slot })
            continue
          }

          // Check fixed assignment by bed label
          const bedLabel = parsed.bed
          let fixedGroup: string | null = null

          for (const [pattern, group] of Object.entries(fixedAssignments)) {
            if (bedLabel === pattern || slotId.includes(pattern.replace('/', '-'))) {
              fixedGroup = group
              break
            }
          }

          if (fixedGroup) {
            assignments[slotId] = fixedGroup
            if (!groupSummary[fixedGroup]) groupSummary[fixedGroup] = []
            groupSummary[fixedGroup].push(slot.patientId)
          } else {
            unassignedSlots.push({ slotId, slot })
          }
        }

        // ---- 2. For day shifts, determine 74 vs 75 sub-groups ----
        let assignableGroups = [...availableGroups]

        if (!isNightShift) {
          const dayRules = config.dayShiftRules?.[dayCategory]
          const shift75Groups = dayRules?.shift75Groups || []
          const shift74Groups = calculate74Groups(availableGroups, shift75Groups)

          // For the default early shift (74), use 74 groups
          // shiftType 'noon' is treated like early for grouping purposes
          assignableGroups = shiftType === SHIFT_CODES.EARLY
            ? shift74Groups.length > 0 ? shift74Groups : availableGroups
            : availableGroups
        }

        // Excluded groups that are meant for hospital patients only
        const hospitalGroupLetters: string[] = isNightShift
          ? (config.hospitalGroups?.nightShift ?? [])
          : (config.hospitalGroups?.dayShift ?? [])

        const regularGroups = assignableGroups.filter((g) => !hospitalGroupLetters.includes(g))
        const hospitalGroups = assignableGroups.filter((g) => hospitalGroupLetters.includes(g))

        // ---- 3. Balanced distribution ----
        // Separate hospital patients from regular patients
        const hospitalSlots: Array<{ slotId: string; slot: SlotData }> = []
        const regularSlots: Array<{ slotId: string; slot: SlotData }> = []

        for (const entry of unassignedSlots) {
          const autoNote: string = entry.slot.autoNote || ''
          if (autoNote.includes('住') || autoNote.includes('急')) {
            hospitalSlots.push(entry)
          } else {
            regularSlots.push(entry)
          }
        }

        // Assign hospital patients to hospital groups
        if (hospitalGroups.length > 0) {
          hospitalSlots.forEach((entry, idx) => {
            const group = hospitalGroups[idx % hospitalGroups.length]
            assignments[entry.slotId] = group
            groupSummary[group].push(entry.slot.patientId!)
          })
        } else if (hospitalSlots.length > 0) {
          warnings.push(
            `No hospital groups configured for ${isNightShift ? 'night' : 'day'} shift. ` +
            `${hospitalSlots.length} hospital patient(s) will be assigned to regular groups.`,
          )
          regularSlots.push(...hospitalSlots)
        }

        // Assign regular patients evenly across regular groups
        if (regularGroups.length > 0) {
          // Sort groups by current count so we fill the least-populated first
          regularSlots.forEach((entry) => {
            const sortedGroups = [...regularGroups].sort(
              (a, b) => (groupSummary[a]?.length || 0) - (groupSummary[b]?.length || 0),
            )
            const group = sortedGroups[0]
            assignments[entry.slotId] = group
            if (!groupSummary[group]) groupSummary[group] = []
            groupSummary[group].push(entry.slot.patientId!)
          })
        } else if (regularSlots.length > 0) {
          warnings.push(
            'No regular groups available for assignment. Check group configuration.',
          )
        }

        const finalResult: GroupAssignmentResult = { assignments, groupSummary, warnings }
        setResult(finalResult)
        return finalResult
      } finally {
        setIsProcessing(false)
      }
    },
    [],
  )

  return {
    assignGroups,
    result,
    isProcessing,
  }
}

export default useGroupAssigner
