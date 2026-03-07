import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { Subscription, filter, map } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css'
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  public authService = inject(AuthService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);

  isSidebarOpen = false;
  isManagementSectionCollapsed = true;
  currentPageTitle = '透析管理';
  private routerSub?: Subscription;

  get environmentTag(): {text: string, class: string} | null {
    if (!environment.production && environment.useEmulators) {
      return { text: '(開發版)', class: 'env-tag-dev' };
    } else if (environment.production) {
      return { text: '(正式版)', class: 'env-tag-prod' };
    }
    return null;
  }

  ngOnInit(): void {
    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => {
        let route = this.activatedRoute.firstChild;
        while (route?.firstChild) {
          route = route.firstChild;
        }
        return route?.snapshot.data['title'] || '透析管理';
      })
    ).subscribe(title => {
      this.currentPageTitle = title;
    });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  toggleManagementSection(): void {
    this.isManagementSectionCollapsed = !this.isManagementSectionCollapsed;
  }

  async handleLogout(): Promise<void> {
    await this.authService.logout();
  }

  // Role checks — delegates to AuthService
  get currentUser() { return this.authService.currentUser; }
  get isAdmin() { return this.authService.isAdmin; }
  get isEditor() { return this.authService.isEditor; }
  get isContributor() { return this.authService.isContributor; }
}
