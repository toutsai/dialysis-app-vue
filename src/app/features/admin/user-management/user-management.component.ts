import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, orderBy, getDocs, doc, setDoc, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from '../../../core/services/auth.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface UserRecord {
  id: string; name: string; username: string; email?: string;
  role: string; title?: string; createdAt?: any; updatedAt?: any;
  [key: string]: any;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent, ConfirmDialogComponent],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css'
})
export class UserManagementComponent implements OnInit {
  auth = inject(AuthService);
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  users: UserRecord[] = [];
  isLoading = true;
  searchTerm = '';
  selectedRole = 'all';
  sortBy = 'name';
  sortOrder: 'asc' | 'desc' = 'asc';
  isSubmitting = false;
  isDeletingUser: string | null = null;

  // Modal state
  isModalVisible = false;
  isEditing = false;
  userForm: Record<string, any> = this.getEmptyForm();

  // Dialog state
  isAlertVisible = false; alertTitle = ''; alertMessage = '';
  isConfirmVisible = false; confirmTitle = ''; confirmMessage = '';
  private confirmAction: (() => void) | null = null;

  // Admin tools
  isResyncLoading = false;
  isMigrationLoading = false;
  isExpireLoading = false;

  roleOptions = [
    { value: 'all', label: '全部角色' }, { value: 'admin', label: '管理員' },
    { value: 'editor', label: '編輯者' }, { value: 'contributor', label: '貢獻者' },
    { value: 'viewer', label: '查看者' },
  ];

  get filteredUsers(): UserRecord[] {
    let result = this.users;
    if (this.selectedRole !== 'all') result = result.filter(u => u.role === this.selectedRole);
    if (this.searchTerm) {
      const s = this.searchTerm.toLowerCase();
      result = result.filter(u =>
        u.name?.toLowerCase().includes(s) || u.username?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s) || u.title?.toLowerCase().includes(s)
      );
    }
    return [...result].sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (b.role === 'admin' && a.role !== 'admin') return 1;
      const aVal = String(a[this.sortBy] || '').toLowerCase();
      const bVal = String(b[this.sortBy] || '').toLowerCase();
      return this.sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }

  get userStats() { return { total: this.users.length, filtered: this.filteredUsers.length }; }

  isAdminUser(): boolean { return this.auth.isAdmin; }

  ngOnInit(): void {
    if (this.auth.isAdmin) this.fetchUsers();
    else this.isLoading = false;
  }

  async fetchUsers(): Promise<void> {
    this.isLoading = true;
    try {
      const q = query(collection(this.firestore, 'users'), orderBy('name'));
      const snapshot = await getDocs(q);
      this.users = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserRecord));
    } catch (e) { console.error('載入用戶失敗:', e); }
    finally { this.isLoading = false; }
  }

  private getEmptyForm(): Record<string, any> {
    return { id: '', name: '', username: '', email: '', password: '', role: 'viewer', title: '' };
  }

  handleAddUser(): void {
    this.isEditing = false; this.userForm = this.getEmptyForm(); this.isModalVisible = true;
  }

  handleEditUser(user: UserRecord): void {
    this.isEditing = true; this.userForm = { ...user, password: '' }; this.isModalVisible = true;
  }

  handleDeleteUser(userId: string, userName: string): void {
    this.confirmTitle = '確認刪除';
    this.confirmMessage = `您確定要刪除使用者 "${userName}" 嗎？此操作無法復原。`;
    this.confirmAction = async () => {
      this.isDeletingUser = userId;
      try {
        await deleteDoc(doc(this.firestore, 'users', userId));
        this.users = this.users.filter(u => u.id !== userId);
        this.showAlert('成功', '使用者已成功刪除。');
      } catch { this.showAlert('刪除失敗', '刪除使用者時發生錯誤。'); }
      finally { this.isDeletingUser = null; }
    };
    this.isConfirmVisible = true;
  }

  async handleSaveUser(): Promise<void> {
    this.isSubmitting = true;
    try {
      if (this.isEditing) {
        const { id, password, ...updateData } = this.userForm;
        updateData['updatedAt'] = new Date();
        if (password) {
          try {
            const resetFn = httpsCallable(this.functions, 'adminResetPassword');
            await resetFn({ userId: id, newPassword: password });
          } catch (e: any) { this.showAlert('密碼更新失敗', e.message); this.isSubmitting = false; return; }
        }
        await updateDoc(doc(this.firestore, 'users', id), updateData);
        const idx = this.users.findIndex(u => u.id === id);
        if (idx !== -1) this.users[idx] = { ...this.users[idx], ...updateData };
        this.showAlert('成功', '使用者資料已更新。');
      } else {
        const { id, ...data } = this.userForm;
        const createFn = httpsCallable(this.functions, 'createUser');
        const result: any = await createFn(data);
        await this.fetchUsers();
        this.showAlert('成功', '使用者已新增。');
      }
      this.isModalVisible = false;
    } catch { this.showAlert('儲存失敗', '儲存使用者資料時發生錯誤。'); }
    finally { this.isSubmitting = false; }
  }

  // Admin tools
  async triggerForceResync(): Promise<void> {
    this.confirmTitle = '⚠️ 高風險操作：強制同步排程';
    this.confirmMessage = '此操作將完全覆蓋未來60天的排程。確定要繼續嗎？';
    this.confirmAction = async () => {
      this.isResyncLoading = true;
      try {
        const fn = httpsCallable(this.functions, 'forceResyncAllSchedules');
        const result: any = await fn({ dryRun: false });
        this.showAlert('同步成功', result.data.message);
      } catch (e: any) { this.showAlert('同步失敗', e.message); }
      finally { this.isResyncLoading = false; }
    };
    this.isConfirmVisible = true;
  }

  async triggerManualExpire(): Promise<void> {
    this.confirmTitle = '確認操作';
    this.confirmMessage = '確定要將所有過期留言標記為「已過期」嗎？';
    this.confirmAction = async () => {
      this.isExpireLoading = true;
      try {
        const fn = httpsCallable(this.functions, 'manuallyExpireTasks');
        const result: any = await fn();
        this.showAlert('操作成功', result.data.message);
      } catch (e: any) { this.showAlert('操作失敗', e.message); }
      finally { this.isExpireLoading = false; }
    };
    this.isConfirmVisible = true;
  }

  onConfirmOk(): void { this.isConfirmVisible = false; this.confirmAction?.(); }
  onConfirmCancel(): void { this.isConfirmVisible = false; }

  showAlert(title: string, message: string): void {
    this.alertTitle = title; this.alertMessage = message; this.isAlertVisible = true;
  }
  onAlertConfirm(): void { this.isAlertVisible = false; }

  clearSearch(): void { this.searchTerm = ''; this.selectedRole = 'all'; }
  toggleSortOrder(): void { this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'; }

  formatDate(timestamp: any): string {
    if (!timestamp) return 'N/A';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return isNaN(d.getTime()) ? '無效日期' : `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }
}
