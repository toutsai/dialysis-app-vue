import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

interface PrepPatient {
  id: string;
  name: string;
  chartNo: string;
  bed: string;
  preparations: PrepItem[];
}

interface PrepItem {
  type: string;
  label: string;
  detail: string;
  status: 'pending' | 'ready' | 'missing';
}

@Component({
  selector: 'app-preparation-popover',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preparation-popover.component.html',
  styleUrl: './preparation-popover.component.css'
})
export class PreparationPopoverComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Input() patients: PrepPatient[] = [];
  @Input() targetElement: HTMLElement | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() openOrderModal = new EventEmitter<string>();

  positionStyle: Record<string, string> = {};

  @HostListener('document:keydown.escape')
  onEscKey(): void {
    if (this.isVisible) {
      this.close();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] || changes['targetElement']) {
      this.calculatePosition();
    }
  }

  calculatePosition(): void {
    if (!this.targetElement || !this.isVisible) {
      this.positionStyle = {};
      return;
    }

    const rect = this.targetElement.getBoundingClientRect();
    this.positionStyle = {
      position: 'fixed',
      top: rect.bottom + 8 + 'px',
      left: rect.left + 'px',
      'z-index': '1000'
    };
  }

  close(): void {
    this.closed.emit();
  }

  onOpenOrder(patientId: string): void {
    this.openOrderModal.emit(patientId);
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      ready: '\u2713',
      pending: '\u25CB',
      missing: '\u2717'
    };
    return icons[status] || '?';
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  get patientsWithMissing(): PrepPatient[] {
    return this.patients.filter(p =>
      p.preparations.some(prep => prep.status === 'missing')
    );
  }

  get allReadyCount(): number {
    return this.patients.filter(p =>
      p.preparations.every(prep => prep.status === 'ready')
    ).length;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('popover-backdrop')) {
      this.close();
    }
  }
}
