import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-month-year-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './month-year-picker.component.html',
  styleUrl: './month-year-picker.component.css'
})
export class MonthYearPickerComponent implements OnInit, OnChanges {
  @Input() isVisible = false;
  @Input() initialDate: Date | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() dateSelected = new EventEmitter<{ year: number; month: number }>();

  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  years: number[] = [];
  months = [
    { value: 1, label: '1月' },
    { value: 2, label: '2月' },
    { value: 3, label: '3月' },
    { value: 4, label: '4月' },
    { value: 5, label: '5月' },
    { value: 6, label: '6月' },
    { value: 7, label: '7月' },
    { value: 8, label: '8月' },
    { value: 9, label: '9月' },
    { value: 10, label: '10月' },
    { value: 11, label: '11月' },
    { value: 12, label: '12月' }
  ];

  ngOnInit(): void {
    this.generateYears();
    this.initFromDate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialDate'] || changes['isVisible']) {
      this.initFromDate();
    }
  }

  private initFromDate(): void {
    const date = this.initialDate || new Date();
    this.selectedYear = date.getFullYear();
    this.selectedMonth = date.getMonth() + 1;
  }

  private generateYears(): void {
    const currentYear = new Date().getFullYear();
    this.years = [];
    for (let y = currentYear - 10; y <= currentYear + 5; y++) {
      this.years.push(y);
    }
  }

  prevYear(): void {
    this.selectedYear--;
  }

  nextYear(): void {
    this.selectedYear++;
  }

  selectMonth(month: number): void {
    this.selectedMonth = month;
  }

  onConfirm(): void {
    this.dateSelected.emit({ year: this.selectedYear, month: this.selectedMonth });
    this.closed.emit();
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.onClose();
    }
  }
}
