// 護理相關路由
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../db/init.js'
import { authenticate, isEditor, isAdmin, logAudit } from '../middleware/auth.js'

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
 * 取得交班日誌
 */
router.get('/handover-logs', authenticate, (req, res) => {
  try {
    const { date, startDate, endDate } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM handover_logs'
    const params = []

    if (date) {
      query += ' WHERE date = ?'
      params.push(date)
    } else if (startDate && endDate) {
      query += ' WHERE date >= ? AND date <= ?'
      params.push(startDate, endDate)
    }

    query += ' ORDER BY date DESC, created_at DESC'

    const logs = db.prepare(query).all(...params)
    db.close()

    res.json(logs.map(l => ({
      id: l.id,
      date: l.date,
      shift: l.shift,
      content: l.content,
      items: JSON.parse(l.items || '[]'),
      createdBy: JSON.parse(l.created_by || '{}'),
      createdAt: l.created_at,
      updatedAt: l.updated_at
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
 * 新增交班日誌
 */
router.post('/handover-logs', ...isEditor, async (req, res) => {
  try {
    const { date, shift, content, items } = req.body

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO handover_logs (id, date, shift, content, items, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      date,
      shift,
      content,
      JSON.stringify(items || []),
      JSON.stringify({ uid: req.user.id, name: req.user.name })
    )

    db.close()

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('新增交班日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增交班日誌失敗'
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
      return res.json({
        id: date,
        date,
        patientMovements: [],
        announcements: [],
        notes: null
      })
    }

    res.json({
      id: log.id,
      date: log.date,
      patientMovements: JSON.parse(log.patient_movements || '[]'),
      announcements: JSON.parse(log.announcements || '[]'),
      notes: log.notes,
      createdAt: log.created_at,
      updatedAt: log.updated_at
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
    const { patientMovements, announcements, notes } = req.body

    const db = getDatabase()

    db.prepare(`
      INSERT INTO daily_logs (id, date, patient_movements, announcements, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(date) DO UPDATE SET
        patient_movements = excluded.patient_movements,
        announcements = excluded.announcements,
        notes = excluded.notes,
        updated_at = datetime('now', 'localtime')
    `).run(
      date,
      date,
      JSON.stringify(patientMovements || []),
      JSON.stringify(announcements || []),
      notes
    )

    db.close()

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

export default router
