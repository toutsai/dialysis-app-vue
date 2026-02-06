import { useCallback } from 'react'
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/hooks/useAuth'

// ============================================================
// Types
// ============================================================

export type NotificationType =
  | 'schedule'
  | 'patient'
  | 'memo'
  | 'task'
  | 'system'
  | 'delete'
  | 'user'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'

export interface NotificationMetadata {
  targetId?: string
  targetType?: string
  action?: string
  details?: string
  [key: string]: unknown
}

export interface CreateNotificationOptions {
  metadata?: NotificationMetadata
  expiresInDays?: number
}

export interface GlobalNotification {
  message: string
  type: NotificationType
  createdBy: string
  createdByName: string
  createdAt: ReturnType<typeof serverTimestamp>
  expireAt: Timestamp
  metadata: NotificationMetadata
  read: boolean
}

// ============================================================
// Hook
// ============================================================

export function useGlobalNotifier() {
  const currentUser = useAuthStore((state) => state.currentUser)

  const createGlobalNotification = useCallback(
    async (
      message: string,
      type: NotificationType = 'system',
      options: CreateNotificationOptions = {},
    ): Promise<string | null> => {
      if (!message || !message.trim()) {
        console.warn('[GlobalNotifier] Notification message cannot be empty.')
        return null
      }

      const { metadata = {}, expiresInDays = 30 } = options

      const expireDate = new Date()
      expireDate.setDate(expireDate.getDate() + expiresInDays)

      const notificationData: GlobalNotification = {
        message: message.trim(),
        type,
        createdBy: currentUser?.uid || 'unknown',
        createdByName: currentUser?.name || '系統',
        createdAt: serverTimestamp(),
        expireAt: Timestamp.fromDate(expireDate),
        metadata: {
          ...metadata,
          action: metadata.action || type,
        },
        read: false,
      }

      try {
        const notificationsRef = collection(db, 'notifications')
        const docRef = await addDoc(notificationsRef, notificationData)
        console.log(`[GlobalNotifier] Notification created with ID: ${docRef.id}`)
        return docRef.id
      } catch (error) {
        console.error('[GlobalNotifier] Failed to create notification:', error)
        return null
      }
    },
    [currentUser],
  )

  return {
    createGlobalNotification,
  }
}
