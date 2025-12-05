// 資料庫遷移腳本 - 用於更新現有資料庫結構
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DB_PATH = join(__dirname, '../../data/dialysis.db')

/**
 * 檢查表格是否存在某個欄位
 */
function columnExists(db, tableName, columnName) {
  const result = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return result.some(col => col.name === columnName)
}

/**
 * 安全地加入欄位（如果不存在）
 */
function addColumnIfNotExists(db, tableName, columnName, columnDef) {
  if (!columnExists(db, tableName, columnName)) {
    console.log(`  ➕ 新增欄位: ${tableName}.${columnName}`)
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`)
    return true
  }
  return false
}

/**
 * 執行遷移
 */
export function runMigrations() {
  if (!existsSync(DB_PATH)) {
    console.log('📂 資料庫不存在，跳過遷移')
    return
  }

  console.log('🔄 檢查資料庫結構...')
  const db = new Database(DB_PATH)

  try {
    let migrationsApplied = 0

    // ========================================
    // Tasks 表格遷移
    // ========================================
    const tasksExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get()
    if (tasksExists) {
      console.log('📋 檢查 tasks 表格...')

      // 新增缺少的欄位
      if (addColumnIfNotExists(db, 'tasks', 'content', "TEXT")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'category', "TEXT DEFAULT 'task'")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'type', "TEXT DEFAULT '常規'")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'patient_id', "TEXT")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'patient_name', "TEXT")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'target_date', "TEXT")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'assignee', "TEXT DEFAULT '{}'")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'creator', "TEXT DEFAULT '{}'")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'created_by', "TEXT DEFAULT '{}'")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'resolved_by', "TEXT DEFAULT '{}'")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'resolved_at', "TEXT")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'due_date', "TEXT")) migrationsApplied++
      if (addColumnIfNotExists(db, 'tasks', 'completed_at', "TEXT")) migrationsApplied++

      // 建立索引（如果不存在）
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_patient ON tasks(patient_id)')
    }

    // ========================================
    // Patients 表格遷移
    // ========================================
    const patientsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patients'").get()
    if (patientsExists) {
      console.log('📋 檢查 patients 表格...')

      // 新增病人狀態欄位
      if (addColumnIfNotExists(db, 'patients', 'patient_status', "TEXT DEFAULT '{}'")) migrationsApplied++
      if (addColumnIfNotExists(db, 'patients', 'is_hepatitis', "INTEGER DEFAULT 0")) migrationsApplied++
      // 新增病人分類與疾病欄位
      if (addColumnIfNotExists(db, 'patients', 'patient_category', "TEXT DEFAULT 'opd_regular'")) migrationsApplied++
      if (addColumnIfNotExists(db, 'patients', 'diseases', "TEXT DEFAULT '[]'")) migrationsApplied++
    }

    // ========================================
    // 其他可能需要遷移的表格
    // ========================================

    // archived_schedules 表格 (用於周排班檢視歷史紀錄)
    const archivedSchedulesExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='archived_schedules'").get()
    if (!archivedSchedulesExists) {
      console.log('📋 建立 archived_schedules 表格...')
      db.exec(`
        CREATE TABLE IF NOT EXISTS archived_schedules (
          id TEXT PRIMARY KEY,
          date TEXT UNIQUE NOT NULL,
          schedule TEXT DEFAULT '{}',
          last_modified_by TEXT DEFAULT '{}',
          archived_at TEXT DEFAULT (datetime('now', 'localtime')),
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
      `)
      db.exec('CREATE INDEX IF NOT EXISTS idx_archived_schedules_date ON archived_schedules(date)')
      migrationsApplied++
    }

    // handover_logs 表格
    const handoverLogsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='handover_logs'").get()
    if (!handoverLogsExists) {
      console.log('📋 建立 handover_logs 表格...')
      db.exec(`
        CREATE TABLE IF NOT EXISTS handover_logs (
          id TEXT PRIMARY KEY,
          content TEXT,
          updated_by TEXT DEFAULT '{}',
          updated_at TEXT,
          source_date TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
      `)
      migrationsApplied++
    }

    if (migrationsApplied > 0) {
      console.log(`✅ 已完成 ${migrationsApplied} 項遷移`)
    } else {
      console.log('✅ 資料庫結構已是最新')
    }

  } catch (error) {
    console.error('❌ 遷移失敗:', error.message)
    throw error
  } finally {
    db.close()
  }
}

// 如果直接執行此檔案
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
}
