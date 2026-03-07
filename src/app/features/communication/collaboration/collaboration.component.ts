import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, Unsubscribe } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface Task {
  id: string; content: string; status: string; type: string;
  patientId?: string; patientName?: string; targetDate?: string;
  createdAt: any; createdBy?: any; resolvedBy?: any; resolvedAt?: any;
}

@Component({
  selector: 'app-collaboration',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './collaboration.component.html',
  styleUrl: './collaboration.component.css'
})
export class CollaborationComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);
  private firestore = inject(Firestore);

  isLoading = true;
  isPageLocked = false;
  displayDate = '';
  weekdayDisplay = '';
  mainPatientViewTab: 'my' | 'all' = 'my';
  selectedPatientId: string | null = null;
  tasks: Task[] = [];
  searchQuery = '';

  isConfirmVisible = false; confirmTitle = ''; confirmMessage = '';
  private taskToDelete: Task | null = null;
  private tasksUnsubscribe: Unsubscribe | null = null;

  get filteredTasks(): Task[] {
    let result = this.tasks.filter(t => t.status === 'pending' || !t.status);
    if (this.selectedPatientId) {
      result = result.filter(t => t.patientId === this.selectedPatientId);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      result = result.filter(t =>
        (t.content || '').toLowerCase().includes(q) ||
        (t.patientName || '').toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  get completedTasks(): Task[] {
    return this.tasks
      .filter(t => t.status === 'completed')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }

  async ngOnInit(): Promise<void> {
    this.isPageLocked = !this.auth.hasPermission('viewer');
    const today = new Date();
    this.displayDate = today.toLocaleDateString('zh-TW');
    this.weekdayDisplay = ['日', '一', '二', '三', '四', '五', '六'][today.getDay()];
    await this.patientState.fetchPatientsIfNeeded();
    this.initTasksListener();
  }

  ngOnDestroy(): void { this.tasksUnsubscribe?.(); }

  private initTasksListener(): void {
    const q = query(collection(this.firestore, 'tasks'), orderBy('createdAt', 'desc'));
    this.tasksUnsubscribe = onSnapshot(q, (snapshot) => {
      this.tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task));
      this.isLoading = false;
    }, () => { this.isLoading = false; });
  }

  selectPatient(patientId: string): void {
    this.selectedPatientId = this.selectedPatientId === patientId ? null : patientId;
  }

  async markComplete(task: Task): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    try {
      await updateDoc(doc(this.firestore, 'tasks', task.id), {
        status: 'completed',
        resolvedBy: { uid: user.uid, name: user.name || '' },
        resolvedAt: new Date(),
      });
    } catch (err) { console.error('更新失敗:', err); }
  }

  confirmDelete(task: Task): void {
    this.taskToDelete = task;
    this.confirmTitle = '確認刪除';
    this.confirmMessage = '您確定要永久刪除此項目嗎？此操作無法復原。';
    this.isConfirmVisible = true;
  }

  async executeDelete(): Promise<void> {
    if (!this.taskToDelete?.id) return;
    try { await deleteDoc(doc(this.firestore, 'tasks', this.taskToDelete.id)); }
    catch (err) { console.error('刪除失敗:', err); }
    this.isConfirmVisible = false;
    this.taskToDelete = null;
  }

  getMemoTypeIcon(type: string): string {
    switch (type) { case '抽血': return '🩸'; case '衛教': return '📢'; default: return '📝'; }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try { return new Date(dateStr).toLocaleDateString('zh-TW'); } catch { return dateStr; }
  }
}
