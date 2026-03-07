import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';

interface ShiftStats { opd: number; ipd: number; er: number; total: number; }
interface DailyLogData {
  date: string;
  stats: {
    main_beds: { early: ShiftStats; noon: ShiftStats; late: ShiftStats };
    peripheral_beds: { early: { ipd: number; er: number }; noon: { ipd: number; er: number }; late: { ipd: number; er: number } };
    patient_care: { onDL: Record<string, string>; akChange: Record<string, string>; noShow: Record<string, string> };
    staffing: { details: any[]; adjustments: Record<string, number> };
  };
  patientMovements: any[];
  vascularAccessLog: any[];
  otherNotes: string;
  leader: Record<string, { name: string; signedAt: any }>;
}

@Component({
  selector: 'app-daily-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './daily-log.component.html',
  styleUrl: './daily-log.component.css'
})
export class DailyLogComponent implements OnInit {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);

  selectedDate = this.formatDateISO(new Date());
  isLoading = true;
  isPageLocked = false;
  statusText = '載入中...';
  isStaffingDetailsVisible = false;

  dailyLog: DailyLogData = this.createEmptyLog();

  private dailyLogsApi = this.apiManager.getCollection<any>('daily_logs');
  private schedulesApi = this.apiManager.getCollection<any>('schedules');

  get selectedDateDisplay(): string {
    try { return new Date(this.selectedDate + 'T00:00:00').toLocaleDateString('zh-TW'); } catch { return this.selectedDate; }
  }

  get weekdayDisplay(): string {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    try { return `星期${days[new Date(this.selectedDate + 'T00:00:00').getDay()]}`; } catch { return ''; }
  }

  get totalPatients(): { early: number; noon: number; late: number } {
    const s = this.dailyLog.stats;
    const calc = (shift: 'early' | 'noon' | 'late') =>
      (s.main_beds[shift].total || 0) + (s.peripheral_beds[shift].ipd || 0) + (s.peripheral_beds[shift].er || 0);
    return { early: calc('early'), noon: calc('noon'), late: calc('late') };
  }

  get calculatedStaffingTotals() {
    const details = this.dailyLog.stats.staffing.details;
    const adj = this.dailyLog.stats.staffing.adjustments;
    let early = 0, noon = 0, late = 0;
    details.forEach((item: any) => {
      early += (item.count || 0) * (item.ratio1 || 0);
      noon += (item.count || 0) * (item.ratio2 || 0);
      late += (item.count || 0) * (item.ratio3 || 0);
    });
    early += (adj['shift1'] || 0) * 0.125;
    noon += (adj['shift2'] || 0) * 0.125;
    late += (adj['shift3'] || 0) * 0.125;
    return { early, noon, late, total: early + noon + late };
  }

  get nursePatientRatios() {
    const total = this.totalPatients;
    const staff = this.calculatedStaffingTotals;
    const calc = (patients: number, nurses: number) => nurses > 0 ? `1:${(patients / nurses).toFixed(1)}` : '-';
    const grandTotal = total.early + total.noon + total.late;
    return {
      early: calc(total.early, staff.early), noon: calc(total.noon, staff.noon),
      late: calc(total.late, staff.late), total: calc(grandTotal, staff.total),
    };
  }

  async ngOnInit(): Promise<void> {
    this.isPageLocked = !this.auth.hasPermission('editor');
    await this.patientState.fetchPatientsIfNeeded();
    await this.loadDailyLog();
  }

  async loadDailyLog(): Promise<void> {
    this.isLoading = true;
    try {
      const records = await this.dailyLogsApi.fetchAll();
      const record = (records || []).find((r: any) => r.date === this.selectedDate);
      if (record) {
        this.dailyLog = this.mergeWithDefaults(record);
      } else {
        this.dailyLog = this.createEmptyLog();
        await this.computeStatsFromSchedule();
      }
      this.statusText = '資料已載入';
    } catch (err) {
      this.statusText = '讀取失敗';
      console.error('載入日誌失敗:', err);
    } finally { this.isLoading = false; }
  }

  private async computeStatsFromSchedule(): Promise<void> {
    try {
      const schedules = await this.schedulesApi.fetchAll();
      const todaySched = (schedules || []).find((s: any) => s.date === this.selectedDate);
      if (!todaySched?.schedule) return;

      for (const [shift, beds] of Object.entries(todaySched.schedule as Record<string, any>)) {
        if (!beds || typeof beds !== 'object') continue;
        const shiftKey = shift as 'early' | 'noon' | 'late';
        if (!this.dailyLog.stats.main_beds[shiftKey]) continue;
        let opd = 0, ipd = 0, er = 0;
        for (const entry of Object.values(beds) as any[]) {
          if (!entry?.patientId) continue;
          const patient = this.patientState.allPatients.find((p: any) => p.id === entry.patientId);
          if (!patient) continue;
          if (patient.status === 'opd') opd++;
          else if (patient.status === 'ipd') ipd++;
          else if (patient.status === 'er') er++;
          else opd++;
        }
        this.dailyLog.stats.main_beds[shiftKey] = { opd, ipd, er, total: opd + ipd + er };
      }
    } catch (err) { console.error('計算排班統計失敗:', err); }
  }

  changeDate(delta: number): void {
    const d = new Date(this.selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    this.selectedDate = this.formatDateISO(d);
    this.loadDailyLog();
  }

  goToToday(): void {
    this.selectedDate = this.formatDateISO(new Date());
    this.loadDailyLog();
  }

  async saveDailyLog(): Promise<void> {
    if (this.isPageLocked) return;
    this.statusText = '儲存中...';
    try {
      await this.dailyLogsApi.save({ ...this.dailyLog, date: this.selectedDate });
      this.statusText = '已儲存';
    } catch { this.statusText = '儲存失敗'; }
  }

  toggleStaffingDetails(): void { this.isStaffingDetailsVisible = !this.isStaffingDetailsVisible; }
  addStaffingRow(): void {
    this.dailyLog.stats.staffing.details.push({ id: Date.now(), label: '', count: 0, ratio1: 0, ratio2: 0, ratio3: 0, isLocked: false });
  }
  deleteStaffingRow(index: number): void { this.dailyLog.stats.staffing.details.splice(index, 1); }

  addRow(section: 'patientMovements' | 'vascularAccessLog'): void {
    (this.dailyLog[section] as any[]).push({ id: Date.now().toString(), name: '', medicalRecordNumber: '', type: '手動' });
  }
  deleteRow(index: number, section: 'patientMovements' | 'vascularAccessLog'): void {
    (this.dailyLog[section] as any[]).splice(index, 1);
  }

  async signAsLeader(shift: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || this.isPageLocked) return;
    (this.dailyLog.leader as any)[shift] = { name: user.name || '', signedAt: new Date() };
    await this.saveDailyLog();
  }

  formatSignTime(signedAt: any): string {
    if (!signedAt) return '';
    try {
      const d = signedAt instanceof Date ? signedAt : new Date(signedAt);
      return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  private formatDateISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private createEmptyLog(): DailyLogData {
    const emptyShift = (): ShiftStats => ({ opd: 0, ipd: 0, er: 0, total: 0 });
    const emptyPeripheral = () => ({ ipd: 0, er: 0 });
    const emptyShiftStr = () => ({ early: '', noon: '', late: '' });
    return {
      date: this.selectedDate,
      stats: {
        main_beds: { early: emptyShift(), noon: emptyShift(), late: emptyShift() },
        peripheral_beds: { early: emptyPeripheral(), noon: emptyPeripheral(), late: emptyPeripheral() },
        patient_care: { onDL: emptyShiftStr(), akChange: emptyShiftStr(), noShow: emptyShiftStr() },
        staffing: { details: [
          { id: 1, label: '白班', count: 0, ratio1: 1, ratio2: 0, ratio3: 0, isLocked: true },
          { id: 2, label: '小夜', count: 0, ratio1: 0, ratio2: 0.5, ratio3: 0.5, isLocked: true },
        ], adjustments: { shift1: 0, shift2: 0, shift3: 0 } },
      },
      patientMovements: [], vascularAccessLog: [], otherNotes: '',
      leader: { early: { name: '', signedAt: null }, noon: { name: '', signedAt: null }, late: { name: '', signedAt: null } },
    };
  }

  private mergeWithDefaults(record: any): DailyLogData {
    const defaults = this.createEmptyLog();
    return { ...defaults, ...record, stats: { ...defaults.stats, ...record.stats } };
  }
}
