import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, serverTimestamp, Unsubscribe } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface ScheduleException {
  id: string;
  patientId: string;
  patientName: string;
  type: 'MOVE' | 'SUSPEND' | 'ADD_SESSION' | 'RANGE_MOVE' | 'SWAP';
  status: 'pending' | 'processing' | 'applied' | 'error' | 'expired' | 'cancelled';
  startDate: string;
  endDate?: string;
  from?: any;
  to?: any;
  reason: string;
  createdAt: any;
  [key: string]: any;
}

@Component({
  selector: 'app-exception-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent, ConfirmDialogComponent],
  templateUrl: './exception-manager.component.html',
  styleUrl: './exception-manager.component.css'
})
export class ExceptionManagerComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private firestore = inject(Firestore);

  exceptions: ScheduleException[] = [];
  isLoading = true;
  isPageLocked = false;
  calendarTitle = '';

  // Dialogs
  isAlertVisible = false;
  alertTitle = '';
  alertMessage = '';
  isConfirmVisible = false;
  confirmTitle = '';
  confirmMessage = '';
  currentActionData: ScheduleException | null = null;

  typeMap: Record<string, string> = {
    MOVE: '臨時調班', SUSPEND: '區間暫停', ADD_SESSION: '臨時加洗',
    RANGE_MOVE: '區間調班', SWAP: '同日互調',
  };
  statusMap: Record<string, string> = {
    pending: '待處理', processing: '處理中', applied: '已生效',
    error: '錯誤', expired: '已過期', cancelled: '已撤銷',
  };
  shiftMap: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' };

  private unsubscribe: Unsubscribe | null = null;

  async ngOnInit(): Promise<void> {
    this.isPageLocked = !this.auth.hasPermission('editor');
    await this.patientState.fetchPatientsIfNeeded();
    this.initializeListener();
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  initializeListener(): void {
    const q = query(collection(this.firestore, 'schedule_exceptions'), orderBy('createdAt', 'desc'));
    this.unsubscribe = onSnapshot(q, (snapshot) => {
      this.exceptions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleException));
      this.isLoading = false;
    }, () => { this.isLoading = false; });
  }

  get pendingExceptions(): ScheduleException[] {
    return this.exceptions.filter(e => e.status === 'pending' || e.status === 'applied');
  }

  isCancellable(ex: ScheduleException): boolean {
    if (!ex || ['cancelled', 'expired', 'error'].includes(ex.status)) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let latestDateStr = ex.endDate || ex.startDate;
    if (ex.type === 'MOVE' && ex.to && ex.from) {
      latestDateStr = ex.to.goalDate > ex.from.sourceDate ? ex.to.goalDate : ex.from.sourceDate;
    }
    if (!latestDateStr) return false;
    return new Date(latestDateStr + 'T00:00:00') >= today;
  }

  showExceptionDetails(ex: ScheduleException): void {
    this.currentActionData = ex;
    this.confirmTitle = '調班詳細資訊';
    this.confirmMessage = `病患: ${ex.patientName}\n類型: ${this.typeMap[ex.type] || '未知'}\n狀態: ${this.statusMap[ex.status] || '未知'}\n區間: ${ex.startDate} ~ ${ex.endDate || ex.startDate}`;
    this.isConfirmVisible = true;
  }

  async handleDelete(): Promise<void> {
    if (!this.currentActionData?.id) return;
    try {
      await deleteDoc(doc(this.firestore, 'schedule_exceptions', this.currentActionData.id));
      this.isConfirmVisible = false;
      this.currentActionData = null;
    } catch (err: any) {
      this.alertTitle = '撤銷失敗';
      this.alertMessage = `執行撤銷操作時發生錯誤: ${err.message}`;
      this.isAlertVisible = true;
    }
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'status-pending', applied: 'status-applied', error: 'status-error',
      cancelled: 'status-cancelled', expired: 'status-expired',
    };
    return map[status] || '';
  }
}
