import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-base-schedule',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './base-schedule.component.html',
  styleUrl: './base-schedule.component.css'
})
export class BaseScheduleComponent {
  protected authService = inject(AuthService);
}
