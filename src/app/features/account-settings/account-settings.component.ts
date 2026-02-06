import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.css'
})
export class AccountSettingsComponent {
  protected authService = inject(AuthService);

  currentPassword = signal('');
  newPassword = signal('');
  confirmPassword = signal('');
  showCurrentPassword = signal(false);
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);
  isSubmitting = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  get isFormValid(): boolean {
    return (
      this.currentPassword().length > 0 &&
      this.newPassword().length >= 6 &&
      this.newPassword() === this.confirmPassword()
    );
  }

  get passwordMismatch(): boolean {
    return (
      this.confirmPassword().length > 0 &&
      this.newPassword() !== this.confirmPassword()
    );
  }

  get passwordTooShort(): boolean {
    return this.newPassword().length > 0 && this.newPassword().length < 6;
  }

  toggleVisibility(field: 'current' | 'new' | 'confirm'): void {
    switch (field) {
      case 'current':
        this.showCurrentPassword.set(!this.showCurrentPassword());
        break;
      case 'new':
        this.showNewPassword.set(!this.showNewPassword());
        break;
      case 'confirm':
        this.showConfirmPassword.set(!this.showConfirmPassword());
        break;
    }
  }

  onInput(field: 'current' | 'new' | 'confirm', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.successMessage.set(null);
    this.errorMessage.set(null);

    switch (field) {
      case 'current':
        this.currentPassword.set(value);
        break;
      case 'new':
        this.newPassword.set(value);
        break;
      case 'confirm':
        this.confirmPassword.set(value);
        break;
    }
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.successMessage.set(null);
    this.errorMessage.set(null);

    if (!this.currentPassword()) {
      this.errorMessage.set('請輸入目前密碼');
      return;
    }

    if (this.newPassword().length < 6) {
      this.errorMessage.set('新密碼至少需要 6 個字元');
      return;
    }

    if (this.newPassword() !== this.confirmPassword()) {
      this.errorMessage.set('新密碼與確認密碼不一致');
      return;
    }

    if (this.currentPassword() === this.newPassword()) {
      this.errorMessage.set('新密碼不能與目前密碼相同');
      return;
    }

    this.isSubmitting.set(true);

    const result = await this.authService.updatePassword(
      this.currentPassword(),
      this.newPassword()
    );

    this.isSubmitting.set(false);

    if (result.success) {
      this.successMessage.set('密碼已成功變更');
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
    } else {
      this.errorMessage.set(result.error ?? '密碼變更失敗');
    }
  }
}
