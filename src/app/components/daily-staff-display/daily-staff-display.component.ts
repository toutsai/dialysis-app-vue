import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-daily-staff-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-staff-display.component.html',
  styleUrl: './daily-staff-display.component.css'
})
export class DailyStaffDisplayComponent implements OnInit, OnDestroy {
  @Input() physicians: any[] = [];
  @Input() consultants: any[] = [];
  @Input() scheduleData: any = null;
  @Input() targetDate = '';

  currentTime = new Date();
  private intervalId: any = null;

  ngOnInit(): void {
    this.intervalId = setInterval(() => {
      this.currentTime = new Date();
    }, 60000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  get currentShift(): string {
    const hour = this.currentTime.getHours();
    if (hour < 12) return 'early';
    if (hour < 18) return 'noon';
    return 'late';
  }

  get currentPhysicians(): any[] {
    if (!this.scheduleData || !this.physicians) return [];
    return this.physicians.filter(p => {
      const schedules = p.defaultSchedules || [];
      return schedules.some((s: string) => s.includes(this.currentShift));
    });
  }

  get currentConsultants(): any[] {
    if (!this.scheduleData || !this.consultants) return [];
    return this.consultants.filter(c => {
      const schedules = c.defaultConsultationSchedules || [];
      return schedules.some((s: string) => s.includes(this.currentShift));
    });
  }

  getShiftDisplayName(shift: string): string {
    const map: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' };
    return map[shift] || shift;
  }
}
