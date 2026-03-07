import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <dialog [open]="isVisible" class="confirm-dialog">
      <header class="dialog-header" *ngIf="title">
        <h3>{{ title }}</h3>
      </header>
      <main class="dialog-content">
        <pre>{{ message }}</pre>
      </main>
      <ng-content select="[footer]"></ng-content>
      <footer *ngIf="!hasCustomFooter" class="dialog-footer">
        <button [ngClass]="cancelClass" (click)="onCancel()">{{ cancelText }}</button>
        <button [ngClass]="confirmClass" (click)="onConfirm()">{{ confirmText }}</button>
      </footer>
    </dialog>
    <div class="dialog-backdrop" *ngIf="isVisible" (click)="onCancel()"></div>
  `,
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

  onConfirm(): void { this.confirmEvent.emit(); }
  onCancel(): void { this.cancelEvent.emit(); }
}
