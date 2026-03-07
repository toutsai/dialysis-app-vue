import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';

interface Physician { id: string; name: string; displayChar?: string; staffId?: string; phone?: string; color?: string; }
type ScheduleTab = 'dialysis' | 'consultation' | 'emergency';

@Component({
  selector: 'app-physician-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent],
  templateUrl: './physician-schedule.component.html',
  styleUrl: './physician-schedule.component.css'
})
export class PhysicianScheduleComponent implements OnInit {
  auth = inject(AuthService);
  private firestore = inject(Firestore);

  activeTab: ScheduleTab = 'dialysis';
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  isLoading = true;
  hasUnsavedChanges = false;
  statusText = '載入中...';

  availablePhysicians: Physician[] = [];
  scheduleData: Record<number, Record<string, { physicianId: string | null }>> = {};
  emergencyRecords: any[] = [];

  isAlertVisible = false;
  alertTitle = '';
  alertMessage = '';

  get canManage(): boolean { return this.auth.canManagePhysicianSchedule; }

  get daysInMonth(): number[] {
    const days = new Date(this.selectedYear, this.selectedMonth, 0).getDate();
    return Array.from({ length: days }, (_, i) => i + 1);
  }

  get weeklyData(): { day: number | null; fullDate: string; isWeekend: boolean; isToday: boolean }[][] {
    const weeks: any[][] = [];
    let currentWeek: any[] = [];
    const firstDay = new Date(this.selectedYear, this.selectedMonth - 1, 1).getDay();
    const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < adjustedFirst; i++) {
      currentWeek.push({ day: null, fullDate: '', isWeekend: false, isToday: false });
    }
    for (const d of this.daysInMonth) {
      const date = new Date(this.selectedYear, this.selectedMonth - 1, d);
      const dow = date.getDay();
      const today = new Date();
      currentWeek.push({
        day: d, fullDate: this.toDateStr(date),
        isWeekend: dow === 0 || dow === 6,
        isToday: date.toDateString() === today.toDateString(),
      });
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    }
    while (currentWeek.length > 0 && currentWeek.length < 7) {
      currentWeek.push({ day: null, fullDate: '', isWeekend: false, isToday: false });
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);
    return weeks;
  }

  async ngOnInit(): Promise<void> {
    await this.loadPhysicians();
    await this.loadScheduleData();
    this.isLoading = false;
    this.statusText = '資料已載入';
  }

  private async loadPhysicians(): Promise<void> {
    const ref = doc(this.firestore, 'settings', 'physicians');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Record<string, Physician>;
      this.availablePhysicians = Object.entries(data)
        .filter(([k]) => k !== 'id')
        .map(([id, v]) => ({ ...v, id }));
    }
  }

  private async loadScheduleData(): Promise<void> {
    const monthKey = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    const ref = doc(this.firestore, 'physician_schedules', monthKey);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      this.scheduleData = (data as any).dialysis || {};
      this.emergencyRecords = (data as any).emergencyRecords || [];
    } else {
      this.scheduleData = {};
      this.daysInMonth.forEach(d => {
        this.scheduleData[d] = {
          early: { physicianId: null }, noon: { physicianId: null }, late: { physicianId: null }
        };
      });
    }
  }

  goToPreviousMonth(): void {
    this.selectedMonth--;
    if (this.selectedMonth < 1) { this.selectedMonth = 12; this.selectedYear--; }
    this.loadScheduleData();
  }
  goToNextMonth(): void {
    this.selectedMonth++;
    if (this.selectedMonth > 12) { this.selectedMonth = 1; this.selectedYear++; }
    this.loadScheduleData();
  }

  async saveAllChanges(): Promise<void> {
    if (!this.canManage) return;
    this.statusText = '儲存中...';
    const monthKey = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}`;
    try {
      await setDoc(doc(this.firestore, 'physician_schedules', monthKey), {
        dialysis: this.scheduleData, emergencyRecords: this.emergencyRecords,
      }, { merge: true });
      this.hasUnsavedChanges = false;
      this.statusText = '已儲存';
    } catch { this.statusText = '儲存失敗'; }
  }

  getDisplayName(doc: Physician): string { return doc.displayChar || doc.name.charAt(0); }

  private toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
