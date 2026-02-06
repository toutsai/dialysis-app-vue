import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-nursing-schedule',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './nursing-schedule.component.html',
  styleUrl: './nursing-schedule.component.css'
})
export class NursingScheduleComponent {
  protected authService = inject(AuthService);

  shifts = ['早班 (08:00-16:00)', '中班 (16:00-00:00)', '晚班 (00:00-08:00)'];
}
