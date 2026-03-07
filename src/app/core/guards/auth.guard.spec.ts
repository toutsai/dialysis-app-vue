import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('AuthGuard', () => {
  let mockAuthService: jasmine.SpyObj<any>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(() => {
    mockAuthService = {
      waitForAuthInit: jasmine.createSpy('waitForAuthInit').and.returnValue(Promise.resolve()),
      isLoggedIn: false,
      currentUser: null,
      isAdmin: false,
      hasPermission: jasmine.createSpy('hasPermission').and.returnValue(false),
    };

    mockRouter = jasmine.createSpyObj('Router', ['createUrlTree']);
    mockRouter.createUrlTree.and.returnValue({ toString: () => '/login' } as any);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ]
    });
  });

  function createRoute(data: Record<string, any> = {}, path?: string): ActivatedRouteSnapshot {
    return { data, routeConfig: { path } } as unknown as ActivatedRouteSnapshot;
  }

  function createState(url: string): RouterStateSnapshot {
    return { url } as RouterStateSnapshot;
  }

  it('should redirect unauthenticated users to login page', async () => {
    mockAuthService.isLoggedIn = false;
    const route = createRoute({ requiresAuth: true });
    const state = createState('/schedule');

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/login'], jasmine.any(Object));
  });

  it('should allow authenticated users to access protected routes', async () => {
    mockAuthService.isLoggedIn = true;
    mockAuthService.currentUser = { role: 'editor', title: '護理師' };
    const route = createRoute({ requiresAuth: true });
    const state = createState('/schedule');

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(result).toBeTrue();
  });

  it('should redirect logged-in nurse from login page to my-patients', async () => {
    mockAuthService.isLoggedIn = true;
    mockAuthService.currentUser = { role: 'editor', title: '護理師' };
    const route = createRoute({}, 'login');
    const state = createState('/login');

    await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/my-patients']);
  });

  it('should redirect logged-in doctor from login page to collaboration', async () => {
    mockAuthService.isLoggedIn = true;
    mockAuthService.currentUser = { role: 'contributor', title: '醫師' };
    const route = createRoute({}, 'login');
    const state = createState('/login');

    await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/collaboration']);
  });

  it('should redirect non-admin from admin pages to schedule', async () => {
    mockAuthService.isLoggedIn = true;
    mockAuthService.isAdmin = false;
    mockAuthService.currentUser = { role: 'viewer' };
    const route = createRoute({ requiresAuth: true, requiresAdmin: true });
    const state = createState('/user-management');

    await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/schedule']);
  });

  it('should allow admin to access admin pages', async () => {
    mockAuthService.isLoggedIn = true;
    mockAuthService.isAdmin = true;
    mockAuthService.currentUser = { role: 'admin' };
    const route = createRoute({ requiresAuth: true, requiresAdmin: true });
    const state = createState('/user-management');

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(result).toBeTrue();
  });

  it('should block user without required role', async () => {
    mockAuthService.isLoggedIn = true;
    mockAuthService.currentUser = { role: 'viewer' };
    const route = createRoute({ requiresAuth: true, roles: ['admin', 'editor'] });
    const state = createState('/patients');

    await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/schedule']);
  });

  it('should allow user with matching role', async () => {
    mockAuthService.isLoggedIn = true;
    mockAuthService.currentUser = { role: 'editor' };
    const route = createRoute({ requiresAuth: true, roles: ['admin', 'editor'] });
    const state = createState('/patients');

    const result = await TestBed.runInInjectionContext(() => authGuard(route, state));
    expect(result).toBeTrue();
  });
});
