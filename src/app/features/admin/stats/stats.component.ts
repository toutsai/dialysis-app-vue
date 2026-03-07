import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, doc, getDoc, setDoc, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface StatsPatient {
  id: string; name: string; dialysisBed: string; mode: string;
  wardNumber?: string; finalTags?: string; shiftId: string; classes: string;
}

interface TeamData {
  nurseName: string;
  earlyShift: { patients: StatsPatient[] };
  noonShiftOn: { patients: StatsPatient[] };
  noonShiftOff: { patients: StatsPatient[] };
  lateShift: { patients: StatsPatient[] };
  totalOpdCount: number; totalIpdCount: number; totalErCount: number;
  [key: string]: any;
}

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css'
})
export class StatsComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private firestore = inject(Firestore);

  currentDate = new Date();
  isLoading = true;
  isPageLocked = false;
  hasUnsavedChanges = false;
  statusIndicator = '已載入';

  effectiveStatsData: Record<string, Record<string, TeamData>> = { early: {}, late: {}, lateTakeOff: {} };
  sortedEarlyTeams: string[] = [];
  sortedLateTeams: string[] = [];
  sortedLateTakeOffTeams: string[] = [];
  lateShiftTakeOffExists = false;

  noonTakeoffVisibility = { early: false, late: false };
  isFireDutyDropdownVisible = false;
  isCreateTaskModalVisible = false;
  isConfirmVisible = false;
  confirmTitle = ''; confirmMessage = '';
  private confirmAction: (() => void) | null = null;

  dailyPhysicians: any[] = [];
  dailyConsultPhysicians: any[] = [];

  private unsubscribe: Unsubscribe | null = null;

  ngOnInit(): void {
    this.isPageLocked = !this.auth.hasPermission('editor');
    this.loadStatsData();
  }

  ngOnDestroy(): void { this.unsubscribe?.(); }

  formatDate(date: Date): string {
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  }

  get weekdayDisplay(): string {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `(${days[this.currentDate.getDay()]})`;
  }

  changeDate(delta: number): void {
    const d = new Date(this.currentDate);
    d.setDate(d.getDate() + delta);
    this.currentDate = d;
    this.loadStatsData();
  }

  goToToday(): void {
    this.currentDate = new Date();
    this.loadStatsData();
  }

  async loadStatsData(): Promise<void> {
    this.isLoading = true;
    const dateStr = this.currentDate.toISOString().split('T')[0];
    try {
      const docRef = doc(this.firestore, 'daily_stats', dateStr);
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        const data = snapshot.data() as any;
        this.effectiveStatsData = data.assignments || { early: {}, late: {}, lateTakeOff: {} };
        this.sortedEarlyTeams = Object.keys(this.effectiveStatsData['early'] || {}).sort();
        this.sortedLateTeams = Object.keys(this.effectiveStatsData['late'] || {}).sort();
        this.sortedLateTakeOffTeams = Object.keys(this.effectiveStatsData['lateTakeOff'] || {}).sort();
        this.lateShiftTakeOffExists = this.sortedLateTakeOffTeams.length > 0;
        this.dailyPhysicians = data.physicians || [];
        this.dailyConsultPhysicians = data.consultPhysicians || [];
      } else {
        this.effectiveStatsData = { early: {}, late: {}, lateTakeOff: {} };
        this.sortedEarlyTeams = []; this.sortedLateTeams = []; this.sortedLateTakeOffTeams = [];
      }
      this.statusIndicator = '已載入';
    } catch (e) {
      console.error('載入護理分組資料失敗:', e);
      this.statusIndicator = '載入失敗';
    } finally { this.isLoading = false; }
  }

  async saveChangesToCloud(): Promise<void> {
    const dateStr = this.currentDate.toISOString().split('T')[0];
    try {
      await setDoc(doc(this.firestore, 'daily_stats', dateStr), {
        assignments: this.effectiveStatsData,
        physicians: this.dailyPhysicians,
        consultPhysicians: this.dailyConsultPhysicians,
        updatedAt: new Date(),
      }, { merge: true });
      this.hasUnsavedChanges = false;
      this.statusIndicator = '已儲存';
    } catch (e) {
      console.error('儲存失敗:', e);
      this.statusIndicator = '儲存失敗';
    }
  }

  toggleNoonTakeoff(section: 'early' | 'late'): void {
    this.noonTakeoffVisibility[section] = !this.noonTakeoffVisibility[section];
  }

  getTeamDisplayName(teamName: string, prefix: string): string {
    if (teamName.includes('未分組')) return '未分組';
    return teamName.replace(prefix, '') + '組';
  }

  onConfirmOk(): void { this.isConfirmVisible = false; this.confirmAction?.(); }
  onConfirmCancel(): void { this.isConfirmVisible = false; }
}
