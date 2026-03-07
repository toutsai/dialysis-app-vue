import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, orderBy, onSnapshot, deleteDoc, doc, addDoc, setDoc, Unsubscribe } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface ScheduledUpdate {
  id: string;
  patientId: string;
  patientName: string;
  changeType: string;
  effectiveDate: string;
  status: 'pending' | 'completed' | 'error';
  payload: any;
  errorMessage?: string;
  [key: string]: any;
}

@Component({
  selector: 'app-update-scheduler',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './update-scheduler.component.html',
  styleUrl: './update-scheduler.component.css'
})
export class UpdateSchedulerComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private firestore = inject(Firestore);

  scheduledUpdates: ScheduledUpdate[] = [];
  isLoading = true;
  isPageLocked = false;
  calendarTitle = '';

  isConfirmVisible = false;
  confirmTitle = '';
  confirmMessage = '';
  currentUpdateForAction: ScheduledUpdate | null = null;

  TYPE_MAP: Record<string, string> = {
    UPDATE_STATUS: '身分變更', UPDATE_MODE: '模式變更', UPDATE_FREQ: '頻率變更',
    UPDATE_BASE_SCHEDULE_RULE: '總表規則變更', DELETE_PATIENT: '刪除病人', RESTORE_PATIENT: '復原病人',
  };
  STATUS_MAP: Record<string, { text: string; color: string }> = {
    pending: { text: '待執行', color: '#ffc107' },
    completed: { text: '已完成', color: '#198754' },
    error: { text: '執行失敗', color: '#dc3545' },
  };

  private unsubscribe: Unsubscribe | null = null;

  async ngOnInit(): Promise<void> {
    this.isPageLocked = !this.auth.hasPermission('editor');
    await this.patientState.fetchPatientsIfNeeded();
    this.initializeListener();
  }

  ngOnDestroy(): void { this.unsubscribe?.(); }

  initializeListener(): void {
    const q = query(collection(this.firestore, 'scheduled_patient_updates'), orderBy('createdAt', 'desc'));
    this.unsubscribe = onSnapshot(q, (snapshot) => {
      this.scheduledUpdates = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ScheduledUpdate));
      this.isLoading = false;
    }, () => { this.isLoading = false; });
  }

  handleEventClick(update: ScheduledUpdate): void {
    this.currentUpdateForAction = update;
    const statusInfo = this.STATUS_MAP[update.status] || { text: '未知' };
    this.confirmTitle = '預約變更詳情';
    this.confirmMessage = `病人: ${update.patientName}\n類型: ${this.TYPE_MAP[update.changeType] || '未知'}\n生效日: ${update.effectiveDate}\n狀態: ${statusInfo.text}`;
    if (update.status === 'error' && update.errorMessage) {
      this.confirmMessage += `\n\n錯誤訊息: ${update.errorMessage}`;
    }
    this.isConfirmVisible = true;
  }

  async handleDelete(): Promise<void> {
    if (!this.currentUpdateForAction?.id) return;
    try {
      await deleteDoc(doc(this.firestore, 'scheduled_patient_updates', this.currentUpdateForAction.id));
    } catch (err) { console.error('撤銷預約失敗:', err); }
    this.isConfirmVisible = false;
    this.currentUpdateForAction = null;
  }

  getStatusClass(status: string): string {
    return ({ pending: 'status-pending', completed: 'status-completed', error: 'status-error' } as Record<string, string>)[status] || '';
  }
}
