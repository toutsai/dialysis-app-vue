import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  protected authService = inject(AuthService);
  private router = inject(Router);

  username = signal('');
  password = signal('');
  showPassword = signal(false);
  errorMessage = signal<string | null>(null);

  get isFormValid(): boolean {
    return this.username().trim().length > 0 && this.password().trim().length > 0;
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.errorMessage.set(null);

    if (!this.isFormValid) {
      return;
    }

    const result = await this.authService.login(
      this.username().trim(),
      this.password()
    );

    if (result.success) {
      this.router.navigate(['/schedule']);
    } else {
      this.errorMessage.set(result.error ?? '登入失敗，請稍後再試');
    }
  }

  onUsernameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.username.set(target.value);
    this.errorMessage.set(null);
  }

  onPasswordInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.password.set(target.value);
    this.errorMessage.set(null);
  }
}
