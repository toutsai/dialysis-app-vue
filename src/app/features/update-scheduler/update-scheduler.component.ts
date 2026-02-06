import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-update-scheduler',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './update-scheduler.component.html',
  styleUrl: './update-scheduler.component.css'
})
export class UpdateSchedulerComponent {
  protected authService = inject(AuthService);
}
