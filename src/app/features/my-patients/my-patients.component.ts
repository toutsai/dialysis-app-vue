import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-my-patients',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-patients.component.html',
  styleUrl: './my-patients.component.css'
})
export class MyPatientsComponent {
  protected authService = inject(AuthService);

  today = new Date();

  get formattedDate(): string {
    const y = this.today.getFullYear();
    const m = String(this.today.getMonth() + 1).padStart(2, '0');
    const d = String(this.today.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }
}
