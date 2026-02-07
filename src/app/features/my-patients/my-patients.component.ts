import {
  Component,
  inject,
  signal,
  computed,
  effect,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { FirebaseService } from '@services/firebase.service';
import { AuthService, type AppUser } from '@services/auth.service';
import { PatientStoreService } from '@services/patient-store.service';
import { NotificationService } from '@services/notification.service';
import { UserDirectoryService } from '@services/user-directory.service';
import {
  ApiManagerService,
  type ApiManager,
  type FirestoreRecord,
} from '@services/api-manager.service';
import { formatDateToYYYYMMDD } from '@/utils/dateUtils.js';
import { handleTaskCreated } from '@/utils/taskHandlers.js';

// Component Imports
import { TaskCreateDialogComponent } from '@app/components/dialogs/task-create-dialog/task-create-dialog.component';
import { ConfirmDialogComponent } from '@app/components/dialogs/confirm-dialog/confirm-dialog.component';
import { DialysisOrderModalComponent } from '@app/components/dialogs/dialysis-order-modal/dialysis-order-modal.component';
import { MarqueeBannerComponent } from '@app/components/marquee-banner/marquee-banner.component';

interface MedicationMaster {
  code: string;
  tradeName: string;
  unit: string;
}

interface MyPatientItem {
  id: string;
  patientId: string;
  name: string;
  bedNum: string;
  preparation: {
    ak: string;
    dialysateCa: string;
    heparin: string;
    bloodFlow: string;
    vascAccess: string;
  };
  injections: {
    orderCode: string;
    orderName?: string;
    dose?: string;
    unit?: string;
    note?: string;
  }[];
  memos: {
    id: string;
    content: string;
    type?: string;
    targetDate?: string;
    [key: string]: unknown;
  }[];
}

interface SelectableUser {
  uid: string;
  name: string;
  username: string;
}

@Component({
  selector: 'app-my-patients',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TaskCreateDialogComponent,
    ConfirmDialogComponent,
    DialysisOrderModalComponent,
    MarqueeBannerComponent,
  ],
  templateUrl: './my-patients.component.html',
  styleUrl: './my-patients.component.css',
})
export class MyPatientsComponent implements OnInit, OnDestroy {
  private readonly firebaseService = inject(FirebaseService);
  private readonly authService = inject(AuthService);
  private readonly patientStore = inject(PatientStoreService);
  private readonly notificationService = inject(NotificationService);
  private readonly userDirectory = inject(UserDirectoryService);
  private readonly apiManagerService = inject(ApiManagerService);

  // --- State ---
  readonly selectedUserId = signal<string | null>(null);
  readonly selectedDate = signal(formatDateToYYYYMMDD());
  readonly isLoading = signal(false);
  readonly patientListByShift = signal<Record<string, MyPatientItem[]>>({});
  readonly selectableUsers = signal<SelectableUser[]>([]);

  private readonly SELECTABLE_USERS_TTL = 10 * 60 * 1000;
  private lastSelectableUsersUpdatedAt = 0;

  // Injection medication master data
  private readonly INJECTION_MEDS_MASTER: MedicationMaster[] = [
    { code: 'INES2', tradeName: 'NESP', unit: 'mcg' },
    { code: 'IREC1', tradeName: 'Recormon', unit: 'KIU' },
    { code: 'IFER2', tradeName: 'Fe-back', unit: 'mg' },
    { code: 'ICAC', tradeName: 'Cacare', unit: 'amp' },
    { code: 'IPAR1', tradeName: 'Parsabiv', unit: 'mg' },
  ];
  private readonly injectionTradeNameMap = new Map(
    this.INJECTION_MEDS_MASTER.map((med) => [med.code, med.tradeName])
  );

  // Dialog state
  readonly isCreateModalVisible = signal(false);
  readonly editingItem = signal<any>(null);
  readonly isConfirmDeleteVisible = signal(false);
  readonly itemToDelete = signal<any>(null);
  readonly isOrderModalVisible = signal(false);
  readonly selectedPatientForOrder = signal<any>(null);

  // Computed
  readonly currentUser = computed(() => this.authService.currentUser());
  readonly canSwitchUser = computed(() => !!this.currentUser());

  readonly hasAnyPatients = computed(() => {
    const shifts = this.patientListByShift();
    if (!shifts) return false;
    return Object.values(shifts).some((list) => list.length > 0);
  });

  readonly todayDateString = computed(() =>
    new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  );

  readonly statusMessage = computed(() => {
    if (this.selectedUserId() !== this.currentUser()?.uid) {
      const selectedUserName =
        this.selectableUsers().find((u) => u.uid === this.selectedUserId())
          ?.name || '';
      return `${selectedUserName} 在 ${this.selectedDate()} 沒有被分配到照護病人。`;
    }
    return '您今天沒有被分配到照護病人，或班表尚未更新。';
  });

  // Watch currentUser changes
  private readonly userWatcher = effect(() => {
    const user = this.authService.currentUser();
    if (user) {
      this.selectedUserId.set(user.uid);
      this.loadSelectableUsers(true);
    } else {
      this.selectedUserId.set(null);
      this.selectableUsers.set([]);
      this.userDirectory.clearCache();
      this.lastSelectableUsersUpdatedAt = 0;
    }
  });

  ngOnInit(): void {
    this.fetchMyPatientData();
  }

  ngOnDestroy(): void {
    // effect cleanup is automatic
  }

  // --- Helper Functions ---
  hasPermission(role: string): boolean {
    return this.authService.hasPermission(role as any);
  }

  getShiftTitle(shiftCode: string): string {
    const map: Record<string, string> = {
      early: '早班 (主責)',
      noonOn: '午班 (上針)',
      noonOff: '午班 (收針)',
      late: '晚班 (主責)',
    };
    return map[shiftCode] || shiftCode;
  }

  getMessageTypeIcon(type: string | undefined): string {
    switch (type) {
      case '抽血':
        return '\u{1FA78}'; // blood drop
      case '衛教':
        return '\u{1F4E2}'; // loudspeaker
      case '常規':
      default:
        return '\u{1F4DD}'; // memo
    }
  }

  formatInjection(injection: any): string {
    const displayName =
      this.injectionTradeNameMap.get(injection.orderCode) ||
      injection.orderName ||
      '未知藥品';
    const parts = [
      displayName,
      `${injection.dose || ''} ${injection.unit || ''}`.trim(),
      injection.note || '',
    ];
    return parts.filter((part) => part).join(' / ');
  }

  getShiftKeys(): string[] {
    return Object.keys(this.patientListByShift());
  }

  getShiftPatients(shiftCode: string): MyPatientItem[] {
    return this.patientListByShift()[shiftCode] || [];
  }

  // --- Data Loading ---
  async fetchMyPatientData(date?: string): Promise<void> {
    // This would typically call a composable/service that fetches
    // the my-patient-list data. For now, this represents the same
    // logic as useMyPatientList composable.
    this.isLoading.set(true);
    try {
      // The actual implementation would use the userId and date
      // to fetch patient data from Firestore
      const userId = this.selectedUserId();
      const targetDate = date || this.selectedDate();
      if (!userId) {
        this.patientListByShift.set({});
        return;
      }
      // Placeholder: actual fetch logic from useMyPatientList composable
      // would be integrated here via a dedicated service
      console.log(
        `[MyPatientsComponent] fetchMyPatientData for user=${userId}, date=${targetDate}`
      );
    } catch (error) {
      console.error('載入今日病人資料失敗:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  reloadData(): void {
    this.fetchMyPatientData(this.selectedDate());
  }

  private async loadSelectableUsers(force = false): Promise<void> {
    if (!this.canSwitchUser()) {
      this.selectableUsers.set([]);
      return;
    }

    const now = Date.now();
    if (
      !force &&
      this.selectableUsers().length > 0 &&
      now - this.lastSelectableUsersUpdatedAt < this.SELECTABLE_USERS_TTL
    ) {
      return;
    }

    try {
      await this.userDirectory.ensureUsersLoaded(force);
      const allUsers = this.userDirectory.allUsers();
      const filteredUsers = allUsers
        .filter(
          (user) =>
            ['護理師', '護理師組長'].includes(user.title) && user.username
        )
        .map((user) => ({
          uid: user.uid,
          name: user.name,
          username: user.username!,
        }));

      this.selectableUsers.set(
        filteredUsers.sort((a, b) => {
          const idA = parseInt(a.username, 10);
          const idB = parseInt(b.username, 10);
          if (!isNaN(idA) && !isNaN(idB)) {
            return idA - idB;
          }
          return String(a.username).localeCompare(String(b.username), undefined, {
            numeric: true,
          });
        })
      );
      this.lastSelectableUsersUpdatedAt = now;
    } catch (error) {
      console.error('無法載入使用者列表:', error);
    }
  }

  // --- Dialog Event Handlers ---
  openCreateModal(itemToEdit: any = null): void {
    if (!this.hasPermission('viewer')) {
      this.notificationService.createNotification(
        '您的權限不足，無法執行此操作。',
        'error'
      );
      return;
    }
    this.editingItem.set(itemToEdit);
    this.isCreateModalVisible.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalVisible.set(false);
    this.editingItem.set(null);
  }

  async handleTaskSubmit(data: any): Promise<void> {
    const db = this.firebaseService.db;
    const user = this.currentUser();

    if (data.id) {
      // Edit mode
      const taskRef = doc(db, 'tasks', data.id);
      const { id, ...updateData } = data;
      try {
        await updateDoc(taskRef, updateData);
        this.notificationService.createNotification('備忘已更新', 'success');
      } catch (error) {
        console.error('更新項目失敗:', error);
        this.notificationService.createNotification(
          '更新失敗，請稍後再試',
          'error'
        );
      }
    } else {
      // Create mode
      try {
        await handleTaskCreated(data, user);
        this.notificationService.createNotification(
          '交辦/留言已成功新增！',
          'success'
        );
      } catch (error: any) {
        console.error('新增項目失敗:', error);
        this.notificationService.createNotification(
          `新增失敗: ${error.message}`,
          'error'
        );
      }
    }
    this.closeCreateModal();
  }

  async updateTaskStatus(task: any, newStatus: string): Promise<void> {
    const user = this.currentUser();
    if (!user) return;
    try {
      const db = this.firebaseService.db;
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        status: newStatus,
        resolvedBy: { uid: user.uid, name: user.name },
        resolvedAt: new Date(),
      });
      this.notificationService.createNotification(
        newStatus === 'completed' ? '狀態已更新為已讀' : '狀態已移回待辦',
        'success'
      );
    } catch (error) {
      console.error('更新任務狀態失敗:', error);
      this.notificationService.createNotification(
        '更新失敗，請稍後再試',
        'error'
      );
    }
  }

  confirmDeleteTask(item: any): void {
    this.itemToDelete.set(item);
    this.isConfirmDeleteVisible.set(true);
  }

  async executeDeleteTask(): Promise<void> {
    const item = this.itemToDelete();
    if (!item) return;
    const db = this.firebaseService.db;
    const taskRef = doc(db, 'tasks', item.id);
    try {
      await deleteDoc(taskRef);
      this.notificationService.createNotification('訊息已刪除', 'info');
    } catch (error) {
      console.error('刪除任務失敗:', error);
      this.notificationService.createNotification(
        '刪除失敗，請稍後再試',
        'error'
      );
    }
    this.isConfirmDeleteVisible.set(false);
    this.itemToDelete.set(null);
  }

  openEditModal(itemToEdit: any): void {
    this.openCreateModal(itemToEdit);
  }

  openOrderModal(patientFromList: MyPatientItem): void {
    const allPatients = this.patientStore.allPatients();
    const fullPatientData = allPatients.find(
      (p) => p.id === patientFromList.patientId
    );
    if (fullPatientData) {
      this.selectedPatientForOrder.set(fullPatientData);
      this.isOrderModalVisible.set(true);
    } else {
      console.error('找不到完整的病人資料:', patientFromList.patientId);
      this.notificationService.createNotification(
        '無法載入病人醫囑，請稍後再試',
        'error'
      );
    }
  }

  closeOrderModal(): void {
    this.isOrderModalVisible.set(false);
    this.selectedPatientForOrder.set(null);
  }

  async handleOrderSave(updatedOrders: any): Promise<void> {
    const patient = this.selectedPatientForOrder();
    if (!patient) return;

    const db = this.firebaseService.db;
    const patientRef = doc(db, 'patients', patient.id);
    const historyRef = collection(db, 'dialysis_order_history');
    const user = this.currentUser();

    try {
      await updateDoc(patientRef, {
        dialysisOrders: updatedOrders,
      });

      await addDoc(historyRef, {
        patientId: patient.id,
        patientName: patient.name,
        orders: updatedOrders,
        updatedBy: user?.name || '未知使用者',
        updatedAt: serverTimestamp(),
      });

      this.notificationService.createNotification(
        `${patient.name} 的醫囑已更新`,
        'success'
      );
      this.patientStore.updatePatientInStore(patient.id, {
        dialysisOrders: updatedOrders,
      });
      this.closeOrderModal();
    } catch (error) {
      console.error('儲存醫囑失敗:', error);
      this.notificationService.createNotification(
        '醫囑儲存失敗，請檢查網路連線',
        'error'
      );
    }
  }

  onCancelConfirmDelete(): void {
    this.isConfirmDeleteVisible.set(false);
  }
}
