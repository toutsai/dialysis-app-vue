// src/pages/UsageGuidePage.tsx
// 平台使用說明 - Collapsible sections with usage guide

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './UsageGuidePage.module.css'

interface GuideSection {
  id: string
  title: string
  content: string[]
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    title: '平台總覽',
    content: [
      '本平台為透析中心護理管理系統，整合排班、病患管理、藥囑、檢驗報告等功能。',
      '登入後可於左側選單快速切換各功能模組。',
      '首頁儀表板顯示今日排班概況與待辦事項。',
    ],
  },
  {
    id: 'schedule',
    title: '排程管理',
    content: [
      '「每日排班」頁面可查看及編輯當日透析排程。',
      '「週班表」提供整週的班次概覽，可快速切換週次。',
      '「基礎班表」為排班的底層範本，修改後會影響未來的自動排班。',
      '「例外管理」用於處理臨時調班、換床等特殊狀況。',
    ],
  },
  {
    id: 'patients',
    title: '病患管理',
    content: [
      '「病患名冊」為所有透析病患的主檔，可搜尋、篩選及檢視詳細資料。',
      '「我的今日病人」顯示當班護理師被指派的病患清單。',
      '點選病患卡片可查看病歷摘要、透析紀錄及相關備註。',
    ],
  },
  {
    id: 'orders',
    title: '藥囑與檢驗',
    content: [
      '「藥囑管理」可查詢、上傳藥物醫囑，並追蹤執行狀態。',
      '「檢驗報告」提供檢驗結果查詢、異常警示及報告上傳功能。',
      '藥囑和檢驗報告均支援日期範圍篩選及病患搜尋。',
    ],
  },
  {
    id: 'collaboration',
    title: '協作功能',
    content: [
      '「協作訊息中心」整合留言板、收件匣及公告功能。',
      '護理備忘錄可與特定病患或日期連結，方便交班參考。',
      '任務指派支援角色和個人兩種模式。',
    ],
  },
  {
    id: 'reports',
    title: '報表與統計',
    content: [
      '「統計分析」頁面提供透析人次、班次統計等圖表。',
      '「KiDit 申報工作站」管理病患異動紀錄，支援月曆檢視和 Excel 匯出。',
      '「每日工作紀錄」紀錄各班次的工作事項。',
    ],
  },
  {
    id: 'faq',
    title: '常見問題',
    content: [
      'Q: 忘記密碼怎麼辦？ A: 請聯繫系統管理員重設密碼。',
      'Q: 如何新增病患？ A: 在「病患名冊」頁面點選「新增病患」按鈕。',
      'Q: 排班異常如何處理？ A: 至「例外管理」頁面建立調班申請。',
      'Q: 資料多久備份一次？ A: 系統每日自動備份，資料保留 90 天。',
    ],
  },
]

const UsageGuidePage: React.FC = () => {
  const { currentUser } = useAuth()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['overview'])
  )

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedSections(new Set(GUIDE_SECTIONS.map((s) => s.id)))
  }, [])

  const collapseAll = useCallback(() => {
    setExpandedSections(new Set())
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className="page-title">平台使用說明</h1>
        <div className={styles.headerActions}>
          <button className={styles.toggleAllButton} onClick={expandAll}>
            全部展開
          </button>
          <button className={styles.toggleAllButton} onClick={collapseAll}>
            全部收合
          </button>
        </div>
      </div>

      <div className={styles.guideContainer}>
        {GUIDE_SECTIONS.map((section) => {
          const isExpanded = expandedSections.has(section.id)
          return (
            <div key={section.id} className={styles.section}>
              <button
                className={styles.sectionHeader}
                onClick={() => toggleSection(section.id)}
                aria-expanded={isExpanded}
              >
                <span className={styles.sectionTitle}>{section.title}</span>
                <span className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}>
                  &#9662;
                </span>
              </button>
              {isExpanded && (
                <div className={styles.sectionContent}>
                  <ul className={styles.contentList}>
                    {section.content.map((item, idx) => (
                      <li key={idx} className={styles.contentItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          如有其他問題，請聯繫系統管理員。
        </p>
      </div>
    </div>
  )
}

export default UsageGuidePage
