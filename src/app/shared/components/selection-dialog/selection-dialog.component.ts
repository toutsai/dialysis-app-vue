import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SelectionOption {
  value: string;
  text: string;
}

@Component({
  selector: 'app-selection-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="selection-dialog-overlay" *ngIf="isVisible" (click)="handleCancel()">
      <div class="selection-dialog-content" (click)="$event.stopPropagation()">
        <h3>{{ title }}</h3>
        <div class="button-group">
          <button *ngFor="let option of options" (click)="handleSelect(option.value)">
            {{ option.text }}
          </button>
        </div>
        <div class="button-group">
          <button class="cancel-btn" (click)="handleCancel()">取消</button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './selection-dialog.component.css'
})
export class SelectionDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() title = '';
  @Input() options: SelectionOption[] = [];
  @Output() selectEvent = new EventEmitter<string>();
  @Output() cancelEvent = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        document.body.classList.add('modal-open');
      } else {
        document.body.classList.remove('modal-open');
      }
    }
  }

  handleSelect(value: string): void { this.selectEvent.emit(value); }
  handleCancel(): void { this.cancelEvent.emit(); }
}
