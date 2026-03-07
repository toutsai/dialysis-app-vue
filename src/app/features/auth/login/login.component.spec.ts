import { TestBed, ComponentFixture } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Functions } from '@angular/fire/functions';
import { Router } from '@angular/router';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['login'], {
      isLoggedIn: false,
      currentUser: null,
      currentUser$: { subscribe: () => {} },
      authLoading$: { subscribe: () => {}, pipe: () => ({ subscribe: () => {} }) },
    });

    await TestBed.configureTestingModule({
      imports: [LoginComponent, FormsModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Auth, useValue: {} },
        { provide: Functions, useValue: {} },
        { provide: Router, useValue: { navigate: () => {}, navigateByUrl: () => {} } },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with empty form fields', () => {
    expect(component.username).toBe('');
    expect(component.password).toBe('');
    expect(component.errorMessage).toBe('');
    expect(component.isLoading).toBeFalse();
  });

  it('should toggle password visibility', () => {
    expect(component.isPasswordVisible).toBeFalse();
    component.togglePasswordVisibility();
    expect(component.isPasswordVisible).toBeTrue();
    component.togglePasswordVisibility();
    expect(component.isPasswordVisible).toBeFalse();
  });

  it('should call authService.login on handleLogin', async () => {
    mockAuthService.login.and.returnValue(Promise.resolve({ success: true, redirectPath: '/schedule' }));
    component.username = 'admin';
    component.password = 'test123';
    await component.handleLogin();
    expect(mockAuthService.login).toHaveBeenCalledWith('admin', 'test123');
  });

  it('should show error message on failed login', async () => {
    mockAuthService.login.and.returnValue(Promise.reject(new Error('帳號或密碼錯誤')));
    component.username = 'wrong';
    component.password = 'wrong';
    await component.handleLogin();
    expect(component.errorMessage).toBe('帳號或密碼錯誤');
    expect(component.isLoading).toBeFalse();
  });

  it('should not call login if already loading', async () => {
    component.isLoading = true;
    await component.handleLogin();
    expect(mockAuthService.login).not.toHaveBeenCalled();
  });

  it('should set isLoading to true during login', async () => {
    mockAuthService.login.and.returnValue(new Promise(() => {})); // Never resolves
    component.username = 'admin';
    component.password = 'test123';
    const loginPromise = component.handleLogin();
    expect(component.isLoading).toBeTrue();
  });

  it('should render login form elements', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    // Check for input fields
    const inputs = compiled.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    // Check for submit button
    const buttons = compiled.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});
