// 護理相關路由
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../db/init.js'
import { authenticate, isEditor, isAdmin, logAudit } from '../middleware/auth.js'
import {
  syncEventsToKiditLogbook,
  getKiditLogbook,
  updateKiditEvent,
  updateKiditEvents,
  listKiditLogbooks,
} from '../services/kiditSync.js'

const router = Router()

// ========================================
// 護理工作職責 API
// ========================================

/**
 * GET /api/nursing/duties
 * 取得護理工作職責
 */
router.get('/duties', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    const duties = db.prepare(`SELECT * FROM nursing_duties WHERE id = 'main'`).get()
    db.close()

    if (!duties) {
      return res.json({
        id: 'main',
        duties: {}
      })
    }

    res.json({
      id: duties.id,
      ...JSON.parse(duties.duties || '{}'),
      createdAt: duties.created_at,
      updatedAt: duties.updated_at
    })

  } catch (error) {
    console.error('取得護理職責錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得護理職責失敗'
    })
  }
})

/**
 * PUT /api/nursing/duties
 * 更新護理工作職責
 */
router.put('/duties', ...isAdmin, async (req, res) => {
  try {
    const data = req.body
    const db = getDatabase()

    db.prepare(`
      INSERT INTO nursing_duties (id, duties, updated_at)
      VALUES ('main', ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        duties = excluded.duties,
        updated_at = datetime('now', 'localtime')
    `).run(JSON.stringify(data))

    db.close()

    res.json({
      success: true,
      message: '護理職責已更新'
    })

  } catch (error) {
    console.error('更新護理職責錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新護理職責失敗'
    })
  }
})

// ========================================
// 護理排班 API
// ========================================

/**
 * GET /api/nursing/schedules
 * 取得護理排班
 */
router.get('/schedules', ...isEditor, (req, res) => {
  try {
    const { id } = req.query
    const db = getDatabase()

    if (id) {
      const schedule = db.prepare(`SELECT * FROM nursing_schedules WHERE id = ?`).get(id)
      db.close()

      if (!schedule) {
        return res.status(404).json({
          error: true,
          message: '排班不存在'
        })
      }

      return res.json({
        id: schedule.id,
        scheduleData: JSON.parse(schedule.schedule_data || '{}'),
        createdAt: schedule.created_at,
        updatedAt: schedule.updated_at
      })
    }

    const schedules = db.prepare(`SELECT * FROM nursing_schedules ORDER BY id DESC`).all()
    db.close()

    res.json(schedules.map(s => ({
      id: s.id,
      scheduleData: JSON.parse(s.schedule_data || '{}'),
      createdAt: s.created_at,
      updatedAt: s.updated_at
    })))

  } catch (error) {
    console.error('取得護理排班錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得護理排班失敗'
    })
  }
})

/**
 * PUT /api/nursing/schedules/:id
 * 更新護理排班
 */
router.put('/schedules/:id', ...isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const scheduleData = req.body

    const db = getDatabase()

    db.prepare(`
      INSERT INTO nursing_schedules (id, schedule_data, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        schedule_data = excluded.schedule_data,
        updated_at = datetime('now', 'localtime')
    `).run(id, JSON.stringify(scheduleData))

    db.close()

    res.json({
      success: true,
      message: '護理排班已更新'
    })

  } catch (error) {
    console.error('更新護理排班錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新護理排班失敗'
    })
  }
})

// ========================================
// 護理組別配置 API
// ========================================

/**
 * GET /api/nursing/group-config
 * 取得護理組別配置
 */
router.get('/group-config', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    const configs = db.prepare(`SELECT * FROM nursing_group_config`).all()
    db.close()

    res.json(configs.map(c => ({
      id: c.id,
      config: JSON.parse(c.config || '{}'),
      createdAt: c.created_at,
      updatedAt: c.updated_at
    })))

  } catch (error) {
    console.error('取得組別配置錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得組別配置失敗'
    })
  }
})

/**
 * PUT /api/nursing/group-config/:id
 * 更新護理組別配置
 */
router.put('/group-config/:id', ...isAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const config = req.body

    const db = getDatabase()

    db.prepare(`
      INSERT INTO nursing_group_config (id, config, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        config = excluded.config,
        updated_at = datetime('now', 'localtime')
    `).run(id, JSON.stringify(config))

    db.close()

    res.json({
      success: true,
      message: '組別配置已更新'
    })

  } catch (error) {
    console.error('更新組別配置錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新組別配置失敗'
    })
  }
})

// ========================================
// 交班日誌 API
// ========================================

/**
 * GET /api/nursing/handover-logs
 * 取得交班日誌 (返回最新一筆或指定條件)
 */
router.get('/handover-logs', authenticate, (req, res) => {
  try {
    const { limit } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM handover_logs ORDER BY updated_at DESC, created_at DESC'
    if (limit) {
      query += ` LIMIT ${parseInt(limit, 10)}`
    }

    const logs = db.prepare(query).all()
    db.close()

    res.json(logs.map(l => ({
      id: l.id,
      content: l.content,
      updatedBy: JSON.parse(l.updated_by || '{}'),
      updatedAt: l.updated_at,
      sourceDate: l.source_date,
      createdAt: l.created_at
    })))

  } catch (error) {
    console.error('取得交班日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得交班日誌失敗'
    })
  }
})

/**
 * POST /api/nursing/handover-logs
 * 儲存交班日誌 (使用 upsert 邏輯 - 只保留最新一筆)
 */
router.post('/handover-logs', ...isEditor, async (req, res) => {
  try {
    const { content, updatedBy, updatedAt, sourceDate } = req.body

    const db = getDatabase()

    // 使用固定 ID 'latest' 來實現只保留一筆最新記錄
    const existingLog = db.prepare(`SELECT id FROM handover_logs LIMIT 1`).get()

    if (existingLog) {
      // 更新現有記錄
      db.prepare(`
        UPDATE handover_logs
        SET content = ?, updated_by = ?, updated_at = ?, source_date = ?
        WHERE id = ?
      `).run(
        content,
        JSON.stringify(updatedBy || { uid: req.user.id, name: req.user.name }),
        updatedAt || new Date().toISOString(),
        sourceDate,
        existingLog.id
      )
    } else {
      // 新增記錄
      const id = uuidv4()
      db.prepare(`
        INSERT INTO handover_logs (id, content, updated_by, updated_at, source_date)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        id,
        content,
        JSON.stringify(updatedBy || { uid: req.user.id, name: req.user.name }),
        updatedAt || new Date().toISOString(),
        sourceDate
      )
    }

    db.close()

    res.status(201).json({
      success: true
    })

  } catch (error) {
    console.error('儲存交班日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '儲存交班日誌失敗'
    })
  }
})

/**
 * GET /api/nursing/handover-logs/latest
 * 取得最新交班日誌 (對應 Firebase 的 handover_logs/latest)
 */
router.get('/handover-logs/latest', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    const log = db.prepare(`SELECT * FROM handover_logs WHERE id = 'latest'`).get()
    db.close()

    if (!log) {
      return res.json({
        id: 'latest',
        content: '',
        updatedBy: null,
        updatedAt: null,
        sourceDate: null
      })
    }

    res.json({
      id: log.id,
      content: log.content,
      updatedBy: JSON.parse(log.created_by || '{}'),  // 使用 created_by 欄位儲存 updatedBy
      updatedAt: log.updated_at,
      sourceDate: log.date  // 使用 date 欄位儲存 sourceDate
    })

  } catch (error) {
    console.error('取得最新交班日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得最新交班日誌失敗'
    })
  }
})

/**
 * PUT /api/nursing/handover-logs/latest
 * 儲存/更新最新交班日誌 (對應 Firebase 的 handover_logs/latest)
 */
router.put('/handover-logs/latest', ...isEditor, async (req, res) => {
  try {
    const { content, updatedBy, updatedAt, sourceDate } = req.body

    const db = getDatabase()

    // 使用現有欄位：created_by 存 updatedBy，date 存 sourceDate
    db.prepare(`
      INSERT INTO handover_logs (id, date, content, created_by, updated_at)
      VALUES ('latest', ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        content = excluded.content,
        created_by = excluded.created_by,
        updated_at = datetime('now', 'localtime')
    `).run(
      sourceDate || new Date().toISOString().split('T')[0],
      content || '',
      JSON.stringify(updatedBy || {})
    )

    db.close()

    res.json({
      success: true,
      message: '交班日誌已儲存'
    })

  } catch (error) {
    console.error('儲存最新交班日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '儲存最新交班日誌失敗'
    })
  }
})

/**
 * PUT /api/nursing/handover-logs/:id
 * 更新交班日誌
 */
router.put('/handover-logs/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const { content, items } = req.body

    const db = getDatabase()

    db.prepare(`
      UPDATE handover_logs
      SET content = ?, items = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(content, JSON.stringify(items || []), id)

    db.close()

    res.json({
      success: true,
      message: '交班日誌已更新'
    })

  } catch (error) {
    console.error('更新交班日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新交班日誌失敗'
    })
  }
})

// ========================================
// 每日工作日誌 API
// ========================================

/**
 * GET /api/nursing/daily-logs/:date
 * 取得特定日期的工作日誌
 */
router.get('/daily-logs/:date', authenticate, (req, res) => {
  try {
    const { date } = req.params
    const db = getDatabase()

    const log = db.prepare(`SELECT * FROM daily_logs WHERE date = ?`).get(date)
    db.close()

    if (!log) {
      // 返回預設結構，標記為新建
      return res.json({
        id: date,
        date,
        isNew: true, // 標記這是新的日誌，前端應該從排程計算統計
        patientMovements: [],
        vascularAccessLog: [],
        announcements: [],
        stats: {},
        leader: {},
        otherNotes: null,
        notes: null,
      })
    }

    res.json({
      id: log.id,
      date: log.date,
      patientMovements: JSON.parse(log.patient_movements || '[]'),
      vascularAccessLog: JSON.parse(log.vascular_access_log || '[]'),
      announcements: JSON.parse(log.announcements || '[]'),
      stats: JSON.parse(log.stats || '{}'),
      leader: JSON.parse(log.leader || '{}'),
      otherNotes: log.other_notes,
      notes: log.notes,
      createdAt: log.created_at,
      updatedAt: log.updated_at,
    })

  } catch (error) {
    console.error('取得工作日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得工作日誌失敗'
    })
  }
})

/**
 * PUT /api/nursing/daily-logs/:date
 * 更新每日工作日誌
 */
router.put('/daily-logs/:date', ...isEditor, async (req, res) => {
  try {
    const { date } = req.params
    const { patientMovements, announcements, notes, vascularAccessLog, stats, leader, otherNotes } = req.body

    // 將可能是物件的欄位轉成可儲存的字串，避免 SQLite 綁定錯誤
    const safeNotes =
      notes == null ? null : typeof notes === 'string' ? notes : JSON.stringify(notes)
    const safeOtherNotes =
      otherNotes == null ? null : typeof otherNotes === 'string' ? otherNotes : JSON.stringify(otherNotes)

    const db = getDatabase()

    db.prepare(`
      INSERT INTO daily_logs (id, date, patient_movements, announcements, notes, vascular_access_log, stats, leader, other_notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(date) DO UPDATE SET
        patient_movements = excluded.patient_movements,
        vascular_access_log = excluded.vascular_access_log,
        announcements = excluded.announcements,
        notes = excluded.notes,
        stats = excluded.stats,
        leader = excluded.leader,
        other_notes = excluded.other_notes,
        updated_at = datetime('now', 'localtime')
    `).run(
      date,
      date,
      JSON.stringify(patientMovements || []),
      JSON.stringify(announcements || []),
      safeNotes,
      JSON.stringify(vascularAccessLog || []),
      JSON.stringify(stats || {}),
      JSON.stringify(leader || {}),
      safeOtherNotes,
    )

    db.close()

    // 同步到 Kidit 日誌本
    try {
      await syncEventsToKiditLogbook(date, {
        patientMovements: patientMovements || [],
        vascularAccessLog: vascularAccessLog || [],
        createdAt: new Date().toISOString(),
      })
    } catch (syncError) {
      console.error('Kidit 同步失敗 (非致命錯誤):', syncError)
      // 不阻擋主要操作
    }

    res.json({
      success: true,
      message: '工作日誌已更新'
    })

  } catch (error) {
    console.error('更新工作日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新工作日誌失敗'
    })
  }
})

// ========================================
// Kidit 日誌本 API
// ========================================

/**
 * GET /api/nursing/kidit-logbook/:date
 * 取得特定日期的 Kidit 日誌本
 */
router.get('/kidit-logbook', authenticate, (req, res) => {
  try {
    const { year, month, startDate, endDate } = req.query

    let rangeStart = startDate
    let rangeEnd = endDate

    if (year && month) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`
      const nextDate = new Date(Number(year), Number(month), 1)
      const end = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`
      rangeStart = start
      rangeEnd = end
    }

    if (!rangeStart || !rangeEnd) {
      return res.status(400).json({ error: true, message: '請提供 year/month 或 startDate 與 endDate' })
    }

    const logbooks = listKiditLogbooks({ startDate: rangeStart, endDate: rangeEnd })
    res.json(logbooks)
  } catch (error) {
    console.error('取得 Kidit 日誌本列表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得 Kidit 日誌本列表失敗',
    })
  }
})

/**
 * GET /api/nursing/kidit-logbook/:date
 * 取得特定日期的 Kidit 日誌本
 */
router.get('/kidit-logbook/:date', authenticate, (req, res) => {
  try {
    const { date } = req.params
    const logbook = getKiditLogbook(date)

    res.json(logbook)

  } catch (error) {
    console.error('取得 Kidit 日誌本錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得 Kidit 日誌本失敗'
    })
  }
})

/**
 * PUT /api/nursing/kidit-logbook/:date/events/:eventId
 * 更新 Kidit 事件狀態 (勾選登記/轉出院所)
 */
router.put('/kidit-logbook/:date/events/:eventId', ...isEditor, async (req, res) => {
  try {
    const { date, eventId } = req.params
    const updates = req.body || {}

    const result = updateKiditEvent(date, eventId, updates)

    res.json({
      success: true,
      message: '事件狀態已更新'
    })

  } catch (error) {
    console.error('更新 Kidit 事件錯誤:', error)
    res.status(500).json({
      error: true,
      message: error.message || '更新 Kidit 事件失敗'
    })
  }
})

/**
 * PUT /api/nursing/kidit-logbook/:date/events
 * 取代整日的 Kidit 事件列表
 */
router.put('/kidit-logbook/:date/events', ...isEditor, (req, res) => {
  try {
    const { date } = req.params
    const { events } = req.body

    const result = updateKiditEvents(date, events || [])

    res.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('更新 Kidit 事件列表錯誤:', error)
    res.status(500).json({
      error: true,
      message: error.message || '更新 Kidit 事件列表失敗',
    })
  }
})

/**
 * POST /api/nursing/kidit-logbook/:date/sync
 * 手動同步 Kidit 日誌本
 */
router.post('/kidit-logbook/:date/sync', ...isEditor, async (req, res) => {
  try {
    const { date } = req.params

    const db = getDatabase()
    const log = db.prepare(`SELECT * FROM daily_logs WHERE date = ?`).get(date)
    db.close()

    if (!log) {
      return res.status(404).json({
        error: true,
        message: '找不到該日期的工作日誌'
      })
    }

    const result = await syncEventsToKiditLogbook(date, {
      patientMovements: JSON.parse(log.patient_movements || '[]'),
      vascularAccessLog: JSON.parse(log.vascular_access_log || '[]'),
      createdAt: log.created_at,
    })

    res.json({
      success: true,
      ...result
    })

  } catch (error) {
    console.error('同步 Kidit 日誌本錯誤:', error)
    res.status(500).json({
      error: true,
      message: '同步 Kidit 日誌本失敗'
    })
  }
})

export default router
