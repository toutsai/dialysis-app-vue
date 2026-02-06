import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface InjectionRecord {
  id: string;
  time: string;
  medicationName: string;
  dose: string;
  route: string;
  administeredBy: string;
  status: 'pending' | 'administered' | 'held' | 'refused';
  notes: string;
}

@Component({
  selector: 'app-daily-injection-list-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-injection-list-dialog.component.html',
  styleUrl: './daily-injection-list-dialog.component.css'
})
export class DailyInjectionListDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patientId = '';
  @Input() date = '';
  @Output() closed = new EventEmitter<void>();

  injections: InjectionRecord[] = [];
  isLoading = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && this.patientId) {
      this.loadInjections();
    }
  }

  private loadInjections(): void {
    this.isLoading = true;
    this.injections = [];
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: '待執行',
      administered: '已執行',
      held: '暫停',
      refused: '拒絕'
    };
    return map[status] || status;
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
