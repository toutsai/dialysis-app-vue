// src/stores/patientStore.ts
// Zustand store for patient data management (migrated from Pinia)

import { create } from 'zustand'
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '@/firebase'
import { fetchAllPatients } from '@/services/optimizedApiService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Patient {
  id: string
  name?: string
  status?: string
  isDeleted?: boolean
  [key: string]: unknown
}

interface PatientState {
  // State
  allPatients: Patient[]
  isLoading: boolean
  error: string | null
  hasFetched: boolean
  patientsVersion: number

  // Derived selectors (computed as getters)
  getPatientMap: () => Map<string, Patient>
  getOpdPatients: () => Patient[]

  // Actions
  fetchPatientsIfNeeded: () => Promise<void>
  forceRefreshPatients: () => Promise<void>
  addPatientInStore: (patient: Patient) => void
  updatePatientInStore: (updatedData: Patient) => void
  removePatientInStore: (patientId: string) => void
  removeRuleFromMasterSchedule: (patientId: string) => Promise<void>
  $reset: () => void
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState = {
  allPatients: [] as Patient[],
  isLoading: false,
  error: null as string | null,
  hasFetched: false,
  patientsVersion: 0,
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePatientStore = create<PatientState>((set, get) => ({
  ...initialState,

  // -------------------------------------------------------------------------
  // Derived selectors
  // -------------------------------------------------------------------------

  getPatientMap: (): Map<string, Patient> => {
    const map = new Map<string, Patient>()
    for (const patient of get().allPatients) {
      if (patient.id) {
        map.set(patient.id, patient)
      }
    }
    return map
  },

  getOpdPatients: (): Patient[] => {
    return get().allPatients.filter(
      (p) => p.status === 'opd' && !p.isDeleted
    )
  },

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  fetchPatientsIfNeeded: async () => {
    if (get().hasFetched) return

    set({ isLoading: true, error: null })

    try {
      const patients = (await fetchAllPatients()) as Patient[]
      set({
        allPatients: patients,
        hasFetched: true,
        isLoading: false,
        patientsVersion: get().patientsVersion + 1,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch patients'
      console.error('[PatientStore] fetchPatientsIfNeeded error:', err)
      set({ error: message, isLoading: false })
    }
  },

  forceRefreshPatients: async () => {
    set({ isLoading: true, error: null })

    try {
      const patients = (await fetchAllPatients()) as Patient[]
      set({
        allPatients: patients,
        hasFetched: true,
        isLoading: false,
        patientsVersion: get().patientsVersion + 1,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to refresh patients'
      console.error('[PatientStore] forceRefreshPatients error:', err)
      set({ error: message, isLoading: false })
    }
  },

  addPatientInStore: (patient: Patient) => {
    const { allPatients } = get()
    const exists = allPatients.some((p) => p.id === patient.id)
    if (!exists) {
      set({
        allPatients: [patient, ...allPatients],
        patientsVersion: get().patientsVersion + 1,
      })
    }
  },

  updatePatientInStore: (updatedData: Patient) => {
    const { allPatients } = get()
    const index = allPatients.findIndex((p) => p.id === updatedData.id)

    if (index !== -1) {
      const updatedPatients = [...allPatients]
      updatedPatients[index] = { ...updatedPatients[index], ...updatedData }
      set({
        allPatients: updatedPatients,
        patientsVersion: get().patientsVersion + 1,
      })
    } else {
      // Patient not found locally -- force a full refresh to stay in sync
      console.warn(
        `[PatientStore] Patient ${updatedData.id} not found locally, forcing refresh.`
      )
      get().forceRefreshPatients()
    }
  },

  removePatientInStore: (patientId: string) => {
    set((state) => ({
      allPatients: state.allPatients.filter((p) => p.id !== patientId),
      patientsVersion: state.patientsVersion + 1,
    }))
  },

  removeRuleFromMasterSchedule: async (patientId: string) => {
    try {
      const docRef = doc(db, 'base_schedules', 'MASTER_SCHEDULE')
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        console.warn(
          '[PatientStore] MASTER_SCHEDULE document not found.'
        )
        return
      }

      const data = docSnap.data()
      const schedule = data?.schedule as Record<string, unknown> | undefined

      if (schedule && patientId in schedule) {
        // Use Firestore deleteField() to remove the nested key
        await updateDoc(docRef, {
          [`schedule.${patientId}`]: deleteField(),
        })
        console.log(
          `[PatientStore] Removed schedule rule for patient ${patientId} from MASTER_SCHEDULE.`
        )
      }
    } catch (err) {
      console.error(
        '[PatientStore] removeRuleFromMasterSchedule error:',
        err
      )
      throw err
    }
  },

  $reset: () => {
    set({ ...initialState })
  },
}))

// ---------------------------------------------------------------------------
// Standalone selectors (for use with usePatientStore(selector))
// ---------------------------------------------------------------------------

export const selectAllPatients = (state: PatientState) => state.allPatients
export const selectIsLoading = (state: PatientState) => state.isLoading
export const selectError = (state: PatientState) => state.error
export const selectHasFetched = (state: PatientState) => state.hasFetched
export const selectPatientsVersion = (state: PatientState) =>
  state.patientsVersion
