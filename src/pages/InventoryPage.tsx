// src/pages/InventoryPage.tsx
// Scaffold - Inventory management

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './InventoryPage.module.css'

type InventoryTab = 'stock' | 'incoming' | 'outgoing'

const TABS: { key: InventoryTab; label: string }[] = [
  { key: 'stock', label: '庫存總覽' },
  { key: 'incoming', label: '入庫紀錄' },
  { key: 'outgoing', label: '出庫紀錄' },
]

export default function InventoryPage() {
  const { currentUser } = useAuth()
  const [activeTab, setActiveTab] = useState<InventoryTab>('stock')
  const [searchText, setSearchText] = useState('')

  return (
    <div className="page-container">
      <div className={styles.pageHeader}>
        <h1 className="page-title">庫存管理</h1>
      </div>

      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜尋品項名稱..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div className={styles.content}>
        {/* Main content area */}
        <div className={styles.emptyState}>
          <p>尚無庫存資料</p>
          <p className={styles.hint}>此頁面正在建構中...</p>
        </div>
      </div>
    </div>
  )
}
