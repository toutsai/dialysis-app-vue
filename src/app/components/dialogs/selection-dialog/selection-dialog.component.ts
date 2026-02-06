import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SelectionOption {
  label: string;
  value: string;
  icon?: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-selection-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './selection-dialog.component.html',
  styleUrl: './selection-dialog.component.css'
})
export class SelectionDialogComponent {
  @Input() isVisible = false;
  @Input() title = '請選擇';
  @Input() options: SelectionOption[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  onSelect(option: SelectionOption): void {
    if (option.disabled) return;
    this.selected.emit(option.value);
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
