import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stats-toolbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats-toolbar.component.html',
  styleUrl: './stats-toolbar.component.css'
})
export class StatsToolbarComponent {
  @Input() stats: any = null;
  @Input() shiftStats: any = null;
  @Input() statsData: any = null;
  @Input() weekdays: string[] = [];
  @Input() columnWidths: number[] = [];
  @Input() showPatientNumbers = false;
  @Input() size = '';

  readonly shiftOrder = [
    { code: 'early', display: '早' },
    { code: 'noon', display: '午' },
    { code: 'late', display: '晚' },
  ];

  get totalPatients(): number {
    return this.stats?.total || 0;
  }

  get scheduledCount(): number {
    return this.stats?.scheduled || 0;
  }

  get unscheduledCount(): number {
    return this.stats?.unscheduled || 0;
  }

  get shiftCounts(): { early: number; noon: number; late: number } {
    return {
      early: this.shiftStats?.early || 0,
      noon: this.shiftStats?.noon || 0,
      late: this.shiftStats?.late || 0,
    };
  }

  formatPatientCounts(shiftData: any): { type: string; text: string }[] {
    if (!shiftData) return [];
    const items: { type: string; text: string }[] = [];
    if (shiftData.er > 0) items.push({ type: 'er', text: `急${shiftData.er}` });
    if (shiftData.ipd > 0) items.push({ type: 'ipd', text: `住${shiftData.ipd}` });
    if (shiftData.opd > 0) items.push({ type: 'opd', text: `門${shiftData.opd}` });
    return items;
  }

  getBarStyles(shiftData: any): { opdStyle: any; ipdStyle: any; erStyle: any } {
    const total = shiftData?.total || 0;
    if (total === 0) {
      return {
        opdStyle: { width: '0%' },
        ipdStyle: { width: '0%' },
        erStyle: { width: '0%' },
      };
    }
    return {
      erStyle: { width: `${((shiftData.er || 0) / total) * 100}%` },
      ipdStyle: { width: `${((shiftData.ipd || 0) / total) * 100}%` },
      opdStyle: { width: `${((shiftData.opd || 0) / total) * 100}%` },
    };
  }
}
