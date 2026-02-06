import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ShiftStats {
  shift: string;
  label: string;
  counts: number[];
  total: number;
}

@Component({
  selector: 'app-stats-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats-toolbar.component.html',
  styleUrl: './stats-toolbar.component.css'
})
export class StatsToolbarComponent {
  @Input() statsData: ShiftStats[] = [];
  @Input() weekdays: string[] = [];
  @Input() columnWidths: number[] = [];

  getColumnStyle(index: number): Record<string, string> {
    if (this.columnWidths.length > index) {
      return { 'min-width': this.columnWidths[index] + 'px' };
    }
    return {};
  }

  getShiftColor(shift: string): string {
    const colors: Record<string, string> = {
      morning: '#1abc9c',
      afternoon: '#3498db',
      evening: '#9b59b6'
    };
    return colors[shift] || '#95a5a6';
  }

  get grandTotal(): number {
    return this.statsData.reduce((sum, s) => sum + s.total, 0);
  }
}
