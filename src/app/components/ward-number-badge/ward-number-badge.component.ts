import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ward-number-badge',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ward-number-badge.component.html',
  styleUrl: './ward-number-badge.component.css'
})
export class WardNumberBadgeComponent {
  @Input() value: string = '';
  @Input() placeholder: string = '床號';
  @Output() updated = new EventEmitter<string>();

  @ViewChild('inputRef') inputRef!: ElementRef<HTMLInputElement>;

  isEditing = false;
  editValue = '';

  startEdit(): void {
    this.isEditing = true;
    this.editValue = this.value;
    setTimeout(() => {
      this.inputRef?.nativeElement?.focus();
      this.inputRef?.nativeElement?.select();
    });
  }

  confirmEdit(): void {
    const trimmed = this.editValue.trim();
    if (trimmed !== this.value) {
      this.updated.emit(trimmed);
    }
    this.isEditing = false;
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.editValue = this.value;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.confirmEdit();
    } else if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }
}
