// src/pages/CollaborationPage.tsx
// 協作訊息中心 - Three-column layout: patient list, announcements, message board

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import { useTaskStore } from '@/stores/taskStore'
import styles from './CollaborationPage.module.css'

type CollabTab = 'messages' | 'inbox' | 'sent'

interface Message {
  id: string
  from: string
  fromName: string
  to: string
  toName: string
  subject: string
  body: string
  isRead: boolean
  createdAt: string
  [key: string]: unknown
}

const TABS: { key: CollabTab; label: string }[] = [
  { key: 'messages', label: '留言板' },
  { key: 'inbox', label: '收件匣' },
  { key: 'sent', label: '已發送' },
]

const CollaborationPage: React.FC = () => {
  const { currentUser } = useAuth()
  const allPatients = usePatientStore((s) => s.allPatients)
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)
  const getSortedFeedMessages = useTaskStore((s) => s.getSortedFeedMessages)

  const [activeTab, setActiveTab] = useState<CollabTab>('messages')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch messages based on activeTab
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch data for active tab
    setIsLoading(false)
  }, [activeTab])

  const handleTabChange = useCallback((tab: CollabTab) => {
    setActiveTab(tab)
    setMessages([])
  }, [])

  const sortedFeed = getSortedFeedMessages()

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className="page-title">協作訊息中心</h1>
        <button className={styles.composeButton}>+ 新增訊息</button>
      </div>

      <div className={styles.content}>
        {/* Left column - Patient list */}
        <aside className={styles.sidebar}>
          <h2 className={styles.sidebarTitle}>病患列表</h2>
          <div className={styles.patientList}>
            {allPatients.length === 0 ? (
              <p className={styles.emptyHint}>尚無病患資料</p>
            ) : (
              allPatients.slice(0, 50).map((patient) => (
                <button
                  key={patient.id}
                  className={`${styles.patientItem} ${selectedPatientId === patient.id ? styles.patientItemActive : ''}`}
                  onClick={() => setSelectedPatientId(patient.id)}
                >
                  <span className={styles.patientName}>{patient.name || patient.id}</span>
                  <span className={styles.patientStatus}>{patient.status || ''}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Main area */}
        <main className={styles.mainArea}>
          <div className={styles.tabBar}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className={styles.loadingOverlay}>載入中...</div>
          )}

          {/* Messages Tab */}
          {activeTab === 'messages' && (
            <div className={styles.tabContent}>
              {sortedFeed.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>留言板尚無訊息</p>
                </div>
              ) : (
                <div className={styles.messageList}>
                  {sortedFeed.map((msg) => (
                    <div key={msg.id} className={styles.messageItem}>
                      <div className={styles.messageMeta}>
                        <span className={styles.messageType}>{msg.type || '一般'}</span>
                        <span className={styles.messageTime}>
                          {typeof msg.createdAt === 'string' ? msg.createdAt : ''}
                        </span>
                      </div>
                      <div className={styles.messageStatus}>
                        <span className={`${styles.statusBadge} ${msg.status === 'pending' ? styles.statusPending : styles.statusDone}`}>
                          {msg.status === 'pending' ? '待處理' : '已完成'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Inbox Tab */}
          {activeTab === 'inbox' && (
            <div className={styles.tabContent}>
              {messages.length === 0 && !isLoading ? (
                <div className={styles.emptyState}>
                  <p>收件匣尚無訊息</p>
                </div>
              ) : (
                <div className={styles.messageList}>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`${styles.inboxItem} ${!msg.isRead ? styles.unread : ''}`}
                    >
                      <div className={styles.messageSender}>{msg.fromName}</div>
                      <div className={styles.messageSubject}>{msg.subject}</div>
                      <div className={styles.messageTime}>{msg.createdAt}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sent Tab */}
          {activeTab === 'sent' && (
            <div className={styles.tabContent}>
              <div className={styles.emptyState}>
                <p>已發送訊息將顯示在此處</p>
              </div>
            </div>
          )}
        </main>

        {/* Right column - Announcements */}
        <aside className={styles.announcementPanel}>
          <h2 className={styles.sidebarTitle}>公告欄</h2>
          <div className={styles.announcementList}>
            {/* TODO: Render announcements from Firestore */}
            <p className={styles.emptyHint}>尚無公告</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default CollaborationPage
