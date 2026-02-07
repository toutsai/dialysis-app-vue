import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { where } from 'firebase/firestore';
import { ApiManagerService, type ApiManager, type FirestoreRecord } from '@services/api-manager.service';
import { SHIFT_CODES, getShiftDisplayName } from '@/constants/scheduleConstants.js';
import * as XLSX from 'xlsx';
import { formatDateToYYYYMMDD, formatDateToYYYYMM } from '@/utils/dateUtils.js';

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporting.component.html',
  styleUrl: './reporting.component.css'
})
export class ReportingComponent {
  private readonly apiManagerService = inject(ApiManagerService);
  private readonly schedulesApi: ApiManager<FirestoreRecord>;
  private readonly expiredSchedulesApi: ApiManager<FirestoreRecord>;
  private readonly patientsApi: ApiManager<FirestoreRecord>;
  private readonly dailyLogsApi: ApiManager<FirestoreRecord>;

  reportType = signal<string>('daily');
  selectedDate = signal<string>(formatDateToYYYYMMDD(new Date()));
  selectedMonth = signal<string>(formatDateToYYYYMM(new Date()));
  selectedYear = signal<number>(new Date().getFullYear());

  isLoading = signal<boolean>(false);
  reportDateRange = signal<{ start: string; end: string }>({ start: '', end: '' });

  dailyTableHeaders = signal<string[]>([]);
  dailyTableRows = signal<any[]>([]);
  monthlyTableHeaders = signal<number[]>([]);
  monthlyTableRows = signal<any[]>([]);
  yearlyTableHeaders = signal<string[]>([]);
  yearlyTableRows = signal<any[]>([]);
  staffingTableRows = signal<any[]>([]);

  reportTitle = computed(() => {
    if (this.reportDateRange().start === '') return '\u7d71\u8a08\u7d50\u679c';
    if (this.reportType() === 'daily') return `${this.reportDateRange().start} \u4eba\u6b21\u65e5\u5831\u8868`;
    if (this.reportType() === 'monthly') return `${this.selectedMonth()} \u4eba\u6b21\u6708\u5831\u8868`;
    if (this.reportType() === 'yearly') return `${this.selectedYear()} \u4eba\u6b21\u5e74\u5ea6\u5831\u8868`;
    if (this.reportType() === 'staffing_monthly') return `${this.selectedMonth()} \u8b77\u7406\u4eba\u529b\u6708\u5831\u8868`;
    return '\u7d71\u8a08\u5831\u8868';
  });

  noData = computed(() => {
    if (this.reportType() === 'daily') return this.dailyTableRows().length === 0;
    if (this.reportType() === 'monthly') return this.monthlyTableRows().length === 0;
    if (this.reportType() === 'yearly') return this.yearlyTableRows().length === 0;
    if (this.reportType() === 'staffing_monthly') return this.staffingTableRows().length === 0;
    return true;
  });

  constructor() {
    this.schedulesApi = this.apiManagerService.create<FirestoreRecord>('schedules');
    this.expiredSchedulesApi = this.apiManagerService.create<FirestoreRecord>('expired_schedules');
    this.patientsApi = this.apiManagerService.create<FirestoreRecord>('patients');
    this.dailyLogsApi = this.apiManagerService.create<FirestoreRecord>('daily_logs');
  }

  private getTaipeiTodayString(): string {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('fr-CA', options);
    return formatter.format(today);
  }

  async generateReport(): Promise<void> {
    this.isLoading.set(true);
    [this.dailyTableRows, this.monthlyTableRows, this.yearlyTableRows,
     this.staffingTableRows, this.dailyTableHeaders, this.monthlyTableHeaders,
     this.yearlyTableHeaders].forEach(arr => arr.set([] as any));

    try {
      let startDate: string | null = null;
      let endDate: string | null = null;

      if (this.reportType() === 'daily') {
        if (!this.selectedDate()) throw new Error('\u8acb\u9078\u64c7\u4e00\u500b\u6709\u6548\u7684\u65e5\u671f\u3002');
        startDate = this.selectedDate();
        endDate = this.selectedDate();
      } else if (this.reportType() === 'monthly' || this.reportType() === 'staffing_monthly') {
        if (!this.selectedMonth() || this.selectedMonth().indexOf('-') === -1) {
          throw new Error('\u8acb\u9078\u64c7\u4e00\u500b\u6709\u6548\u7684\u6708\u4efd\u3002');
        }
        const [year, month] = this.selectedMonth().split('-').map(Number);
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
          throw new Error('\u60a8\u9078\u64c7\u7684\u6708\u4efd\u683c\u5f0f\u4e0d\u6b63\u78ba\u3002');
        }
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        if (isNaN(firstDay.getTime()) || isNaN(lastDay.getTime())) {
          throw new Error('\u7121\u6cd5\u6839\u64da\u60a8\u7684\u9078\u64c7\u5efa\u7acb\u6709\u6548\u7684\u65e5\u671f\u3002');
        }
        startDate = formatDateToYYYYMMDD(firstDay);
        endDate = formatDateToYYYYMMDD(lastDay);
      } else if (this.reportType() === 'yearly') {
        const year = Number(this.selectedYear());
        if (!year || isNaN(year) || year < 1900 || year > 2100) {
          throw new Error('\u8acb\u9078\u64c7\u4e00\u500b\u6709\u6548\u7684\u5e74\u4efd\u3002');
        }
        startDate = formatDateToYYYYMMDD(new Date(year, 0, 1));
        endDate = formatDateToYYYYMMDD(new Date(year, 11, 31));
      }

      if (!startDate || !endDate) {
        throw new Error('\u7121\u6cd5\u8a08\u7b97\u51fa\u6709\u6548\u7684\u958b\u59cb\u6216\u7d50\u675f\u65e5\u671f\uff0c\u7a0b\u5f0f\u4e2d\u6b62\u3002');
      }

      this.reportDateRange.set({ start: startDate, end: endDate });

      if (this.reportType() === 'staffing_monthly') {
        const dailyLogsData = await this.dailyLogsApi.fetchAll([
          where('date', '>=', startDate),
          where('date', '<=', endDate),
        ]);
        this.processStaffingReport(dailyLogsData);
      } else {
        const todayStr = this.getTaipeiTodayString();
        let schedulesData: any[] = [];
        let expiredSchedulesData: any[] = [];
        const fetchPromises: Promise<void>[] = [];

        if (endDate < todayStr) {
          fetchPromises.push(
            this.expiredSchedulesApi.fetchAll([
              where('date', '>=', startDate),
              where('date', '<=', endDate),
            ]).then(data => { expiredSchedulesData = data; })
          );
        } else if (startDate >= todayStr) {
          fetchPromises.push(
            this.schedulesApi.fetchAll([
              where('date', '>=', startDate),
              where('date', '<=', endDate),
            ]).then(data => { schedulesData = data; })
          );
        } else {
          fetchPromises.push(
            this.expiredSchedulesApi.fetchAll([
              where('date', '>=', startDate),
              where('date', '<', todayStr),
            ]).then(data => { expiredSchedulesData = data; })
          );
          fetchPromises.push(
            this.schedulesApi.fetchAll([
              where('date', '>=', todayStr),
              where('date', '<=', endDate),
            ]).then(data => { schedulesData = data; })
          );
        }

        const patientsData = await this.patientsApi.fetchAll();
        const patientMap = new Map(patientsData.map((p: any) => [p.id, p]));
        await Promise.all(fetchPromises);
        const allSchedules = [...schedulesData, ...expiredSchedulesData];

        if (this.reportType() === 'daily') {
          this.processDailyReport(allSchedules, patientMap);
        } else if (this.reportType() === 'monthly') {
          this.processMonthlyReport(allSchedules, patientMap, startDate);
        } else if (this.reportType() === 'yearly') {
          this.processYearlyReport(allSchedules, patientMap);
        }
      }
    } catch (error: any) {
      console.error('\u751f\u6210\u5831\u8868\u5931\u6557:', error);
      alert(`\u751f\u6210\u5831\u8868\u6642\u767c\u751f\u932f\u8aa4: ${error.message}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  private processStaffingReport(dailyLogsData: any[]): void {
    const reportData = dailyLogsData
      .map(log => {
        const staffing = log.stats?.staffing;
        const ratios = log.nursePatientRatios;
        return {
          date: log.date,
          earlyStaff: staffing?.early?.toFixed(3) ?? 'N/A',
          noonStaff: staffing?.noon?.toFixed(3) ?? 'N/A',
          lateStaff: staffing?.late?.toFixed(3) ?? 'N/A',
          earlyRatio: ratios?.early ?? 'N/A',
          noonRatio: ratios?.noon ?? 'N/A',
          lateRatio: ratios?.late ?? 'N/A',
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    this.staffingTableRows.set(reportData);
  }

  exportToExcel(): void {
    if (this.noData()) {
      alert('\u6c92\u6709\u53ef\u532f\u51fa\u7684\u6578\u64da\uff01');
      return;
    }
    let headers!: string[];
    let dataRows!: any[][];
    let filename!: string;
    const excelTitle = this.reportTitle();

    if (this.reportType() === 'daily') {
      headers = ['\u900f\u6790\u6a21\u5f0f', '\u985e\u5225', ...this.dailyTableHeaders(), '\u7576\u65e5\u7e3d\u8a08'];
      dataRows = this.dailyTableRows().map((row: any) => [
        row.mode, row.status, ...row.shiftCounts, row.dailyTotal,
      ]);
      filename = `\u65e5\u5831\u8868_${this.selectedDate()}.xlsx`;
    } else if (this.reportType() === 'monthly') {
      headers = ['\u900f\u6790\u6a21\u5f0f', '\u985e\u5225', ...this.monthlyTableHeaders().map(String), '\u6708\u7e3d\u8a08'];
      dataRows = this.monthlyTableRows().map((row: any) => [
        row.mode, row.status, ...row.dailyCounts, row.monthlyTotal,
      ]);
      filename = `\u6708\u5831\u8868_${this.selectedMonth()}.xlsx`;
    } else if (this.reportType() === 'yearly') {
      headers = ['\u900f\u6790\u6a21\u5f0f', '\u985e\u5225', ...this.yearlyTableHeaders(), '\u5e74\u7e3d\u8a08'];
      dataRows = this.yearlyTableRows().map((row: any) => [
        row.mode, row.status, ...row.monthlyCounts, row.yearlyTotal,
      ]);
      filename = `\u5e74\u5ea6\u5831\u8868_${this.selectedYear()}.xlsx`;
    } else if (this.reportType() === 'staffing_monthly') {
      headers = ['\u65e5\u671f', '\u7b2c\u4e00\u73ed\u4eba\u529b', '\u7b2c\u4e00\u73ed\u8b77\u75c5\u6bd4', '\u7b2c\u4e8c\u73ed\u4eba\u529b', '\u7b2c\u4e8c\u73ed\u8b77\u75c5\u6bd4', '\u7b2c\u4e09\u73ed\u4eba\u529b', '\u7b2c\u4e09\u73ed\u8b77\u75c5\u6bd4'];
      dataRows = this.staffingTableRows().map((row: any) => [
        row.date, row.earlyStaff, row.earlyRatio, row.noonStaff, row.noonRatio, row.lateStaff, row.lateRatio,
      ]);
      filename = `\u8b77\u7406\u4eba\u529b\u6708\u5831\u8868_${this.selectedMonth()}.xlsx`;
    } else {
      return;
    }

    const titleRow = [excelTitle];
    const emptyRow: string[] = [];
    const data = [titleRow, emptyRow, headers, ...dataRows];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const merge = { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } };
    if (!worksheet['!merges']) worksheet['!merges'] = [];
    worksheet['!merges'].push(merge);
    if (worksheet['A1']) {
      worksheet['A1'].s = { alignment: { horizontal: 'center', vertical: 'center' } };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, '\u5831\u8868');
    XLSX.writeFile(workbook, filename);
  }

  private processDailyReport(allSchedules: any[], patientMap: Map<string, any>): void {
    const shiftBreakdown: Record<string, Record<string, number>> = {};
    const dailyRecord = allSchedules[0];
    if (dailyRecord && dailyRecord.schedule) {
      for (const [shiftKey, slotData] of Object.entries<any>(dailyRecord.schedule)) {
        if (!slotData?.patientId) continue;
        let patientStatus: string, patientMode: string;
        if (slotData.archivedPatientInfo) {
          patientStatus = slotData.archivedPatientInfo.status || 'unknown';
          patientMode = slotData.archivedPatientInfo.mode || 'HD';
        } else {
          const patient = patientMap.get(slotData.patientId);
          patientStatus = patient ? patient.status || 'unknown' : 'unknown';
          patientMode = patient ? patient.mode || 'HD' : 'HD';
        }
        const shiftCode = shiftKey.split('-').pop();
        if (!shiftCode) continue;
        if (!shiftBreakdown[shiftCode]) shiftBreakdown[shiftCode] = {};
        const comboKey = `${patientMode}-${patientStatus}`;
        if (!shiftBreakdown[shiftCode][comboKey]) shiftBreakdown[shiftCode][comboKey] = 0;
        shiftBreakdown[shiftCode][comboKey]++;
      }
    }
    const shiftOrder = [SHIFT_CODES.EARLY, SHIFT_CODES.NOON, SHIFT_CODES.LATE];
    this.dailyTableHeaders.set(shiftOrder.map((code: string) => getShiftDisplayName(code)));
    const reportMatrix: Record<string, any> = {};
    const statusDisplay: Record<string, string> = { opd: '\u9580\u8a3a', ipd: '\u4f4f\u9662', er: '\u6025\u8a3a', unknown: '\u672a\u77e5' };
    shiftOrder.forEach((shiftCode: string, shiftIndex: number) => {
      const shiftData = shiftBreakdown[shiftCode] || {};
      for (const comboKey in shiftData) {
        if (!reportMatrix[comboKey]) {
          const [mode, status] = comboKey.split('-');
          reportMatrix[comboKey] = {
            mode, status: statusDisplay[status] || status,
            shiftCounts: Array(shiftOrder.length).fill(0), dailyTotal: 0,
          };
        }
        const count = shiftData[comboKey];
        reportMatrix[comboKey].shiftCounts[shiftIndex] = count;
        reportMatrix[comboKey].dailyTotal += count;
      }
    });
    const shiftTotalsRow = {
      mode: '\u6bcf\u73ed\u7e3d\u8a08', status: '',
      shiftCounts: Array(shiftOrder.length).fill(0), dailyTotal: 0,
    };
    const sortedRows = Object.values(reportMatrix).sort(
      (a: any, b: any) => a.mode.localeCompare(b.mode) || a.status.localeCompare(b.status)
    );
    sortedRows.forEach((row: any) => {
      row.shiftCounts.forEach((count: number, index: number) => {
        shiftTotalsRow.shiftCounts[index] += count;
      });
    });
    shiftTotalsRow.dailyTotal = shiftTotalsRow.shiftCounts.reduce((sum: number, count: number) => sum + count, 0);
    this.dailyTableRows.set([...sortedRows, shiftTotalsRow]);
  }

  private processMonthlyReport(allSchedules: any[], patientMap: Map<string, any>, monthStartDate: string): void {
    const dailyBreakdown: Record<string, Record<string, number>> = {};
    for (const dailyRecord of allSchedules) {
      if (!dailyRecord.schedule) continue;
      const dateKey = dailyRecord.date;
      if (!dailyBreakdown[dateKey]) dailyBreakdown[dateKey] = {};
      for (const slotData of Object.values<any>(dailyRecord.schedule)) {
        if (!slotData?.patientId) continue;
        let patientStatus: string, patientMode: string;
        if (slotData.archivedPatientInfo) {
          patientStatus = slotData.archivedPatientInfo.status || 'unknown';
          patientMode = slotData.archivedPatientInfo.mode || 'HD';
        } else {
          const patient = patientMap.get(slotData.patientId);
          patientStatus = patient ? patient.status || 'unknown' : 'unknown';
          patientMode = patient ? patient.mode || 'HD' : 'HD';
        }
        const comboKey = `${patientMode}-${patientStatus}`;
        if (!dailyBreakdown[dateKey][comboKey]) dailyBreakdown[dateKey][comboKey] = 0;
        dailyBreakdown[dateKey][comboKey]++;
      }
    }
    const month = new Date(monthStartDate).getMonth();
    const year = new Date(monthStartDate).getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    this.monthlyTableHeaders.set(Array.from({ length: daysInMonth }, (_, i) => i + 1));
    const reportMatrix: Record<string, any> = {};
    const statusDisplay: Record<string, string> = { opd: '\u9580\u8a3a', ipd: '\u4f4f\u9662', er: '\u6025\u8a3a', unknown: '\u672a\u77e5' };
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateToYYYYMMDD(new Date(year, month, day));
      const dayData = dailyBreakdown[dateStr] || {};
      for (const comboKey in dayData) {
        if (!reportMatrix[comboKey]) {
          const [mode, status] = comboKey.split('-');
          reportMatrix[comboKey] = {
            mode, status: statusDisplay[status] || status,
            dailyCounts: Array(daysInMonth).fill(0), monthlyTotal: 0,
          };
        }
        const count = dayData[comboKey];
        reportMatrix[comboKey].dailyCounts[day - 1] = count;
        reportMatrix[comboKey].monthlyTotal += count;
      }
    }
    const dailyTotalsRow = {
      mode: '\u6bcf\u65e5\u7e3d\u8a08', status: '',
      dailyCounts: Array(daysInMonth).fill(0), monthlyTotal: 0,
    };
    const sortedRows = Object.values(reportMatrix).sort(
      (a: any, b: any) => a.mode.localeCompare(b.mode) || a.status.localeCompare(b.status)
    );
    sortedRows.forEach((row: any) => {
      row.dailyCounts.forEach((count: number, index: number) => {
        dailyTotalsRow.dailyCounts[index] += count;
      });
    });
    dailyTotalsRow.monthlyTotal = dailyTotalsRow.dailyCounts.reduce((sum: number, count: number) => sum + count, 0);
    this.monthlyTableRows.set([...sortedRows, dailyTotalsRow]);
  }

  private processYearlyReport(allSchedules: any[], patientMap: Map<string, any>): void {
    const monthlyBreakdown: Record<string, number[]> = {};
    for (const dailyRecord of allSchedules) {
      if (!dailyRecord.schedule) continue;
      const recordDate = new Date(dailyRecord.date + 'T00:00:00');
      const monthIndex = recordDate.getMonth();
      for (const slotData of Object.values<any>(dailyRecord.schedule)) {
        if (!slotData?.patientId) continue;
        let patientStatus: string, patientMode: string;
        if (slotData.archivedPatientInfo) {
          patientStatus = slotData.archivedPatientInfo.status || 'unknown';
          patientMode = slotData.archivedPatientInfo.mode || 'HD';
        } else {
          const patient = patientMap.get(slotData.patientId);
          patientStatus = patient ? patient.status || 'unknown' : 'unknown';
          patientMode = patient ? patient.mode || 'HD' : 'HD';
        }
        const comboKey = `${patientMode}-${patientStatus}`;
        if (!monthlyBreakdown[comboKey]) monthlyBreakdown[comboKey] = Array(12).fill(0);
        monthlyBreakdown[comboKey][monthIndex]++;
      }
    }
    this.yearlyTableHeaders.set(Array.from({ length: 12 }, (_, i) => `${i + 1}\u6708`));
    const reportMatrix: Record<string, any> = {};
    const statusDisplay: Record<string, string> = { opd: '\u9580\u8a3a', ipd: '\u4f4f\u9662', er: '\u6025\u8a3a', unknown: '\u672a\u77e5' };
    for (const comboKey in monthlyBreakdown) {
      const [mode, status] = comboKey.split('-');
      const monthlyCounts = monthlyBreakdown[comboKey];
      reportMatrix[comboKey] = {
        mode, status: statusDisplay[status] || status,
        monthlyCounts, yearlyTotal: monthlyCounts.reduce((sum: number, count: number) => sum + count, 0),
      };
    }
    const monthlyTotalsRow = {
      mode: '\u6bcf\u6708\u7e3d\u8a08', status: '',
      monthlyCounts: Array(12).fill(0), yearlyTotal: 0,
    };
    const sortedRows = Object.values(reportMatrix).sort(
      (a: any, b: any) => a.mode.localeCompare(b.mode) || a.status.localeCompare(b.status)
    );
    sortedRows.forEach((row: any) => {
      row.monthlyCounts.forEach((count: number, index: number) => {
        monthlyTotalsRow.monthlyCounts[index] += count;
      });
    });
    monthlyTotalsRow.yearlyTotal = monthlyTotalsRow.monthlyCounts.reduce(
      (sum: number, count: number) => sum + count, 0
    );
    this.yearlyTableRows.set([...sortedRows, monthlyTotalsRow]);
  }
}
