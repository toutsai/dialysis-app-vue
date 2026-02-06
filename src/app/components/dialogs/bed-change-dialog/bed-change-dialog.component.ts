import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface BedChangePatient {
  id: string;
  name: string;
  bedNumber: string;
  medicalRecordNumber?: string;
}

@Component({
  selector: 'app-bed-change-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bed-change-dialog.component.html',
  styleUrl: './bed-change-dialog.component.css'
})
export class BedChangeDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patient: BedChangePatient | null = null;
  @Input() allPatients: BedChangePatient[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() bedChanged = new EventEmitter<{ patientId: string; newBedNumber: string; reason: string }>();

  newBedNumber = '';
  reason = '';
  isSwap = false;
  swapTargetId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.newBedNumber = '';
      this.reason = '';
      this.isSwap = false;
      this.swapTargetId = '';
    }
  }

  get occupiedBeds(): BedChangePatient[] {
    return this.allPatients.filter(p => p.id !== this.patient?.id && p.bedNumber);
  }

  get canSubmit(): boolean {
    if (this.isSwap) {
      return !!this.swapTargetId;
    }
    return !!this.newBedNumber.trim();
  }

  onSubmit(): void {
    if (!this.canSubmit || !this.patient) return;

    if (this.isSwap) {
      const target = this.allPatients.find(p => p.id === this.swapTargetId);
      if (target) {
        this.bedChanged.emit({
          patientId: this.patient.id,
          newBedNumber: target.bedNumber,
          reason: this.reason || '換床'
        });
      }
    } else {
      this.bedChanged.emit({
        patientId: this.patient.id,
        newBedNumber: this.newBedNumber.trim(),
        reason: this.reason || '換床'
      });
    }
    this.closed.emit();
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
