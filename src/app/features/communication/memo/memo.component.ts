import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, collection, query, onSnapshot, doc, updateDoc, deleteDoc, addDoc, Unsubscribe } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface Memo {
  id: string; content: string; patientId?: string; patientName?: string;
  targetDate?: string; status: string; isResolved: boolean; createdAt: any;
}

@Component({
  selector: 'app-memo',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent, ConfirmDialogComponent],
  templateUrl: './memo.component.html',
  styleUrl: './memo.component.css'
})
export class MemoComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);
  private firestore = inject(Firestore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  memos: Memo[] = [];
  contentInput = ''; dateInput = '';
  selectedPatient: any = null; filterPatientId: string | null = null;
  activeTab: 'expired' | 'resolved' = 'expired';
  isLoading = true; isSubmitting = false; isMemosLoading = false;
  error: string | null = null;

  isAlertVisible = false; alertTitle = ''; alertMessage = '';
  isConfirmVisible = false; confirmTitle = ''; confirmMessage = '';
  private confirmAction: (() => void) | null = null;
  private memosApi = this.apiManager.getCollection<Memo>('memos');

  private readonly SYSTEM_MEMO_KEYWORDS = ['【臨時調班】', '【區間暫停】', '【臨時加洗】', '【區間調班】', '【更新-臨時調班】'];

  get pendingList(): Memo[] {
    return this.memos
      .filter(m => (m.status === 'pending' || !m.status) && !this.isSystemMemo(m) && (!this.filterPatientId || m.patientId === this.filterPatientId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  get resolvedList(): Memo[] {
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    return this.memos
      .filter(m => m.status === 'resolved' && new Date(m.createdAt) > ninetyDaysAgo && !this.isSystemMemo(m) && (!this.filterPatientId || m.patientId === this.filterPatientId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  get expiredList(): Memo[] {
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return this.memos
      .filter(m => m.status === 'expired' && m.targetDate && new Date(m.targetDate) >= sevenDaysAgo && !this.isSystemMemo(m) && (!this.filterPatientId || m.patientId === this.filterPatientId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  get memoStats() {
    return { total: this.memos.length, pending: this.pendingList.length, resolved: this.resolvedList.length, expired: this.expiredList.length };
  }

  async ngOnInit(): Promise<void> {
    await this.patientState.fetchPatientsIfNeeded();
    await this.fetchMemos();
    const patientIdFromQuery = this.route.snapshot.queryParamMap.get('patientId');
    if (patientIdFromQuery) {
      const patient = this.patientState.allPatients.find((p: any) => p.id === patientIdFromQuery);
      if (patient) { this.selectedPatient = patient; this.filterPatientId = patientIdFromQuery; }
    }
    this.isLoading = false;
  }

  ngOnDestroy(): void {}

  private isSystemMemo(memo: Memo): boolean {
    return this.SYSTEM_MEMO_KEYWORDS.some(kw => memo.content.startsWith(kw));
  }

  async fetchMemos(): Promise<void> {
    this.isMemosLoading = true; this.error = null;
    try {
      this.memos = await this.memosApi.fetchAll() as Memo[];
    } catch { this.error = '載入備忘錄失敗，請重試'; }
    finally { this.isMemosLoading = false; }
  }

  async addMemo(): Promise<void> {
    if (!this.contentInput.trim()) { this.showAlert('提示', '備忘內容不能為空！'); return; }
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    const newMemo: any = {
      content: this.contentInput.trim(), patientId: this.selectedPatient?.id || null,
      patientName: this.selectedPatient?.name || null, targetDate: this.dateInput || null,
      status: 'pending', isResolved: false, createdAt: new Date().toISOString(),
    };
    try {
      this.memos.unshift({ ...newMemo, id: `temp_${Date.now()}` });
      this.contentInput = ''; this.dateInput = '';
      const saved = await this.memosApi.save(newMemo);
      const idx = this.memos.findIndex(m => m.id.startsWith('temp_'));
      if (idx !== -1) this.memos[idx] = saved as Memo;
    } catch { this.showAlert('錯誤', '新增備忘失敗！請稍後重試。'); }
    finally { this.isSubmitting = false; }
  }

  async updateMemoStatus(id: string, resolve: boolean): Promise<void> {
    const idx = this.memos.findIndex(m => m.id === id);
    if (idx === -1) return;
    const original = { ...this.memos[idx] };
    const newStatus = resolve ? 'resolved' : 'pending';
    this.memos[idx] = { ...original, status: newStatus, isResolved: resolve };
    try { await this.memosApi.update(id, { status: newStatus, isResolved: resolve }); }
    catch { this.memos[idx] = original; this.showAlert('錯誤', '更新狀態失敗！'); }
  }

  deleteMemo(id: string): void {
    this.confirmTitle = '確認刪除'; this.confirmMessage = '您確定要刪除這筆備忘錄嗎？此操作無法復原。';
    this.confirmAction = async () => {
      const idx = this.memos.findIndex(m => m.id === id);
      if (idx === -1) return;
      const backup = { ...this.memos[idx] };
      this.memos.splice(idx, 1);
      try { await this.memosApi.delete(id); }
      catch { this.memos.splice(idx, 0, backup); this.showAlert('錯誤', '刪除備忘失敗！'); }
    };
    this.isConfirmVisible = true;
  }

  handleConfirm(): void {
    this.confirmAction?.();
    this.isConfirmVisible = false;
    this.confirmAction = null;
  }

  clearPatientSelection(): void {
    this.selectedPatient = null;
    this.filterPatientId = null;
    this.router.navigate([], { queryParams: {} });
  }

  getMemoDisplayContent(memo: Memo): string {
    if (memo.patientName) return `<span class="memo-patient-name">${memo.patientName}</span> ${memo.content}`;
    return memo.content;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try { return new Date(dateStr).toLocaleDateString('zh-TW'); } catch { return dateStr; }
  }

  private showAlert(title: string, msg: string): void {
    this.alertTitle = title; this.alertMessage = msg; this.isAlertVisible = true;
  }
}
