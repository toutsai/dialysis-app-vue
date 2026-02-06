import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface MovementEvent {
  id: string;
  patientId: string;
  patientName: string;
  type: 'admission' | 'discharge' | 'transfer' | 'temporary';
  fromUnit: string;
  toUnit: string;
  date: string;
  time: string;
  reason: string;
  status: string;
  notes: string;
  orderBy: string;
}

@Component({
  selector: 'app-movement-detail-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './movement-detail-modal.component.html',
  styleUrl: './movement-detail-modal.component.css'
})
export class MovementDetailModalComponent implements OnChanges {
  @Input() visible: boolean = false;
  @Input() date: string = '';
  @Input() events: MovementEvent[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() refresh = new EventEmitter<void>();

  activeTab: 'all' | 'admission' | 'discharge' | 'transfer' | 'temporary' = 'all';
  searchQuery: string = '';

  tabs: { key: typeof MovementDetailModalComponent.prototype.activeTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'admission', label: '入院' },
    { key: 'discharge', label: '出院' },
    { key: 'transfer', label: '轉科' },
    { key: 'temporary', label: '臨時' }
  ];

  @HostListener('document:keydown.escape')
  onEscKey(): void {
    if (this.visible) {
      this.close();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.activeTab = 'all';
      this.searchQuery = '';
    }
  }

  get filteredEvents(): MovementEvent[] {
    let filtered = this.events;

    if (this.activeTab !== 'all') {
      filtered = filtered.filter(e => e.type === this.activeTab);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      filtered = filtered.filter(e =>
        e.patientName.toLowerCase().includes(q) ||
        e.patientId.toLowerCase().includes(q) ||
        e.reason.toLowerCase().includes(q)
      );
    }

    return filtered;
  }

  get countByType(): Record<string, number> {
    const counts: Record<string, number> = { all: this.events.length };
    for (const e of this.events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return counts;
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      admission: '入院',
      discharge: '出院',
      transfer: '轉科',
      temporary: '臨時'
    };
    return labels[type] || type;
  }

  getTypeClass(type: string): string {
    return `type-${type}`;
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  close(): void {
    this.closed.emit();
  }

  onRefresh(): void {
    this.refresh.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  selectTab(tab: typeof this.activeTab): void {
    this.activeTab = tab;
  }

  trackByEvent(_index: number, event: MovementEvent): string {
    return event.id;
  }
}
