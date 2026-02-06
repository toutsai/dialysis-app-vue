// src/app/layouts/main-layout.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Router,
  ActivatedRoute,
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
  NavigationEnd,
} from '@angular/router';
import { filter, map } from 'rxjs/operators';
import {
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { environment } from '@env/environment';
import { AuthService } from '@services/auth.service';
import { NotificationService } from '@services/notification.service';
import { TaskStoreService } from '@services/task-store.service';
import { PatientStoreService } from '@services/patient-store.service';
import { FirebaseService } from '@services/firebase.service';

// ---------------------------------------------------------------------------
// Environment tag type
// ---------------------------------------------------------------------------

interface EnvironmentTag {
  text: string;
  class: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  // -------------------------------------------------------------------------
  // Injected services
  // -------------------------------------------------------------------------
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  readonly notificationService = inject(NotificationService);
  private readonly taskStoreService = inject(TaskStoreService);
  private readonly patientStoreService = inject(PatientStoreService);
  private readonly firebaseService = inject(FirebaseService);
  private readonly destroyRef = inject(DestroyRef);

  // -------------------------------------------------------------------------
  // Sidebar state
  // -------------------------------------------------------------------------
  readonly isSidebarOpen = signal(false);
  readonly isManagementCollapsed = signal(false);

  // -------------------------------------------------------------------------
  // Conflict count (schedule_exceptions with unresolved conflicts)
  // -------------------------------------------------------------------------
  readonly conflictCount = signal(0);
  private conflictUnsubscribe: Unsubscribe | null = null;

  // -------------------------------------------------------------------------
  // Notification count (pending tasks + unread memos)
  // -------------------------------------------------------------------------
  readonly notificationCount = computed(() => {
    return this.taskStoreService.todayTaskCount();
  });

  // -------------------------------------------------------------------------
  // Current page title from route data
  // -------------------------------------------------------------------------
  readonly currentPageTitle = signal('');

  // -------------------------------------------------------------------------
  // Environment tag
  // -------------------------------------------------------------------------
  readonly environmentTag = computed<EnvironmentTag | null>(() => {
    const env = environment.appEnv as string;
    switch (env) {
      case 'emulator':
        return { text: '模擬器', class: 'tag-emulator' };
      case 'development':
        return { text: '開發版', class: 'tag-development' };
      default:
        return null;
    }
  });

  constructor() {
    // React to auth state changes: start/stop listeners when user logs in/out
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.startListeners(user.uid);
      } else {
        this.stopListeners();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  ngOnInit(): void {
    // Listen to route changes to update page title
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        map(() => this.getDeepestRouteTitle()),
      )
      .subscribe((title) => {
        this.currentPageTitle.set(title);
      });

    // Set initial page title
    this.currentPageTitle.set(this.getDeepestRouteTitle());

    // Fetch patient data
    this.patientStoreService.fetchPatientsIfNeeded();

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => {
      this.cleanup();
    });
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  toggleSidebar(): void {
    this.isSidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  toggleManagement(): void {
    this.isManagementCollapsed.update((collapsed) => !collapsed);
  }

  async handleLogout(): Promise<void> {
    this.closeSidebar();
    this.stopListeners();
    await this.authService.logout();
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  /**
   * Start all real-time Firestore listeners.
   */
  private startListeners(uid: string): void {
    // Notification listener
    this.notificationService.startListener();

    // Task/memo real-time updates
    this.taskStoreService.startRealtimeUpdates(uid);

    // Conflict count listener on schedule_exceptions
    this.startConflictListener();
  }

  /**
   * Stop all listeners and clear state.
   */
  private stopListeners(): void {
    this.notificationService.stopListener();
    this.taskStoreService.stopRealtimeUpdates();
    this.stopConflictListener();
  }

  /**
   * Listen to schedule_exceptions for unresolved conflicts.
   */
  private startConflictListener(): void {
    if (this.conflictUnsubscribe) return;

    const q = query(
      collection(this.firebaseService.db, 'schedule_exceptions'),
      where('hasConflict', '==', true),
      where('resolved', '==', false),
    );

    this.conflictUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        this.conflictCount.set(snapshot.size);
      },
      (error) => {
        console.error(
          '[MainLayout] Conflict listener error:',
          error,
        );
      },
    );
  }

  /**
   * Stop the conflict count listener.
   */
  private stopConflictListener(): void {
    if (this.conflictUnsubscribe) {
      this.conflictUnsubscribe();
      this.conflictUnsubscribe = null;
    }
    this.conflictCount.set(0);
  }

  /**
   * Traverse the activated route tree to find the deepest child route's
   * title from its data property.
   */
  private getDeepestRouteTitle(): string {
    let route = this.activatedRoute;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return (route.snapshot.data as { title?: string })?.title || '';
  }

  /**
   * Cleanup all listeners on component destroy.
   */
  private cleanup(): void {
    this.stopListeners();
  }
}
