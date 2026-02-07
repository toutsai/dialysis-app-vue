import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
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
  @Input() title = '';
  @Input() message = '';
  @Input() currentValue = '';
  @Output() confirmEvent = new EventEmitter<string>();
  @Output() cancelEvent = new EventEmitter<void>();

  @ViewChild('inputRef') inputRef!: ElementRef<HTMLInputElement>;

  localValue = '';
  private shouldFocus = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.localValue = this.currentValue || '';
      this.shouldFocus = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldFocus && this.inputRef) {
      this.inputRef.nativeElement.focus();
      this.inputRef.nativeElement.select();
      this.shouldFocus = false;
    }
  }

  onConfirm(): void {
    this.confirmEvent.emit(this.localValue.trim());
  }

  onCancel(): void {
    this.cancelEvent.emit();
  }
}
