import { Component, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData, query, where } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

interface TaskMessage {
  id: string;
  type: string;
  status: string;
  content: string;
  createdAt: any;
}

@Component({
  selector: 'app-patient-messages-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-messages-icon.component.html',
  styleUrl: './patient-messages-icon.component.css'
})
export class PatientMessagesIconComponent implements OnInit, OnDestroy {
  @Input() patientId: string = '';
  @Input() context: string = 'schedule';
  @Input() typesMap: Record<string, { icon: string; color: string; label: string }> = {};

  private firestore = inject(Firestore);
  private subscription: Subscription | null = null;

  messages: TaskMessage[] = [];

  get pendingCount(): number {
    return this.messages.filter(m => m.status === 'pending').length;
  }

  get hasMessages(): boolean {
    return this.messages.length > 0;
  }

  get visibleIndicators(): { type: string; icon: string; color: string; count: number }[] {
    const countByType: Record<string, number> = {};
    for (const msg of this.messages) {
      countByType[msg.type] = (countByType[msg.type] || 0) + 1;
    }

    return Object.entries(countByType).map(([type, count]) => {
      const config = this.typesMap[type] || { icon: '!', color: '#999', label: type };
      return { type, icon: config.icon, color: config.color, count };
    });
  }

  ngOnInit(): void {
    if (!this.patientId) return;

    const tasksRef = collection(this.firestore, 'tasks');
    const q = query(
      tasksRef,
      where('patientId', '==', this.patientId),
      where('status', 'in', ['pending', 'in-progress'])
    );

    this.subscription = collectionData(q, { idField: 'id' }).subscribe({
      next: (tasks: TaskMessage[]) => {
        this.messages = tasks;
      },
      error: (err) => {
        console.error('Failed to load patient messages:', err);
        this.messages = [];
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
