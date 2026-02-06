import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Memo {
  id: string;
  content: string;
  createdAt: string;
  author: string;
  priority: 'normal' | 'important' | 'urgent';
  isRead: boolean;
}

@Component({
  selector: 'app-memo-display-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './memo-display-dialog.component.html',
  styleUrl: './memo-display-dialog.component.css'
})
export class MemoDisplayDialogComponent {
  @Input() isVisible = false;
  @Input() patientName = '';
  @Input() memos: Memo[] = [];
  @Output() closed = new EventEmitter<void>();

  getPriorityLabel(priority: string): string {
    const map: Record<string, string> = {
      normal: '一般',
      important: '重要',
      urgent: '緊急'
    };
    return map[priority] || priority;
  }

  getPriorityClass(priority: string): string {
    return `priority-${priority}`;
  }

  markAsRead(memo: Memo): void {
    memo.isRead = true;
  }

  get unreadCount(): number {
    return this.memos.filter(m => !m.isRead).length;
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.onClose();
    }
  }
}
