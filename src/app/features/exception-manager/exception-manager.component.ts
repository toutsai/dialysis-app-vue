import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-exception-manager',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exception-manager.component.html',
  styleUrl: './exception-manager.component.css'
})
export class ExceptionManagerComponent {
  protected authService = inject(AuthService);
}
