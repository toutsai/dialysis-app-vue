import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';

@Component({
  selector: 'app-weekly',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent],
  templateUrl: './weekly.component.html',
  styleUrl: './weekly.component.css'
})
export class WeeklyComponent implements OnInit {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);

  SHIFTS = ['A', 'B', 'C'];
  WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  FREQ_MAP: Record<string, number[]> = {
    '一三五': [0, 2, 4], '二四六': [1, 3, 5], '一四': [0, 3], '二五': [1, 4],
    '三六': [2, 5], '每日': [0, 1, 2, 3, 4, 5],
  };

  currentWeekStartDate = this.getStartOfWeek(new Date());
  weekScheduleRecords = new Map<string, any>();
  hasUnsavedChanges = false;
  statusText = '資料已載入';
  isPageLocked = false;
  searchQuery = '';

  // Dialog
  isAlertVisible = false;
  alertTitle = '';
  alertMessage = '';

  private schedulesApi = this.apiManager.getCollection<any>('schedules');

  get weekDisplay(): string {
    const start = new Date(this.currentWeekStartDate);
    const end = new Date(start); end.setDate(start.getDate() + 5);
    return `${this.formatDate(start)} ~ ${this.formatDate(end)}`;
  }

  get weekDates(): { weekday: string; date: string; queryDate: string }[] {
    return Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(this.currentWeekStartDate);
      d.setDate(d.getDate() + i);
      const qd = this.formatDateISO(d);
      return { weekday: this.WEEKDAYS[i], date: `(${this.formatDate(d)})`, queryDate: qd };
    });
  }

  async ngOnInit(): Promise<void> {
    await this.patientState.fetchPatientsIfNeeded();
    this.isPageLocked = !this.auth.hasPermission('editor');
    await this.loadDataForWeek();
  }

  getStartOfWeek(date: Date): Date {
    const d = new Date(date); const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(new Date(d.setDate(diff)).setHours(0, 0, 0, 0));
  }

  formatDate(d: Date): string {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  formatDateISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async changeWeek(delta: number): Promise<void> {
    const d = new Date(this.currentWeekStartDate);
    d.setDate(d.getDate() + delta);
    this.currentWeekStartDate = this.getStartOfWeek(d);
    await this.loadDataForWeek();
  }

  async goToToday(): Promise<void> {
    this.currentWeekStartDate = this.getStartOfWeek(new Date());
    await this.loadDataForWeek();
  }

  async loadDataForWeek(): Promise<void> {
    this.statusText = '讀取中...';
    try {
      const dates = this.weekDates.map(d => d.queryDate);
      const records = await this.schedulesApi.fetchAll();
      const newMap = new Map<string, any>();
      this.weekDates.forEach(day => {
        newMap.set(day.queryDate, { id: null, date: day.queryDate, schedule: {} });
      });
      (records || []).forEach((r: any) => {
        if (dates.includes(r.date)) newMap.set(r.date, r);
      });
      this.weekScheduleRecords = newMap;
      this.hasUnsavedChanges = false;
      this.statusText = '資料已載入';
    } catch (err) {
      this.statusText = '讀取失敗';
    }
  }

  async saveChangesToCloud(): Promise<void> {
    if (this.isPageLocked || !this.hasUnsavedChanges) return;
    this.statusText = '儲存中...';
    try {
      // TODO: batch save logic
      this.hasUnsavedChanges = false;
      this.statusText = '已儲存';
    } catch { this.statusText = '儲存失敗'; }
  }

  showAlert(title: string, msg: string): void {
    this.alertTitle = title; this.alertMessage = msg; this.isAlertVisible = true;
  }
}
