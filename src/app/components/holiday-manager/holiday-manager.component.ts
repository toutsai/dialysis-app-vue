import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-holiday-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './holiday-manager.component.html',
  styleUrl: './holiday-manager.component.css'
})
export class HolidayManagerComponent {
  @Input() holidays: string[] = [];
  @Output() update = new EventEmitter<string[]>();

  newDate = '';

  readonly taiwanHolidays2025 = [
    '2025-01-01', '2025-01-27', '2025-01-28', '2025-01-29',
    '2025-01-30', '2025-01-31', '2025-02-28', '2025-04-03',
    '2025-04-04', '2025-05-01', '2025-05-31', '2025-10-10',
  ];

  addHoliday(): void {
    if (this.newDate && !this.holidays.includes(this.newDate)) {
      const updated = [...this.holidays, this.newDate].sort();
      this.update.emit(updated);
      this.newDate = '';
    }
  }

  removeHoliday(date: string): void {
    const updated = this.holidays.filter(d => d !== date);
    this.update.emit(updated);
  }

  loadTaiwanHolidays(): void {
    const merged = [...new Set([...this.holidays, ...this.taiwanHolidays2025])].sort();
    this.update.emit(merged);
  }
}
