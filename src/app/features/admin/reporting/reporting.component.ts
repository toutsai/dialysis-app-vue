import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, getDocs, orderBy } from '@angular/fire/firestore';
import { PatientStateService } from '../../../core/states/patient.state';

interface ReportRow {
  mode: string; status: string;
  shiftCounts?: number[]; dailyTotal?: number;
  dailyCounts?: number[]; monthlyTotal?: number;
  monthlyCounts?: number[]; yearlyTotal?: number;
}

interface StaffingRow {
  date: string;
  earlyStaff: string; earlyRatio: string;
  noonStaff: string; noonRatio: string;
  lateStaff: string; lateRatio: string;
}

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporting.component.html',
  styleUrl: './reporting.component.css'
})
export class ReportingComponent {
  private firestore = inject(Firestore);
  private patientState = inject(PatientStateService);

  reportType = 'daily';
  selectedDate = this.formatDateYYYYMMDD(new Date());
  selectedMonth = this.formatYYYYMM(new Date());
  selectedYear = new Date().getFullYear();
  isLoading = false;
  reportTitle = '';

  dailyTableHeaders: string[] = [];
  dailyTableRows: ReportRow[] = [];
  monthlyTableHeaders: number[] = [];
  monthlyTableRows: ReportRow[] = [];
  yearlyTableHeaders: string[] = [];
  yearlyTableRows: ReportRow[] = [];
  staffingTableRows: StaffingRow[] = [];

  get noData(): boolean {
    if (this.reportType === 'daily') return this.dailyTableRows.length === 0;
    if (this.reportType === 'monthly') return this.monthlyTableRows.length === 0;
    if (this.reportType === 'yearly') return this.yearlyTableRows.length === 0;
    if (this.reportType === 'staffing_monthly') return this.staffingTableRows.length === 0;
    return true;
  }

  private formatDateYYYYMMDD(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private formatYYYYMM(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async generateReport(): Promise<void> {
    this.isLoading = true;
    this.dailyTableRows = []; this.monthlyTableRows = []; this.yearlyTableRows = []; this.staffingTableRows = [];
    this.dailyTableHeaders = []; this.monthlyTableHeaders = []; this.yearlyTableHeaders = [];

    try {
      let startDate = ''; let endDate = '';

      if (this.reportType === 'daily') {
        startDate = this.selectedDate; endDate = this.selectedDate;
      } else if (this.reportType === 'monthly' || this.reportType === 'staffing_monthly') {
        const [year, month] = this.selectedMonth.split('-').map(Number);
        startDate = this.formatDateYYYYMMDD(new Date(year, month - 1, 1));
        endDate = this.formatDateYYYYMMDD(new Date(year, month, 0));
      } else if (this.reportType === 'yearly') {
        startDate = this.formatDateYYYYMMDD(new Date(this.selectedYear, 0, 1));
        endDate = this.formatDateYYYYMMDD(new Date(this.selectedYear, 11, 31));
      }

      this.reportTitle = this.getReportTitle(startDate);

      if (this.reportType === 'staffing_monthly') {
        const q = query(collection(this.firestore, 'daily_logs'), where('date', '>=', startDate), where('date', '<=', endDate));
        const snapshot = await getDocs(q);
        const dailyLogs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        this.processStaffingReport(dailyLogs);
      } else {
        const todayStr = this.formatDateYYYYMMDD(new Date());
        let allSchedules: any[] = [];

        if (endDate < todayStr) {
          const q = query(collection(this.firestore, 'expired_schedules'), where('date', '>=', startDate), where('date', '<=', endDate));
          allSchedules = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
        } else if (startDate >= todayStr) {
          const q = query(collection(this.firestore, 'schedules'), where('date', '>=', startDate), where('date', '<=', endDate));
          allSchedules = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
          const q1 = query(collection(this.firestore, 'expired_schedules'), where('date', '>=', startDate), where('date', '<', todayStr));
          const q2 = query(collection(this.firestore, 'schedules'), where('date', '>=', todayStr), where('date', '<=', endDate));
          const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
          allSchedules = [...snap1.docs, ...snap2.docs].map(d => ({ id: d.id, ...d.data() }));
        }

        await this.patientState.fetchPatientsIfNeeded();
        const patients = this.patientState.allPatients;
        const patientMap = new Map<string, any>(patients.map((p: any) => [p.id, p]));

        if (this.reportType === 'daily') this.processDailyReport(allSchedules, patientMap);
        else if (this.reportType === 'monthly') this.processMonthlyReport(allSchedules, patientMap, startDate);
        else if (this.reportType === 'yearly') this.processYearlyReport(allSchedules, patientMap);
      }
    } catch (err: any) {
      console.error('生成報表失敗:', err);
      alert(`生成報表時發生錯誤: ${err.message}`);
    } finally {
      this.isLoading = false;
    }
  }

  private getReportTitle(startDate: string): string {
    if (this.reportType === 'daily') return `${startDate} 人次日報表`;
    if (this.reportType === 'monthly') return `${this.selectedMonth} 人次月報表`;
    if (this.reportType === 'yearly') return `${this.selectedYear} 人次年度報表`;
    if (this.reportType === 'staffing_monthly') return `${this.selectedMonth} 護理人力月報表`;
    return '統計報表';
  }

  private processStaffingReport(logs: any[]): void {
    this.staffingTableRows = logs.map(log => ({
      date: log.date,
      earlyStaff: log.stats?.staffing?.early?.toFixed(3) ?? 'N/A',
      earlyRatio: log.nursePatientRatios?.early ?? 'N/A',
      noonStaff: log.stats?.staffing?.noon?.toFixed(3) ?? 'N/A',
      noonRatio: log.nursePatientRatios?.noon ?? 'N/A',
      lateStaff: log.stats?.staffing?.late?.toFixed(3) ?? 'N/A',
      lateRatio: log.nursePatientRatios?.late ?? 'N/A',
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  private processDailyReport(allSchedules: any[], patientMap: Map<string, any>): void {
    const SHIFT_CODES = { EARLY: 'early', NOON: 'noon', LATE: 'late' };
    const shiftOrder = [SHIFT_CODES.EARLY, SHIFT_CODES.NOON, SHIFT_CODES.LATE];
    const shiftNames: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' };
    const statusDisplay: Record<string, string> = { opd: '門診', ipd: '住院', er: '急診', unknown: '未知' };
    const shiftBreakdown: Record<string, Record<string, number>> = {};

    const dailyRecord = allSchedules[0];
    if (dailyRecord?.schedule) {
      for (const [shiftKey, slotData] of Object.entries(dailyRecord.schedule) as [string, any][]) {
        if (!slotData?.patientId) continue;
        let status = 'unknown', mode = 'HD';
        if (slotData.archivedPatientInfo) { status = slotData.archivedPatientInfo.status || 'unknown'; mode = slotData.archivedPatientInfo.mode || 'HD'; }
        else { const p = patientMap.get(slotData.patientId); status = p?.status || 'unknown'; mode = p?.mode || 'HD'; }
        const shiftCode = shiftKey.split('-').pop() || '';
        if (!shiftBreakdown[shiftCode]) shiftBreakdown[shiftCode] = {};
        const comboKey = `${mode}-${status}`;
        shiftBreakdown[shiftCode][comboKey] = (shiftBreakdown[shiftCode][comboKey] || 0) + 1;
      }
    }

    this.dailyTableHeaders = shiftOrder.map(c => shiftNames[c]);
    const reportMatrix: Record<string, ReportRow> = {};
    shiftOrder.forEach((code, idx) => {
      const data = shiftBreakdown[code] || {};
      for (const comboKey in data) {
        if (!reportMatrix[comboKey]) {
          const [m, s] = comboKey.split('-');
          reportMatrix[comboKey] = { mode: m, status: statusDisplay[s] || s, shiftCounts: Array(3).fill(0), dailyTotal: 0 };
        }
        reportMatrix[comboKey].shiftCounts![idx] = data[comboKey];
        reportMatrix[comboKey].dailyTotal! += data[comboKey];
      }
    });
    const totalsRow: ReportRow = { mode: '每班總計', status: '', shiftCounts: Array(3).fill(0), dailyTotal: 0 };
    const rows = Object.values(reportMatrix).sort((a, b) => a.mode.localeCompare(b.mode));
    rows.forEach(r => r.shiftCounts!.forEach((c, i) => { totalsRow.shiftCounts![i] += c; }));
    totalsRow.dailyTotal = totalsRow.shiftCounts!.reduce((s, c) => s + c, 0);
    this.dailyTableRows = [...rows, totalsRow];
  }

  private processMonthlyReport(allSchedules: any[], patientMap: Map<string, any>, monthStart: string): void {
    const statusDisplay: Record<string, string> = { opd: '門診', ipd: '住院', er: '急診', unknown: '未知' };
    const dailyBreakdown: Record<string, Record<string, number>> = {};
    for (const rec of allSchedules) {
      if (!rec.schedule) continue;
      const dateKey = rec.date;
      if (!dailyBreakdown[dateKey]) dailyBreakdown[dateKey] = {};
      for (const slotData of Object.values(rec.schedule) as any[]) {
        if (!slotData?.patientId) continue;
        let status = 'unknown', mode = 'HD';
        if (slotData.archivedPatientInfo) { status = slotData.archivedPatientInfo.status || 'unknown'; mode = slotData.archivedPatientInfo.mode || 'HD'; }
        else { const p = patientMap.get(slotData.patientId); status = p?.status || 'unknown'; mode = p?.mode || 'HD'; }
        const comboKey = `${mode}-${status}`;
        dailyBreakdown[dateKey][comboKey] = (dailyBreakdown[dateKey][comboKey] || 0) + 1;
      }
    }
    const d = new Date(monthStart); const month = d.getMonth(); const year = d.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    this.monthlyTableHeaders = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const reportMatrix: Record<string, ReportRow> = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = this.formatDateYYYYMMDD(new Date(year, month, day));
      const dayData = dailyBreakdown[dateStr] || {};
      for (const comboKey in dayData) {
        if (!reportMatrix[comboKey]) {
          const [m, s] = comboKey.split('-');
          reportMatrix[comboKey] = { mode: m, status: statusDisplay[s] || s, dailyCounts: Array(daysInMonth).fill(0), monthlyTotal: 0 };
        }
        reportMatrix[comboKey].dailyCounts![day - 1] = dayData[comboKey];
        reportMatrix[comboKey].monthlyTotal! += dayData[comboKey];
      }
    }
    const totalsRow: ReportRow = { mode: '每日總計', status: '', dailyCounts: Array(daysInMonth).fill(0), monthlyTotal: 0 };
    const rows = Object.values(reportMatrix).sort((a, b) => a.mode.localeCompare(b.mode));
    rows.forEach(r => r.dailyCounts!.forEach((c, i) => { totalsRow.dailyCounts![i] += c; }));
    totalsRow.monthlyTotal = totalsRow.dailyCounts!.reduce((s, c) => s + c, 0);
    this.monthlyTableRows = [...rows, totalsRow];
  }

  private processYearlyReport(allSchedules: any[], patientMap: Map<string, any>): void {
    const statusDisplay: Record<string, string> = { opd: '門診', ipd: '住院', er: '急診', unknown: '未知' };
    const monthlyBreakdown: Record<string, number[]> = {};
    for (const rec of allSchedules) {
      if (!rec.schedule) continue;
      const monthIdx = new Date(rec.date + 'T00:00:00').getMonth();
      for (const slotData of Object.values(rec.schedule) as any[]) {
        if (!slotData?.patientId) continue;
        let status = 'unknown', mode = 'HD';
        if (slotData.archivedPatientInfo) { status = slotData.archivedPatientInfo.status || 'unknown'; mode = slotData.archivedPatientInfo.mode || 'HD'; }
        else { const p = patientMap.get(slotData.patientId); status = p?.status || 'unknown'; mode = p?.mode || 'HD'; }
        const comboKey = `${mode}-${status}`;
        if (!monthlyBreakdown[comboKey]) monthlyBreakdown[comboKey] = Array(12).fill(0);
        monthlyBreakdown[comboKey][monthIdx]++;
      }
    }
    this.yearlyTableHeaders = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
    const reportMatrix: Record<string, ReportRow> = {};
    for (const comboKey in monthlyBreakdown) {
      const [m, s] = comboKey.split('-');
      reportMatrix[comboKey] = { mode: m, status: statusDisplay[s] || s, monthlyCounts: monthlyBreakdown[comboKey], yearlyTotal: monthlyBreakdown[comboKey].reduce((s2, c) => s2 + c, 0) };
    }
    const totalsRow: ReportRow = { mode: '每月總計', status: '', monthlyCounts: Array(12).fill(0), yearlyTotal: 0 };
    const rows = Object.values(reportMatrix).sort((a, b) => a.mode.localeCompare(b.mode));
    rows.forEach(r => r.monthlyCounts!.forEach((c, i) => { totalsRow.monthlyCounts![i] += c; }));
    totalsRow.yearlyTotal = totalsRow.monthlyCounts!.reduce((s, c) => s + c, 0);
    this.yearlyTableRows = [...rows, totalsRow];
  }

  displayCount(count: number): string { return count > 0 ? String(count) : ''; }
}
