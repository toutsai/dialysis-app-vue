import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css'
})
export class ConfirmDialogComponent {
  @Input() isVisible = false;
  @Input() title = '';
  @Input() message = '';
  @Input() confirmText = '確認';
  @Input() cancelText = '取消';
  @Input() confirmClass = 'btn-primary';
  @Input() cancelClass = 'btn-secondary';
  @Input() hasCustomFooter = false;
  @Output() confirmEvent = new EventEmitter<void>();
  @Output() cancelEvent = new EventEmitter<void>();

  onConfirm(): void {
    this.confirmEvent.emit();
  }

  onCancel(): void {
    this.cancelEvent.emit();
  }
}
