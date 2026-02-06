import { useState, useCallback, useRef } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/firebase'

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

export interface RealtimeNotification {
  id: string
  message: string
  type: NotificationType
  createdBy: string
  createdByName: string
  createdAt: Date
  isLocal?: boolean
}

interface NotificationConfig {
  icon: string
  color: string
  bgColor: string
  label: string
}

// ============================================================
// Notification type configuration
// ============================================================

export const NOTIFICATION_CONFIG: Record<NotificationType, NotificationConfig> = {
  schedule: {
    icon: '📅',
    color: '#1abc9c',
    bgColor: '#e8f8f5',
    label: '排班',
  },
  patient: {
    icon: '🏥',
    color: '#3498db',
    bgColor: '#ebf5fb',
    label: '病患',
  },
  memo: {
    icon: '📝',
    color: '#f39c12',
    bgColor: '#fef9e7',
    label: '備忘',
  },
  task: {
    icon: '✅',
    color: '#27ae60',
    bgColor: '#eafaf1',
    label: '任務',
  },
  system: {
    icon: '⚙️',
    color: '#8e44ad',
    bgColor: '#f4ecf7',
    label: '系統',
  },
  delete: {
    icon: '🗑️',
    color: '#e74c3c',
    bgColor: '#fdedec',
    label: '刪除',
  },
  user: {
    icon: '👤',
    color: '#2c3e50',
    bgColor: '#ebedef',
    label: '使用者',
  },
}

const MAX_NOTIFICATIONS = 10

// ============================================================
// Hook
// ============================================================

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([])
  const unsubscribeRef = useRef<Unsubscribe | null>(null)
  const localIdCounterRef = useRef(0)

  const startListening = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    const notificationsRef = collection(db, 'notifications')
    const q = query(
      notificationsRef,
      where('createdAt', '>=', Timestamp.fromDate(twentyFourHoursAgo)),
      orderBy('createdAt', 'desc'),
      limit(MAX_NOTIFICATIONS),
    )

    unsubscribeRef.current = onSnapshot(
      q,
      (snapshot) => {
        const newNotifications: RealtimeNotification[] = []

        snapshot.forEach((doc) => {
          const data = doc.data()
          const createdAt = data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date()

          newNotifications.push({
            id: doc.id,
            message: data.message || '',
            type: (data.type as NotificationType) || 'system',
            createdBy: data.createdBy || '',
            createdByName: data.createdByName || '系統',
            createdAt,
            isLocal: false,
          })
        })

        setNotifications((prev) => {
          const localNotifications = prev.filter((n) => n.isLocal)
          const combined = [...localNotifications, ...newNotifications]
          return combined.slice(0, MAX_NOTIFICATIONS)
        })
      },
      (error) => {
        console.error('[RealtimeNotifications] Firestore listener error:', error)
      },
    )
  }, [])

  const stopListening = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
  }, [])

  const addLocalNotification = useCallback(
    (message: string, type: NotificationType = 'system') => {
      localIdCounterRef.current += 1
      const localId = `local-${Date.now()}-${localIdCounterRef.current}`

      const localNotification: RealtimeNotification = {
        id: localId,
        message,
        type,
        createdBy: 'local',
        createdByName: '本機',
        createdAt: new Date(),
        isLocal: true,
      }

      setNotifications((prev) => {
        const updated = [localNotification, ...prev]
        return updated.slice(0, MAX_NOTIFICATIONS)
      })

      return localId
    },
    [],
  )

  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const getNotificationConfig = useCallback((type: NotificationType): NotificationConfig => {
    return NOTIFICATION_CONFIG[type] || NOTIFICATION_CONFIG.system
  }, [])

  return {
    notifications,
    startListening,
    stopListening,
    addLocalNotification,
    clearNotifications,
    removeNotification,
    getNotificationConfig,
    NOTIFICATION_CONFIG,
  }
}
