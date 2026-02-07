import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@app/core/services/auth.service';
import { ApiManagerService, type FirestoreRecord } from '@app/core/services/api-manager.service';
import { FirebaseService } from '@app/core/services/firebase.service';
import { NotificationService } from '@app/core/services/notification.service';
import { AlertDialogComponent } from '@app/components/dialogs/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '@app/components/dialogs/confirm-dialog/confirm-dialog.component';
import { UserFormModalComponent } from '@app/components/dialogs/user-form-modal/user-form-modal.component';
import { httpsCallable } from 'firebase/functions';
import { formatDateToChinese, parseFirestoreTimestamp } from '@/utils/dateUtils.js';

interface UserRecord extends FirestoreRecord {
  name?: string;
  username?: string;
  email?: string;
  title?: string;
  role?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface AlertInfo {
  isVisible: boolean;
  title: string;
  message: string;
}

interface ConfirmInfo {
  isVisible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText: string;
  cancelText: string;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AlertDialogComponent,
    ConfirmDialogComponent,
    UserFormModalComponent,
  ],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css',
})
export class UserManagementComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly apiManager = inject(ApiManagerService);
  private readonly firebase = inject(FirebaseService);
  private readonly notificationService = inject(NotificationService);

  private readonly usersApi = this.apiManager.create<UserRecord>('users');

  // --- State ---
  users = signal<UserRecord[]>([]);
  isLoading = signal(true);
  searchTerm = signal('');
  isModalVisible = signal(false);
  isEditing = signal(false);
  userToEdit = signal<UserRecord | null>(null);
  selectedRole = signal('all');
  sortBy = signal('name');
  sortOrder = signal<'asc' | 'desc'>('asc');
  isSubmitting = signal(false);
  isDeletingUser = signal<string | null>(null);

  // --- Admin Tools State ---
  isMigrationLoading = signal(false);
  isExpireLoading = signal(false);
  isUploadingToDrive = signal(false);
  selectedFileForDrive = signal<File | null>(null);
  isResyncLoading = signal(false);

  // --- Dialog State ---
  alertInfo = signal<AlertInfo>({ isVisible: false, title: '', message: '' });
  confirmInfo = signal<ConfirmInfo>({
    isVisible: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {},
    confirmText: '確認',
    cancelText: '取消',
  });

  // --- Auth ---
  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  // --- Options ---
  roleOptions = [
    { value: 'all', label: '全部角色' },
    { value: 'admin', label: '管理員' },
    { value: 'editor', label: '編輯者' },
    { value: 'contributor', label: '貢獻者' },
    { value: 'viewer', label: '查看者' },
  ];

  sortOptions = [
    { value: 'name', label: '姓名' },
    { value: 'username', label: '帳號' },
    { value: 'role', label: '角色' },
    { value: 'createdAt', label: '建立時間' },
  ];

  // --- Computed Properties ---
  filteredUsers = computed(() => {
    let result = this.users();
    if (this.selectedRole() !== 'all') {
      result = result.filter((user) => user.role === this.selectedRole());
    }
    const search = this.searchTerm().toLowerCase();
    if (search) {
      result = result.filter(
        (user) =>
          user.name?.toLowerCase().includes(search) ||
          user.username?.toLowerCase().includes(search) ||
          user.email?.toLowerCase().includes(search) ||
          user.title?.toLowerCase().includes(search),
      );
    }
    return [...result].sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (b.role === 'admin' && a.role !== 'admin') return 1;
      let aValue: any = (a as any)[this.sortBy()];
      let bValue: any = (b as any)[this.sortBy()];
      if (this.sortBy().includes('At') && aValue && bValue) {
        aValue = aValue.toDate ? aValue.toDate() : new Date(aValue);
        bValue = bValue.toDate ? bValue.toDate() : new Date(bValue);
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      if (this.sortOrder() === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  });

  userStats = computed(() => ({
    total: this.users().length,
    filtered: this.filteredUsers().length,
  }));

  // --- Lifecycle ---
  ngOnInit(): void {
    if (this.isAdmin) {
      this.fetchUsers();
    } else {
      this.isLoading.set(false);
    }
  }

  // --- Helper Functions ---
  formatDate(timestamp: any): string {
    if (!timestamp) return 'N/A';
    const date = parseFirestoreTimestamp(timestamp);
    if (isNaN(date as any)) return '無效日期';
    return formatDateToChinese(date);
  }

  // --- Dialog Helper Functions ---
  showAlert(title: string, message: string): void {
    this.alertInfo.set({ isVisible: true, title, message });
  }

  handleAlertConfirm(): void {
    this.alertInfo.update((info) => ({ ...info, isVisible: false }));
  }

  showConfirm(
    title: string,
    message: string,
    confirmAction: () => void,
    options: { confirmText?: string; cancelText?: string } = {},
  ): void {
    this.confirmInfo.set({
      isVisible: true,
      title,
      message,
      onConfirm: () => {
        this.confirmInfo.update((info) => ({ ...info, isVisible: false }));
        confirmAction();
      },
      onCancel: () => {
        this.confirmInfo.update((info) => ({ ...info, isVisible: false }));
      },
      confirmText: options.confirmText || '確認',
      cancelText: options.cancelText || '取消',
    });
  }

  // --- Functions ---
  clearSearch(): void {
    this.searchTerm.set('');
    this.selectedRole.set('all');
  }

  async fetchUsers(): Promise<void> {
    this.isLoading.set(true);
    try {
      const result = await this.usersApi.fetchAll();
      this.users.set(result);
    } catch (error) {
      console.error('載入用戶失敗:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  handleAddUser(): void {
    if (!this.isAdmin) return;
    this.isEditing.set(false);
    this.userToEdit.set(null);
    this.isModalVisible.set(true);
  }

  handleEditUser(user: UserRecord): void {
    if (!this.isAdmin) return;
    this.isEditing.set(true);
    this.userToEdit.set(JSON.parse(JSON.stringify(user)));
    this.isModalVisible.set(true);
  }

  async handleDeleteUser(userId: string, userName: string): Promise<void> {
    if (!this.isAdmin) return;
    this.showConfirm(
      '確認刪除',
      `您確定要刪除使用者 "${userName}" 嗎？此操作無法復原。`,
      async () => {
        this.isDeletingUser.set(userId);
        const currentUsers = [...this.users()];
        const userIndex = currentUsers.findIndex((user) => user.id === userId);
        let removedUser: UserRecord | null = null;
        if (userIndex !== -1) {
          removedUser = currentUsers.splice(userIndex, 1)[0];
          this.users.set(currentUsers);
        }
        try {
          await this.usersApi.delete(userId);
          this.showAlert('成功', '使用者已成功刪除。');
        } catch (error) {
          if (removedUser && userIndex !== -1) {
            const restored = [...this.users()];
            restored.splice(userIndex, 0, removedUser);
            this.users.set(restored);
          }
          this.showAlert('刪除失敗', '刪除使用者時發生錯誤，請稍後再試。');
        } finally {
          this.isDeletingUser.set(null);
        }
      },
    );
  }

  async handleSaveUser(userData: any): Promise<void> {
    if (!this.isAdmin) return;
    this.isSubmitting.set(true);
    try {
      if (this.isEditing()) {
        const { id, password, ...updateData } = userData;
        updateData.updatedAt = new Date();

        if (password) {
          try {
            const adminResetPassword = httpsCallable(this.firebase.functions, 'adminResetPassword');
            await adminResetPassword({ userId: id, newPassword: password });
          } catch (pwError: any) {
            console.error('密碼更新失敗:', pwError);
            this.showAlert(
              '密碼更新失敗',
              pwError.message || '密碼需至少 8 個字元，並包含大寫字母、小寫字母和數字。',
            );
            this.isSubmitting.set(false);
            return;
          }
        }

        const currentUsers = [...this.users()];
        const userIndex = currentUsers.findIndex((user) => user.id === id);
        let originalUser: UserRecord | null = null;
        if (userIndex !== -1) {
          originalUser = { ...currentUsers[userIndex] };
          currentUsers[userIndex] = { ...currentUsers[userIndex], ...updateData };
          this.users.set(currentUsers);
        }
        try {
          await this.usersApi.update(id, updateData);
          this.showAlert('成功', '使用者資料已更新。');
        } catch (error) {
          if (originalUser && userIndex !== -1) {
            const restored = [...this.users()];
            restored[userIndex] = originalUser;
            this.users.set(restored);
          }
          throw error;
        }
      } else {
        const { id, ...dataToSave } = userData;
        try {
          const createUser = httpsCallable(this.firebase.functions, 'createUser');
          const result: any = await createUser(dataToSave);

          const newUserDoc = await this.usersApi.fetchById(result.data.userId);
          if (newUserDoc) {
            this.users.update((users) => [newUserDoc, ...users]);
          }
          this.showAlert('成功', '使用者已新增。密碼已安全加密儲存。');
        } catch (createError: any) {
          console.error('建立用戶失敗:', createError);
          this.showAlert('建立失敗', createError.message || '建立使用者時發生錯誤。');
          this.isSubmitting.set(false);
          return;
        }
      }
      this.isModalVisible.set(false);
    } catch (error) {
      this.showAlert('儲存失敗', '儲存使用者資料時發生錯誤。');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async copyEmail(email: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(email);
      this.showAlert('已複製', `Email 地址 "${email}" 已複製到剪貼簿`);
    } catch (err) {
      this.showAlert('Email 地址', `請手動複製: ${email}`);
    }
  }

  // --- Admin Tools Functions ---
  async triggerForceResync(): Promise<void> {
    const callCloudFunction = async (isDryRun: boolean) => {
      this.isResyncLoading.set(true);
      const logPrefix = isDryRun ? '模擬運行' : '正式執行';
      this.notificationService.createGlobalNotification(
        `${logPrefix}：已發送強制同步請求，此過程可能需要數分鐘，請稍候...`,
        'info',
      );

      try {
        const forceResync = httpsCallable(this.firebase.functions, 'forceResyncAllSchedules');
        const result: any = await forceResync({ dryRun: isDryRun });
        this.showAlert(`同步請求成功 (${logPrefix})`, result.data.message);
      } catch (error: any) {
        console.error('強制同步失敗:', error);
        this.showAlert('同步請求失敗', `發生錯誤: ${error.message}`);
      } finally {
        this.isResyncLoading.set(false);
      }
    };

    this.showConfirm(
      '⚠️ 高風險操作：強制同步排程',
      '此操作將完全覆蓋未來60天的排程，用於修復資料錯亂。<strong>此操作不可逆，請謹慎使用！</strong><br><br>您要如何執行？',
      () => {
        this.showConfirm(
          '最終確認：選擇執行模式',
          '<strong>模擬運行 (Dry Run)</strong> 不會寫入資料庫，只會在後端日誌顯示操作過程，推薦先執行此項檢查。<br><br><strong>正式執行</strong>將會實際修改資料庫。',
          () => callCloudFunction(false),
          {
            confirmText: '🔴 正式執行',
            cancelText: '🟡 模擬運行 (Dry Run)',
          },
        );

        // Override second dialog's cancel to run dry-run
        this.confirmInfo.update((info) => ({
          ...info,
          onCancel: () => {
            if (this.confirmInfo().confirmText === '🔴 正式執行') {
              this.confirmInfo.update((i) => ({ ...i, isVisible: false }));
              callCloudFunction(true);
            } else {
              this.confirmInfo.update((i) => ({ ...i, isVisible: false }));
            }
          },
        }));
      },
      {
        confirmText: '我了解風險，繼續',
        cancelText: '取消',
      },
    );
  }

  async triggerMigration(): Promise<void> {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const startDateStr = '2024-01-01';
    const endDateStr = yesterday.toISOString().split('T')[0];

    if (endDateStr < startDateStr) {
      this.showAlert('無需操作', '所有歷史排班資料似乎都已完成歸檔，無需執行手動遷移。');
      return;
    }

    this.showConfirm(
      '⚠️ 高風險操作確認',
      `此操作將會遷移從 ${startDateStr} 到 ${endDateStr} (昨天) 的所有歷史排班資料到歸檔區。您確定要繼續嗎？`,
      () => {
        this.showConfirm(
          '最終確認',
          `請再次確認，即將開始遷移 ${startDateStr} 至 ${endDateStr} 的排班資料。`,
          async () => {
            this.isMigrationLoading.set(true);
            const migrate = httpsCallable(this.firebase.functions, 'migrateSchedulesToArchive');
            try {
              const result: any = await migrate({
                startDate: startDateStr,
                endDate: endDateStr,
              });
              this.showAlert('遷移成功', `操作已完成！\n${result.data.message}`);
            } catch (error: any) {
              console.error('遷移失敗:', error);
              this.showAlert('遷移失敗', `發生錯誤: ${error.message}`);
            } finally {
              this.isMigrationLoading.set(false);
            }
          },
        );
      },
    );
  }

  async triggerManualExpire(): Promise<void> {
    this.showConfirm(
      '確認操作',
      '您確定要立即將所有過期的留言標記為「已過期」嗎？',
      async () => {
        this.isExpireLoading.set(true);
        try {
          const manuallyExpireTasks = httpsCallable(this.firebase.functions, 'manuallyExpireTasks');
          const result: any = await manuallyExpireTasks();
          this.showAlert('操作成功', result.data.message);
        } catch (error: any) {
          console.error('手動更新失敗:', error);
          this.showAlert('操作失敗', `發生錯誤: ${error.message}`);
        } finally {
          this.isExpireLoading.set(false);
        }
      },
    );
  }

  handleFileSelectForDrive(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFileForDrive.set(input.files?.[0] || null);
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  }

  async triggerUploadToDrive(): Promise<void> {
    const file = this.selectedFileForDrive();
    if (!file) {
      this.showAlert('提示', '請先選擇一個要上傳的檔案！');
      return;
    }
    this.isUploadingToDrive.set(true);
    try {
      const fileContentBase64 = await this.fileToBase64(file);
      const payload = {
        fileName: file.name,
        fileContentBase64: fileContentBase64,
        mimeType: file.type,
        targetPath: ['測試上傳'],
      };
      const uploadFile = httpsCallable(this.firebase.functions, 'uploadFile');
      const result: any = await uploadFile(payload);
      this.showAlert(
        '上傳成功',
        `${result.data.message}\n檔案名稱: ${result.data.file.name}\n檔案ID: ${result.data.file.id}`,
      );
      this.selectedFileForDrive.set(null);
    } catch (error: any) {
      console.error('上傳失敗:', error);
      this.showAlert('上傳失敗', `發生錯誤: ${error.message}`);
    } finally {
      this.isUploadingToDrive.set(false);
    }
  }

  toggleSortOrder(): void {
    this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
  }
}
