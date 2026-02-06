import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface BedPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
}

export interface BedSlot {
  bedNumber: string;
  zone: string;
  isOccupied: boolean;
  patientName?: string;
}

export interface ScheduleSlot {
  shift: string;
  day: string;
  bedNumber: string;
}

@Component({
  selector: 'app-bed-assignment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bed-assignment-dialog.component.html',
  styleUrl: './bed-assignment-dialog.component.css'
})
export class BedAssignmentDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() allPatients: BedPatient[] = [];
  @Input() bedLayout: BedSlot[] = [];
  @Input() scheduleData: ScheduleSlot[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() assignBed = new EventEmitter<{ patientId: string; bedNumber: string }>();

  selectedPatientId = '';
  selectedBed = '';
  searchQuery = '';
  filteredPatients: BedPatient[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.selectedPatientId = '';
      this.selectedBed = '';
      this.searchQuery = '';
      this.filteredPatients = [...this.allPatients];
    }
  }

  onSearchChange(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.filteredPatients = [...this.allPatients];
      return;
    }
    this.filteredPatients = this.allPatients.filter(
      p => p.name.toLowerCase().includes(q) || p.medicalRecordNumber.toLowerCase().includes(q)
    );
  }

  selectPatient(patient: BedPatient): void {
    this.selectedPatientId = patient.id;
  }

  selectBed(bed: BedSlot): void {
    if (!bed.isOccupied) {
      this.selectedBed = bed.bedNumber;
    }
  }

  get availableBeds(): BedSlot[] {
    return this.bedLayout.filter(b => !b.isOccupied);
  }

  get canAssign(): boolean {
    return !!(this.selectedPatientId && this.selectedBed);
  }

  onAssign(): void {
    if (this.canAssign) {
      this.assignBed.emit({
        patientId: this.selectedPatientId,
        bedNumber: this.selectedBed
      });
      this.closed.emit();
    }
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.onClose();
    }
  }

  getSelectedPatientName(): string {
    const p = this.allPatients.find(p => p.id === this.selectedPatientId);
    return p ? p.name : '';
  }
}
