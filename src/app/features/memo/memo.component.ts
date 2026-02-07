import { Component, inject, signal, computed, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiManagerService, type ApiManager, type FirestoreRecord } from '@services/api-manager.service';
import { PatientStoreService } from '@services/patient-store.service';
import { NotificationService } from '@services/notification.service';
import { PatientSelectDialogComponent } from '@app/components/dialogs/patient-select-dialog/patient-select-dialog.component';
import { AlertDialogComponent } from '@app/components/dialogs/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '@app/components/dialogs/confirm-dialog/confirm-dialog.component';
import { formatDateToChinese, addDays, parseFirestoreTimestamp } from '@/utils/dateUtils.js';
import { escapeHtml } from '@/utils/sanitize.js';

@Component({
  selector: 'app-memo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PatientSelectDialogComponent,
    AlertDialogComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './memo.component.html',
  styleUrl: './memo.component.css'
})
export class MemoComponent implements OnInit, OnDestroy {
  private readonly apiManagerService = inject(ApiManagerService);
  private readonly patientStore = inject(PatientStoreService);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly memosApi: ApiManager<FirestoreRecord>;

  memos = signal<any[]>([]);
  contentInput = signal<string>('');
  dateInput = signal<string>('');
  isPatientDialogVisible = signal<boolean>(false);
  selectedPatient = signal<any>(null);
  filterPatientId = signal<string | null>(null);
  activeTab = signal<string>('expired');
  isFormModalVisible = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  isMemosLoading = signal<boolean>(false);
  isAlertDialogVisible = signal<boolean>(false);
  alertDialogTitle = signal<string>('');
  alertDialogMessage = signal<string>('');
  isConfirmDialogVisible = signal<boolean>(false);
  confirmDialogTitle = signal<string>('');
  confirmDialogMessage = signal<string>('');
  error = signal<string | null>(null);

  private confirmAction: (() => Promise<void>) | null = null;
  private queryParamSub: any;

  private readonly SYSTEM_MEMO_KEYWORDS = [
    '\u3010\u81e8\u6642\u8abf\u73ed\u3011',
    '\u3010\u5340\u9593\u66ab\u505c\u3011',
    '\u3010\u81e8\u6642\u52a0\u6d17\u3011',
    '\u3010\u5340\u9593\u8abf\u73ed\u3011',
    '\u3010\u66f4\u65b0-\u81e8\u6642\u8abf\u73ed\u3011',
  ];

  get allPatients() {
    return this.patientStore.allPatients();
  }

  get isPatientsLoading() {
    return this.patientStore.isLoading();
  }

  pendingList = computed(() =>
    this.memos()
      .filter(memo => {
        const isPending = memo.status === 'pending' || !memo.status;
        if (isPending && !this.isSystemMemo(memo)) {
          if (this.filterPatientId()) {
            return memo.patientId === this.filterPatientId();
          }
          return true;
        }
        return false;
      })
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );

  resolvedList = computed(() => {
    const ninetyDaysAgo = addDays(new Date(), -90);
    return this.memos()
      .filter(memo => {
        const isRecentResolved =
          memo.status === 'resolved' && parseFirestoreTimestamp(memo.createdAt) > ninetyDaysAgo;
        if (isRecentResolved && !this.isSystemMemo(memo)) {
          if (this.filterPatientId()) {
            return memo.patientId === this.filterPatientId();
          }
          return true;
        }
        return false;
      })
      .sort((a: any, b: any) => parseFirestoreTimestamp(b.createdAt) - parseFirestoreTimestamp(a.createdAt));
  });

  expiredList = computed(() => {
    const sevenDaysAgo = addDays(new Date(), -7);
    return this.memos()
      .filter(memo => {
        const isExpired = memo.status === 'expired';
        const isRecent = memo.targetDate && new Date(memo.targetDate) >= sevenDaysAgo;
        if (isExpired && isRecent && !this.isSystemMemo(memo)) {
          if (this.filterPatientId()) {
            return memo.patientId === this.filterPatientId();
          }
          return true;
        }
        return false;
      })
      .sort((a: any, b: any) => parseFirestoreTimestamp(b.createdAt) - parseFirestoreTimestamp(a.createdAt));
  });

  memoStats = computed(() => ({
    total: this.memos().length,
    pending: this.pendingList().length,
    resolved: this.resolvedList().length,
    expired: this.expiredList().length,
  }));

  constructor() {
    this.memosApi = this.apiManagerService.create<FirestoreRecord>('memos');
  }

  ngOnInit(): void {
    this.queryParamSub = this.route.queryParams.subscribe(params => {
      const newPatientId = params['patientId'] || null;
      this.filterPatientId.set(newPatientId);
      if (newPatientId && this.allPatients.length > 0) {
        const patient = this.allPatients.find((p: any) => p.id === newPatientId);
        if (patient) {
          this.selectedPatient.set(patient);
        }
      } else if (!newPatientId) {
        this.selectedPatient.set(null);
      }
    });
    this.initializeData();
  }

  ngOnDestroy(): void {
    if (this.queryParamSub) {
      this.queryParamSub.unsubscribe();
    }
  }

  private isSystemMemo(memo: any): boolean {
    return this.SYSTEM_MEMO_KEYWORDS.some(keyword => memo.content.startsWith(keyword));
  }

  private async fetchMemos(): Promise<void> {
    if (this.isMemosLoading()) return;
    this.isMemosLoading.set(true);
    this.error.set(null);
    try {
      const data = await this.memosApi.fetchAll();
      this.memos.set(data);
    } catch (err: any) {
      this.error.set('\u8f09\u5165\u5099\u5fd8\u9304\u5931\u6557\uff0c\u8acb\u91cd\u8a66');
      this.handleError('\u8b80\u53d6\u5099\u5fd8\u9304\u5931\u6557', err);
    } finally {
      this.isMemosLoading.set(false);
    }
  }

  private async initializeData(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.patientStore.fetchPatientsIfNeeded();
      await this.fetchMemos();
      const patientIdFromQuery = this.route.snapshot.queryParams['patientId'];
      if (patientIdFromQuery && this.allPatients.length > 0) {
        const patient = this.allPatients.find((p: any) => p.id === patientIdFromQuery);
        if (patient) {
          this.selectedPatient.set(patient);
          this.filterPatientId.set(patientIdFromQuery);
        }
      }
    } catch (err: any) {
      this.error.set('\u521d\u59cb\u5316\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u6574\u7406\u9801\u9762');
    } finally {
      this.isLoading.set(false);
    }
  }

  async addMemo(): Promise<void> {
    if (!this.contentInput().trim()) {
      this.showAlert('\u63d0\u793a', '\u5099\u5fd8\u5167\u5bb9\u4e0d\u80fd\u70ba\u7a7a\uff01');
      return;
    }
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    const newMemo: any = {
      content: this.contentInput().trim(),
      patientId: this.selectedPatient()?.id || null,
      patientName: this.selectedPatient()?.name || null,
      targetDate: this.dateInput() || null,
      status: 'pending',
      isResolved: false,
      createdAt: new Date().toISOString(),
    };
    try {
      const tempId = `temp_${Date.now()}`;
      this.memos.update(list => [{ ...newMemo, id: tempId }, ...list]);
      const contentPreview =
        this.contentInput().substring(0, 20) + (this.contentInput().length > 20 ? '...' : '');
      const patientContext = this.selectedPatient() ? ` (${this.selectedPatient().name})` : '';
      this.contentInput.set('');
      this.dateInput.set('');
      this.clearPatientSelection();
      const savedMemo = await this.memosApi.save(newMemo);
      this.memos.update(list => {
        const idx = list.findIndex(m => m.id === tempId);
        if (idx !== -1) {
          const updated = [...list];
          updated[idx] = savedMemo;
          return updated;
        }
        return list;
      });
      this.notificationService.createGlobalNotification(`\u65b0\u589e\u5099\u5fd8\uff1a${contentPreview}${patientContext}`, 'memo');
      this.closeFormModal();
    } catch (err: any) {
      this.memos.update(list => list.filter(m => m.content !== newMemo.content));
      this.contentInput.set(newMemo.content);
      this.dateInput.set(newMemo.targetDate || '');
      if (newMemo.patientId) {
        const patient = this.allPatients.find((p: any) => p.id === newMemo.patientId);
        if (patient) {
          this.selectedPatient.set(patient);
        }
      }
      this.handleError('\u65b0\u589e\u5099\u5fd8\u5931\u6557', err);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  handlePatientSelected(event: { patientId: string }): void {
    const patient = this.allPatients.find((p: any) => p.id === event.patientId) || null;
    this.selectedPatient.set(patient);
    this.isPatientDialogVisible.set(false);
  }

  clearPatientSelection(): void {
    this.selectedPatient.set(null);
    if (this.route.snapshot.queryParams['patientId']) {
      this.filterPatientId.set(null);
      this.router.navigate([], { queryParams: {} });
    }
  }

  async updateMemoStatus(id: string, resolve: boolean): Promise<void> {
    const currentMemos = this.memos();
    const memoIndex = currentMemos.findIndex(m => m.id === id);
    if (memoIndex === -1) return;
    const originalMemo = { ...currentMemos[memoIndex] };
    const newStatus = resolve ? 'resolved' : 'pending';
    this.memos.update(list => {
      const updated = [...list];
      updated[memoIndex] = { ...originalMemo, status: newStatus, isResolved: resolve };
      return updated;
    });
    try {
      await this.memosApi.update(id, { status: newStatus, isResolved: resolve });
      const contentPreview =
        originalMemo.content.substring(0, 20) + (originalMemo.content.length > 20 ? '...' : '');
      const patientContext = originalMemo.patientName ? ` (${originalMemo.patientName})` : '';
      if (resolve) {
        this.notificationService.createGlobalNotification(`\u5df2\u8655\u7406\u5099\u5fd8\uff1a${contentPreview}${patientContext}`, 'success');
      } else {
        this.notificationService.createGlobalNotification(`\u5df2\u79fb\u56de\u5f85\u8fa6\uff1a${contentPreview}${patientContext}`, 'info');
      }
    } catch (err: any) {
      this.memos.update(list => {
        const updated = [...list];
        updated[memoIndex] = originalMemo;
        return updated;
      });
      this.handleError('\u66f4\u65b0\u72c0\u614b\u5931\u6557', err);
    }
  }

  deleteMemo(id: string): void {
    this.confirmDialogTitle.set('\u78ba\u8a8d\u522a\u9664');
    this.confirmDialogMessage.set('\u60a8\u78ba\u5b9a\u8981\u522a\u9664\u9019\u7b46\u5099\u5fd8\u9304\u55ce\uff1f\u6b64\u64cd\u4f5c\u7121\u6cd5\u5fa9\u539f\u3002');
    this.confirmAction = async () => {
      const currentMemos = this.memos();
      const memoIndex = currentMemos.findIndex(m => m.id === id);
      if (memoIndex === -1) return;
      const memoToDelete = { ...currentMemos[memoIndex] };
      this.memos.update(list => list.filter((_, i) => i !== memoIndex));
      try {
        await this.memosApi.delete(id);
        const contentPreview =
          memoToDelete.content.substring(0, 20) + (memoToDelete.content.length > 20 ? '...' : '');
        const patientContext = memoToDelete.patientName ? ` (${memoToDelete.patientName})` : '';
        this.notificationService.createGlobalNotification(`\u5df2\u522a\u9664\u5099\u5fd8\uff1a${contentPreview}${patientContext}`, 'info');
      } catch (err: any) {
        this.memos.update(list => {
          const updated = [...list];
          updated.splice(memoIndex, 0, memoToDelete);
          return updated;
        });
        this.handleError('\u522a\u9664\u5099\u5fd8\u5931\u6557', err);
      }
    };
    this.isConfirmDialogVisible.set(true);
  }

  openPatientDialog(): void {
    this.isPatientDialogVisible.set(true);
  }

  handleConfirm(): void {
    if (this.confirmAction) this.confirmAction();
    this.isConfirmDialogVisible.set(false);
    this.confirmAction = null;
  }

  handleCancel(): void {
    this.isConfirmDialogVisible.set(false);
    this.confirmAction = null;
  }

  private handleError(title: string, error: any): void {
    console.error(`[MemoView] ${title}:`, error);
    this.showAlert('\u932f\u8aa4', `${title}\uff01\u8acb\u7a0d\u5f8c\u91cd\u8a66\u3002`);
  }

  private showAlert(title: string, message: string): void {
    this.alertDialogTitle.set(title);
    this.alertDialogMessage.set(message);
    this.isAlertDialogVisible.set(true);
  }

  async retryLoadData(): Promise<void> {
    this.error.set(null);
    await this.initializeData();
  }

  getMemoDisplayContent(memo: any): string {
    if (memo.patientName) {
      return `<span class="memo-patient-name">${escapeHtml(memo.patientName)}</span> ${escapeHtml(memo.content)}`;
    }
    return escapeHtml(memo.content);
  }

  openFormModal(): void {
    this.isFormModalVisible.set(true);
  }

  closeFormModal(): void {
    this.isFormModalVisible.set(false);
  }

  formatDateToChinese = formatDateToChinese;
  parseFirestoreTimestamp = parseFirestoreTimestamp;
}
