// src/components/MarqueeBanner.tsx
// Scrolling marquee banner displaying real-time site announcements from Firestore.

import { useState, useEffect, useRef } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { sanitizeHtml } from '@/utils/sanitize'
import styles from '@/components/MarqueeBanner.module.css'

interface MarqueeItem {
  id: string
  content: string
  isActive: boolean
  priority?: number
  createdAt?: unknown
}

export default function MarqueeBanner() {
  const [announcements, setAnnouncements] = useState<MarqueeItem[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const marqueeCol = collection(db, 'marquee')
    const q = query(
      marqueeCol,
      where('isActive', '==', true),
      orderBy('priority', 'desc')
    )

    const unsubscribe: Unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: MarqueeItem[] = []
        snapshot.forEach((docSnap) => {
          const data = docSnap.data()
          items.push({
            id: docSnap.id,
            content: data.content ?? '',
            isActive: data.isActive ?? false,
            priority: data.priority ?? 0,
            createdAt: data.createdAt,
          })
        })
        setAnnouncements(items)
      },
      (err) => {
        console.error('[MarqueeBanner] Firestore listener error:', err)
      }
    )

    return () => {
      unsubscribe()
    }
  }, [])

  if (announcements.length === 0) {
    return null
  }

  const combinedHtml = announcements
    .map((item) => sanitizeHtml(item.content))
    .join('<span class="' + styles.separator + '"> \u00A0\u00A0\u2022\u00A0\u00A0 </span>')

  return (
    <div className={styles.marqueeWrapper} role="marquee" aria-live="polite">
      <div className={styles.marqueeTrack} ref={containerRef}>
        <div className={styles.marqueeContent}>
          <span dangerouslySetInnerHTML={{ __html: combinedHtml }} />
        </div>
        <div className={styles.marqueeContent} aria-hidden="true">
          <span dangerouslySetInnerHTML={{ __html: combinedHtml }} />
        </div>
      </div>
    </div>
  )
}
