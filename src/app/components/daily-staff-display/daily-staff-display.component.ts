import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  shift: string;
}

@Component({
  selector: 'app-daily-staff-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-staff-display.component.html',
  styleUrl: './daily-staff-display.component.css'
})
export class DailyStaffDisplayComponent {
  @Input() staff: StaffMember[] = [];
  @Input() date: string = '';

  get groupedByRole(): Record<string, StaffMember[]> {
    const groups: Record<string, StaffMember[]> = {};
    for (const member of this.staff) {
      const role = member.role || 'other';
      if (!groups[role]) {
        groups[role] = [];
      }
      groups[role].push(member);
    }
    return groups;
  }

  get roleKeys(): string[] {
    return Object.keys(this.groupedByRole);
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      doctor: '醫師',
      nurse: '護理師',
      technician: '技術員',
      other: '其他'
    };
    return labels[role] || role;
  }

  getRoleClass(role: string): string {
    return `role-${role}`;
  }
}
