// src/app/features/schedule/schedule.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { where, orderBy, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as XLSX from 'xlsx';

import { AuthService } from '@app/core/services/auth.service';
import { FirebaseService } from '@app/core/services/firebase.service';
import { PatientStoreService } from '@app/core/services/patient-store.service';
import { TaskStoreService } from '@app/core/services/task-store.service';
import { ArchiveStoreService } from '@app/core/services/archive-store.service';
import { MedicationStoreService } from '@app/core/services/medication-store.service';
import { ApiManagerService, type ApiManager, type FirestoreRecord } from '@app/core/services/api-manager.service';
import { NotificationService } from '@app/core/services/notification.service';

import {
  SHIFT_CODES,
  ORDERED_SHIFT_CODES,
  getShiftDisplayName,
  baseTeams,
  earlyTeams,
  lateTeams,
  allTeams,
} from '@/constants/scheduleConstants.js';
import {
  createEmptySlotData,
  generateAutoNote,
  getUnifiedCellStyle,
} from '@/utils/scheduleUtils.js';
import {
  formatDateToYYYYMMDD,
} from '@/utils/dateUtils.js';
import {
  fetchTeamsByDate,
  saveTeams,
  updateTeams,
} from '@/services/nurseAssignmentsService.js';
import {
  fetchAllSchedules as optimizedFetchAllSchedules,
  saveSchedule as optimizedSaveSchedule,
  updateSchedule as optimizedUpdateSchedule,
  updatePatient as optimizedUpdatePatient,
  createDialysisOrderAndUpdatePatient,
} from '@/services/optimizedApiService.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleSlotData {
  patientId?: string;
  autoNote?: string;
  manualNote?: string;
  shiftId?: string;
  transportMethod?: string;
  archivedPatientInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ScheduleRecord {
  id: string | null;
  date: string;
  schedule: Record<string, ScheduleSlotData>;
  names: Record<string, string>;
}

interface TeamsRecord {
  id: string | null;
  date: string;
  teams: Record<string, Record<string, string | null>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYOUT_DATA = {
  leftWingRows: [
    ['空', 32, 31],
    [33, 35, 36],
    [39, 38, 37],
    [51, 52, 53],
    [57, 56, 55],
    [58, 59, 61],
    [65, 63, 62],
  ] as (string | number)[][],
  rightWingRows: [
    [29, 28, 27],
    [23, 25, 26],
    [22, 21, 19],
    [16, 17, 18],
    [15, 13, 12],
    [8, 9, 11],
    [7, 6, 5],
    [1, 2, 3],
  ] as number[][],
};

const ALL_BED_NUMBERS: (string | number)[] = [
  ...LAYOUT_DATA.leftWingRows.flat(),
  ...LAYOUT_DATA.rightWingRows.flat(),
].filter((b) => b !== '空');

const HEPATITIS_BEDS: (string | number)[] = ['空', 31, 32, 33, 35, 36];
const AISLE_SIDE_BEDS: number[] = [1, 7, 8, 15, 16, 22, 23, 29, 31, 36, 37, 53, 55, 61, 62, 65];
const PERIPHERAL_BED_COUNT = 6;

const FREQ_TO_DAYS: Record<string, number[]> = {
  '一三五': [1, 3, 5],
  '二四六': [2, 4, 6],
  '一四': [1, 4],
  '二五': [2, 5],
  '三六': [3, 6],
  '一五': [1, 5],
  '二六': [2, 6],
  '每周一次': [0, 1, 2, 3, 4, 5, 6],
  '臨時': [],
};

const BASE_TEAMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.css',
})
export class ScheduleComponent implements OnInit, OnDestroy {
  // Services
  readonly auth = inject(AuthService);
  private readonly firebaseService = inject(FirebaseService);
  private readonly patientStore = inject(PatientStoreService);
  private readonly taskStore = inject(TaskStoreService);
  private readonly archiveStore = inject(ArchiveStoreService);
  private readonly medicationStore = inject(MedicationStoreService);
  private readonly apiManagerService = inject(ApiManagerService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  // API managers
  private readonly conditionRecordsApi: ApiManager<FirestoreRecord>;
  private readonly usersApi: ApiManager<FirestoreRecord>;
  private readonly ordersHistoryApi: ApiManager<FirestoreRecord>;

  // Expose constants to template
  readonly ORDERED_SHIFT_CODES = ORDERED_SHIFT_CODES;
  readonly SHIFT_CODES = SHIFT_CODES;
  readonly layoutData = LAYOUT_DATA;
  readonly allBedNumbers = ALL_BED_NUMBERS;
  readonly hepatitisBeds = HEPATITIS_BEDS;
  readonly aisleSideBeds = AISLE_SIDE_BEDS;
  readonly peripheralBedCount = PERIPHERAL_BED_COUNT;
  readonly earlyTeams = earlyTeams;
  readonly lateTeams = lateTeams;
  readonly allTeams = allTeams;
  readonly freqToDays = FREQ_TO_DAYS;

  // Reactive state
  readonly currentDate = signal(new Date());
  readonly recentConditionRecords = signal<FirestoreRecord[]>([]);
  readonly hasUnsavedChanges = signal(false);
  readonly statusIndicator = signal('');
  currentRecord: ScheduleRecord = { id: null, date: '', schedule: {}, names: {} };
  readonly currentTeamsRecord = signal<TeamsRecord>({ id: null, date: '', teams: {} });
  readonly hasUnsavedTeamChanges = signal(false);
  readonly isLoading = signal(true);

  // Dialog visibility
  readonly isAlertDialogVisible = signal(false);
  readonly alertDialogTitle = signal('');
  readonly alertDialogMessage = signal('');
  readonly isAssignmentDialogVisible = signal(false);
  readonly isPatientSelectDialogVisible = signal(false);
  readonly isConfirmDialogVisible = signal(false);
  readonly confirmDialogMessage = signal('');
  readonly isSimplifiedViewVisible = signal(false);
  readonly isMemoDialogVisible = signal(false);
  readonly isConditionRecordDialogVisible = signal(false);
  readonly isDetailModalVisible = signal(false);
  readonly isWardDialogVisible = signal(false);
  readonly isInpatientRoundsDialogVisible = signal(false);
  readonly isRecordsSummaryDialogVisible = signal(false);
  readonly isInjectionDialogVisible = signal(false);
  readonly isInjectionLoading = signal(false);
  readonly isDraftDialogVisible = signal(false);
  readonly isDraftLoading = signal(false);
  readonly isIcuOrdersDialogVisible = signal(false);
  readonly isOrderModalVisible = signal(false);
  readonly isCRRTOrderModalVisible = signal(false);

  // Dialog data
  private onConfirmAction: (() => void) | null = null;
  readonly currentSlotId = signal<string | null>(null);
  readonly selectedPatientForDetail = signal<Record<string, unknown> | null>(null);
  readonly shiftForDetailModal = signal<string | null>(null);
  readonly patientIdForDialog = signal<string | null>(null);
  readonly patientNameForDialog = signal('');
  readonly currentWardNumber = signal('');
  readonly currentEditingShiftId = signal<string | null>(null);
  readonly shiftCodeForDialog = signal<string | null>(null);
  readonly patientIdsForDialog = signal<string[]>([]);
  readonly patientInfoMapForDialog = signal<Record<string, Record<string, string>>>({});
  readonly allDailyInjections = signal<Record<string, unknown>[]>([]);
  readonly injectionDialogDate = signal('');
  readonly filterSpecificInjections = signal(false);
  readonly dailyDrafts = signal<Record<string, unknown>[]>([]);
  readonly draftDialogDate = signal('');
  readonly patientsForDraftDialog = signal<Record<string, unknown>[]>([]);
  readonly sortedSlotsForModal = signal<Record<string, unknown>[]>([]);
  readonly currentPatientIndexForModal = signal(0);
  readonly editingPatientForOrder = signal<Record<string, unknown> | null>(null);
  readonly editingPatientForCRRT = signal<Record<string, unknown> | null>(null);
  readonly crrtOrderHistory = signal<Record<string, unknown>[]>([]);
  readonly noonTakeoffVisibility = signal({ early: false, late: false });

  readonly dailyPhysicians = signal<Record<string, unknown | null>>({ early: null, noon: null, late: null });
  readonly dailyConsultPhysicians = signal<Record<string, unknown | null>>({ morning: null, afternoon: null, night: null });

  // Computed properties
  readonly allPatients = this.patientStore.allPatients;
  readonly patientMap = this.patientStore.patientMap;

  readonly isPageLocked = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDay = new Date(this.currentDate());
    currentDay.setHours(0, 0, 0, 0);
    return currentDay < today;
  });

  readonly sortedBedNumbers = computed(() => {
    const numericBeds = ALL_BED_NUMBERS.filter((b): b is number => typeof b === 'number');
    return [...numericBeds].sort((a, b) => a - b);
  });

  readonly currentDateDisplay = computed(() => this.formatDate(this.currentDate()));
  readonly weekdayDisplay = computed(
    () => ['日', '一', '二', '三', '四', '五', '六'][this.currentDate().getDay()],
  );
  readonly dayOfWeek = computed(() => {
    const day = this.currentDate().getDay();
    return day === 0 ? 7 : day;
  });

  readonly scheduledPatientIds = computed(() => {
    const ids = new Set<string>();
    if (this.currentRecord.schedule) {
      for (const [, slot] of Object.entries(this.currentRecord.schedule)) {
        if (slot?.patientId) ids.add(slot.patientId);
      }
    }
    return ids;
  });

  // --- Schedule Analysis (from useScheduleAnalysis) ---

  private shouldPatientBeScheduled(patient: any, dayOfWeek: number): boolean {
    if (patient.freq === '臨時') return true;
    if (!patient.freq || !this.freqToDays) return false;
    const scheduledDays = this.freqToDays[patient.freq];
    return scheduledDays ? scheduledDays.includes(dayOfWeek) : false;
  }

  readonly dailyUnassignedPatients = computed(() => {
    const today = this.dayOfWeek();
    if (!today) return [];
    const allPatients = this.allPatients() || [];
    return allPatients.filter((p: any) => {
      if (p.isDeleted || p.isDiscontinued || this.scheduledPatientIds().has(p.id)) return false;
      return this.shouldPatientBeScheduled(p, today);
    });
  });

  readonly dailyTemporaryPatients = computed(() => {
    const today = this.dayOfWeek();
    if (!today) return [];
    const allPatients = this.allPatients() || [];
    return allPatients.filter((p: any) => {
      if (p.isDeleted || p.isDiscontinued || this.scheduledPatientIds().has(p.id)) return false;
      return !this.shouldPatientBeScheduled(p, today);
    });
  });

  readonly patientGroupsForDialog = computed(() => {
    const groups: Record<string, any[]> = {
      '今日應排 - 急診': [],
      '今日應排 - 住院': [],
      '今日應排 - 門診': [],
      '今日非排 (臨洗) - 急診': [],
      '今日非排 (臨洗) - 住院': [],
      '今日非排 (臨洗) - 門診': [],
    };
    this.dailyUnassignedPatients().forEach((p: any) => {
      if (p.status === 'er') groups['今日應排 - 急診'].push(p);
      else if (p.status === 'ipd') groups['今日應排 - 住院'].push(p);
      else if (p.status === 'opd') groups['今日應排 - 門診'].push(p);
    });
    this.dailyTemporaryPatients().forEach((p: any) => {
      if (p.status === 'er') groups['今日非排 (臨洗) - 急診'].push(p);
      else if (p.status === 'ipd') groups['今日非排 (臨洗) - 住院'].push(p);
      else if (p.status === 'opd') groups['今日非排 (臨洗) - 門診'].push(p);
    });
    return groups;
  });

  readonly statsToolbarData = computed(() => {
    const counts: Record<string, Record<string, number>> = {};
    ORDERED_SHIFT_CODES.forEach((shiftCode: string) => {
      counts[shiftCode] = { total: 0, opd: 0, ipd: 0, er: 0 };
    });
    const dailyData = { counts, total: 0 };
    if (this.currentRecord.schedule) {
      for (const [shiftKey, slotData] of Object.entries(this.currentRecord.schedule)) {
        if (slotData?.patientId) {
          const patient = this.patientMap().get(slotData.patientId);
          if (!patient) continue;
          const shiftCode = shiftKey.split('-').pop()!;
          if (shiftCode && dailyData.counts[shiftCode]) {
            const shiftStats = dailyData.counts[shiftCode];
            shiftStats['total']++;
            dailyData.total++;
            const status = (patient as Record<string, unknown>)['status'] as string;
            if (status === 'opd') shiftStats['opd']++;
            else if (status === 'ipd') shiftStats['ipd']++;
            else if (status === 'er') shiftStats['er']++;
          }
        }
      }
    }
    return [dailyData];
  });

  readonly statsToolbarWeekdays = computed(() => ['本日']);

  readonly todayInpatients = computed(() => {
    const inpatientsMap = new Map<string, Record<string, unknown>>();
    if (this.currentRecord?.schedule) {
      for (const shiftId in this.currentRecord.schedule) {
        const slot = this.currentRecord.schedule[shiftId];
        if (slot?.patientId && !shiftId.startsWith('peripheral')) {
          const patientInfo = this.getArchivedOrLivePatientInfo(slot);
          const patientDetails = this.patientMap().get(slot.patientId);
          if (patientInfo && patientDetails) {
            const status = (patientInfo as Record<string, unknown>)['status'] as string;
            if (status === 'ipd' || status === 'er') {
              const shiftCode = shiftId.split('-')[2];
              const dialysisBed = String(shiftId.split('-')[1] || 'N/A');
              if (!inpatientsMap.has((patientDetails as Record<string, unknown>)['id'] as string)) {
                inpatientsMap.set((patientDetails as Record<string, unknown>)['id'] as string, {
                  id: `${(patientDetails as Record<string, unknown>)['id']}-${shiftId}`,
                  shiftId,
                  dialysisBed,
                  medicalRecordNumber: (patientDetails as Record<string, unknown>)['medicalRecordNumber'],
                  name: (patientDetails as Record<string, unknown>)['name'],
                  wardNumber: (patientInfo as Record<string, unknown>)['wardNumber'] || '未登錄',
                  shift: shiftCode,
                  transportMethod: slot.transportMethod,
                });
              }
            }
          }
        }
      }
    }
    const inpatients = Array.from(inpatientsMap.values());
    const shiftOrder: Record<string, number> = { early: 1, noon: 2, late: 3, unknown: 4 };
    inpatients.sort((a, b) => {
      const sa = shiftOrder[a['shift'] as string] || 4;
      const sb = shiftOrder[b['shift'] as string] || 4;
      if (sa !== sb) return sa - sb;
      const bedA = a['dialysisBed'] === '未排床' ? 1000 : parseInt(a['dialysisBed'] as string);
      const bedB = b['dialysisBed'] === '未排床' ? 1000 : parseInt(b['dialysisBed'] as string);
      return bedA - bedB;
    });
    return inpatients;
  });

  readonly filteredDailyInjections = computed(() => {
    if (!this.filterSpecificInjections()) return this.allDailyInjections();
    const specificMedCodes = ['ICAC', 'IFER2', 'IPAR1'];
    return this.allDailyInjections().filter((injection) =>
      specificMedCodes.includes(injection['orderCode'] as string),
    );
  });

  private previousDateStr = '';

  constructor() {
    this.conditionRecordsApi = this.apiManagerService.create<FirestoreRecord>('condition_records');
    this.usersApi = this.apiManagerService.create<FirestoreRecord>('users');
    this.ordersHistoryApi = this.apiManagerService.create<FirestoreRecord>('dialysis_orders_history');

    // Watch currentDate changes
    effect(() => {
      const newDate = this.currentDate();
      const newDateStr = this.formatDate(newDate);
      if (this.previousDateStr && newDateStr !== this.previousDateStr) {
        this.medicationStore.clearCache();
        this.noonTakeoffVisibility.set({ early: false, late: false });
        this.loadDataForDay(newDate);
        this.loadDailyStaffInfo(newDate);
      }
      this.previousDateStr = newDateStr;
    });
  }

  // Lifecycle
  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    await this.auth.waitForAuthInit();
    if (this.auth.currentUser()) {
      this.taskStore.startRealtimeUpdates(this.auth.currentUser()!.uid);
    }
    await Promise.all([
      this.loadDataForDay(this.currentDate()),
      this.loadDailyStaffInfo(this.currentDate()),
    ]);
    this.isLoading.set(false);
  }

  ngOnDestroy(): void {
    // cleanup handled by service destroy
  }

  // ---------------------------------------------------------------------------
  // Public methods (used in template)
  // ---------------------------------------------------------------------------

  getShiftDisplayName(shiftCode: string): string {
    return getShiftDisplayName(shiftCode);
  }

  formatDate(date: Date): string {
    if (!date) return '';
    return formatDateToYYYYMMDD(date);
  }

  getPatientName(shiftId: string): string {
    const patientId = this.currentRecord.schedule[shiftId]?.patientId;
    const patient = this.patientMap().get(patientId || '');
    return ((patient as Record<string, unknown>)?.['name'] as string) || '';
  }

  getPatientMode(shiftId: string): string | null {
    const patientId = this.currentRecord.schedule[shiftId]?.patientId;
    if (!patientId) return null;
    const patient = this.patientMap().get(patientId);
    return ((patient as Record<string, unknown>)?.['mode'] as string) || null;
  }

  getCombinedNote(shiftId: string): string {
    const slotData = this.currentRecord.schedule[shiftId];
    if (!slotData) return '';
    const autoTags = (slotData.autoNote || '').split(' ').filter(Boolean);
    const manualTags = (slotData.manualNote || '').split(' ').filter(Boolean);
    const combinedTags = [...new Set([...autoTags, ...manualTags])];
    const finalTags = combinedTags.filter((tag) => !['住', '急'].includes(tag));
    return finalTags.join(' ');
  }

  getPatientCellStyle(shiftId: string): Record<string, boolean> {
    const slotData = this.currentRecord.schedule[shiftId];
    const patientForStyle = this.getArchivedOrLivePatientInfo(slotData);
    if (!patientForStyle) return {};
    const patientId = slotData?.patientId;
    if (!patientId) return getUnifiedCellStyle(slotData, patientForStyle, null, []);
    const messageTypesForPatient =
      [...(this.taskStore.getPatientMessageTypesMapForDate(this.formatDate(this.currentDate())).get(patientId) || [])];
    return getUnifiedCellStyle(slotData, patientForStyle, null, messageTypesForPatient);
  }

  getPatientWardNumber(patientId: string | undefined): string {
    if (!patientId) return '';
    const patient = this.patientMap().get(patientId);
    return ((patient as Record<string, unknown>)?.['wardNumber'] as string) || '';
  }

  isInpatientOrER(shiftId: string): boolean {
    const slotData = this.currentRecord.schedule[shiftId];
    const patientInfo = this.getArchivedOrLivePatientInfo(slotData);
    const status = (patientInfo as Record<string, unknown>)?.['status'] as string;
    return status === 'ipd' || status === 'er';
  }

  getNurseTeam(shiftId: string, type: string): string {
    const slot = this.currentRecord.schedule[shiftId];
    if (!slot?.patientId) return '';
    const shiftCode = shiftId.split('-').pop()!;
    const key = `${slot.patientId}-${shiftCode}`;
    const teamData = this.currentTeamsRecord().teams[key];
    if (!teamData) return '';
    if (type === 'single') return teamData['nurseTeam'] || '';
    else if (type === 'in') return teamData['nurseTeamIn'] || '';
    else if (type === 'out') return teamData['nurseTeamOut'] || '';
    return '';
  }

  changeDate(days: number): void {
    const performChange = () => {
      const newDate = new Date(this.currentDate());
      newDate.setDate(newDate.getDate() + days);
      this.currentDate.set(newDate);
    };
    if ((this.hasUnsavedChanges() || this.hasUnsavedTeamChanges()) && !this.isPageLocked()) {
      this.showConfirm('注意', '您有未儲存的變更，確定要切換日期嗎？', performChange);
    } else {
      performChange();
    }
  }

  goToToday(): void {
    const performChange = () => this.currentDate.set(new Date());
    if ((this.hasUnsavedChanges() || this.hasUnsavedTeamChanges()) && !this.isPageLocked()) {
      this.showConfirm('注意', '您有未儲存的變更，確定要切換到今天嗎？', performChange);
    } else {
      performChange();
    }
  }

  handleSlotClick(shiftId: string): void {
    const slotData = this.currentRecord.schedule[shiftId];
    if (this.isPageLocked()) return;
    if (!slotData?.patientId) {
      this.currentSlotId.set(shiftId);
      this.isPatientSelectDialogVisible.set(true);
      return;
    }
    const patient = this.patientMap().get(slotData.patientId);
    const name = (patient as Record<string, unknown>)?.['name'] as string || '未知';
    this.showConfirm(`確認移除`, `確定要將「${name}」從此班次中移除嗎？`, () => {
      this.handleSlotUpdate(shiftId, null);
    });
  }

  handleSimplifiedCellClick(shiftId: string): void {
    const patientId = this.currentRecord.schedule[shiftId]?.patientId;
    if (patientId) {
      this.openDetailModalForPatient(patientId);
    }
  }

  async saveDataToCloud(): Promise<void> {
    if (this.isPageLocked()) {
      this.showAlert('操作失敗', '操作被鎖定：權限不足或日期已過。');
      return;
    }
    this.statusIndicator.set('儲存中...');
    try {
      const promises: Promise<unknown>[] = [];
      if (this.hasUnsavedChanges()) {
        const dataToSave = {
          date: this.currentRecord.date,
          schedule: this.currentRecord.schedule || {},
          names: this.currentRecord.names || {},
        };
        if (this.currentRecord.id) {
          promises.push(optimizedUpdateSchedule(this.currentRecord.id, dataToSave));
        } else if (Object.keys(dataToSave.schedule).length > 0) {
          promises.push(
            optimizedSaveSchedule(dataToSave).then((savedRecord: { id: string }) => {
              this.currentRecord.id = savedRecord.id;
            }),
          );
        }
      }
      const teamsRec = this.currentTeamsRecord();
      if (this.hasUnsavedTeamChanges() && Object.keys(teamsRec.teams).length > 0) {
        const teamsToSave = { date: teamsRec.date, teams: teamsRec.teams };
        if (teamsRec.id) {
          promises.push(updateTeams(teamsRec.id, teamsToSave));
        } else {
          promises.push(
            saveTeams(teamsToSave).then((savedRecord: { id: string }) => {
              this.currentTeamsRecord.update((r) => ({ ...r, id: savedRecord.id }));
            }),
          );
        }
      }
      await Promise.all(promises);
      this.hasUnsavedChanges.set(false);
      this.hasUnsavedTeamChanges.set(false);
      this.statusIndicator.set('儲存成功！');
      this.showAlert('操作成功', '排程已成功儲存！');
    } catch (error: unknown) {
      console.error('儲存失敗:', error);
      this.statusIndicator.set('儲存失敗');
      const msg = error instanceof Error ? error.message : '未知錯誤';
      this.showAlert('操作失敗', `儲存失敗: ${msg}`);
    }
  }

  runScheduleCheck(): void {
    const warnings: string[] = [];
    const duplicateNames = new Set<string>();
    const tempScheduled: Record<string, boolean> = {};
    Object.values(this.currentRecord.schedule).forEach((slot) => {
      if (slot?.patientId) {
        if (tempScheduled[slot.patientId]) {
          const patient = this.patientMap().get(slot.patientId);
          const name = (patient as Record<string, unknown>)?.['name'] as string;
          if (name) duplicateNames.add(name);
        }
        tempScheduled[slot.patientId] = true;
      }
    });
    if (duplicateNames.size > 0) {
      warnings.push(`【重複排班】:\n- 病人 ${Array.from(duplicateNames).join(', ')} 在本日出現超過一次。`);
    }
    if (warnings.length > 0) {
      this.showAlert('排班檢視警告', warnings.join('\n\n'));
    } else {
      this.showAlert('排班檢視完畢', '未發現明顯的排班或遺漏問題。');
    }
  }

  updateNurseTeam(event: Event, shiftId: string, type: string): void {
    const target = event.target as HTMLSelectElement;
    if (this.isPageLocked()) {
      target.value = this.getNurseTeam(shiftId, type);
      return;
    }
    const slot = this.currentRecord.schedule[shiftId];
    if (!slot?.patientId) {
      target.value = '';
      return;
    }
    const value = target.value;
    const shiftCode = shiftId.split('-').pop()!;
    const key = `${slot.patientId}-${shiftCode}`;
    const teamsRec = { ...this.currentTeamsRecord() };
    if (!teamsRec.teams[key]) {
      teamsRec.teams[key] = {};
    }
    const teamData = teamsRec.teams[key];
    const isPeripheralNoon = shiftId.startsWith('peripheral') && shiftId.endsWith(SHIFT_CODES.NOON);
    if (type === 'single' && isPeripheralNoon) {
      teamData['nurseTeamIn'] = value || null;
      teamData['nurseTeamOut'] = value || null;
      teamData['nurseTeam'] = null;
    } else if (type === 'single') {
      teamData['nurseTeam'] = value || null;
    } else if (type === 'in') {
      teamData['nurseTeamIn'] = value || null;
    } else if (type === 'out') {
      teamData['nurseTeamOut'] = value || null;
    }
    if (!teamData['nurseTeam'] && !teamData['nurseTeamIn'] && !teamData['nurseTeamOut']) {
      delete teamsRec.teams[key];
    }
    this.currentTeamsRecord.set(teamsRec);
    this.setTeamChange();
  }

  updateNote(event: Event, shiftId: string): void {
    const target = event.target as HTMLElement;
    if (this.isPageLocked()) {
      target.textContent = this.getCombinedNote(shiftId);
      return;
    }
    if (!this.currentRecord.schedule[shiftId]) {
      this.currentRecord.schedule[shiftId] = createEmptySlotData(shiftId);
    }
    this.currentRecord.schedule[shiftId].manualNote = (target.textContent || '').trim();
    this.setChange();
  }

  async copyMedicalRecordNumber(mrn: string | undefined): Promise<void> {
    if (!mrn) return;
    try {
      await navigator.clipboard.writeText(mrn);
    } catch (err) {
      console.error('複製失敗:', err);
      this.showAlert('複製失敗', '無法將病歷號複製到剪貼簿，您的瀏覽器可能不支援或未授予權限。');
    }
  }

  promptWardNumber(shiftId: string): void {
    if (this.isPageLocked()) return;
    const slot = this.currentRecord.schedule[shiftId];
    if (!slot?.patientId) return;
    const patient = this.patientMap().get(slot.patientId);
    const patientInfo = this.getArchivedOrLivePatientInfo(slot);
    const status = (patientInfo as Record<string, unknown>)?.['status'] as string;
    if (!patient || !patientInfo || (status !== 'ipd' && status !== 'er')) {
      this.showAlert('提示', '只有住院或急診病人才能設定床號');
      return;
    }
    this.currentEditingShiftId.set(shiftId);
    this.currentWardNumber.set(((patient as Record<string, unknown>)['wardNumber'] as string) || '');
    this.isWardDialogVisible.set(true);
  }

  async handleWardNumberConfirm(value: string): Promise<void> {
    if (!this.currentEditingShiftId()) return;
    const slot = this.currentRecord.schedule[this.currentEditingShiftId()!];
    if (!slot?.patientId) return;
    try {
      await optimizedUpdatePatient(slot.patientId, { wardNumber: value });
      await this.patientStore.forceRefreshPatients();
      this.showAlert('操作成功', '床號已更新');
    } catch (error: unknown) {
      console.error('更新床號失敗:', error);
      this.showAlert('操作失敗', '更新床號失敗');
    }
    this.isWardDialogVisible.set(false);
    this.currentEditingShiftId.set(null);
    this.currentWardNumber.set('');
  }

  exportScheduleToExcel(): void {
    if (this.isLoading()) {
      this.showAlert('提示', '資料正在載入中，請稍後再試。');
      return;
    }
    const data: unknown[][] = [];
    const stats = this.statsToolbarData()[0];
    const statsString = `總計: ${stats.total}人 (早: ${stats.counts['early']?.['total']}, 午: ${stats.counts['noon']?.['total']}, 晚: ${stats.counts['late']?.['total']})`;
    data.push(['部立台北醫院 每日排程表']);
    data.push(['日期:', this.currentDateDisplay()]);
    data.push(['人數統計:', statsString]);
    data.push([]);
    const headers = ['床號', getShiftDisplayName('early'), getShiftDisplayName('noon'), getShiftDisplayName('late')];
    data.push(headers);
    const allBedsToExport: (string | number)[] = [...this.sortedBedNumbers()];
    for (let i = 1; i <= PERIPHERAL_BED_COUNT; i++) {
      allBedsToExport.push(`外圍 ${i}`);
    }
    allBedsToExport.forEach((bedKey) => {
      const row: unknown[] = [bedKey];
      ORDERED_SHIFT_CODES.forEach((shiftCode: string) => {
        const bedNum = String(bedKey).replace('外圍 ', '');
        const shiftId = String(bedKey).startsWith('外圍')
          ? `peripheral-${bedNum}-${shiftCode}`
          : `bed-${bedNum}-${shiftCode}`;
        const slot = this.currentRecord.schedule[shiftId];
        if (slot?.patientId) {
          const patient = this.patientMap().get(slot.patientId) as Record<string, unknown>;
          const statusMap: Record<string, string> = { opd: '門診', ipd: '住院', er: '急診' };
          const cellText = `${patient?.['name'] || '未知'} (${patient?.['medicalRecordNumber'] || 'N/A'})\n[${statusMap[patient?.['status'] as string] || '未知'}]\n${this.getCombinedNote(shiftId)}`;
          row.push(cellText);
        } else {
          row.push('');
        }
      });
      data.push(row);
    });
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 1 }, e: { r: 1, c: 3 } },
      { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } },
    ];
    worksheet['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 30 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '每日排程');
    XLSX.writeFile(workbook, `每日排程表_${this.formatDate(this.currentDate())}.xlsx`);
  }

  async showShiftInjections(shiftCode: string): Promise<void> {
    if (!shiftCode) return;
    const patientIds = Object.entries(this.currentRecord.schedule)
      .filter(([shiftId, slot]) => slot?.patientId && shiftId.endsWith(`-${shiftCode}`))
      .map(([, slot]) => slot.patientId!);
    this.injectionDialogDate.set(this.formatDate(this.currentDate()));
    this.isInjectionDialogVisible.set(true);
    this.isInjectionLoading.set(true);
    this.allDailyInjections.set([]);
    this.filterSpecificInjections.set(false);
    try {
      const injectionsForShift = await this.medicationStore.fetchDailyInjections(
        this.injectionDialogDate(),
        patientIds,
      );
      this.allDailyInjections.set(injectionsForShift);
    } catch (error: unknown) {
      console.error('[ScheduleView] 獲取應打針劑失敗:', error);
      const msg = error instanceof Error ? error.message : '未知錯誤';
      this.showAlert('查詢失敗', `獲取應打針劑清單時發生錯誤: ${msg}`);
      this.isInjectionDialogVisible.set(false);
    } finally {
      this.isInjectionLoading.set(this.medicationStore.isLoading());
    }
  }

  async showShiftMedicationDrafts(shiftCode: string): Promise<void> {
    if (!shiftCode) return;
    const patientsInShift = Object.entries(this.currentRecord.schedule)
      .filter(([shiftId, slot]) => slot?.patientId && shiftId.endsWith(`-${shiftCode}`))
      .map(([shiftId, slot]) => {
        const patientData = this.patientMap().get(slot.patientId!) as Record<string, unknown>;
        if (!patientData) return null;
        const bedNum = shiftId.startsWith('peripheral') ? `外${shiftId.split('-')[1]}` : shiftId.split('-')[1];
        const shift = shiftId.split('-')[2];
        return { ...patientData, bedNum, shift };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const bedA = String(a.bedNum).startsWith('外') ? 1000 + parseInt(String(a.bedNum).substring(1)) : parseInt(a.bedNum);
        const bedB = String(b.bedNum).startsWith('外') ? 1000 + parseInt(String(b.bedNum).substring(1)) : parseInt(b.bedNum);
        return bedA - bedB;
      });
    this.patientsForDraftDialog.set(patientsInShift as Record<string, unknown>[]);
    const patientIds = patientsInShift.map((p: any) => p['id'] as string);
    this.draftDialogDate.set(this.formatDate(this.currentDate()));
    this.isDraftDialogVisible.set(true);
    this.isDraftLoading.set(true);
    this.dailyDrafts.set([]);
    if (patientIds.length === 0) {
      this.isDraftLoading.set(false);
      return;
    }
    try {
      const getDailyMedicationDrafts = httpsCallable(this.firebaseService.functions, 'getDailyMedicationDrafts');
      const CHUNK_SIZE = 30;
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
        const chunk = patientIds.slice(i, i + CHUNK_SIZE);
        const payload = { targetDate: this.draftDialogDate(), patientIds: chunk };
        promises.push(getDailyMedicationDrafts(payload));
      }
      const results = await Promise.all(promises);
      let combinedDrafts: Record<string, unknown>[] = [];
      for (const result of results) {
        const data = (result as { data: { success: boolean; drafts: Record<string, unknown>[] } }).data;
        if (data?.success) {
          combinedDrafts = combinedDrafts.concat(data.drafts);
        }
      }
      this.dailyDrafts.set(combinedDrafts);
    } catch (error: unknown) {
      console.error(`獲取 ${shiftCode} 班藥囑草稿失敗:`, error);
      const msg = error instanceof Error ? error.message : '獲取藥囑草稿時發生未知錯誤';
      this.showAlert('查詢失敗', `獲取藥囑草稿清單時發生錯誤: ${msg}`);
      this.isDraftDialogVisible.set(false);
    } finally {
      this.isDraftLoading.set(false);
    }
  }

  showShiftRecordsSummary(shiftCode: string): void {
    const patientIds = new Set<string>();
    const patientInfoMap: Record<string, Record<string, string>> = {};
    for (const shiftId in this.currentRecord.schedule) {
      if (shiftId.endsWith(`-${shiftCode}`)) {
        const slot = this.currentRecord.schedule[shiftId];
        if (slot?.patientId) {
          patientIds.add(slot.patientId);
          const parts = shiftId.split('-');
          const bedNum = parts[0] === 'peripheral' ? `外${parts[1]}` : parts[1];
          const patient = this.patientMap().get(slot.patientId) as Record<string, unknown>;
          patientInfoMap[slot.patientId] = {
            bedNum,
            medicalRecordNumber: (patient?.['medicalRecordNumber'] as string) || '',
          };
        }
      }
    }
    this.shiftCodeForDialog.set(shiftCode);
    this.patientIdsForDialog.set(Array.from(patientIds));
    this.patientInfoMapForDialog.set(patientInfoMap);
    this.isRecordsSummaryDialogVisible.set(true);
  }

  closeRecordsSummaryDialog(): void {
    this.isRecordsSummaryDialogVisible.set(false);
    this.shiftCodeForDialog.set(null);
    this.patientIdsForDialog.set([]);
    this.patientInfoMapForDialog.set({});
  }

  autoAssignNurseTeams(): void {
    if (this.isPageLocked()) {
      this.showAlert('操作失敗', '頁面已鎖定，無法執行自動分組。');
      return;
    }
    this.showConfirm('確認操作', '此操作將會覆蓋現有的護理師分組，您確定要繼續嗎？', () => {
      this.executeAutoAssignment();
    });
  }

  handleConfirm(): void {
    if (typeof this.onConfirmAction === 'function') this.onConfirmAction();
    this.isConfirmDialogVisible.set(false);
    this.onConfirmAction = null;
  }

  handleCancel(): void {
    this.isConfirmDialogVisible.set(false);
    this.onConfirmAction = null;
  }

  // Drag and drop
  onDrop(event: DragEvent, targetShiftId: string): void {
    if (this.isPageLocked()) return;
    event.preventDefault();
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    const sourceShiftId = event.dataTransfer?.getData('sourceShiftId') || '';
    const jsonData = event.dataTransfer?.getData('application/json');
    if (!jsonData) return;
    const droppedSlotData = JSON.parse(jsonData);
    if (!droppedSlotData?.patientId) return;
    const patient = this.patientMap().get(droppedSlotData.patientId) as Record<string, unknown>;
    if (!patient) return;
    const targetSlotData = this.currentRecord.schedule[targetShiftId];
    if (sourceShiftId === 'sidebar' && this.scheduledPatientIds().has(patient['id'] as string)) {
      this.showConfirm('重複排班警告', `病人 ${patient['name']} 在本日已有排班，您確定要重複排班嗎？`, () => {
        if (targetSlotData?.patientId) {
          this.showAlert('操作失敗', '目標床位已被佔用，無法放置！');
          return;
        }
        this.handleSlotUpdate(targetShiftId, droppedSlotData.patientId, droppedSlotData);
      });
      return;
    }
    if (targetSlotData?.patientId) {
      if (sourceShiftId === 'sidebar') {
        this.showAlert('操作失敗', '目標床位已被佔用，無法從側邊欄拖曳至此。');
        return;
      }
      this.handleSlotUpdate(targetShiftId, droppedSlotData.patientId, droppedSlotData);
      this.handleSlotUpdate(sourceShiftId, targetSlotData.patientId, targetSlotData);
    } else {
      this.handleSlotUpdate(targetShiftId, droppedSlotData.patientId, droppedSlotData);
      if (sourceShiftId && sourceShiftId !== 'sidebar') {
        this.handleSlotUpdate(sourceShiftId, null);
      }
    }
  }

  onBedDragStart(event: DragEvent, sourceShiftId: string): void {
    if (this.isPageLocked()) {
      event.preventDefault();
      return;
    }
    const slotData = this.currentRecord.schedule[sourceShiftId];
    if (!slotData?.patientId) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('sourceShiftId', sourceShiftId);
    event.dataTransfer?.setData('application/json', JSON.stringify(slotData));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent): void {
    if (this.isPageLocked()) return;
    event.preventDefault();
    const targetCell = (event.target as HTMLElement).closest('.patient-name, .peripheral-patient-name');
    if (targetCell) targetCell.classList.add('drag-over');
  }

  onDragLeave(event: DragEvent): void {
    (event.target as HTMLElement).closest('.patient-name, .peripheral-patient-name')?.classList.remove('drag-over');
  }

  handlePatientSelect(data: { patientId: string }): void {
    if (!data.patientId || !this.currentSlotId()) return;
    this.isPatientSelectDialogVisible.set(false);
    if (this.scheduledPatientIds().has(data.patientId)) {
      const patient = this.patientMap().get(data.patientId) as Record<string, unknown>;
      this.showAlert('重複排班警告', `病人 ${patient?.['name']} 在本日已有排班，無法重複排入。`);
      this.currentSlotId.set(null);
      return;
    }
    this.handleSlotUpdate(this.currentSlotId()!, data.patientId);
    this.currentSlotId.set(null);
  }

  handleAssignBed(data: { patientId: string; shiftId: string }): void {
    if (!data.patientId || !data.shiftId || this.isPageLocked()) return;
    if (this.scheduledPatientIds().has(data.patientId)) {
      const patient = this.patientMap().get(data.patientId) as Record<string, unknown>;
      this.showConfirm('重複排班警告', `病人 ${patient?.['name']} 在本日已有排班，您確定要重複排班嗎？`, () => {
        if (this.currentRecord.schedule[data.shiftId]?.patientId) {
          this.showAlert('錯誤', '目標床位已被佔用！');
          return;
        }
        this.handleSlotUpdate(data.shiftId, data.patientId);
      });
      return;
    }
    this.handleSlotUpdate(data.shiftId, data.patientId);
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private getArchivedOrLivePatientInfo(slotData: ScheduleSlotData | undefined): Record<string, unknown> | null {
    if (!slotData?.patientId) return null;
    if (slotData.archivedPatientInfo) return slotData.archivedPatientInfo;
    return (this.patientMap().get(slotData.patientId) as Record<string, unknown>) || null;
  }

  private showAlert(title: string, message: string): void {
    this.alertDialogTitle.set(title);
    this.alertDialogMessage.set(message);
    this.isAlertDialogVisible.set(true);
  }

  private showConfirm(title: string, message: string, onConfirm: () => void): void {
    this.confirmDialogMessage.set(message);
    this.onConfirmAction = onConfirm;
    this.isConfirmDialogVisible.set(true);
  }

  private setChange(): void {
    if (this.isPageLocked()) return;
    this.hasUnsavedChanges.set(true);
    this.statusIndicator.set('有未儲存的變更');
  }

  private setTeamChange(): void {
    if (this.isPageLocked()) return;
    this.hasUnsavedTeamChanges.set(true);
    this.hasUnsavedChanges.set(true);
    this.statusIndicator.set('有未儲存的變更');
  }

  private handleSlotUpdate(shiftId: string, patientId: string | null, fullSlotData?: ScheduleSlotData): void {
    if (this.isPageLocked()) return;
    if (patientId) {
      const patient = this.patientMap().get(patientId) as Record<string, unknown>;
      if (!patient) return;
      const correctShiftCode = shiftId.split('-').pop()!;
      let newSlotData: ScheduleSlotData;
      if (fullSlotData) {
        newSlotData = { ...fullSlotData, patientId };
      } else {
        newSlotData = { patientId, manualNote: patient['status'] === 'ipd' ? '住' : '' };
      }
      newSlotData.autoNote = generateAutoNote(patient);
      newSlotData.shiftId = correctShiftCode;
      this.currentRecord.schedule[shiftId] = newSlotData;
    } else {
      delete this.currentRecord.schedule[shiftId];
    }
    this.setChange();
  }

  private openDetailModalForPatient(patientId: string): void {
    const patient = this.patientMap().get(patientId) as Record<string, unknown>;
    if (patient) {
      this.selectedPatientForDetail.set(patient);
      this.isDetailModalVisible.set(true);
    }
  }

  private async loadDataForDay(date: Date): Promise<void> {
    this.hasUnsavedChanges.set(false);
    this.hasUnsavedTeamChanges.set(false);
    this.statusIndicator.set('讀取中...');
    this.isLoading.set(true);
    const dateStr = this.formatDate(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    try {
      const isPastDate = targetDate < today;
      if (!isPastDate) {
        await this.patientStore.fetchPatientsIfNeeded();
      }
      let scheduleRecord: Record<string, unknown>;
      if (isPastDate) {
        scheduleRecord = await this.archiveStore.fetchScheduleByDate(dateStr);
      } else {
        scheduleRecord = await this.fetchLiveSchedule(dateStr);
      }
      const [teamsData] = await Promise.all([fetchTeamsByDate(dateStr), this.fetchRecentRecords()]);
      this.currentRecord.id = (scheduleRecord['id'] as string) || null;
      this.currentRecord.date = dateStr;
      this.currentRecord.schedule = (scheduleRecord['schedule'] as Record<string, ScheduleSlotData>) || {};
      this.currentRecord.names = (scheduleRecord['names'] as Record<string, string>) || {};
      this.currentTeamsRecord.set(teamsData || { id: null, date: dateStr, teams: {} });
      this.statusIndicator.set(scheduleRecord['id'] ? '資料已載入' : '本日無排程資料');
    } catch (error: unknown) {
      console.error(`載入 ${dateStr} 資料失敗:`, error);
      this.statusIndicator.set('讀取失敗');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async fetchLiveSchedule(dateStr: string): Promise<Record<string, unknown>> {
    const schedulesApi = this.apiManagerService.create<FirestoreRecord>('schedules');
    const dailyRecords = await schedulesApi.fetchAll([where('date', '==', dateStr)]);
    if (dailyRecords.length === 0) return { date: dateStr, schedule: {} };
    const record = dailyRecords[0] as Record<string, unknown>;
    const finalSchedule: Record<string, unknown> = {};
    const schedule = record['schedule'] as Record<string, Record<string, unknown>>;
    if (schedule) {
      for (const shiftId in schedule) {
        const dbSlotData = schedule[shiftId];
        if (dbSlotData?.['patientId'] && this.patientMap().has(dbSlotData['patientId'] as string)) {
          const patient = this.patientMap().get(dbSlotData['patientId'] as string) as Record<string, unknown>;
          const mergedSlot = { ...createEmptySlotData(shiftId), ...dbSlotData };
          if (patient) mergedSlot['autoNote'] = generateAutoNote(patient);
          finalSchedule[shiftId] = mergedSlot;
        }
      }
    }
    record['schedule'] = finalSchedule;
    return record;
  }

  private async fetchRecentRecords(): Promise<FirestoreRecord[]> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const records = await this.conditionRecordsApi.fetchAll([where('createdAt', '>=', sevenDaysAgo)]);
      this.recentConditionRecords.set(records || []);
      return records;
    } catch (error: unknown) {
      console.error('獲取近期病情紀錄失敗:', error);
      return [];
    }
  }

  private async loadDailyStaffInfo(date: Date): Promise<void> {
    try {
      const dateStr = this.formatDate(date).substring(0, 7);
      const physicianSchedulesApi = this.apiManagerService.create<FirestoreRecord>('physician_schedules');
      const [monthScheduleDoc, usersSnapshot] = await Promise.all([
        physicianSchedulesApi.fetchById(dateStr),
        this.usersApi.fetchAll([where('title', 'in', ['主治醫師', '專科護理師'])]),
      ]);
      const userMap = new Map(usersSnapshot.map((u: FirestoreRecord) => [u['id'], u]));
      const dialysisPhysiciansData: Record<string, unknown> = { early: null, noon: null, late: null };
      const consultPhysiciansData: Record<string, unknown> = { morning: null, afternoon: null, night: null };
      if (monthScheduleDoc) {
        const dayOfMonth = date.getDate();
        const doc = monthScheduleDoc as Record<string, unknown>;
        const schedule = doc['schedule'] as Record<string, Record<string, Record<string, unknown>>>;
        const daySchedule = schedule?.[dayOfMonth];
        if (daySchedule) {
          dialysisPhysiciansData['early'] = userMap.get(daySchedule['early']?.['physicianId'] as string) || null;
          dialysisPhysiciansData['noon'] = userMap.get(daySchedule['noon']?.['physicianId'] as string) || null;
          dialysisPhysiciansData['late'] = userMap.get(daySchedule['late']?.['physicianId'] as string) || null;
        }
        const consultationSchedule = doc['consultationSchedule'] as Record<string, Record<string, Record<string, unknown>>>;
        const consultationDaySchedule = consultationSchedule?.[dayOfMonth];
        if (consultationDaySchedule) {
          consultPhysiciansData['morning'] = userMap.get(consultationDaySchedule['morning']?.['physicianId'] as string) || null;
          consultPhysiciansData['afternoon'] = userMap.get(consultationDaySchedule['afternoon']?.['physicianId'] as string) || null;
          consultPhysiciansData['night'] = userMap.get(consultationDaySchedule['night']?.['physicianId'] as string) || null;
        }
      }
      this.dailyPhysicians.set(dialysisPhysiciansData);
      this.dailyConsultPhysicians.set(consultPhysiciansData);
    } catch (error: unknown) {
      console.error('載入每日負責人資訊失敗:', error);
      this.dailyPhysicians.set({ early: null, noon: null, late: null });
      this.dailyConsultPhysicians.set({ morning: null, afternoon: null, night: null });
    }
  }

  /**
   * distributePatients — 核心分配引擎 (移植自 useTeamAssigner.js v4)
   * 根據臨床規則將病人分配到護理組別。
   */
  private distributePatients(
    allPatients: { id: string; shiftId: string; shiftCode: string; status: string; isHepatitis: boolean; isPeripheral: boolean }[],
    teams: string[],
    rules: {
      priorityTeams: { hepatitis: string | null; inPatientTeams?: string[]; inPatientCapacity?: Record<string, number> };
      mainDistribution: { specialTeam: { name: string; capacity: number } | null; regularTeams: string[] };
    },
  ): Record<string, typeof allPatients> {
    const assignments: Record<string, typeof allPatients> = {};
    teams.forEach((t) => { assignments[t] = []; });

    const assignedPatientIds = new Set<string>();
    const addPatient = (team: string, patient: typeof allPatients[0]): boolean => {
      if (team && team.includes('K')) return false;
      if (patient && assignments[team] && !assignedPatientIds.has(patient.id)) {
        assignments[team].push(patient);
        assignedPatientIds.add(patient.id);
        return true;
      }
      return false;
    };

    const isInPatientOrER = (p: typeof allPatients[0]) => p.status === 'ipd' || p.status === 'er';

    // --- 步驟一：優先分配 ---
    const { hepatitis, inPatientTeams, inPatientCapacity } = rules.priorityTeams;

    // B肝病人優先分配
    if (hepatitis) {
      allPatients.filter((p) => p.isHepatitis).forEach((p) => addPatient(hepatitis, p));
    }

    // 住院/急診病人輪流分配
    if (inPatientTeams && inPatientCapacity) {
      const unassignedInPatients = allPatients.filter(
        (p) => isInPatientOrER(p) && !assignedPatientIds.has(p.id),
      );
      let priorityTeamIndex = 0;
      unassignedInPatients.forEach((patient) => {
        for (let i = 0; i < inPatientTeams.length; i++) {
          const teamIndex = (priorityTeamIndex + i) % inPatientTeams.length;
          const team = inPatientTeams[teamIndex];
          if (assignments[team].length < (inPatientCapacity[team] || 0)) {
            if (addPatient(team, patient)) {
              priorityTeamIndex = (teamIndex + 1) % inPatientTeams.length;
              break;
            }
          }
        }
      });
    }

    // --- 步驟二：處理特殊組 (A組) ---
    const { specialTeam, regularTeams } = rules.mainDistribution;
    if (specialTeam) {
      const availableOpdPatients = allPatients.filter(
        (p) => !assignedPatientIds.has(p.id) && p.status === 'opd' && !p.isHepatitis,
      );
      availableOpdPatients.slice(0, specialTeam.capacity).forEach((p) => addPatient(specialTeam.name, p));
    }

    // --- 步驟三：為常規組計算最終目標人數並填充 ---
    const participatingTeams = regularTeams.filter((team) => !team.includes('K'));
    const remainingPatients = allPatients.filter((p) => !assignedPatientIds.has(p.id));

    let totalWorkload = remainingPatients.length;
    participatingTeams.forEach((team) => { totalWorkload += assignments[team]?.length || 0; });

    if (totalWorkload > 0 && participatingTeams.length > 0) {
      const baseSize = Math.floor(totalWorkload / participatingTeams.length);
      const remainder = totalWorkload % participatingTeams.length;

      const finalTargetSize: Record<string, number> = {};
      participatingTeams.forEach((team, index) => {
        finalTargetSize[team] = baseSize + (index < remainder ? 1 : 0);
      });

      const neededCounts: Record<string, number> = {};
      participatingTeams.forEach((team) => {
        neededCounts[team] = Math.max(0, finalTargetSize[team] - (assignments[team]?.length || 0));
      });

      let patientIndex = 0;
      for (const team of participatingTeams) {
        const needed = neededCounts[team];
        if (needed > 0) {
          remainingPatients.slice(patientIndex, patientIndex + needed).forEach((p) => addPatient(team, p));
          patientIndex += needed;
        }
      }
    }

    return assignments;
  }

  /**
   * executeAutoAssignment — 執行四個班次的自動分組 (移植自 ScheduleView.vue)
   */
  private executeAutoAssignment(): void {
    // 清空現有分組
    this.currentTeamsRecord.update((r) => ({ ...r, teams: {} }));

    const hepatitisBedNums = [31, 32, 33, 35, 36];

    // 取得指定班別的病人清單（帶豐富資訊）
    const getRichPatientList = (shiftCode: string) => {
      return Object.entries(this.currentRecord.schedule)
        .filter(([shiftId, slot]) => slot?.patientId && shiftId.endsWith(shiftCode))
        .map(([shiftId, slot]) => {
          const patientData = this.patientMap().get(slot.patientId!) as Record<string, unknown> | undefined;
          if (!patientData) return null;
          const bedNumberStr = shiftId.split('-')[1];
          const bedNumber = parseInt(bedNumberStr, 10);
          return {
            id: slot.patientId!,
            shiftId,
            shiftCode,
            status: (patientData['status'] as string) || 'opd',
            isHepatitis: !isNaN(bedNumber) && hepatitisBedNums.includes(bedNumber),
            isPeripheral: shiftId.startsWith('peripheral'),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    };

    const mainArea = (list: ReturnType<typeof getRichPatientList>) => list.filter((p) => !p.isPeripheral);
    const peripheral = (list: ReturnType<typeof getRichPatientList>) => list.filter((p) => p.isPeripheral);
    const sortByBed = (list: ReturnType<typeof getRichPatientList>) => {
      const getSortKey = (shiftId: string) => {
        const parts = shiftId.split('-');
        if (parts[0] === 'peripheral') return 100 + parseInt(parts[1], 10);
        const num = parseInt(parts[1], 10);
        return isNaN(num) ? 999 : num;
      };
      return [...list].sort((a, b) => getSortKey(a.shiftId) - getSortKey(b.shiftId));
    };

    // 取得各班病人
    const allEarlyPatients = getRichPatientList(SHIFT_CODES.EARLY);
    const allNoonPatients = getRichPatientList(SHIFT_CODES.NOON);
    const allLatePatients = getRichPatientList(SHIFT_CODES.LATE);

    // --- 早班分組 ---
    const earlyMain = mainArea(allEarlyPatients);
    const useEarlyTeamA = earlyMain.length > 36;
    const earlyTeamsToUse = baseTeams.filter((t: string) => t !== 'L' && t !== '外圍').map((t: string) => `早${t}`);
    const earlyRegularTeams = baseTeams
      .filter((t: string) => !['A', 'K', 'L', '外圍'].includes(t))
      .map((t: string) => `早${t}`);
    const earlyRules = {
      priorityTeams: {
        hepatitis: '早G',
        inPatientTeams: ['早H', '早I', '早J'],
        inPatientCapacity: { '早H': 2, '早I': 2, '早J': 2 } as Record<string, number>,
      },
      mainDistribution: {
        specialTeam: useEarlyTeamA ? { name: '早A', capacity: 2 } : null,
        regularTeams: earlyRegularTeams,
      },
    };
    const earlyAssignments = this.distributePatients(sortByBed(earlyMain), earlyTeamsToUse, earlyRules);
    earlyAssignments['早外圍'] = peripheral(allEarlyPatients);

    // --- 午班上針（同早班規則）---
    const noonMain = mainArea(allNoonPatients);
    const useNoonTeamA = noonMain.length > 36;
    const noonOnRules = {
      ...earlyRules,
      mainDistribution: {
        specialTeam: useNoonTeamA ? { name: '早A', capacity: 2 } : null,
        regularTeams: earlyRegularTeams,
      },
    };
    const noonOnAssignments = this.distributePatients(sortByBed(noonMain), earlyTeamsToUse, noonOnRules);
    noonOnAssignments['早外圍'] = peripheral(allNoonPatients);

    // --- 午班收針 & 晚班（使用晚班規則）---
    const lateTeamsToUse = baseTeams.filter((t: string) => t <= 'H').map((t: string) => `晚${t}`);
    const lateRules = {
      priorityTeams: {
        hepatitis: '晚F',
        inPatientTeams: ['晚H'],
        inPatientCapacity: { '晚H': 2 } as Record<string, number>,
      },
      mainDistribution: {
        specialTeam: null,
        regularTeams: lateTeamsToUse,
      },
    };
    const noonOffAssignments = this.distributePatients(sortByBed(noonMain), lateTeamsToUse, lateRules);
    noonOffAssignments['晚外圍'] = peripheral(allNoonPatients);

    const lateMain = mainArea(allLatePatients);
    const lateAssignments = this.distributePatients(sortByBed(lateMain), lateTeamsToUse, lateRules);
    lateAssignments['晚外圍'] = peripheral(allLatePatients);

    // --- 寫入 currentTeamsRecord ---
    const teams: Record<string, Record<string, string>> = {};

    for (const team in earlyAssignments) {
      for (const patient of earlyAssignments[team]) {
        const key = `${patient.id}-${SHIFT_CODES.EARLY}`;
        if (!teams[key]) teams[key] = {};
        teams[key]['nurseTeam'] = team;
      }
    }
    for (const team in noonOnAssignments) {
      for (const patient of noonOnAssignments[team]) {
        const key = `${patient.id}-${SHIFT_CODES.NOON}`;
        if (!teams[key]) teams[key] = {};
        teams[key]['nurseTeamIn'] = team;
      }
    }
    for (const team in noonOffAssignments) {
      for (const patient of noonOffAssignments[team]) {
        const key = `${patient.id}-${SHIFT_CODES.NOON}`;
        if (!teams[key]) teams[key] = {};
        teams[key]['nurseTeamOut'] = team;
      }
    }
    for (const team in lateAssignments) {
      for (const patient of lateAssignments[team]) {
        const key = `${patient.id}-${SHIFT_CODES.LATE}`;
        if (!teams[key]) teams[key] = {};
        teams[key]['nurseTeam'] = team;
      }
    }

    this.currentTeamsRecord.update((r) => ({ ...r, teams }));
    this.setTeamChange();
    this.hasUnsavedChanges.set(true);
    this.statusIndicator.set('自動分組完成，請確認並儲存');
    this.showAlert('操作成功', '四個班次的自動分組已全部完成！請檢視結果並點擊「儲存」。');
  }

  // Helper to generate array for ngFor
  peripheralBedRange(): number[] {
    return Array.from({ length: PERIPHERAL_BED_COUNT }, (_, i) => i + 1);
  }
}
