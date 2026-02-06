import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LabAlertData {
  id: string;
  patientName: string;
  patientId: string;
  medicalRecordNumber: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: 'high' | 'low' | 'critical_high' | 'critical_low';
  collectedAt: string;
  reportedAt: string;
  previousValue?: string;
  previousDate?: string;
  notes?: string;
}

@Component({
  selector: 'app-lab-alert-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lab-alert-detail-modal.component.html',
  styleUrl: './lab-alert-detail-modal.component.css'
})
export class LabAlertDetailModalComponent {
  @Input() isVisible = false;
  @Input() alert: LabAlertData | null = null;
  @Output() closed = new EventEmitter<void>();

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      high: '偏高',
      low: '偏低',
      critical_high: '危險值偏高',
      critical_low: '危險值偏低'
    };
    return map[status] || status;
  }

  getStatusClass(status: string): string {
    if (status.startsWith('critical')) return 'status-critical';
    return `status-${status}`;
  }

  isCritical(): boolean {
    return !!this.alert?.status.startsWith('critical');
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onClose();
    }
  }
}
