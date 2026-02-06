import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface PatientOption {
  id: string;
  name: string;
  medicalRecordNumber?: string;
  bedNumber?: string;
  wardNumber?: string;
}

@Component({
  selector: 'app-patient-select-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-select-dialog.component.html',
  styleUrl: './patient-select-dialog.component.css'
})
export class PatientSelectDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() title = '選擇病患';
  @Input() patients: PatientOption[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<PatientOption>();
  @Output() cancelled = new EventEmitter<void>();

  searchQuery = '';
  filteredPatients: PatientOption[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patients'] || changes['isVisible']) {
      this.filterPatients();
      if (this.isVisible) {
        this.searchQuery = '';
        this.filterPatients();
      }
    }
  }

  filterPatients(): void {
    if (!this.searchQuery.trim()) {
      this.filteredPatients = [...this.patients];
      return;
    }
    const query = this.searchQuery.trim().toLowerCase();
    this.filteredPatients = this.patients.filter(
      p =>
        p.name.toLowerCase().includes(query) ||
        (p.medicalRecordNumber && p.medicalRecordNumber.toLowerCase().includes(query)) ||
        (p.bedNumber && p.bedNumber.toLowerCase().includes(query))
    );
  }

  onSearchChange(): void {
    this.filterPatients();
  }

  selectPatient(patient: PatientOption): void {
    this.confirmed.emit(patient);
    this.closed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.onCancel();
    }
  }
}
