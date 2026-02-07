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
}
