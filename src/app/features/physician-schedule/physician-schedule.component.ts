import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-physician-schedule',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './physician-schedule.component.html',
  styleUrl: './physician-schedule.component.css'
})
export class PhysicianScheduleComponent {
  protected authService = inject(AuthService);
}
