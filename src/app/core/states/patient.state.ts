import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { ApiManagerService } from '../services/api/api-manager.service';

export interface Patient {
  id: string;
  name?: string;
  status?: string;
  isDeleted?: boolean;
  medicalRecordNumber?: string;
  scheduleRule?: any;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class PatientStateService {
  private firestore = inject(Firestore);
  private apiManager = inject(ApiManagerService);
  
  private patientsApi = this.apiManager.getCollection<Patient>('patients');
  private schedulesApi = this.apiManager.getCollection<any>('base_schedules');

  // --- State (狀態) ---
  private allPatientsSubject = new BehaviorSubject<Patient[]>([]);
  public allPatients$ = this.allPatientsSubject.asObservable();

  private isLoadingSubject = new BehaviorSubject<boolean>(false);
  public isLoading$ = this.isLoadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  private hasFetched = false;
  private patientsVersion = 0;

  // --- Getters (計算屬性 Equivalent) ---
  public get allPatients(): Patient[] {
    return this.allPatientsSubject.value;
  }

  public get patientMap(): Map<string, Patient> {
    return new Map(this.allPatients.map(p => [p.id, p]));
  }

  public get opdPatients(): Patient[] {
    return this.allPatients.filter(p => p.status === 'opd' && !p.isDeleted);
  }

  // --- Private Helper ---
  private bumpPatientsVersion() {
    this.patientsVersion += 1;
  }

  // --- Actions ---

  /**
   * Equivalent to optimizedFetchAllPatients (with caching/rules logic inside)
   */
  private async fetchPatientsWithRules(): Promise<Patient[]> {
    const [patients, masterScheduleDoc] = await Promise.all([
      this.patientsApi.fetchAll(),
      this.schedulesApi.fetchById('MASTER_SCHEDULE')
    ]);
    
    const masterRules = masterScheduleDoc?.['schedule'] || {};
    const rulesMap = new Map(Object.entries(masterRules));
    
    return patients.map(patient => ({
      ...patient,
      scheduleRule: rulesMap.get(patient.id) || null
    }));
  }

  public async fetchPatientsIfNeeded(): Promise<void> {
    if (this.hasFetched || this.isLoadingSubject.value) {
      return;
    }
    this.isLoadingSubject.next(true);
    this.errorSubject.next(null);
    try {
      const patients = await this.fetchPatientsWithRules();
      this.allPatientsSubject.next(patients);
      this.hasFetched = true;
      this.bumpPatientsVersion();
      console.log('✅ [RxJS State] Patient data fetched and stored successfully.');
    } catch (err) {
      this.errorSubject.next('讀取病人資料失敗');
      console.error('❌ [RxJS State] Failed to fetch patients:', err);
      this.hasFetched = false;
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  public async forceRefreshPatients(): Promise<Patient[]> {
    this.isLoadingSubject.next(true);
    this.errorSubject.next(null);
    try {
      const patients = await this.fetchPatientsWithRules();
      this.allPatientsSubject.next(patients);
      this.hasFetched = true;
      this.bumpPatientsVersion();
      console.log('🔄 [RxJS State] Patient data force refreshed.');
      return patients;
    } catch (err) {
      this.errorSubject.next('刷新病人資料失敗');
      console.error('❌ [RxJS State] Failed to force refresh patients:', err);
      return [];
    } finally {
      this.isLoadingSubject.next(false);
    }
  }

  public addPatientInStore(newPatient: Patient): void {
    const current = this.allPatientsSubject.value;
    const exists = current.some(p => p.id === newPatient.id);
    if (!exists) {
      this.allPatientsSubject.next([newPatient, ...current]);
      this.bumpPatientsVersion();
      console.log(`[RxJS State] Patient added in store: ${newPatient.name}`);
    }
  }

  public updatePatientInStore(updatedData: Patient): void {
    const current = [...this.allPatientsSubject.value];
    const index = current.findIndex(p => p.id === updatedData.id);
    if (index !== -1) {
      current[index] = { ...current[index], ...updatedData };
      this.allPatientsSubject.next(current);
      this.bumpPatientsVersion();
      console.log(`[RxJS State] Patient updated in store: ${current[index].name}`);
    } else {
      console.warn(`[RxJS State] Patient with ID ${updatedData.id} not found for update, triggering refresh.`);
      void this.forceRefreshPatients();
    }
  }

  public removePatientInStore(patientId: string): void {
    const current = this.allPatientsSubject.value;
    const index = current.findIndex(p => p.id === patientId);
    if (index !== -1) {
      const newPatients = [...current];
      newPatients.splice(index, 1);
      this.allPatientsSubject.next(newPatients);
      console.log(`[RxJS State] Patient removed from store: ${patientId}`);
      this.bumpPatientsVersion();
    }
  }

  public async removeRuleFromMasterSchedule(patientId: string): Promise<boolean> {
    if (!patientId) {
      console.error('[RxJS State] removeRuleFromMasterSchedule: patientId is missing.');
      return false;
    }

    console.log(`[RxJS State] Sending request to remove rule for patient ${patientId}...`);

    try {
      const masterScheduleRef = doc(this.firestore, 'base_schedules', 'MASTER_SCHEDULE');
      const docSnap = await getDoc(masterScheduleRef);

      if (!docSnap.exists()) {
        console.warn('[RxJS State] MASTER_SCHEDULE document does not exist.');
        return true;
      }

      const data = docSnap.data();
      const schedule = (data['schedule'] || {}) as Record<string, unknown>;

      if (schedule[patientId]) {
        delete schedule[patientId];
        await updateDoc(masterScheduleRef, {
          schedule: schedule,
          updatedAt: new Date()
        });
        console.log(`[RxJS State] Successfully sent update to remove rule from Firestore.`);
      } else {
        console.log(`[RxJS State] Rule for patient ${patientId} already absent.`);
      }

      console.log(`✅ [RxJS State] Rule removal request for patient ${patientId} completed.`);
      return true;
    } catch (error) {
      console.error('❌ [RxJS State] Error removing rule from master schedule:', error);
      throw error;
    }
  }

  public reset(): void {
    this.allPatientsSubject.next([]);
    this.isLoadingSubject.next(false);
    this.errorSubject.next(null);
    this.hasFetched = false;
    this.bumpPatientsVersion();
  }
}
