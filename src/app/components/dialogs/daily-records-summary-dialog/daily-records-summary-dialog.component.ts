import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DailyRecord {
  id: string;
  time: string;
  type: string;
  content: string;
  author: string;
  status: string;
}

@Component({
  selector: 'app-daily-records-summary-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-records-summary-dialog.component.html',
  styleUrl: './daily-records-summary-dialog.component.css'
})
export class DailyRecordsSummaryDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patientId = '';
  @Output() closed = new EventEmitter<void>();

  records: DailyRecord[] = [];
  isLoading = false;
  selectedDate = new Date().toISOString().split('T')[0];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && this.patientId) {
      this.loadRecords();
    }
  }

  private loadRecords(): void {
    this.isLoading = true;
    this.records = [];
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  onDateChange(event: Event): void {
    this.selectedDate = (event.target as HTMLInputElement).value;
    this.loadRecords();
  }

  getTypeLabel(type: string): string {
    const map: Record<string, string> = {
      vitals: '生命徵象',
      nursing: '護理紀錄',
      medication: '用藥紀錄',
      procedure: '處置紀錄',
      dialysis: '透析紀錄',
      io: '出入量'
    };
    return map[type] || type;
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
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
