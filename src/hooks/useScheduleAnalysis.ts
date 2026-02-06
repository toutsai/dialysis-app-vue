// src/hooks/useScheduleAnalysis.ts
// Hook for analysing schedule data: detecting conflicts, gaps, and other issues.

import { useState, useCallback } from 'react'
import {
  hasFrequencyConflict,
  shouldPatientBeScheduled,
  BIWEEKLY_FREQUENCIES,
} from '@/utils/scheduleUtils'
import { SHIFT_CODES, ORDERED_SHIFT_CODES } from '@/constants/scheduleConstants'
import { getDayOfWeek } from '@/utils/dateUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlotData {
  shiftId: string
  patientId: string | null
  autoNote?: string
  manualNote?: string
  nurseTeam?: string | null
  nurseTeamIn?: string | null
  nurseTeamOut?: string | null
  wardNumber?: string | null
  [key: string]: unknown
}

export interface ScheduleDocument {
  id: string
  date: string
  schedule: Record<string, SlotData>
  [key: string]: unknown
}

export interface Patient {
  id: string
  name?: string
  freq?: string
  status?: string
  isDeleted?: boolean
  [key: string]: unknown
}

export type IssueSeverity = 'error' | 'warning' | 'info'

export interface ScheduleIssue {
  type: 'conflict' | 'gap' | 'duplicate' | 'missing_nurse' | 'wrong_day' | 'deleted_patient'
  severity: IssueSeverity
  message: string
  date?: string
  slotId?: string
  patientId?: string
}

export interface AnalysisResult {
  issues: ScheduleIssue[]
  totalSlots: number
  filledSlots: number
  emptySlots: number
  occupancyRate: number
  issuesByType: Record<string, number>
}

interface UseScheduleAnalysisReturn {
  /** Latest analysis result */
  analysisResult: AnalysisResult | null
  /** Whether analysis is in progress */
  isAnalysing: boolean
  /** Run a full analysis on a single schedule document */
  analyseSchedule: (
    schedule: ScheduleDocument,
    patients: Map<string, Patient> | Record<string, Patient>,
  ) => AnalysisResult
  /** Detect duplicate patients within a single day's schedule */
  detectDuplicates: (schedule: Record<string, SlotData>) => ScheduleIssue[]
  /** Detect patients scheduled on the wrong day-of-week for their frequency */
  detectWrongDayPatients: (
    schedule: Record<string, SlotData>,
    date: string,
    patients: Map<string, Patient> | Record<string, Patient>,
  ) => ScheduleIssue[]
  /** Detect frequency conflicts between two patients sharing the same bed */
  detectFrequencyConflicts: (
    schedules: ScheduleDocument[],
    patients: Map<string, Patient> | Record<string, Patient>,
  ) => ScheduleIssue[]
  /** Detect slots that are missing a nurse team assignment */
  detectMissingNurseAssignments: (schedule: Record<string, SlotData>) => ScheduleIssue[]
  /** Detect deleted patients that are still on the schedule */
  detectDeletedPatients: (
    schedule: Record<string, SlotData>,
    patients: Map<string, Patient> | Record<string, Patient>,
  ) => ScheduleIssue[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPatient(
  patients: Map<string, Patient> | Record<string, Patient>,
  id: string,
): Patient | undefined {
  if (patients instanceof Map) return patients.get(id)
  return (patients as Record<string, Patient>)[id]
}

/**
 * Parse a shiftId like "bed-32-early" into its parts.
 */
function parseShiftId(shiftId: string): { bed: string; shift: string } | null {
  // Expect format: bed-<number>-<shift>
  const match = shiftId.match(/^bed-(\d+)-(\w+)$/)
  if (!match) return null
  return { bed: match[1], shift: match[2] }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that provides schedule analysis functions.
 *
 * All analysis helpers are stable callbacks that can be called imperatively.
 * `analyseSchedule` also stores the latest result in state for convenience.
 */
export function useScheduleAnalysis(): UseScheduleAnalysisReturn {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isAnalysing, setIsAnalysing] = useState(false)

  // -----------------------------------------------------------------------
  // Individual detectors
  // -----------------------------------------------------------------------

  /** Detect the same patientId appearing in more than one slot on the same day. */
  const detectDuplicates = useCallback(
    (schedule: Record<string, SlotData>): ScheduleIssue[] => {
      const issues: ScheduleIssue[] = []
      const seen = new Map<string, string>() // patientId -> first slotId

      for (const [slotId, slot] of Object.entries(schedule)) {
        if (!slot?.patientId) continue
        const pid = slot.patientId

        if (seen.has(pid)) {
          issues.push({
            type: 'duplicate',
            severity: 'error',
            message: `Patient ${pid} is duplicated in slots ${seen.get(pid)} and ${slotId}`,
            slotId,
            patientId: pid,
          })
        } else {
          seen.set(pid, slotId)
        }
      }

      return issues
    },
    [],
  )

  /** Detect patients whose frequency does not include the scheduled day-of-week. */
  const detectWrongDayPatients = useCallback(
    (
      schedule: Record<string, SlotData>,
      date: string,
      patients: Map<string, Patient> | Record<string, Patient>,
    ): ScheduleIssue[] => {
      const issues: ScheduleIssue[] = []
      const dayOfWeek = getDayOfWeek(date) // 0=Sun ... 6=Sat
      // Convert JS day (0=Sun) to our system (1=Mon ... 7=Sun)
      const systemDay = dayOfWeek === 0 ? 7 : dayOfWeek

      for (const [slotId, slot] of Object.entries(schedule)) {
        if (!slot?.patientId) continue
        const patient = getPatient(patients, slot.patientId)
        if (!patient || !patient.freq) continue

        if (!shouldPatientBeScheduled(patient, systemDay)) {
          issues.push({
            type: 'wrong_day',
            severity: 'warning',
            message: `Patient ${patient.name || slot.patientId} (freq: ${patient.freq}) is scheduled on an unexpected day`,
            date,
            slotId,
            patientId: slot.patientId,
          })
        }
      }

      return issues
    },
    [],
  )

  /** Cross-day analysis: detect two patients with conflicting frequencies on the same bed. */
  const detectFrequencyConflicts = useCallback(
    (
      schedules: ScheduleDocument[],
      patients: Map<string, Patient> | Record<string, Patient>,
    ): ScheduleIssue[] => {
      const issues: ScheduleIssue[] = []

      // Build a bed -> Set<patientId> mapping across all schedule documents
      const bedPatients = new Map<string, Set<string>>()

      for (const scheduleDoc of schedules) {
        const scheduleMap = scheduleDoc.schedule || {}
        for (const [slotId, slot] of Object.entries(scheduleMap)) {
          if (!slot?.patientId) continue
          const parsed = parseShiftId(slotId)
          if (!parsed) continue

          const bedKey = `${parsed.bed}-${parsed.shift}`
          if (!bedPatients.has(bedKey)) {
            bedPatients.set(bedKey, new Set())
          }
          bedPatients.get(bedKey)!.add(slot.patientId)
        }
      }

      // For each bed, check pairwise frequency conflicts
      for (const [bedKey, patientIds] of bedPatients.entries()) {
        const ids = Array.from(patientIds)
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const p1 = getPatient(patients, ids[i])
            const p2 = getPatient(patients, ids[j])
            if (!p1?.freq || !p2?.freq) continue

            if (hasFrequencyConflict(p1.freq, p2.freq)) {
              issues.push({
                type: 'conflict',
                severity: 'error',
                message: `Bed ${bedKey}: ${p1.name || ids[i]} (${p1.freq}) conflicts with ${p2.name || ids[j]} (${p2.freq})`,
                patientId: ids[i],
              })
            }
          }
        }
      }

      return issues
    },
    [],
  )

  /** Detect filled slots that have no nurse team assigned. */
  const detectMissingNurseAssignments = useCallback(
    (schedule: Record<string, SlotData>): ScheduleIssue[] => {
      const issues: ScheduleIssue[] = []

      for (const [slotId, slot] of Object.entries(schedule)) {
        if (!slot?.patientId) continue

        if (!slot.nurseTeam && !slot.nurseTeamIn) {
          issues.push({
            type: 'missing_nurse',
            severity: 'info',
            message: `Slot ${slotId} has a patient but no nurse team assigned`,
            slotId,
            patientId: slot.patientId,
          })
        }
      }

      return issues
    },
    [],
  )

  /** Detect patients still on the schedule who have been soft-deleted. */
  const detectDeletedPatients = useCallback(
    (
      schedule: Record<string, SlotData>,
      patients: Map<string, Patient> | Record<string, Patient>,
    ): ScheduleIssue[] => {
      const issues: ScheduleIssue[] = []

      for (const [slotId, slot] of Object.entries(schedule)) {
        if (!slot?.patientId) continue
        const patient = getPatient(patients, slot.patientId)

        if (patient?.isDeleted) {
          issues.push({
            type: 'deleted_patient',
            severity: 'error',
            message: `Slot ${slotId} contains deleted patient ${patient.name || slot.patientId}`,
            slotId,
            patientId: slot.patientId,
          })
        }
      }

      return issues
    },
    [],
  )

  // -----------------------------------------------------------------------
  // Full analysis
  // -----------------------------------------------------------------------

  const analyseSchedule = useCallback(
    (
      scheduleDoc: ScheduleDocument,
      patients: Map<string, Patient> | Record<string, Patient>,
    ): AnalysisResult => {
      setIsAnalysing(true)

      try {
        const schedule = scheduleDoc.schedule || {}
        const allSlotIds = Object.keys(schedule)
        const filledSlots = allSlotIds.filter((id) => !!schedule[id]?.patientId)

        const issues: ScheduleIssue[] = [
          ...detectDuplicates(schedule),
          ...detectWrongDayPatients(schedule, scheduleDoc.date, patients),
          ...detectMissingNurseAssignments(schedule),
          ...detectDeletedPatients(schedule, patients),
        ]

        // Annotate every issue with the date
        for (const issue of issues) {
          if (!issue.date) issue.date = scheduleDoc.date
        }

        // Summarise by type
        const issuesByType: Record<string, number> = {}
        for (const issue of issues) {
          issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1
        }

        const result: AnalysisResult = {
          issues,
          totalSlots: allSlotIds.length,
          filledSlots: filledSlots.length,
          emptySlots: allSlotIds.length - filledSlots.length,
          occupancyRate:
            allSlotIds.length > 0
              ? Math.round((filledSlots.length / allSlotIds.length) * 100)
              : 0,
          issuesByType,
        }

        setAnalysisResult(result)
        return result
      } finally {
        setIsAnalysing(false)
      }
    },
    [detectDuplicates, detectWrongDayPatients, detectMissingNurseAssignments, detectDeletedPatients],
  )

  return {
    analysisResult,
    isAnalysing,
    analyseSchedule,
    detectDuplicates,
    detectWrongDayPatients,
    detectFrequencyConflicts,
    detectMissingNurseAssignments,
    detectDeletedPatients,
  }
}

export default useScheduleAnalysis
