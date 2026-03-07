import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';

@Component({
  selector: 'app-lab-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent],
  templateUrl: './lab-reports.component.html',
  styleUrl: './lab-reports.component.css'
})
export class LabReportsComponent implements OnInit {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);
  private router = inject(Router);

  activeTab: 'query' | 'alert' | 'upload' = 'query';
  searchType: 'group' | 'individual' = 'group';
  isSearchVisible = true;
  isLoadingReports = false;
  searchPerformed = false;
  reportData: any[] = [];
  reportColumns: string[] = [];

  groupSearchParams = { freq: '一三五', shift: 'early', month: this.formatMonth(new Date()) };
  individualSearchQuery = '';
  individualSearchYear = new Date().getFullYear();

  // Upload
  selectedFile: File | null = null;
  isUploading = false;
  uploadResult: any = null;
  isDragOver = false;

  // Alert
  isLoadingAlerts = false;
  alertList: any[] = [];

  isAlertVisible = false; alertTitle = ''; alertMessage = '';

  private labReportsApi = this.apiManager.getCollection<any>('lab_reports');

  readonly prioritizedLabItems = ['WBC', 'Platelet', 'Hb', 'Ferritin', 'TSAT', 'GlucoseAC', 'Triglyceride', 'LDL',
    'Albumin', 'ALT', 'Na', 'K', 'P', 'Ca', 'CaXP', 'iPTH', 'BUN', 'PostBUN', 'Creatinine', 'Kt/V', 'URR'];

  readonly labItemDisplayNames: Record<string, string> = {
    WBC: '白血球', Platelet: '血小板', Hb: '血色素', Ferritin: '鐵蛋白', TSAT: 'TSAT',
    GlucoseAC: '飯前血糖', Triglyceride: '三酸甘油酯', LDL: 'LDL', Albumin: '白蛋白',
    ALT: 'ALT', Na: '鈉', K: '鉀', P: '磷', Ca: '鈣', CaXP: 'Ca×P', iPTH: 'iPTH',
    BUN: 'BUN', PostBUN: '洗後BUN', Creatinine: '肌酐', 'Kt/V': 'Kt/V', URR: 'URR',
    Iron: 'Iron', TIBC: 'TIBC',
  };

  readonly SHIFT_MAP: Record<string, string> = { '0': '早班', '1': '午班', '2': '晚班' };

  async ngOnInit(): Promise<void> {
    await this.patientState.fetchPatientsIfNeeded();
  }

  setActiveTab(tab: 'query' | 'alert' | 'upload'): void {
    this.activeTab = tab;
  }

  async handleSearch(): Promise<void> {
    this.isLoadingReports = true;
    this.searchPerformed = true;
    this.reportData = [];
    this.reportColumns = [];
    try {
      if (this.searchType === 'group') {
        await this.searchGroupReports();
      } else {
        await this.searchIndividualReports();
      }
    } catch (err) {
      console.error('查詢報告失敗:', err);
      this.showAlert('錯誤', '查詢報告時發生錯誤，請稍後再試。');
    } finally { this.isLoadingReports = false; }
  }

  private async searchGroupReports(): Promise<void> {
    const records = await this.labReportsApi.fetchAll();
    // Filter by month and build table data
    const monthKey = this.groupSearchParams.month;
    this.reportData = (records || [])
      .filter((r: any) => {
        const reportMonth = r.reportDate?.slice?.(0, 7) || '';
        return reportMonth === monthKey;
      })
      .map((r: any) => ({
        patientId: r.patientId,
        patientName: r.patientName || '未知',
        freq: r.freq || '-',
        bedNum: r.bedNum || '-',
        shiftIndex: r.shiftIndex,
        labData: r.data || {},
      }));
  }

  private async searchIndividualReports(): Promise<void> {
    const term = this.individualSearchQuery.trim().toLowerCase();
    if (!term) { this.showAlert('提示', '請輸入姓名或病歷號'); return; }
    const records = await this.labReportsApi.fetchAll();
    const filtered = (records || []).filter((r: any) =>
      (r.patientName || '').toLowerCase().includes(term) ||
      (r.medicalRecordNumber || '').includes(term)
    );
    // Build month columns
    const monthSet = new Set<string>();
    const processed: Record<string, Record<string, any>> = {};
    filtered.forEach((r: any) => {
      const month = r.reportDate?.slice?.(0, 7) || '';
      if (!month) return;
      monthSet.add(month);
      for (const [key, val] of Object.entries(r.data || {})) {
        if (!processed[key]) processed[key] = {};
        processed[key][month] = val;
      }
    });
    this.reportColumns = Array.from(monthSet).sort().reverse();
    this.reportData = processed as any;
  }

  changeYear(offset: number): void {
    this.individualSearchYear += offset;
    if (this.individualSearchQuery.trim()) this.handleSearch();
  }

  formatShift(shiftIndex: number | undefined): string {
    return this.SHIFT_MAP[String(shiftIndex)] ?? 'N/A';
  }

  handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
    this.uploadResult = null;
  }

  private showAlert(title: string, msg: string): void {
    this.alertTitle = title; this.alertMessage = msg; this.isAlertVisible = true;
  }

  private formatMonth(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
