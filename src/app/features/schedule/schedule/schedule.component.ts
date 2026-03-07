import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService, Patient } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

// 班次代碼
const SHIFT_CODES = { EARLY: 'A', NOON: 'B', LATE: 'C' };
const ORDERED_SHIFT_CODES = [SHIFT_CODES.EARLY, SHIFT_CODES.NOON, SHIFT_CODES.LATE];

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent, ConfirmDialogComponent],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.css'
})
export class ScheduleComponent implements OnInit {
  public auth = inject(AuthService);
  private patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);

  ORDERED_SHIFT_CODES = ORDERED_SHIFT_CODES;
  SHIFT_CODES = SHIFT_CODES;

  // State
  currentDate = new Date();
  isLoading = false;
  hasUnsavedChanges = false;
  isPageLocked = false;
  isSimplifiedViewVisible = false;

  // Schedule data
  currentRecord: any = { schedule: {}, nurseTeams: {} };
  sortedBedNumbers: string[] = [];
  peripheralBedCount = 6;

  // Dialog states
  isAlertDialogVisible = false;
  alertDialogTitle = '';
  alertDialogMessage = '';
  isConfirmDialogVisible = false;
  confirmDialogMessage = '';

  private schedulesApi = this.apiManager.getCollection<any>('schedules');

  get currentDateDisplay(): string {
    return this.formatDate(this.currentDate);
  }

  get weekdayDisplay(): string {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `(星期${weekdays[this.currentDate.getDay()]})`;
  }

  get dayOfWeek(): number {
    return this.currentDate.getDay();
  }

  get patientMap(): Map<string, Patient> {
    return this.patientState.patientMap;
  }

  get allPatients(): Patient[] {
    return this.patientState.allPatients;
  }

  get statusIndicator(): string {
    if (this.isPageLocked) return '🔒 唯讀';
    return this.hasUnsavedChanges ? '⚠️ 未儲存' : '✅ 已同步';
  }

  async ngOnInit(): Promise<void> {
    await this.patientState.fetchPatientsIfNeeded();
    await this.loadSchedule();
  }

  formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async changeDate(delta: number): Promise<void> {
    const newDate = new Date(this.currentDate);
    newDate.setDate(newDate.getDate() + delta);
    this.currentDate = newDate;
    await this.loadSchedule();
  }

  async goToToday(): Promise<void> {
    this.currentDate = new Date();
    await this.loadSchedule();
  }

  async loadSchedule(): Promise<void> {
    this.isLoading = true;
    try {
      const dateStr = this.formatDate(this.currentDate);
      const result = await this.schedulesApi.fetchById(dateStr);
      if (result) {
        this.currentRecord = result;
      } else {
        this.currentRecord = { id: dateStr, schedule: {}, nurseTeams: {} };
      }
      this.hasUnsavedChanges = false;
      this.isPageLocked = !this.auth.hasPermission('editor');
      
      // Build bed numbers
      this.sortedBedNumbers = this.extractBedNumbers();
    } catch (err) {
      console.error('❌ 載入排程失敗:', err);
      this.showAlert('載入失敗', '無法載入排程資料，請重新整理頁面。');
    } finally {
      this.isLoading = false;
    }
  }

  private extractBedNumbers(): string[] {
    const beds = new Set<string>();
    // Default beds 1-28
    for (let i = 1; i <= 28; i++) {
      beds.add(String(i));
    }
    // Also from data
    for (const key of Object.keys(this.currentRecord.schedule || {})) {
      const match = key.match(/^bed-(\d+)-/);
      if (match) beds.add(match[1]);
    }
    return Array.from(beds).sort((a, b) => Number(a) - Number(b));
  }

  getPatientName(slotKey: string): string {
    const slot = this.currentRecord.schedule?.[slotKey];
    if (!slot?.patientId) return '';
    return this.patientMap.get(slot.patientId)?.name || '未知病人';
  }

  getShiftDisplayName(code: string): string {
    const names: Record<string, string> = { A: '早班', B: '午班', C: '晚班' };
    return names[code] || code;
  }

  async saveDataToCloud(): Promise<void> {
    if (!this.hasUnsavedChanges) return;
    this.isLoading = true;
    try {
      const dateStr = this.formatDate(this.currentDate);
      await this.schedulesApi.save(dateStr, {
        ...this.currentRecord,
        updatedAt: new Date().toISOString()
      });
      this.hasUnsavedChanges = false;
      this.showAlert('儲存成功', '排程資料已成功儲存至雲端。');
    } catch (err) {
      this.showAlert('儲存失敗', '無法儲存排程資料，請檢查網路連線後重試。');
    } finally {
      this.isLoading = false;
    }
  }

  showAlert(title: string, message: string): void {
    this.alertDialogTitle = title;
    this.alertDialogMessage = message;
    this.isAlertDialogVisible = true;
  }

  handleSlotClick(slotKey: string): void {
    // TODO: Implement patient assignment dialog
    console.log('Slot clicked:', slotKey);
  }
}
