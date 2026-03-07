import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private authService = inject(AuthService);

  username = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  isPasswordVisible = false;

  togglePasswordVisibility(): void {
    this.isPasswordVisible = !this.isPasswordVisible;
  }

  async handleLogin(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.authService.login(this.username, this.password);
      // 成功時不將 isLoading 設為 false，避免跳轉瞬間畫面閃爍
    } catch (error: any) {
      this.errorMessage = error?.message || '登入發生錯誤';
      this.isLoading = false;
    }
  }
}
