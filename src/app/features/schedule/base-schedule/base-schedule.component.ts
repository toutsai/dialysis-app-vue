import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';
import { SelectionDialogComponent } from '../../../shared/components/selection-dialog/selection-dialog.component';

@Component({
  selector: 'app-base-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent, SelectionDialogComponent],
  templateUrl: './base-schedule.component.html',
  styleUrl: './base-schedule.component.css'
})
export class BaseScheduleComponent implements OnInit {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);

  masterRecord: any = null;
  statusText = '';
  isPageLocked = false;
  searchQuery = '';
  isLoading = true;

  SHIFTS = ['early', 'noon', 'late'];
  WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  FREQ_MAP: Record<string, number[]> = {
    '一三五': [0, 2, 4], '二四六': [1, 3, 5], '一四': [0, 3], '二五': [1, 4],
    '三六': [2, 5], '每日': [0, 1, 2, 3, 4, 5],
  };

  // Alert dialog
  isAlertVisible = false;
  alertTitle = '';
  alertMessage = '';

  private baseSchedulesApi = this.apiManager.getCollection<any>('base_schedules');

  async ngOnInit(): Promise<void> {
    this.isPageLocked = !this.auth.hasPermission('editor');
    await this.patientState.fetchPatientsIfNeeded();
    await this.loadAllData();
  }

  async loadAllData(): Promise<void> {
    this.isLoading = true;
    try {
      const records = await this.baseSchedulesApi.fetchAll();
      this.masterRecord = (records || []).find((r: any) => r.id === 'MASTER_SCHEDULE') || { schedule: {} };
      this.statusText = '總表資料已載入';
    } catch (err) {
      this.statusText = '讀取失敗';
    } finally {
      this.isLoading = false;
    }
  }

  showAlert(title: string, msg: string): void {
    this.alertTitle = title; this.alertMessage = msg; this.isAlertVisible = true;
  }
}
