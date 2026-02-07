import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-kidit-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kidit-report.component.html',
  styleUrl: './kidit-report.component.css'
})
export class KiditReportComponent {
  protected authService = inject(AuthService);
}
