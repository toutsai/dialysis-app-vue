// src/app/core/services/notification.service.ts
import {
  Injectable,
  inject,
  signal,
  OnDestroy,
  DestroyRef,
} from '@angular/core';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'schedule_change'
  | 'patient_update'
  | 'task_assigned'
  | 'memo'
  | 'alert'
  | 'schedule'
  | 'patient'
  | 'task'
  | 'message'
  | 'order'
  | 'system'
  | 'error'
  | 'success'
  | 'warning'
  | 'info'
  | 'team'
  | 'default';

export interface NotificationConfig {
  icon: string;
  bgColor: string;
  textColor: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
  time: string;
  config: NotificationConfig;
  read?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Notification config per type
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPE_CONFIG: Record<string, NotificationConfig> = {
  schedule_change: {
    icon: 'calendar_month',
    bgColor: '#eaf4fc',
    textColor: '#2c3e50',
  },
  schedule: {
    icon: 'calendar_month',
    bgColor: '#eaf4fc',
    textColor: '#1abc9c',
  },
  patient_update: {
    icon: 'person',
    bgColor: '#fef9e7',
    textColor: '#7d6608',
  },
  patient: {
    icon: 'person',
    bgColor: '#ebf5fb',
    textColor: '#3498db',
  },
  task_assigned: {
    icon: 'task_alt',
    bgColor: '#eafaf1',
    textColor: '#1e8449',
  },
  task: {
    icon: 'task_alt',
    bgColor: '#fef5e7',
    textColor: '#e67e22',
  },
  memo: {
    icon: 'sticky_note_2',
    bgColor: '#fdf2e9',
    textColor: '#a04000',
  },
  message: {
    icon: 'chat',
    bgColor: '#f4ecf7',
    textColor: '#9b59b6',
  },
  order: {
    icon: 'medication',
    bgColor: '#eafaf1',
    textColor: '#2ecc71',
  },
  alert: {
    icon: 'warning',
    bgColor: '#fdedec',
    textColor: '#c0392b',
  },
  system: {
    icon: 'settings',
    bgColor: '#f4f6f7',
    textColor: '#95a5a6',
  },
  error: {
    icon: 'error',
    bgColor: '#fdedec',
    textColor: '#dc3545',
  },
  success: {
    icon: 'check_circle',
    bgColor: '#eafaf1',
    textColor: '#28a745',
  },
  warning: {
    icon: 'warning',
    bgColor: '#fef9e7',
    textColor: '#ffc107',
  },
  info: {
    icon: 'info',
    bgColor: '#ebf5fb',
    textColor: '#17a2b8',
  },
  default: {
    icon: 'notifications',
    bgColor: '#f4f6f7',
    textColor: '#2c3e50',
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NOTIFICATIONS = 10;
const COLLECTION_NAME = 'global_notifications';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly firebase = inject(FirebaseService);
  private readonly destroyRef = inject(DestroyRef);

  // -----------------------------------------------------------------------
  // State signals
  // -----------------------------------------------------------------------
  readonly notifications = signal<AppNotification[]>([]);

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------
  private unsubscribe: Unsubscribe | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopListening());
  }

  ngOnDestroy(): void {
    this.stopListening();
  }

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  /**
   * Start listening to real-time global notifications from Firestore.
   * Only the most recent MAX_NOTIFICATIONS items are kept.
   */
  startListening(): void {
    if (this.unsubscribe) return; // Already listening

    const q = query(
      collection(this.firebase.db, COLLECTION_NAME),
      orderBy('createdAt', 'desc'),
      limit(MAX_NOTIFICATIONS),
    );

    this.unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AppNotification[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          const type = (data['type'] as NotificationType) || 'default';
          const createdAt = (data['createdAt'] as Timestamp) || null;
          const config =
            NOTIFICATION_TYPE_CONFIG[type] ||
            NOTIFICATION_TYPE_CONFIG['default'];

          return {
            id: doc.id,
            type,
            title: (data['title'] as string) || '',
            message: (data['message'] as string) || '',
            createdBy: (data['createdBy'] as string) || '',
            createdByName: (data['createdByName'] as string) || '',
            createdAt,
            time: createdAt ? this.formatTime(createdAt) : '',
            config,
            read: (data['read'] as boolean) || false,
          };
        });
        this.notifications.set(items);
      },
      (error) => {
        console.error('[NotificationService] Listener error:', error);
      },
    );

    console.log('[NotificationService] Listening for notifications');
  }

  /**
   * Backward-compatible alias for startListening().
   */
  startListener(): void {
    this.startListening();
  }

  /**
   * Stop the real-time listener and clear local notification data.
   */
  stopListening(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.notifications.set([]);
    console.log('[NotificationService] Stopped listening');
  }

  /**
   * Backward-compatible alias for stopListening().
   */
  stopListener(): void {
    this.stopListening();
  }

  /**
   * Write a new global notification document to Firestore.
   *
   * @param title   - Notification headline
   * @param type    - Notification category
   * @param message - Optional detailed message body
   */
  async createGlobalNotification(
    title: string,
    type: NotificationType = 'info',
    message?: string,
  ): Promise<void> {
    try {
      const db = this.firebase.db;
      await addDoc(collection(db, COLLECTION_NAME), {
        title,
        type,
        message: message || '',
        createdAt: serverTimestamp(),
        read: false,
      });
      console.log(
        `[NotificationService] Created notification: "${title}" (${type})`,
      );
    } catch (error) {
      console.error(
        '[NotificationService] Failed to create notification:',
        error,
      );
      throw error;
    }
  }

  /**
   * Backward-compatible alias for createGlobalNotification().
   */
  async createNotification(
    title: string,
    type: NotificationType = 'info',
    message?: string,
  ): Promise<void> {
    return this.createGlobalNotification(title, type, message);
  }

  /**
   * Show a simple notification (backward-compatible convenience method).
   */
  async show(message: string, type: NotificationType = 'info'): Promise<void> {
    return this.createGlobalNotification(message, type);
  }

  /**
   * Get the config (icon, colors) for a notification type.
   */
  getConfigForType(type: string): NotificationConfig {
    return (
      NOTIFICATION_TYPE_CONFIG[type] || NOTIFICATION_TYPE_CONFIG['default']
    );
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private formatTime(timestamp: Timestamp): string {
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return '剛剛';
    if (diffMin < 60) return `${diffMin} 分鐘前`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} 小時前`;

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  }
}
