import { Component, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  collection, query, where, orderBy, doc, updateDoc, addDoc, deleteDoc,
  onSnapshot, Timestamp, type Unsubscribe
} from 'firebase/firestore';
import { FirebaseService } from '@services/firebase.service';

interface Memo {
  id: string;
  patientId: string;
  content: string;
  status: 'pending' | 'done';
  priority: 'high' | 'normal' | 'low';
  createdAt: unknown;
  completedAt: unknown;
}

@Component({
  selector: 'app-memo-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './memo-panel.component.html',
  styleUrl: './memo-panel.component.css'
})
export class MemoPanelComponent implements OnInit, OnDestroy {
  @Input() patientId: string = '';

  private firebase = inject(FirebaseService);
  private unsubscribe: Unsubscribe | null = null;

  memos: Memo[] = [];
  newMemoContent: string = '';
  newMemoPriority: 'high' | 'normal' | 'low' = 'normal';
  isAdding: boolean = false;

  get pendingMemos(): Memo[] {
    return this.memos.filter(m => m.status === 'pending');
  }

  get completedMemos(): Memo[] {
    return this.memos.filter(m => m.status === 'done');
  }

  ngOnInit(): void {
    if (!this.patientId) return;

    const memosRef = collection(this.firebase.db, 'tasks');
    const q = query(
      memosRef,
      where('patientId', '==', this.patientId),
      where('type', '==', 'memo'),
      orderBy('createdAt', 'desc')
    );

    this.unsubscribe = onSnapshot(q, (snapshot) => {
      this.memos = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Memo));
    }, (err: Error) => {
      console.error('Failed to load memos:', err);
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  async addMemo(): Promise<void> {
    const content = this.newMemoContent.trim();
    if (!content || !this.patientId) return;

    const memosRef = collection(this.firebase.db, 'tasks');
    await addDoc(memosRef, {
      patientId: this.patientId,
      type: 'memo',
      content,
      status: 'pending',
      priority: this.newMemoPriority,
      createdAt: Timestamp.now(),
      completedAt: null
    });

    this.newMemoContent = '';
    this.newMemoPriority = 'normal';
    this.isAdding = false;
  }

  async toggleMemo(memo: Memo): Promise<void> {
    const memoRef = doc(this.firebase.db, 'tasks', memo.id);
    const newStatus = memo.status === 'pending' ? 'done' : 'pending';
    await updateDoc(memoRef, {
      status: newStatus,
      completedAt: newStatus === 'done' ? Timestamp.now() : null
    });
  }

  async deleteMemo(memo: Memo): Promise<void> {
    const memoRef = doc(this.firebase.db, 'tasks', memo.id);
    await deleteDoc(memoRef);
  }

  getPriorityClass(priority: string): string {
    return `priority-${priority}`;
  }

  startAdding(): void {
    this.isAdding = true;
  }

  cancelAdding(): void {
    this.isAdding = false;
    this.newMemoContent = '';
    this.newMemoPriority = 'normal';
  }
}
