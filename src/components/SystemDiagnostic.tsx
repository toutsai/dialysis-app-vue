import { useState, useCallback } from 'react'
import { db, auth, functions } from '@/firebase'
import { collection, getDocs, limit, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import styles from '@/components/SystemDiagnostic.module.css'

type TestStatus = 'idle' | 'running' | 'pass' | 'fail' | 'skip'

interface DiagnosticTest {
  id: string
  name: string
  description: string
  run: () => Promise<string>
}

interface TestResult {
  status: TestStatus
  output: string
  duration: number
  expanded: boolean
}

const diagnosticTests: DiagnosticTest[] = [
  {
    id: 'firebase-connection',
    name: 'Firebase 連線測試',
    description: '確認 Firebase 是否正確初始化並可連線',
    run: async () => {
      if (!db) throw new Error('Firestore db instance is null or undefined')
      if (!auth) throw new Error('Auth instance is null or undefined')
      if (!functions) throw new Error('Functions instance is null or undefined')
      return 'Firebase 核心服務 (Firestore, Auth, Functions) 初始化成功'
    },
  },
  {
    id: 'firestore-read',
    name: 'Firestore 讀取測試',
    description: '嘗試從 Firestore 讀取資料以確認讀取權限',
    run: async () => {
      const q = query(collection(db, 'patients'), limit(1))
      const snapshot = await getDocs(q)
      if (snapshot.empty) {
        return 'Firestore 讀取成功 (patients 集合目前為空)'
      }
      const firstDoc = snapshot.docs[0]
      return `Firestore 讀取成功，取得文件 ID: ${firstDoc.id}，集合大小: ${snapshot.size}`
    },
  },
  {
    id: 'auth-state',
    name: '認證狀態檢查',
    description: '檢查目前使用者的認證狀態',
    run: async () => {
      const user = auth.currentUser
      if (!user) {
        return '目前未登入 (currentUser = null)'
      }
      const token = await user.getIdTokenResult()
      const lines = [
        `已登入使用者: ${user.email ?? user.uid}`,
        `UID: ${user.uid}`,
        `角色: ${(token.claims.role as string) ?? 'N/A'}`,
        `名稱: ${(token.claims.name as string) ?? 'N/A'}`,
        `Token 到期: ${token.expirationTime}`,
      ]
      return lines.join('\n')
    },
  },
  {
    id: 'cloud-functions',
    name: 'Cloud Functions 連線測試',
    description: '嘗試呼叫 Cloud Function 確認 Functions 服務可用',
    run: async () => {
      try {
        const ping = httpsCallable<void, { status: string }>(functions, 'ping')
        const result = await ping()
        return `Cloud Functions 回應: ${JSON.stringify(result.data)}`
      } catch (err: any) {
        if (
          err?.code === 'functions/not-found' ||
          err?.message?.includes('not found')
        ) {
          return 'Cloud Functions 服務可達，但 ping 函式未部署 (預期行為)'
        }
        throw err
      }
    },
  },
  {
    id: 'collections-check',
    name: '關鍵集合存在性檢查',
    description: '確認系統所需的關鍵 Firestore 集合是否存在',
    run: async () => {
      const requiredCollections = [
        'patients',
        'tasks',
        'base_schedules',
        'holidays',
        'condition_records',
        'kidit_logbook',
      ]
      const results: string[] = []

      for (const collName of requiredCollections) {
        try {
          const q = query(collection(db, collName), limit(1))
          const snapshot = await getDocs(q)
          const count = snapshot.size
          results.push(
            `  ${collName}: ${count > 0 ? `存在 (${count}+ 筆)` : '存在 (空集合)'}`
          )
        } catch (err: any) {
          results.push(`  ${collName}: 存取失敗 - ${err.message ?? err}`)
        }
      }

      return '集合檢查結果:\n' + results.join('\n')
    },
  },
  {
    id: 'browser-info',
    name: '瀏覽器環境資訊',
    description: '收集目前瀏覽器的環境資訊',
    run: async () => {
      const lines = [
        `User Agent: ${navigator.userAgent}`,
        `語言: ${navigator.language}`,
        `線上狀態: ${navigator.onLine ? '線上' : '離線'}`,
        `畫面寬度: ${window.innerWidth}px`,
        `畫面高度: ${window.innerHeight}px`,
        `設備像素比: ${window.devicePixelRatio}`,
        `時區: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
        `目前時間: ${new Date().toLocaleString('zh-TW')}`,
      ]
      return lines.join('\n')
    },
  },
  {
    id: 'local-storage',
    name: 'Local Storage 測試',
    description: '測試 Local Storage 讀寫功能',
    run: async () => {
      const testKey = '__diag_test__'
      const testValue = `test_${Date.now()}`

      localStorage.setItem(testKey, testValue)
      const readBack = localStorage.getItem(testKey)
      localStorage.removeItem(testKey)

      if (readBack !== testValue) {
        throw new Error(
          `Local Storage 讀寫不一致: 寫入 "${testValue}", 讀取 "${readBack}"`
        )
      }

      const usedKeys = Object.keys(localStorage).length
      return `Local Storage 讀寫正常，目前儲存 ${usedKeys} 個鍵值`
    },
  },
  {
    id: 'performance-check',
    name: '效能基準測試',
    description: '簡單的效能基準測試',
    run: async () => {
      const iterations = 100000
      const start = performance.now()
      let sum = 0
      for (let i = 0; i < iterations; i++) {
        sum += Math.sqrt(i)
      }
      const elapsed = performance.now() - start

      const lines = [
        `計算 ${iterations.toLocaleString()} 次 Math.sqrt`,
        `耗時: ${elapsed.toFixed(2)} ms`,
        `結果: ${sum.toFixed(2)}`,
        elapsed < 50
          ? '效能評級: 優秀'
          : elapsed < 200
          ? '效能評級: 良好'
          : '效能評級: 一般',
      ]
      return lines.join('\n')
    },
  },
]

export default function SystemDiagnostic() {
  const [results, setResults] = useState<Record<string, TestResult>>({})
  const [isRunningAll, setIsRunningAll] = useState(false)

  const updateResult = useCallback(
    (testId: string, partial: Partial<TestResult>) => {
      setResults((prev) => ({
        ...prev,
        [testId]: {
          ...(prev[testId] ?? {
            status: 'idle',
            output: '',
            duration: 0,
            expanded: false,
          }),
          ...partial,
        },
      }))
    },
    []
  )

  const runSingleTest = useCallback(
    async (test: DiagnosticTest) => {
      updateResult(test.id, { status: 'running', output: '', duration: 0 })
      const start = performance.now()
      try {
        const output = await test.run()
        const duration = performance.now() - start
        updateResult(test.id, {
          status: 'pass',
          output,
          duration,
          expanded: true,
        })
      } catch (err: any) {
        const duration = performance.now() - start
        const message = err?.message ?? String(err)
        updateResult(test.id, {
          status: 'fail',
          output: `錯誤: ${message}`,
          duration,
          expanded: true,
        })
      }
    },
    [updateResult]
  )

  const runAllTests = useCallback(async () => {
    setIsRunningAll(true)
    for (const test of diagnosticTests) {
      await runSingleTest(test)
    }
    setIsRunningAll(false)
  }, [runSingleTest])

  const clearResults = useCallback(() => {
    setResults({})
  }, [])

  const toggleExpanded = useCallback((testId: string) => {
    setResults((prev) => {
      const existing = prev[testId]
      if (!existing) return prev
      return {
        ...prev,
        [testId]: { ...existing, expanded: !existing.expanded },
      }
    })
  }, [])

  const getStatusIconClass = (status: TestStatus): string => {
    switch (status) {
      case 'running':
        return styles.statusIconRunning
      case 'pass':
        return styles.statusIconPass
      case 'fail':
        return styles.statusIconFail
      case 'skip':
        return styles.statusIconSkip
      default:
        return styles.statusIconIdle
    }
  }

  const getStatusSymbol = (status: TestStatus): string => {
    switch (status) {
      case 'running':
        return '...'
      case 'pass':
        return '\u2713'
      case 'fail':
        return '\u2717'
      case 'skip':
        return '-'
      default:
        return '?'
    }
  }

  const summary = {
    total: diagnosticTests.length,
    pass: Object.values(results).filter((r) => r.status === 'pass').length,
    fail: Object.values(results).filter((r) => r.status === 'fail').length,
    skip: Object.values(results).filter((r) => r.status === 'skip').length,
  }

  const hasResults = Object.keys(results).length > 0

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>系統診斷工具</h2>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.runAllBtn}
          onClick={runAllTests}
          disabled={isRunningAll}
        >
          {isRunningAll ? '執行中...' : '執行全部測試'}
        </button>
        {hasResults && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={clearResults}
          >
            清除結果
          </button>
        )}
      </div>

      <div className={styles.testList}>
        {diagnosticTests.map((test) => {
          const result = results[test.id]
          const status = result?.status ?? 'idle'
          const isExpanded = result?.expanded ?? false

          return (
            <div key={test.id} className={styles.testCard}>
              <div
                className={styles.testHeader}
                onClick={() => toggleExpanded(test.id)}
              >
                <div className={styles.testHeaderLeft}>
                  <div
                    className={`${styles.statusIcon} ${getStatusIconClass(
                      status
                    )}`}
                  >
                    {getStatusSymbol(status)}
                  </div>
                  <div>
                    <div className={styles.testName}>{test.name}</div>
                    <div className={styles.testDescription}>
                      {test.description}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.runSingleBtn}
                  onClick={(e) => {
                    e.stopPropagation()
                    runSingleTest(test)
                  }}
                  disabled={status === 'running' || isRunningAll}
                >
                  {status === 'running' ? '執行中' : '執行'}
                </button>
              </div>

              {isExpanded && result && result.output && (
                <div className={styles.testDetail}>
                  <pre className={styles.testOutput}>{result.output}</pre>
                  <div className={styles.testDuration}>
                    耗時: {result.duration.toFixed(1)} ms
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {hasResults && (
        <div className={styles.summary}>
          <h3 className={styles.summaryTitle}>測試摘要</h3>
          <div className={styles.summaryRow}>
            <span className={styles.summaryTotal}>
              共 {summary.total} 項測試
            </span>
            <span className={styles.summaryPass}>
              通過: {summary.pass}
            </span>
            <span className={styles.summaryFail}>
              失敗: {summary.fail}
            </span>
            {summary.skip > 0 && (
              <span className={styles.summarySkip}>
                略過: {summary.skip}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
