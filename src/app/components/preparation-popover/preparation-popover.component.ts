import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-preparation-popover',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './preparation-popover.component.html',
  styleUrl: './preparation-popover.component.css'
})
export class PreparationPopoverComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() position: { x: number; y: number } = { x: 0, y: 0 };
  @Input() patientData: any = null;
  @Input() prepData: any = null;
  @Output() closeEvent = new EventEmitter<void>();
  @Output() saveEvent = new EventEmitter<any>();

  localData: any = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.localData = this.prepData ? { ...this.prepData } : {
        weight: null,
        bloodPressure: '',
        temperature: null,
        notes: '',
      };
    }
  }

  save(): void {
    this.saveEvent.emit(this.localData);
  }

  close(): void {
    this.closeEvent.emit();
  }
}
