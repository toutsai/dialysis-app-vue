import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.css'
})
export class AccountSettingsComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  oldPassword = '';
  newPassword = '';
  confirmPassword = '';
  message = '';
  messageType: 'success' | 'error' | '' = '';
  isLoading = false;

  isOldPasswordVisible = false;
  isNewPasswordVisible = false;
  isConfirmPasswordVisible = false;

  get currentUser() { return this.authService.currentUser; }

  togglePasswordVisibility(field: string): void {
    if (field === 'old') this.isOldPasswordVisible = !this.isOldPasswordVisible;
    else if (field === 'new') this.isNewPasswordVisible = !this.isNewPasswordVisible;
    else if (field === 'confirm') this.isConfirmPasswordVisible = !this.isConfirmPasswordVisible;
  }

  async handleChangePassword(): Promise<void> {
    this.message = '';
    this.isLoading = true;

    if (this.newPassword !== this.confirmPassword) {
      this.message = '新密碼與確認密碼不相符。';
      this.messageType = 'error';
      this.isLoading = false;
      return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(this.newPassword)) {
      this.message = '新密碼需至少 8 個字元，並包含大寫字母、小寫字母和數字。';
      this.messageType = 'error';
      this.isLoading = false;
      return;
    }

    try {
      await this.authService.updatePassword(this.oldPassword, this.newPassword);
      this.message = '密碼已成功更新！';
      this.messageType = 'success';
      this.oldPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
    } catch (error: any) {
      if (error?.code === 'functions/unauthenticated') {
        this.message = '舊密碼不正確，請重新輸入。';
      } else {
        this.message = error?.message || '發生未知錯誤，請稍後再試。';
      }
      this.messageType = 'error';
    } finally {
      this.isLoading = false;
    }
  }

  handleCancel(): void {
    this.router.navigate(['/']);
  }
}
