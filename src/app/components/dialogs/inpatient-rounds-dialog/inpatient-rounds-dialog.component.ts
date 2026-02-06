import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface RoundsPatient {
  id: string;
  name: string;
  bedNumber: string;
  medicalRecordNumber: string;
  diagnosis: string;
}

export interface RoundsRecord {
  patientId: string;
  vitalSigns: string;
  assessment: string;
  plan: string;
  notes: string;
  isCompleted: boolean;
}

@Component({
  selector: 'app-inpatient-rounds-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inpatient-rounds-dialog.component.html',
  styleUrl: './inpatient-rounds-dialog.component.css'
})
export class InpatientRoundsDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patients: RoundsPatient[] = [];
  @Output() closed = new EventEmitter<void>();

  records: Map<string, RoundsRecord> = new Map();
  currentPatientIndex = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.currentPatientIndex = 0;
      this.initRecords();
    }
  }

  private initRecords(): void {
    this.records = new Map();
    for (const p of this.patients) {
      this.records.set(p.id, {
        patientId: p.id,
        vitalSigns: '',
        assessment: '',
        plan: '',
        notes: '',
        isCompleted: false
      });
    }
  }

  get currentPatient(): RoundsPatient | null {
    return this.patients[this.currentPatientIndex] || null;
  }

  get currentRecord(): RoundsRecord | null {
    const p = this.currentPatient;
    return p ? (this.records.get(p.id) || null) : null;
  }

  get completedCount(): number {
    let count = 0;
    this.records.forEach(r => { if (r.isCompleted) count++; });
    return count;
  }

  goToPatient(index: number): void {
    if (index >= 0 && index < this.patients.length) {
      this.currentPatientIndex = index;
    }
  }

  prevPatient(): void {
    this.goToPatient(this.currentPatientIndex - 1);
  }

  nextPatient(): void {
    this.goToPatient(this.currentPatientIndex + 1);
  }

  markCompleted(): void {
    const record = this.currentRecord;
    if (record) {
      record.isCompleted = true;
      if (this.currentPatientIndex < this.patients.length - 1) {
        this.nextPatient();
      }
    }
  }

  isPatientCompleted(patientId: string): boolean {
    const r = this.records.get(patientId);
    return r ? r.isCompleted : false;
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
