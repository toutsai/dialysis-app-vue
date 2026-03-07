import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, Unsubscribe } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface ShiftPatient {
  id: string; patientId: string; name: string; bedNum: string;
  preparation: Record<string, string>;
  injections: { orderCode: string; orderName: string; dose: string; unit: string; note: string }[];
  memos: { id: string; content: string; type: string; targetDate?: string; status: string }[];
}

@Component({
  selector: 'app-my-patients',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './my-patients.component.html',
  styleUrl: './my-patients.component.css'
})
export class MyPatientsComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);
  private firestore = inject(Firestore);

  isLoading = true;
  selectedDate = this.formatDateISO(new Date());
  patientListByShift: Record<string, ShiftPatient[]> = { early: [], noonOn: [], noonOff: [], late: [] };
  shiftOrder = ['early', 'noonOn', 'noonOff', 'late'];

  isConfirmVisible = false; confirmTitle = ''; confirmMessage = '';
  private memoToDelete: any = null;

  private readonly INJECTION_TRADE_NAME_MAP = new Map([
    ['INES2', 'NESP'], ['IREC1', 'Recormon'], ['IFER2', 'Fe-back'],
    ['ICAC', 'Cacare'], ['IPAR1', 'Parsabiv'],
  ]);

  private schedulesApi = this.apiManager.getCollection<any>('schedules');
  private tasksUnsubscribe: Unsubscribe | null = null;

  get hasAnyPatients(): boolean {
    return this.shiftOrder.some(k => (this.patientListByShift[k]?.length ?? 0) > 0);
  }

  async ngOnInit(): Promise<void> {
    await this.patientState.fetchPatientsIfNeeded();
    await this.fetchMyPatientData();
  }

  ngOnDestroy(): void { this.tasksUnsubscribe?.(); }

  async fetchMyPatientData(): Promise<void> {
    this.isLoading = true;
    try {
      const currentUser = this.auth.currentUser;
      if (!currentUser) { this.isLoading = false; return; }

      const dateStr = this.selectedDate;
      const scheduleRecords = await this.schedulesApi.fetchAll();
      const todaySchedule = (scheduleRecords || []).find((r: any) => r.date === dateStr);
      if (!todaySchedule?.schedule) {
        this.patientListByShift = { early: [], noonOn: [], noonOff: [], late: [] };
        this.isLoading = false;
        return;
      }

      const newList: Record<string, ShiftPatient[]> = { early: [], noonOn: [], noonOff: [], late: [] };
      const allPatients = this.patientState.allPatients;
      const schedule = todaySchedule.schedule;

      for (const [shift, beds] of Object.entries(schedule as Record<string, any>)) {
        if (!beds || typeof beds !== 'object') continue;
        for (const [bedNum, entry] of Object.entries(beds as Record<string, any>)) {
          if (!entry?.patientId) continue;
          const patient = allPatients.find((p: any) => p.id === entry.patientId);
          if (!patient) continue;
          const prep = (patient as any)['preparation'] || {};
          const injections = (patient as any)['dialysisOrders']?.injections || [];
          const shiftPatient: ShiftPatient = {
            id: `${shift}-${bedNum}`, patientId: patient.id, name: String(patient.name ?? ''), bedNum: String(bedNum ?? ''),
            preparation: {
              ak: prep['ak'] || '-', dialysateCa: prep['dialysateCa'] || '-',
              heparin: prep['heparin'] || '-', bloodFlow: prep['bloodFlow'] || '-',
              vascAccess: prep['vascAccess'] || '-',
            },
            injections: injections.map((inj: any) => ({
              orderCode: inj.orderCode, orderName: inj.orderName || '',
              dose: inj.dose || '', unit: inj.unit || '', note: inj.note || '',
            })),
            memos: [],
          };
          if (newList[shift]) newList[shift].push(shiftPatient);
        }
      }

      for (const shift of this.shiftOrder) {
        newList[shift].sort((a, b) => String(a.bedNum).localeCompare(String(b.bedNum), undefined, { numeric: true }));
      }

      this.patientListByShift = newList;
    } catch (err) {
      console.error('載入病人資料失敗:', err);
    } finally {
      this.isLoading = false;
    }
  }

  getShiftTitle(shiftCode: string): string {
    const map: Record<string, string> = {
      early: '早班 (主責)', noonOn: '午班 (上針)', noonOff: '午班 (收針)', late: '晚班 (主責)',
    };
    return map[shiftCode] || shiftCode;
  }

  formatInjection(injection: any): string {
    const displayName = this.INJECTION_TRADE_NAME_MAP.get(injection.orderCode) || injection.orderName || '未知藥品';
    return [displayName, `${injection.dose || ''} ${injection.unit || ''}`.trim(), injection.note || '']
      .filter(p => p).join(' / ');
  }

  getMemoTypeIcon(type: string): string {
    switch (type) { case '抽血': return '🩸'; case '衛教': return '📢'; default: return '📝'; }
  }

  confirmDeleteMemo(memo: any): void {
    this.memoToDelete = memo;
    this.confirmTitle = '確認刪除';
    this.confirmMessage = '您確定要永久刪除此項目嗎？此操作無法復原。';
    this.isConfirmVisible = true;
  }

  async executeDeleteMemo(): Promise<void> {
    if (!this.memoToDelete?.id) return;
    try {
      await deleteDoc(doc(this.firestore, 'tasks', this.memoToDelete.id));
    } catch (err) { console.error('刪除任務失敗:', err); }
    this.isConfirmVisible = false;
    this.memoToDelete = null;
  }

  async markMemoRead(memo: any): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return;
    try {
      await updateDoc(doc(this.firestore, 'tasks', memo.id), {
        status: 'completed',
        resolvedBy: { uid: currentUser.uid, name: currentUser.name || '' },
        resolvedAt: new Date(),
      });
    } catch (err) { console.error('更新任務狀態失敗:', err); }
  }

  changeDate(delta: number): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + delta);
    this.selectedDate = this.formatDateISO(d);
    this.fetchMyPatientData();
  }

  private formatDateISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
