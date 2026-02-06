import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ward-number-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ward-number-dialog.component.html',
  styleUrl: './ward-number-dialog.component.css'
})
export class WardNumberDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() title = '輸入床號';
  @Input() currentValue = '';
  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  inputValue = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.inputValue = this.currentValue;
    }
  }

  onConfirm(): void {
    const trimmed = this.inputValue.trim();
    if (trimmed) {
      this.confirmed.emit(trimmed);
      this.closed.emit();
    }
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

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onConfirm();
    }
  }
}
