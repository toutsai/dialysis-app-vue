import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-alert-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <dialog [open]="isVisible" class="alert-dialog">
      <header class="dialog-header" *ngIf="title">
        <h3>{{ title }}</h3>
      </header>
      <main class="dialog-content">
        <pre>{{ message }}</pre>
      </main>
      <footer class="dialog-footer">
        <button class="btn-primary" (click)="handleConfirm()">確定</button>
      </footer>
    </dialog>
    <div class="dialog-backdrop" *ngIf="isVisible" (click)="handleConfirm()"></div>
  `,
  styleUrl: './alert-dialog.component.css'
})
export class AlertDialogComponent {
  @Input() isVisible = false;
  @Input() title = '';
  @Input() message = '';
  @Output() confirm = new EventEmitter<void>();

  handleConfirm(): void {
    this.confirm.emit();
  }
}
