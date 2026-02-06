import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface TaskPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
}

export interface TaskFormData {
  patientId: string;
  taskType: string;
  priority: string;
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
  assignedTo: string;
}

@Component({
  selector: 'app-task-create-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-create-dialog.component.html',
  styleUrl: './task-create-dialog.component.css'
})
export class TaskCreateDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() allPatients: TaskPatient[] = [];
  @Input() preselectedPatient: TaskPatient | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<TaskFormData>();

  formData: TaskFormData = this.getDefaultForm();

  taskTypes = [
    { value: 'task', label: '一般任務' },
    { value: 'message', label: '交班訊息' },
    { value: 'reminder', label: '提醒' },
    { value: 'followup', label: '追蹤事項' },
    { value: 'urgent', label: '緊急事項' }
  ];

  priorities = [
    { value: 'low', label: '低', color: '#95a5a6' },
    { value: 'normal', label: '一般', color: '#3498db' },
    { value: 'high', label: '高', color: '#e67e22' },
    { value: 'urgent', label: '緊急', color: '#dc3545' }
  ];

  private getDefaultForm(): TaskFormData {
    return {
      patientId: '',
      taskType: 'task',
      priority: 'normal',
      title: '',
      description: '',
      dueDate: new Date().toISOString().split('T')[0],
      dueTime: '',
      assignedTo: ''
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.formData = this.getDefaultForm();
      if (this.preselectedPatient) {
        this.formData.patientId = this.preselectedPatient.id;
      }
    }
  }

  get isFormValid(): boolean {
    return !!(this.formData.title.trim() && this.formData.taskType);
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
