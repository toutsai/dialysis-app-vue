import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInWithCustomToken, signOut, user, getIdTokenResult, IdTokenResult } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, map, filter, firstValueFrom } from 'rxjs';

export interface AppUser {
  id: string;
  uid: string;
  name: string;
  username: string;
  role: string;
  title: string;
  email: string | null;
  lastLogin: string;
}

export interface AuthClaims {
  role?: string;
  title?: string;
  name?: string;
  [key: string]: unknown;
}

export interface LoginResult {
  success: boolean;
  redirectPath: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private functions = inject(Functions);
  private router = inject(Router);

  private currentUserSubject = new BehaviorSubject<AppUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private authLoadingSubject = new BehaviorSubject<boolean>(true);
  public authLoading$ = this.authLoadingSubject.asObservable();

  private loginLoadingSubject = new BehaviorSubject<boolean>(false);
  public loginLoading$ = this.loginLoadingSubject.asObservable();

  private logoutLoadingSubject = new BehaviorSubject<boolean>(false);
  public logoutLoading$ = this.logoutLoadingSubject.asObservable();

  private claimsSubject = new BehaviorSubject<AuthClaims | null>(null);
  public claims$ = this.claimsSubject.asObservable();

  constructor() {
    authState(this.auth).subscribe(async (firebaseUser) => {
      this.authLoadingSubject.next(true);
      if (firebaseUser) {
        try {
          const idTokenResult = await firebaseUser.getIdTokenResult();
          this.claimsSubject.next(idTokenResult.claims);

          const claims = idTokenResult.claims as AuthClaims;
          const userData: AppUser = {
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            name: claims.name || '未命名',
            username: (claims as any)['username'] || firebaseUser.email || '',
            role: claims.role || 'viewer',
            title: claims.title || '未知職稱',
            email: firebaseUser.email,
            lastLogin: new Date().toISOString()
          };
          this.currentUserSubject.next(userData);
        } catch (error) {
          console.error('❌ Error getting user token result:', error);
          this.currentUserSubject.next(null);
          this.claimsSubject.next(null);
          await signOut(this.auth);
        }
      } else {
        this.currentUserSubject.next(null);
        this.claimsSubject.next(null);
      }
      this.authLoadingSubject.next(false);
    });
  }

  public get currentUser(): AppUser | null {
    return this.currentUserSubject.value;
  }

  public get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  public async waitForAuthInit(): Promise<void> {
    if (!this.authLoadingSubject.value) return;
    await firstValueFrom(this.authLoading$.pipe(filter(loading => !loading)));
  }

  public async login(username: string, password: string): Promise<LoginResult> {
    this.loginLoadingSubject.next(true);
    try {
      const customLoginFunction = httpsCallable<{username: string, password: string}, {token: string}>(this.functions, 'customLogin');
      const response = await customLoginFunction({ username, password });
      
      const token = response.data?.token;
      if (!token) {
        throw new Error('從伺服器獲取登入憑證(token)失敗。');
      }

      await signInWithCustomToken(this.auth, token);
      
      // 等待 currentUser 更新
      if (!this.currentUser) {
        await firstValueFrom(this.currentUser$.pipe(filter(user => !!user)));
      }

      const redirectPath = this.router.routerState.snapshot.url.includes('redirect=') ? 
        new URLSearchParams(this.router.routerState.snapshot.url.split('?')[1]).get('redirect') || '/schedule' : '/schedule';
      
      await this.router.navigateByUrl(redirectPath);
      return { success: true, redirectPath };
    } catch (error) {
      console.error('[Auth] Login process failed:', error);
      throw error;
    } finally {
      this.loginLoadingSubject.next(false);
    }
  }

  public async logout(): Promise<{success: boolean}> {
    this.logoutLoadingSubject.next(true);
    try {
      await signOut(this.auth);
      await this.router.navigate(['/login']);
      return { success: true };
    } finally {
      this.logoutLoadingSubject.next(false);
    }
  }

  public async updatePassword(oldPassword: string, newPassword: string): Promise<{success: boolean}> {
    if (!this.auth.currentUser) throw new Error('使用者未登入，無法更改密碼。');
    
    const changeUserPasswordFunction = httpsCallable<{oldPassword: string, newPassword: string}, {success: boolean}>(this.functions, 'changeUserPassword');
    const result = await changeUserPasswordFunction({ oldPassword, newPassword });
    return result.data;
  }

  public hasPermission(requiredRole: string): boolean {
    if (!this.currentUser) return false;
    const roleHierarchy: Record<string, number> = {
      viewer: 1,
      contributor: 2,
      editor: 3,
      admin: 4
    };
    const userLevel = roleHierarchy[this.currentUser.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 999;
    return userLevel >= requiredLevel;
  }

  // Helper getters mimicking computed properties
  public get isAdmin(): boolean { return this.hasPermission('admin'); }
  public get isEditor(): boolean { return this.hasPermission('editor'); }
  public get isContributor(): boolean { return this.hasPermission('contributor'); }
  public get isViewer(): boolean { return this.currentUser?.role === 'viewer'; }
  public get isReadOnly(): boolean { return !this.hasPermission('contributor'); }

  public get canManagePhysicianSchedule(): boolean {
    if (!this.currentUser) return false;
    return ['admin', 'contributor'].includes(this.currentUser.role);
  }
}
