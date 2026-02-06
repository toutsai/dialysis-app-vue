import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ExceptionPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
}

export interface ExceptionFormData {
  patientId: string;
  exceptionType: string;
  date: string;
  shift: string;
  reason: string;
  notes: string;
}

@Component({
  selector: 'app-exception-create-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exception-create-dialog.component.html',
  styleUrl: './exception-create-dialog.component.css'
})
export class ExceptionCreateDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patient: ExceptionPatient | null = null;
  @Input() allPatients: ExceptionPatient[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<ExceptionFormData>();

  formData: ExceptionFormData = this.getDefaultForm();

  exceptionTypes = [
    { value: 'skip', label: '跳過透析' },
    { value: 'extra', label: '加洗' },
    { value: 'reschedule', label: '改期' },
    { value: 'temporary', label: '臨時透析' },
    { value: 'other', label: '其他' }
  ];

  shifts = [
    { value: 'morning', label: '早班' },
    { value: 'afternoon', label: '午班' },
    { value: 'evening', label: '晚班' }
  ];

  private getDefaultForm(): ExceptionFormData {
    return {
      patientId: '',
      exceptionType: 'skip',
      date: new Date().toISOString().split('T')[0],
      shift: 'morning',
      reason: '',
      notes: ''
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.formData = this.getDefaultForm();
      if (this.patient) {
        this.formData.patientId = this.patient.id;
      }
    }
  }

  get isFormValid(): boolean {
    return !!(
      this.formData.patientId &&
      this.formData.exceptionType &&
      this.formData.date &&
      this.formData.reason.trim()
    );
  }

  onSubmit(): void {
    if (this.isFormValid) {
      this.submitted.emit({ ...this.formData });
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
