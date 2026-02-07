import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '@services/firebase.service';
import { AuthService } from '@app/core/services/auth.service';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

@Component({
  selector: 'app-condition-record-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './condition-record-panel.component.html',
  styleUrl: './condition-record-panel.component.css'
})
export class ConditionRecordPanelComponent implements OnChanges {
  private readonly firebase = inject(FirebaseService);
  private readonly auth = inject(AuthService);

  @Input() patientId = '';
  @Input() patientName = '';
  @Input() targetDate = '';
  @Output() recordsChanged = new EventEmitter<void>();

  records: any[] = [];
  newContent = '';
  isLoading = false;
  isSaving = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patientId'] || changes['targetDate']) {
      this.fetchRecords();
    }
  }

  async fetchRecords(): Promise<void> {
    if (!this.patientId) {
      this.records = [];
      return;
    }
    this.isLoading = true;
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const q = query(
        collection(this.firebase.db, 'condition_records'),
        where('patientId', '==', this.patientId),
        where('createdAt', '>=', sevenDaysAgo),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      this.records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('讀取病情紀錄失敗:', err);
      this.records = [];
    } finally {
      this.isLoading = false;
    }
  }

  async addRecord(): Promise<void> {
    const content = this.newContent.trim();
    if (!content || !this.patientId) return;

    const currentUser = this.auth.currentUser();
    if (!currentUser) return;

    this.isSaving = true;
    try {
      await addDoc(collection(this.firebase.db, 'condition_records'), {
        patientId: this.patientId,
        patientName: this.patientName,
        content,
        authorName: currentUser.name,
        authorId: currentUser.uid,
        recordDate: this.targetDate || new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
      });
      this.newContent = '';
      await this.fetchRecords();
      this.recordsChanged.emit();
    } catch (err) {
      console.error('新增病情紀錄失敗:', err);
      alert('新增失敗，請稍後再試');
    } finally {
      this.isSaving = false;
    }
  }

  async deleteRecord(recordId: string): Promise<void> {
    if (!confirm('確定要刪除此紀錄？')) return;
    try {
      await deleteDoc(doc(this.firebase.db, 'condition_records', recordId));
      await this.fetchRecords();
      this.recordsChanged.emit();
    } catch (err) {
      console.error('刪除紀錄失敗:', err);
    }
  }

  formatTimestamp(ts: any): string {
    if (!ts) return '未知時間';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
