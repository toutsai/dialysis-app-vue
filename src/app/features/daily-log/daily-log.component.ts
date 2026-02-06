import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-daily-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-log.component.html',
  styleUrl: './daily-log.component.css'
})
export class DailyLogComponent {
  protected authService = inject(AuthService);

  today = new Date();

  get formattedDate(): string {
    const y = this.today.getFullYear();
    const m = String(this.today.getMonth() + 1).padStart(2, '0');
    const d = String(this.today.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }
}
