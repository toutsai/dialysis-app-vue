import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for initial Firebase Auth state to resolve
  await authService.waitForAuthInit();

  const requiresAuth = route.data['requiresAuth'] === true;
  const requiresAdmin = route.data['requiresAdmin'] === true;
  const requiredRoles = (route.data['roles'] as string[]) || [];

  const isLoggedIn = authService.isLoggedIn;
  const currentUser = authService.currentUser;
  const isLoginPage = route.routeConfig?.path === 'login';

  // 1. 如果目標頁面需要登入，但使用者未登入 -> 導向登入頁
  if (requiresAuth && !isLoggedIn) {
    return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
  }

  // 2. 如果使用者已登入，但又試圖訪問登入頁 -> 根據職稱決定導向何處
  if (isLoginPage && isLoggedIn) {
    const userTitle = currentUser?.title;
    if (userTitle === '護理師' || userTitle === '護理師組長') {
      return router.createUrlTree(['/my-patients']);
    } else {
      return router.createUrlTree(['/collaboration']);
    }
  }

  // 3. 如果目標頁面需要管理員權限，但使用者不是管理員 -> 導向預設頁面
  if (requiresAdmin && !authService.isAdmin) {
    console.warn(`權限不足：用戶角色 (${currentUser?.role}) 無法訪問管理員頁面。`);
    return router.createUrlTree(['/schedule']);
  }

  // 4. 如果目標頁面需要特定角色，但使用者角色不符 -> 導向預設頁面
  if (requiredRoles.length > 0 && currentUser && !requiredRoles.includes(currentUser.role)) {
    console.warn(`權限不足：用戶角色 (${currentUser?.role}) 無法訪問此頁面。`);
    return router.createUrlTree(['/schedule']);
  }

  // 5. 所有檢查都通過 -> 允許導航
  return true;
};
