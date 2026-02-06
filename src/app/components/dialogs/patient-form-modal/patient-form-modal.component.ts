import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface PatientFormData {
  id?: string;
  name: string;
  medicalRecordNumber: string;
  idNumber: string;
  birthDate: string;
  gender: string;
  bloodType: string;
  phone: string;
  emergencyContact: string;
  emergencyPhone: string;
  address: string;
  dialysisStartDate: string;
  vascularAccess: string;
  primaryDiagnosis: string;
  allergies: string;
  notes: string;
}

@Component({
  selector: 'app-patient-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-form-modal.component.html',
  styleUrl: './patient-form-modal.component.css'
})
export class PatientFormModalComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patientData: PatientFormData | null = null;
  @Input() patientType: 'hemodialysis' | 'peritoneal' | 'inpatient' = 'hemodialysis';
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<PatientFormData>();

  formData: PatientFormData = this.getDefaultFormData();

  get isEditing(): boolean {
    return !!this.patientData?.id;
  }

  genderOptions = [
    { value: 'male', label: '男' },
    { value: 'female', label: '女' }
  ];

  bloodTypeOptions = ['A', 'B', 'AB', 'O'];

  vascularAccessOptions = [
    { value: 'avf', label: '動靜脈瘻管 (AVF)' },
    { value: 'avg', label: '人工血管 (AVG)' },
    { value: 'perm_cath', label: '永久性導管' },
    { value: 'temp_cath', label: '臨時導管' },
    { value: 'pd_catheter', label: '腹膜透析導管' }
  ];

  patientTypeOptions = [
    { value: 'hemodialysis', label: '血液透析' },
    { value: 'peritoneal', label: '腹膜透析' },
    { value: 'inpatient', label: '住院' }
  ];

  private getDefaultFormData(): PatientFormData {
    return {
      name: '',
      medicalRecordNumber: '',
      idNumber: '',
      birthDate: '',
      gender: 'male',
      bloodType: 'A',
      phone: '',
      emergencyContact: '',
      emergencyPhone: '',
      address: '',
      dialysisStartDate: '',
      vascularAccess: 'avf',
      primaryDiagnosis: '',
      allergies: '',
      notes: ''
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      if (this.patientData) {
        this.formData = { ...this.patientData };
      } else {
        this.formData = this.getDefaultFormData();
      }
    }
  }

  get isFormValid(): boolean {
    return !!(
      this.formData.name.trim() &&
      this.formData.medicalRecordNumber.trim() &&
      this.formData.gender
    );
  }

  onSave(): void {
    if (this.isFormValid) {
      this.saved.emit({ ...this.formData });
      this.closed.emit();
    }
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
