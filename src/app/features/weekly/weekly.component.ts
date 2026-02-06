import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-weekly',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weekly.component.html',
  styleUrl: './weekly.component.css'
})
export class WeeklyComponent {
  protected authService = inject(AuthService);

  weekdays = ['週一', '週二', '週三', '週四', '週五', '週六'];
}
