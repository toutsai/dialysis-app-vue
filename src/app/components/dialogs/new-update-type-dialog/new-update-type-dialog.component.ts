import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface UpdateTypePatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
}

export interface UpdateTypeSelection {
  type: string;
  patientId: string;
}

@Component({
  selector: 'app-new-update-type-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './new-update-type-dialog.component.html',
  styleUrl: './new-update-type-dialog.component.css'
})
export class NewUpdateTypeDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() allPatients: UpdateTypePatient[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() continued = new EventEmitter<UpdateTypeSelection>();

  selectedType = '';
  selectedPatientId = '';
  searchQuery = '';

  updateTypes = [
    { value: 'schedule_change', label: '排程變更', description: '變更病患透析排程', icon: '📅' },
    { value: 'transfer', label: '轉入/轉出', description: '病患轉入或轉出', icon: '🔄' },
    { value: 'new_patient', label: '新收病患', description: '新收治透析病患', icon: '➕' },
    { value: 'discharge', label: '結案', description: '病患結案或停止透析', icon: '📤' },
    { value: 'temporary', label: '臨時透析', description: '臨時安排透析', icon: '⚡' },
    { value: 'status_change', label: '狀態變更', description: '變更病患狀態', icon: '🔀' }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.selectedType = '';
      this.selectedPatientId = '';
      this.searchQuery = '';
    }
  }

  get filteredPatients(): UpdateTypePatient[] {
    if (!this.searchQuery.trim()) return this.allPatients;
    const q = this.searchQuery.trim().toLowerCase();
    return this.allPatients.filter(
      p => p.name.toLowerCase().includes(q) || p.medicalRecordNumber.toLowerCase().includes(q)
    );
  }

  get needsPatientSelection(): boolean {
    return this.selectedType !== '' && this.selectedType !== 'new_patient';
  }

  get canContinue(): boolean {
    if (!this.selectedType) return false;
    if (this.selectedType === 'new_patient') return true;
    return !!this.selectedPatientId;
  }

  selectType(type: string): void {
    this.selectedType = type;
    if (type === 'new_patient') {
      this.selectedPatientId = '';
    }
  }

  onContinue(): void {
    if (this.canContinue) {
      this.continued.emit({
        type: this.selectedType,
        patientId: this.selectedPatientId
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
}
