import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DraftRecord {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: string;
}

@Component({
  selector: 'app-daily-draft-list-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-draft-list-dialog.component.html',
  styleUrl: './daily-draft-list-dialog.component.css'
})
export class DailyDraftListDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patientId = '';
  @Output() closed = new EventEmitter<void>();

  drafts: DraftRecord[] = [];
  isLoading = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && this.patientId) {
      this.loadDrafts();
    }
  }

  private loadDrafts(): void {
    this.isLoading = true;
    this.drafts = [];
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  getTypeLabel(type: string): string {
    const map: Record<string, string> = {
      nursing: '護理紀錄',
      dialysis: '透析紀錄',
      progress: '病程紀錄',
      order: '醫囑草稿',
      assessment: '評估表'
    };
    return map[type] || type;
  }

  deleteDraft(draft: DraftRecord): void {
    this.drafts = this.drafts.filter(d => d.id !== draft.id);
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
