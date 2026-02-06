import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reporting.component.html',
  styleUrl: './reporting.component.css'
})
export class ReportingComponent {
  protected authService = inject(AuthService);

  reportTypes = [
    '透析次數統計',
    '病人人數統計',
    '護理工時統計',
    '月報表'
  ];
}
