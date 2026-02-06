import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ConditionPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
}

export interface ConditionRecord {
  id: string;
  date: string;
  time: string;
  category: string;
  description: string;
  severity: 'mild' | 'moderate' | 'severe';
  interventions: string;
  outcome: string;
  recordedBy: string;
}

@Component({
  selector: 'app-condition-record-display-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './condition-record-display-dialog.component.html',
  styleUrl: './condition-record-display-dialog.component.css'
})
export class ConditionRecordDisplayDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patient: ConditionPatient | null = null;
  @Output() closed = new EventEmitter<void>();

  records: ConditionRecord[] = [];
  isLoading = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && this.patient) {
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

  getSeverityLabel(severity: string): string {
    const map: Record<string, string> = {
      mild: '輕微',
      moderate: '中等',
      severe: '嚴重'
    };
    return map[severity] || severity;
  }

  getSeverityClass(severity: string): string {
    return `severity-${severity}`;
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
