import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface GroupPatient {
  id: string;
  name: string;
  bedNumber: string;
  medicalRecordNumber: string;
}

export interface NursingGroupData {
  groupId: string;
  groupName: string;
  nurseId: string;
  nurseName: string;
  patientIds: string[];
  color: string;
}

@Component({
  selector: 'app-nursing-group-config-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nursing-group-config-dialog.component.html',
  styleUrl: './nursing-group-config-dialog.component.css'
})
export class NursingGroupConfigDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() groupId = '';
  @Input() allPatients: GroupPatient[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<NursingGroupData>();

  groupData: NursingGroupData = this.getDefaultData();
  searchQuery = '';

  colors = ['#1abc9c', '#3498db', '#9b59b6', '#e67e22', '#e74c3c', '#f39c12', '#2ecc71', '#34495e'];

  private getDefaultData(): NursingGroupData {
    return {
      groupId: '',
      groupName: '',
      nurseId: '',
      nurseName: '',
      patientIds: [],
      color: '#1abc9c'
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.groupData = this.getDefaultData();
      this.groupData.groupId = this.groupId;
      this.searchQuery = '';
    }
  }

  get filteredPatients(): GroupPatient[] {
    if (!this.searchQuery.trim()) return this.allPatients;
    const q = this.searchQuery.trim().toLowerCase();
    return this.allPatients.filter(
      p => p.name.toLowerCase().includes(q) || p.bedNumber.toLowerCase().includes(q)
    );
  }

  isPatientSelected(patientId: string): boolean {
    return this.groupData.patientIds.includes(patientId);
  }

  togglePatient(patientId: string): void {
    const idx = this.groupData.patientIds.indexOf(patientId);
    if (idx >= 0) {
      this.groupData.patientIds.splice(idx, 1);
    } else {
      this.groupData.patientIds.push(patientId);
    }
  }

  selectColor(color: string): void {
    this.groupData.color = color;
  }

  get isFormValid(): boolean {
    return !!(this.groupData.groupName.trim() && this.groupData.patientIds.length > 0);
  }

  onSave(): void {
    if (this.isFormValid) {
      this.saved.emit({ ...this.groupData, patientIds: [...this.groupData.patientIds] });
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
