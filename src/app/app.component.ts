import { Component, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '@services/auth.service';
import { PatientService } from '@services/patient.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly authService = inject(AuthService);
  private readonly patientService = inject(PatientService);

  constructor() {
    // When a user logs in, trigger patient data fetch
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.patientService.fetchPatients();
      }
    });
  }
}
