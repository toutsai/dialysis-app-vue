import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface HistoryEvent {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  createdBy?: string;
}

@Component({
  selector: 'app-patient-history-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-history-modal.component.html',
  styleUrl: './patient-history-modal.component.css'
})
export class PatientHistoryModalComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patientId = '';
  @Input() patientName = '';
  @Output() closed = new EventEmitter<void>();

  historyEvents: HistoryEvent[] = [];
  isLoading = false;
  filterType = 'all';

  eventTypes = [
    { value: 'all', label: '全部' },
    { value: 'dialysis', label: '透析紀錄' },
    { value: 'lab', label: '檢驗報告' },
    { value: 'medication', label: '用藥變更' },
    { value: 'admission', label: '住院/出院' },
    { value: 'schedule', label: '排程變更' },
    { value: 'note', label: '備註' }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && this.patientId) {
      this.loadHistory();
    }
  }

  private loadHistory(): void {
    this.isLoading = true;
    this.historyEvents = [];
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  get filteredEvents(): HistoryEvent[] {
    if (this.filterType === 'all') return this.historyEvents;
    return this.historyEvents.filter(e => e.type === this.filterType);
  }

  setFilter(type: string): void {
    this.filterType = type;
  }

  getEventTypeLabel(type: string): string {
    const found = this.eventTypes.find(t => t.value === type);
    return found ? found.label : type;
  }

  getEventTypeClass(type: string): string {
    return `event-type-${type}`;
  }

  onClose(): void {
    this.filterType = 'all';
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onClose();
    }
  }
}
