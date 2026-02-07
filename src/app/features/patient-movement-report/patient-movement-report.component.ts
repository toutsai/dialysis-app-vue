import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { kiditService } from '@/services/kiditService';
import { PatientStoreService } from '@services/patient-store.service';
import { exportKiDitExcel } from '@/services/kiditExportService';
import { MovementDetailModalComponent } from '@app/components/kidit/movement-detail-modal.component';

@Component({
  selector: 'app-patient-movement-report',
  standalone: true,
  imports: [CommonModule, FormsModule, MovementDetailModalComponent],
  templateUrl: './patient-movement-report.component.html',
  styleUrl: './patient-movement-report.component.css'
})
export class PatientMovementReportComponent implements OnInit {
  private readonly patientStore = inject(PatientStoreService);

  currentYear = signal<number>(new Date().getFullYear());
  currentMonth = signal<number>(new Date().getMonth() + 1);
  daysData = signal<any[]>([]);
  isLoading = signal<boolean>(false);
  weekDays = ['\u65e5', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d'];

  // Modal state
  showModal = signal<boolean>(false);
  selectedDate = signal<string>('');
  selectedEvents = signal<any[]>([]);

  firstDayOffset = computed(() => {
    return new Date(this.currentYear(), this.currentMonth() - 1, 1).getDay();
  });

  get firstDayOffsetArray(): number[] {
    return Array.from({ length: this.firstDayOffset() }, (_, i) => i);
  }

  ngOnInit(): void {
    this.fetchData();
  }

  isToday(dateStr: string): boolean {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return dateStr === `${y}-${m}-${d}`;
  }

  async fetchData(): Promise<void> {
    this.isLoading.set(true);
    try {
      if (this.patientStore.allPatients().length === 0) {
        await this.patientStore.fetchPatientsIfNeeded();
      }

      const logs = await kiditService.fetchMonthLogs(this.currentYear(), this.currentMonth());
      const daysInMonth = new Date(this.currentYear(), this.currentMonth(), 0).getDate();
      const tempDays: any[] = [];
      const logMap: Record<string, any[]> = {};

      logs.forEach((l: any) => (logMap[l.date] = l.events || []));

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${this.currentYear()}-${String(this.currentMonth()).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const events = logMap[dateStr] || [];

        tempDays.push({
          dateStr,
          dayNum: d,
          events,
          unregistered: events.filter((e: any) => !e.isRegistered).length,
        });
      }
      this.daysData.set(tempDays);
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  changeMonth(offset: number): void {
    let m = this.currentMonth() + offset;
    let y = this.currentYear();
    if (m > 12) {
      m = 1;
      y++;
    } else if (m < 1) {
      m = 12;
      y--;
    }
    this.currentMonth.set(m);
    this.currentYear.set(y);
    this.fetchData();
  }

  openModal(day: any): void {
    this.selectedDate.set(day.dateStr);
    this.selectedEvents.set(day.events);
    this.showModal.set(true);
  }

  exportToCSV(): void {
    if (!this.daysData().length) {
      alert('\u76ee\u524d\u7121\u8cc7\u6599\u53ef\u532f\u51fa');
      return;
    }

    const allEvents = this.daysData().flatMap(day => day.events);

    if (allEvents.length === 0) {
      alert('\u672c\u6708\u4efd\u5c1a\u7121\u4efb\u4f55\u4e8b\u4ef6\u7d00\u9304\u3002');
      return;
    }

    const filename = `KiDit_Export_${this.currentYear()}_${String(this.currentMonth()).padStart(2, '0')}.xlsx`;

    try {
      exportKiDitExcel(allEvents, filename);
    } catch (error) {
      console.error('\u532f\u51fa\u5931\u6557:', error);
      alert('\u532f\u51fa\u5931\u6557\uff0c\u8acb\u6aa2\u67e5\u8cc7\u6599\u683c\u5f0f');
    }
  }

  onModalClose(): void {
    this.showModal.set(false);
  }

  onModalRefresh(): void {
    this.fetchData();
  }
}
