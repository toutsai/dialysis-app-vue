import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface UserFormData {
  id?: string;
  displayName: string;
  email: string;
  role: string;
  department: string;
  isActive: boolean;
}

@Component({
  selector: 'app-user-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-form-modal.component.html',
  styleUrl: './user-form-modal.component.css'
})
export class UserFormModalComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() isEditing = false;
  @Input() user: UserFormData | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<UserFormData>();

  formData: UserFormData = this.getDefaultFormData();

  roles = [
    { value: 'admin', label: '管理員' },
    { value: 'doctor', label: '醫師' },
    { value: 'nurse', label: '護理師' },
    { value: 'technician', label: '技術員' },
    { value: 'clerk', label: '行政人員' }
  ];

  departments = [
    { value: 'dialysis', label: '透析室' },
    { value: 'nephrology', label: '腎臟科' },
    { value: 'icu', label: '加護病房' },
    { value: 'general', label: '一般病房' }
  ];

  private getDefaultFormData(): UserFormData {
    return {
      displayName: '',
      email: '',
      role: 'nurse',
      department: 'dialysis',
      isActive: true
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      if (this.isEditing && this.user) {
        this.formData = { ...this.user };
      } else {
        this.formData = this.getDefaultFormData();
      }
    }
  }

  get isFormValid(): boolean {
    return !!(
      this.formData.displayName.trim() &&
      this.formData.email.trim() &&
      this.formData.role &&
      this.formData.department
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
