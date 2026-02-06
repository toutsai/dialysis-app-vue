import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-lab-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lab-reports.component.html',
  styleUrl: './lab-reports.component.css'
})
export class LabReportsComponent {
  protected authService = inject(AuthService);
}
