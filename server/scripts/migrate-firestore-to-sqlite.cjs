/**
 * Firestore to SQLite Migration Script
 * 將 Firebase Firestore 的資料遷移到 SQLite 資料庫
 *
 * 使用方式:
 *   cd server && node scripts/migrate-firestore-to-sqlite.cjs
 *
 * 需要:
 *   1. 在專案根目錄放置 serviceAccountKey.json (Firebase Admin SDK 憑證)
 *   2. 確保 server/data/dialysis.db 存在且已初始化
 */

const path = require('path')
const admin = require('firebase-admin')
const Database = require('better-sqlite3')
const { v4: uuidv4 } = require('uuid')

// ========================================
// 配置
// ========================================

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../../serviceAccountKey.json')
const SQLITE_DB_PATH = path.resolve(__dirname, '../data/dialysis.db')

// 如果有設定模擬器環境變數，則使用模擬器
const useEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.USE_EMULATOR === 'true'

// ========================================
// 初始化 Firebase
// ========================================

let serviceAccount
try {
  serviceAccount = require(SERVICE_ACCOUNT_PATH)
} catch (error) {
  console.error('❌ 找不到 serviceAccountKey.json 檔案')
  console.error('   請從 Firebase Console 下載服務帳戶金鑰並放置於專案根目錄')
  console.error('   路徑: Firebase Console > 專案設定 > 服務帳戶 > 產生新的私密金鑰')
  process.exit(1)
}

if (useEmulator) {
  console.log('🔧 使用 Firestore 模擬器')
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
  admin.initializeApp({ projectId: serviceAccount.project_id })
} else {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

const firestore = admin.firestore()

// ========================================
// 初始化 SQLite
// ========================================

let db
try {
  db = new Database(SQLITE_DB_PATH)
  db.pragma('journal_mode = WAL')
  console.log(`✅ 已連接到 SQLite 資料庫: ${SQLITE_DB_PATH}`)
} catch (error) {
  console.error('❌ 無法連接到 SQLite 資料庫:', error.message)
  process.exit(1)
}

// ========================================
// 工具函式
// ========================================

function toSqliteDate(firestoreTimestamp) {
  if (!firestoreTimestamp) return null
  if (firestoreTimestamp.toDate) {
    return firestoreTimestamp.toDate().toISOString().replace('T', ' ').substring(0, 19)
  }
  if (firestoreTimestamp instanceof Date) {
    return firestoreTimestamp.toISOString().replace('T', ' ').substring(0, 19)
  }
  return String(firestoreTimestamp)
}

function toJson(obj) {
  if (!obj) return '{}'
  return JSON.stringify(obj)
}

function toJsonArray(arr) {
  if (!arr) return '[]'
  return JSON.stringify(arr)
}

function normalizeStatus(status) {
  const validStatuses = ['opd', 'ipd', 'er', 'deleted']
  if (!status) return 'opd'
  const normalized = String(status).toLowerCase()
  if (validStatuses.includes(normalized)) {
    return normalized
  }
  // 嘗試映射常見的變體
  if (normalized === 'outpatient' || normalized === '門診') return 'opd'
  if (normalized === 'inpatient' || normalized === '住院') return 'ipd'
  if (normalized === 'emergency' || normalized === '急診') return 'er'
  // 預設為 opd
  console.log(`   ⚠️ 未知的 status 值: "${status}"，設為 opd`)
  return 'opd'
}

function normalizeExceptionStatus(status) {
  const validStatuses = ['pending', 'applied', 'cancelled', 'conflict_requires_resolution', 'processing']
  if (!status) return 'pending'
  const normalized = String(status).toLowerCase()
  if (validStatuses.includes(normalized)) {
    return normalized
  }
  // 嘗試映射
  if (normalized === 'completed' || normalized === 'done') return 'applied'
  if (normalized === 'canceled') return 'cancelled'
  // 預設為 pending
  console.log(`   ⚠️ 未知的 exception status 值: "${status}"，設為 pending`)
  return 'pending'
}

// ========================================
// 遷移函式
// ========================================

async function migrateUsers() {
  console.log('\n📦 遷移 users 集合...')
  const snapshot = await firestore.collection('users').get()

  if (snapshot.empty) {
    console.log('   ⚠️ users 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO users (id, username, password_hash, name, title, role, email, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        data.username || doc.id,
        '$2b$10$defaultHashForMigration', // 預設密碼雜湊，需要之後重設
        data.name || '',
        data.title || '',
        data.role || 'viewer',
        data.email || null,
        1,
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 位使用者`)
  return count
}

async function migratePatients() {
  console.log('\n📦 遷移 patients 集合...')
  const snapshot = await firestore.collection('patients').get()

  if (snapshot.empty) {
    console.log('   ⚠️ patients 集合為空')
    return 0
  }

  // 重建 patients 表以支援 'deleted' status
  console.log('   🔧 重建 patients 表以支援 deleted 狀態...')
  db.exec(`
    -- 備份現有資料
    CREATE TABLE IF NOT EXISTS patients_backup AS SELECT * FROM patients;
    -- 刪除原表
    DROP TABLE IF EXISTS patients;
    -- 重建表 (包含 deleted 狀態)
    CREATE TABLE patients (
      id TEXT PRIMARY KEY,
      medical_record_number TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'opd' CHECK (status IN ('opd', 'ipd', 'er', 'deleted')),
      is_deleted INTEGER DEFAULT 0,
      delete_reason TEXT,
      dialysis_orders TEXT DEFAULT '{}',
      birth_date TEXT,
      gender TEXT,
      id_number TEXT,
      phone TEXT,
      address TEXT,
      emergency_contact TEXT,
      emergency_phone TEXT,
      physician TEXT,
      first_dialysis_date TEXT,
      vasc_access TEXT,
      access_creation_date TEXT,
      ward_number TEXT,
      bed_number TEXT,
      hospital_info TEXT DEFAULT '{}',
      inpatient_reason TEXT,
      dialysis_reason TEXT,
      notes TEXT,
      patient_category TEXT DEFAULT 'opd_regular',
      diseases TEXT DEFAULT '[]',
      patient_status TEXT DEFAULT '{}',
      is_hepatitis INTEGER DEFAULT 0,
      schedule_rule TEXT DEFAULT '{}',
      last_modified_by TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(medical_record_number);
    CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
    CREATE INDEX IF NOT EXISTS idx_patients_deleted ON patients(is_deleted);
    -- 刪除備份
    DROP TABLE IF EXISTS patients_backup;
  `)

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO patients (
      id, medical_record_number, name, status, is_deleted, delete_reason,
      dialysis_orders, birth_date, gender, id_number, phone, address,
      emergency_contact, emergency_phone, physician, first_dialysis_date,
      vasc_access, access_creation_date, ward_number, bed_number,
      hospital_info, inpatient_reason, dialysis_reason, notes,
      patient_category, diseases, patient_status, is_hepatitis,
      schedule_rule, last_modified_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        data.medicalRecordNumber || '',
        data.name || '',
        normalizeStatus(data.status),
        data.isDeleted ? 1 : 0,
        data.deleteReason || null,
        toJson(data.dialysisOrders),
        data.birthDate || null,
        data.gender || null,
        data.idNumber || null,
        data.phone || null,
        data.address || null,
        data.emergencyContact || null,
        data.emergencyPhone || null,
        data.physician || null,
        data.firstDialysisDate || null,
        data.vascAccess || data.vascularAccess || null,
        data.accessCreationDate || null,
        data.wardNumber || null,
        data.bedNumber || null,
        toJson(data.hospitalInfo),
        data.inpatientReason || null,
        data.dialysisReason || null,
        data.notes || null,
        data.patientCategory || 'opd_regular',
        toJsonArray(data.diseases),
        toJson(data.patientStatus),
        data.isHepatitis ? 1 : 0,
        toJson(data.scheduleRule),
        toJson(data.lastModifiedBy),
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 位病人`)
  return count
}

async function migrateBaseSchedules() {
  console.log('\n📦 遷移 base_schedules 集合...')
  const snapshot = await firestore.collection('base_schedules').get()

  if (snapshot.empty) {
    console.log('   ⚠️ base_schedules 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO base_schedules (id, schedule, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `)

  let count = 0
  for (const doc of snapshot.docs) {
    const data = doc.data()
    stmt.run(
      doc.id,
      toJson(data.schedule),
      toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
      toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
    )
    count++
  }

  console.log(`   ✅ 已遷移 ${count} 份基礎排班`)
  return count
}

async function migrateSchedules() {
  console.log('\n📦 遷移 schedules 集合...')
  const snapshot = await firestore.collection('schedules').get()

  if (snapshot.empty) {
    console.log('   ⚠️ schedules 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO schedules (id, date, schedule, sync_method, last_modified_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        doc.id, // 日期作為 ID
        toJson(data.schedule),
        data.syncMethod || null,
        toJson(data.lastModifiedBy),
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 份每日排班`)
  return count
}

async function migrateScheduleExceptions() {
  console.log('\n📦 遷移 schedule_exceptions 集合...')
  const snapshot = await firestore.collection('schedule_exceptions').get()

  if (snapshot.empty) {
    console.log('   ⚠️ schedule_exceptions 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO schedule_exceptions (
      id, type, status, patient_id, patient_name,
      from_data, to_data, patient1, patient2,
      start_date, end_date, date, reason, cancel_reason, error_message,
      created_by, cancelled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        data.type || 'MOVE',
        normalizeExceptionStatus(data.status),
        data.patientId || null,
        data.patientName || null,
        toJson(data.fromData || data.from),
        toJson(data.toData || data.to),
        toJson(data.patient1),
        toJson(data.patient2),
        data.startDate || null,
        data.endDate || null,
        data.date || null,
        data.reason || null,
        data.cancelReason || null,
        data.errorMessage || null,
        toJson(data.createdBy),
        toSqliteDate(data.cancelledAt),
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 筆排程例外`)
  return count
}

async function migrateLabReports() {
  console.log('\n📦 遷移 lab_reports 集合...')
  const snapshot = await firestore.collection('lab_reports').get()

  if (snapshot.empty) {
    console.log('   ⚠️ lab_reports 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO lab_reports (
      id, patient_id, report_date, report_type, results, file_path, uploaded_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      // 處理 reportDate - 可能是 Timestamp 或字串
      let reportDate = null
      if (data.reportDate) {
        if (data.reportDate.toDate) {
          reportDate = data.reportDate.toDate().toISOString().substring(0, 10)
        } else {
          reportDate = String(data.reportDate).substring(0, 10)
        }
      }

      stmt.run(
        doc.id,
        data.patientId || null,
        reportDate,
        data.reportType || 'excel_import',
        toJson(data.data || data.results),
        data.sourceFile || data.filePath || null,
        toJson(data.uploadedBy),
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 份檢驗報告`)
  return count
}

async function migrateTasks() {
  console.log('\n📦 遷移 tasks 集合...')
  const snapshot = await firestore.collection('tasks').get()

  if (snapshot.empty) {
    console.log('   ⚠️ tasks 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tasks (
      id, title, description, content, status, priority, category, type,
      patient_id, patient_name, target_date, assigned_to, assignee,
      creator, created_by, resolved_by, resolved_at, due_date, completed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        data.title || null,
        data.description || null,
        data.content || null,
        data.status || 'pending',
        data.priority || 'normal',
        data.category || 'task',
        data.type || '常規',
        data.patientId || null,
        data.patientName || null,
        data.targetDate || null,
        data.assignedTo || null,
        toJson(data.assignee),
        toJson(data.creator),
        toJson(data.createdBy),
        toJson(data.resolvedBy),
        toSqliteDate(data.resolvedAt),
        data.dueDate || null,
        toSqliteDate(data.completedAt),
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 筆任務`)
  return count
}

async function migrateDailyLogs() {
  console.log('\n📦 遷移 daily_logs 集合...')
  const snapshot = await firestore.collection('daily_logs').get()

  if (snapshot.empty) {
    console.log('   ⚠️ daily_logs 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO daily_logs (
      id, date, patient_movements, vascular_access_log, announcements,
      notes, other_notes, stats, leader, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        doc.id, // 日期作為 ID
        toJsonArray(data.patientMovements),
        toJsonArray(data.vascularAccessLog),
        toJsonArray(data.announcements),
        data.notes || null,
        data.otherNotes || null,
        toJson(data.stats),
        toJson(data.leader),
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 筆每日日誌`)
  return count
}

async function migrateMemos() {
  console.log('\n📦 遷移 memos 集合...')
  const snapshot = await firestore.collection('memos').get()

  if (snapshot.empty) {
    console.log('   ⚠️ memos 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO memos (id, date, content, author_id, author_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        data.date || doc.id,
        data.content || null,
        data.authorId || null,
        data.authorName || null,
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 筆備忘錄`)
  return count
}

async function migrateNursingSchedules() {
  console.log('\n📦 遷移 nursing_schedules 集合...')
  const snapshot = await firestore.collection('nursing_schedules').get()

  if (snapshot.empty) {
    console.log('   ⚠️ nursing_schedules 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO nursing_schedules (id, schedule_data, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `)

  let count = 0
  for (const doc of snapshot.docs) {
    const data = doc.data()
    // nursing_schedules 的資料結構直接就是 schedule data
    const scheduleData = { ...data }
    delete scheduleData.createdAt
    delete scheduleData.updatedAt

    stmt.run(
      doc.id,
      toJson(scheduleData),
      toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
      toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
    )
    count++
  }

  console.log(`   ✅ 已遷移 ${count} 份護理排班`)
  return count
}

async function migratePhysicians() {
  console.log('\n📦 遷移 physicians 集合...')
  const snapshot = await firestore.collection('physicians').get()

  if (snapshot.empty) {
    console.log('   ⚠️ physicians 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO physicians (
      id, name, specialty, staff_id, phone, clinic_hours,
      default_schedules, default_consultation_schedules, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  for (const doc of snapshot.docs) {
    const data = doc.data()
    stmt.run(
      doc.id,
      data.name || '',
      data.specialty || null,
      data.staffId || null,
      data.phone || null,
      toJsonArray(data.clinicHours),
      toJsonArray(data.defaultSchedules),
      toJsonArray(data.defaultConsultationSchedules),
      data.isActive !== false ? 1 : 0,
      toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
      toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
    )
    count++
  }

  console.log(`   ✅ 已遷移 ${count} 位醫師`)
  return count
}

async function migratePhysicianSchedules() {
  console.log('\n📦 遷移 physician_schedules 集合...')
  const snapshot = await firestore.collection('physician_schedules').get()

  if (snapshot.empty) {
    console.log('   ⚠️ physician_schedules 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO physician_schedules (id, schedule_data, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `)

  let count = 0
  for (const doc of snapshot.docs) {
    const data = doc.data()
    stmt.run(
      doc.id,
      toJson(data),
      toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
      toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
    )
    count++
  }

  console.log(`   ✅ 已遷移 ${count} 份醫師排班`)
  return count
}

async function migrateConditionRecords() {
  console.log('\n📦 遷移 condition_records 集合...')
  const snapshot = await firestore.collection('condition_records').get()

  if (snapshot.empty) {
    console.log('   ⚠️ condition_records 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO condition_records (
      id, patient_id, record_date, content, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        data.patientId || null,
        data.recordDate || null,
        data.content || null,
        toJson(data.createdBy),
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 筆病情記錄`)
  return count
}

async function migrateHandoverLogs() {
  console.log('\n📦 遷移 handover_logs 集合...')
  const snapshot = await firestore.collection('handover_logs').get()

  if (snapshot.empty) {
    console.log('   ⚠️ handover_logs 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO handover_logs (
      id, date, shift, content, items, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        data.date || null,
        data.shift || null,
        data.content || null,
        toJsonArray(data.items),
        toJson(data.createdBy),
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 筆交班日誌`)
  return count
}

async function migrateArchivedSchedules() {
  console.log('\n📦 遷移 archived_schedules 集合...')
  const snapshot = await firestore.collection('archived_schedules').get()

  if (snapshot.empty) {
    console.log('   ⚠️ archived_schedules 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO archived_schedules (
      id, date, schedule, last_modified_by, archived_at, archive_method,
      patient_count, missing_patient_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertMany = db.transaction((docs) => {
    for (const doc of docs) {
      const data = doc.data()
      stmt.run(
        doc.id,
        doc.id,
        toJson(data.schedule),
        toJson(data.lastModifiedBy),
        toSqliteDate(data.archivedAt),
        data.archiveMethod || null,
        data.patientCount || 0,
        data.missingPatientCount || 0,
        toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
        toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
      )
      count++
    }
  })

  insertMany(snapshot.docs)
  console.log(`   ✅ 已遷移 ${count} 份歸檔排班`)
  return count
}

async function migrateLabAlertAnalyses() {
  console.log('\n📦 遷移 lab_alert_analyses 集合...')
  const snapshot = await firestore.collection('lab_alert_analyses').get()

  if (snapshot.empty) {
    console.log('   ⚠️ lab_alert_analyses 集合為空')
    return 0
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO lab_alert_analyses (id, patient_id, analysis_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  let count = 0
  for (const doc of snapshot.docs) {
    const data = doc.data()
    stmt.run(
      doc.id,
      data.patientId || doc.id,
      toJson(data),
      toSqliteDate(data.createdAt) || toSqliteDate(new Date()),
      toSqliteDate(data.updatedAt) || toSqliteDate(new Date())
    )
    count++
  }

  console.log(`   ✅ 已遷移 ${count} 筆檢驗警示分析`)
  return count
}

// ========================================
// 主執行函式
// ========================================

async function runMigration() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║       Firestore to SQLite Migration Tool v1.0              ║')
  console.log('║       Firebase Firestore → SQLite 資料遷移工具             ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`🔗 目標資料庫: ${SQLITE_DB_PATH}`)
  console.log(`🔗 Firebase 專案: ${serviceAccount.project_id}`)

  const results = {}

  try {
    // 依序遷移各集合
    results.users = await migrateUsers()
    results.patients = await migratePatients()
    results.baseSchedules = await migrateBaseSchedules()
    results.schedules = await migrateSchedules()
    results.archivedSchedules = await migrateArchivedSchedules()
    results.scheduleExceptions = await migrateScheduleExceptions()
    results.labReports = await migrateLabReports()
    results.labAlertAnalyses = await migrateLabAlertAnalyses()
    results.tasks = await migrateTasks()
    results.dailyLogs = await migrateDailyLogs()
    results.memos = await migrateMemos()
    results.nursingSchedules = await migrateNursingSchedules()
    results.physicians = await migratePhysicians()
    results.physicianSchedules = await migratePhysicianSchedules()
    results.conditionRecords = await migrateConditionRecords()
    results.handoverLogs = await migrateHandoverLogs()

    // 輸出統計
    console.log('\n╔════════════════════════════════════════════════════════════╗')
    console.log('║                      遷移完成統計                          ║')
    console.log('╠════════════════════════════════════════════════════════════╣')

    let total = 0
    for (const [key, count] of Object.entries(results)) {
      const label = key.padEnd(25)
      console.log(`║  ${label}: ${String(count).padStart(6)} 筆                   ║`)
      total += count
    }

    console.log('╠════════════════════════════════════════════════════════════╣')
    console.log(`║  ${'總計'.padEnd(23)}: ${String(total).padStart(6)} 筆                   ║`)
    console.log('╚════════════════════════════════════════════════════════════╝')
    console.log('\n🎉 遷移完成！')

  } catch (error) {
    console.error('\n❌ 遷移過程中發生錯誤:', error)
    process.exit(1)
  } finally {
    db.close()
    process.exit(0)
  }
}

// 執行遷移
runMigration()
