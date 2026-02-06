import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SchedulerPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
  currentSchedule?: { day: string; shift: string }[];
}

export interface ScheduleChangeData {
  patientId: string;
  changeType: string;
  effectiveDate: string;
  newSchedule: { day: string; shift: string }[];
  reason: string;
  notes: string;
}

@Component({
  selector: 'app-patient-update-scheduler-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-update-scheduler-dialog.component.html',
  styleUrl: './patient-update-scheduler-dialog.component.css'
})
export class PatientUpdateSchedulerDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patient: SchedulerPatient | null = null;
  @Input() changeType = 'schedule_change';
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<ScheduleChangeData>();

  formData: ScheduleChangeData = this.getDefaultForm();

  days = [
    { value: 'mon', label: '週一' },
    { value: 'tue', label: '週二' },
    { value: 'wed', label: '週三' },
    { value: 'thu', label: '週四' },
    { value: 'fri', label: '週五' },
    { value: 'sat', label: '週六' }
  ];

  shifts = [
    { value: 'morning', label: '早班' },
    { value: 'afternoon', label: '午班' },
    { value: 'evening', label: '晚班' }
  ];

  scheduleEntries: { day: string; shift: string; selected: boolean }[] = [];

  private getDefaultForm(): ScheduleChangeData {
    return {
      patientId: '',
      changeType: 'schedule_change',
      effectiveDate: new Date().toISOString().split('T')[0],
      newSchedule: [],
      reason: '',
      notes: ''
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.formData = this.getDefaultForm();
      this.formData.changeType = this.changeType;
      if (this.patient) {
        this.formData.patientId = this.patient.id;
      }
      this.initScheduleEntries();
    }
  }

  private initScheduleEntries(): void {
    this.scheduleEntries = [];
    for (const day of this.days) {
      for (const shift of this.shifts) {
        const isSelected = this.patient?.currentSchedule?.some(
          s => s.day === day.value && s.shift === shift.value
        ) || false;
        this.scheduleEntries.push({ day: day.value, shift: shift.value, selected: isSelected });
      }
    }
  }

  getEntry(day: string, shift: string): { day: string; shift: string; selected: boolean } | undefined {
    return this.scheduleEntries.find(e => e.day === day && e.shift === shift);
  }

  toggleEntry(day: string, shift: string): void {
    const entry = this.getEntry(day, shift);
    if (entry) {
      entry.selected = !entry.selected;
    }
  }

  isEntrySelected(day: string, shift: string): boolean {
    const entry = this.getEntry(day, shift);
    return entry ? entry.selected : false;
  }

  get isFormValid(): boolean {
    const hasSchedule = this.scheduleEntries.some(e => e.selected);
    return !!(this.formData.effectiveDate && hasSchedule && this.formData.reason.trim());
  }

  onSubmit(): void {
    if (this.isFormValid) {
      this.formData.newSchedule = this.scheduleEntries
        .filter(e => e.selected)
        .map(e => ({ day: e.day, shift: e.shift }));
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
