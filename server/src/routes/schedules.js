// 排程管理路由
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../db/init.js'
import { authenticate, isEditor, logAudit } from '../middleware/auth.js'
import { syncMasterScheduleToFuture, initializeFutureSchedules } from '../services/scheduleSync.js'

const router = Router()

// ========================================
// 每日排程 API
// ========================================

/**
 * GET /api/schedules
 * 取得排程列表 (可選日期範圍)
 */
router.get('/', authenticate, (req, res) => {
  try {
    const { startDate, endDate, date } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM schedules'
    const params = []

    if (date) {
      query += ' WHERE date = ?'
      params.push(date)
    } else if (startDate && endDate) {
      query += ' WHERE date >= ? AND date <= ?'
      params.push(startDate, endDate)
    } else if (startDate) {
      query += ' WHERE date >= ?'
      params.push(startDate)
    }

    query += ' ORDER BY date'

    const schedules = db.prepare(query).all(...params)
    db.close()

    res.json(schedules.map(s => ({
      id: s.id,
      date: s.date,
      schedule: JSON.parse(s.schedule || '{}'),
      syncMethod: s.sync_method,
      lastModifiedBy: JSON.parse(s.last_modified_by || '{}'),
      createdAt: s.created_at,
      updatedAt: s.updated_at
    })))

  } catch (error) {
    console.error('取得排程錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得排程失敗'
    })
  }
})

/**
 * GET /api/schedules/expired/:date
 * 取得特定日期的歸檔排程（用於周排班檢視）
 * 注意：此路由必須放在 /:date 之前
 */
router.get('/expired/:date', authenticate, (req, res) => {
  try {
    const { date } = req.params
    const db = getDatabase()

    // 嘗試從歸檔排程表取得資料
    const archived = db.prepare(`
      SELECT * FROM archived_schedules WHERE date = ?
    `).get(date)

    // 如果歸檔表沒有，嘗試從一般排程表取得
    if (!archived) {
      const schedule = db.prepare(`SELECT * FROM schedules WHERE date = ?`).get(date)
      db.close()

      // 不管有沒有資料都回傳成功，避免 404 錯誤
      if (!schedule) {
        return res.json({
          id: date,
          date,
          schedule: {},
          createdAt: null,
          updatedAt: null
        })
      }

      return res.json({
        id: schedule.id,
        date: schedule.date,
        schedule: JSON.parse(schedule.schedule || '{}'),
        syncMethod: schedule.sync_method,
        lastModifiedBy: JSON.parse(schedule.last_modified_by || '{}'),
        createdAt: schedule.created_at,
        updatedAt: schedule.updated_at
      })
    }

    db.close()

    res.json({
      id: archived.id,
      date: archived.date,
      schedule: JSON.parse(archived.schedule || '{}'),
      lastModifiedBy: JSON.parse(archived.last_modified_by || '{}'),
      createdAt: archived.created_at,
      updatedAt: archived.updated_at
    })

  } catch (error) {
    console.error('取得歸檔排程錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得歸檔排程失敗'
    })
  }
})

/**
 * GET /api/schedules/:date
 * 取得特定日期的排程
 */
router.get('/:date', authenticate, (req, res) => {
  try {
    const { date } = req.params
    const db = getDatabase()

    const schedule = db.prepare(`SELECT * FROM schedules WHERE date = ?`).get(date)
    db.close()

    if (!schedule) {
      return res.json({
        id: date,
        date,
        schedule: {},
        createdAt: null,
        updatedAt: null
      })
    }

    res.json({
      id: schedule.id,
      date: schedule.date,
      schedule: JSON.parse(schedule.schedule || '{}'),
      syncMethod: schedule.sync_method,
      lastModifiedBy: JSON.parse(schedule.last_modified_by || '{}'),
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at
    })

  } catch (error) {
    console.error('取得排程錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得排程失敗'
    })
  }
})

/**
 * PUT /api/schedules/:date
 * 更新特定日期的排程
 */
router.put('/:date', ...isEditor, async (req, res) => {
  try {
    const { date } = req.params
    const { schedule } = req.body

    const db = getDatabase()

    const existing = db.prepare(`SELECT id FROM schedules WHERE date = ?`).get(date)

    const lastModifiedBy = JSON.stringify({ uid: req.user.id, name: req.user.name })

    if (existing) {
      db.prepare(`
        UPDATE schedules
        SET schedule = ?,
            last_modified_by = ?,
            updated_at = datetime('now', 'localtime')
        WHERE date = ?
      `).run(JSON.stringify(schedule), lastModifiedBy, date)
    } else {
      db.prepare(`
        INSERT INTO schedules (id, date, schedule, last_modified_by)
        VALUES (?, ?, ?, ?)
      `).run(date, date, JSON.stringify(schedule), lastModifiedBy)
    }

    const updated = db.prepare(`SELECT * FROM schedules WHERE date = ?`).get(date)
    db.close()

    await logAudit('SCHEDULE_UPDATE', req.user.id, req.user.name, 'schedules', date, {
      slotCount: Object.keys(schedule).length
    })

    res.json({
      id: updated.id,
      date: updated.date,
      schedule: JSON.parse(updated.schedule || '{}'),
      lastModifiedBy: JSON.parse(updated.last_modified_by || '{}'),
      updatedAt: updated.updated_at
    })

  } catch (error) {
    console.error('更新排程錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新排程失敗'
    })
  }
})

// ========================================
// 基礎排班總表 API
// ========================================

/**
 * GET /api/schedules/base/master
 * 取得主要排班總表
 */
router.get('/base/master', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    const masterSchedule = db.prepare(`
      SELECT * FROM base_schedules WHERE id = 'MASTER_SCHEDULE'
    `).get()

    db.close()

    if (!masterSchedule) {
      return res.json({
        id: 'MASTER_SCHEDULE',
        schedule: {}
      })
    }

    res.json({
      id: masterSchedule.id,
      schedule: JSON.parse(masterSchedule.schedule || '{}'),
      createdAt: masterSchedule.created_at,
      updatedAt: masterSchedule.updated_at
    })

  } catch (error) {
    console.error('取得排班總表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得排班總表失敗'
    })
  }
})

/**
 * PUT /api/schedules/base/master
 * 更新主要排班總表（並自動同步到未來 60 天排程）
 */
router.put('/base/master', ...isEditor, async (req, res) => {
  try {
    const { schedule } = req.body

    const db = getDatabase()

    // 先取得變更前的總表
    const beforeDoc = db.prepare(`
      SELECT schedule FROM base_schedules WHERE id = 'MASTER_SCHEDULE'
    `).get()
    const beforeRules = beforeDoc ? JSON.parse(beforeDoc.schedule || '{}') : {}

    // 更新總表
    db.prepare(`
      INSERT INTO base_schedules (id, schedule, updated_at)
      VALUES ('MASTER_SCHEDULE', ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        schedule = excluded.schedule,
        updated_at = datetime('now', 'localtime')
    `).run(JSON.stringify(schedule))

    const updated = db.prepare(`
      SELECT * FROM base_schedules WHERE id = 'MASTER_SCHEDULE'
    `).get()

    db.close()

    await logAudit('BASE_SCHEDULE_UPDATE', req.user.id, req.user.name, 'base_schedules', 'MASTER_SCHEDULE', {
      patientCount: Object.keys(schedule).length
    })

    // 🔥 同步到未來 60 天排程（非同步執行，不阻塞回應）
    const modifiedBy = { uid: req.user.id, name: req.user.name }
    syncMasterScheduleToFuture(beforeRules, schedule, modifiedBy)
      .then(result => {
        console.log('📅 [MasterSchedule] 同步完成:', result.message)
      })
      .catch(err => {
        console.error('❌ [MasterSchedule] 同步失敗:', err.message)
      })

    res.json({
      id: updated.id,
      schedule: JSON.parse(updated.schedule || '{}'),
      updatedAt: updated.updated_at
    })

  } catch (error) {
    console.error('更新排班總表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新排班總表失敗'
    })
  }
})

/**
 * PATCH /api/schedules/base/master/patient/:patientId
 * 更新單一病人的排班規則（並自動同步到未來 60 天排程）
 */
router.patch('/base/master/patient/:patientId', ...isEditor, async (req, res) => {
  try {
    const { patientId } = req.params
    const rule = req.body

    const db = getDatabase()

    // 取得目前的總表（變更前）
    const current = db.prepare(`
      SELECT schedule FROM base_schedules WHERE id = 'MASTER_SCHEDULE'
    `).get()

    const beforeRules = current ? JSON.parse(current.schedule || '{}') : {}
    const schedule = { ...beforeRules }

    // 更新或刪除規則
    if (rule && Object.keys(rule).length > 0) {
      schedule[patientId] = rule
    } else {
      delete schedule[patientId]
    }

    // 儲存更新
    db.prepare(`
      UPDATE base_schedules
      SET schedule = ?, updated_at = datetime('now', 'localtime')
      WHERE id = 'MASTER_SCHEDULE'
    `).run(JSON.stringify(schedule))

    db.close()

    await logAudit('PATIENT_SCHEDULE_RULE_UPDATE', req.user.id, req.user.name, 'base_schedules', patientId, rule)

    // 🔥 同步到未來 60 天排程（非同步執行）
    const modifiedBy = { uid: req.user.id, name: req.user.name }
    syncMasterScheduleToFuture(beforeRules, schedule, modifiedBy)
      .then(result => {
        console.log('📅 [PatientRule] 同步完成:', result.message)
      })
      .catch(err => {
        console.error('❌ [PatientRule] 同步失敗:', err.message)
      })

    res.json({
      success: true,
      patientId,
      rule: schedule[patientId] || null
    })

  } catch (error) {
    console.error('更新病人排班規則錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新病人排班規則失敗'
    })
  }
})

/**
 * POST /api/schedules/sync/initialize
 * 手動初始化未來 60 天排程（用於首次設定或重建）
 */
router.post('/sync/initialize', ...isEditor, async (req, res) => {
  try {
    const modifiedBy = { uid: req.user.id, name: req.user.name }
    const result = await initializeFutureSchedules(modifiedBy)

    await logAudit('SCHEDULE_INITIALIZE', req.user.id, req.user.name, 'schedules', 'future_60_days', {
      createdCount: result.createdCount
    })

    res.json(result)

  } catch (error) {
    console.error('初始化排程錯誤:', error)
    res.status(500).json({
      error: true,
      message: '初始化排程失敗'
    })
  }
})

// ========================================
// 調班申請 API
// ========================================

/**
 * GET /api/schedules/exceptions
 * 取得調班申請列表
 */
router.get('/exceptions/list', authenticate, (req, res) => {
  try {
    const { status, patientId, startDate, endDate } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM schedule_exceptions WHERE 1=1'
    const params = []

    if (status) {
      const statuses = status.split(',')
      query += ` AND status IN (${statuses.map(() => '?').join(',')})`
      params.push(...statuses)
    }

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    if (startDate) {
      query += ' AND (date >= ? OR start_date >= ?)'
      params.push(startDate, startDate)
    }

    if (endDate) {
      query += ' AND (date <= ? OR end_date <= ?)'
      params.push(endDate, endDate)
    }

    query += ' ORDER BY created_at DESC'

    const exceptions = db.prepare(query).all(...params)
    db.close()

    res.json(exceptions.map(e => ({
      id: e.id,
      type: e.type,
      status: e.status,
      patientId: e.patient_id,
      patientName: e.patient_name,
      from: JSON.parse(e.from_data || '{}'),
      to: JSON.parse(e.to_data || '{}'),
      patient1: JSON.parse(e.patient1 || '{}'),
      patient2: JSON.parse(e.patient2 || '{}'),
      startDate: e.start_date,
      endDate: e.end_date,
      date: e.date,
      reason: e.reason,
      cancelReason: e.cancel_reason,
      errorMessage: e.error_message,
      createdBy: JSON.parse(e.created_by || '{}'),
      cancelledAt: e.cancelled_at,
      createdAt: e.created_at,
      updatedAt: e.updated_at
    })))

  } catch (error) {
    console.error('取得調班申請錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得調班申請失敗'
    })
  }
})

/**
 * POST /api/schedules/exceptions
 * 建立調班申請
 */
router.post('/exceptions', ...isEditor, async (req, res) => {
  try {
    const data = req.body
    const id = uuidv4()

    const db = getDatabase()

    db.prepare(`
      INSERT INTO schedule_exceptions (
        id, type, status, patient_id, patient_name,
        from_data, to_data, patient1, patient2,
        start_date, end_date, date, reason, created_by
      ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.type,
      data.patientId || null,
      data.patientName || null,
      JSON.stringify(data.from || {}),
      JSON.stringify(data.to || {}),
      JSON.stringify(data.patient1 || {}),
      JSON.stringify(data.patient2 || {}),
      data.startDate || null,
      data.endDate || null,
      data.date || null,
      data.reason || null,
      JSON.stringify({ uid: req.user.id, name: req.user.name })
    )

    const created = db.prepare(`SELECT * FROM schedule_exceptions WHERE id = ?`).get(id)
    db.close()

    await logAudit('EXCEPTION_CREATE', req.user.id, req.user.name, 'schedule_exceptions', id, {
      type: data.type,
      patientName: data.patientName
    })

    res.status(201).json({
      id: created.id,
      type: created.type,
      status: created.status,
      createdAt: created.created_at
    })

  } catch (error) {
    console.error('建立調班申請錯誤:', error)
    res.status(500).json({
      error: true,
      message: '建立調班申請失敗'
    })
  }
})

/**
 * PATCH /api/schedules/exceptions/:id
 * 更新調班申請狀態
 */
router.patch('/exceptions/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const { status, cancelReason, errorMessage } = req.body

    const db = getDatabase()

    const existing = db.prepare(`SELECT * FROM schedule_exceptions WHERE id = ?`).get(id)

    if (!existing) {
      db.close()
      return res.status(404).json({
        error: true,
        message: '調班申請不存在'
      })
    }

    const updates = ["updated_at = datetime('now', 'localtime')"]
    const params = []

    if (status) {
      updates.push('status = ?')
      params.push(status)
    }

    if (cancelReason) {
      updates.push('cancel_reason = ?')
      params.push(cancelReason)
    }

    if (errorMessage) {
      updates.push('error_message = ?')
      params.push(errorMessage)
    }

    if (status === 'cancelled') {
      updates.push("cancelled_at = datetime('now', 'localtime')")
    }

    params.push(id)

    db.prepare(`UPDATE schedule_exceptions SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    db.close()

    await logAudit('EXCEPTION_UPDATE', req.user.id, req.user.name, 'schedule_exceptions', id, {
      newStatus: status
    })

    res.json({
      success: true,
      message: '調班申請已更新'
    })

  } catch (error) {
    console.error('更新調班申請錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新調班申請失敗'
    })
  }
})

/**
 * DELETE /api/schedules/exceptions/:id
 * 刪除調班申請
 */
router.delete('/exceptions/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const result = db.prepare(`DELETE FROM schedule_exceptions WHERE id = ?`).run(id)
    db.close()

    if (result.changes === 0) {
      return res.status(404).json({
        error: true,
        message: '調班申請不存在'
      })
    }

    await logAudit('EXCEPTION_DELETE', req.user.id, req.user.name, 'schedule_exceptions', id, {})

    res.json({
      success: true,
      message: '調班申請已刪除'
    })

  } catch (error) {
    console.error('刪除調班申請錯誤:', error)
    res.status(500).json({
      error: true,
      message: '刪除調班申請失敗'
    })
  }
})

// ========================================
// 護理人員分配 API
// ========================================

/**
 * GET /api/schedules/nurse-assignments/:date
 * 取得特定日期的護理人員分配
 */
router.get('/nurse-assignments/:date', authenticate, (req, res) => {
  try {
    const { date } = req.params
    const db = getDatabase()

    const assignment = db.prepare(`
      SELECT * FROM nurse_assignments WHERE date = ?
    `).get(date)

    db.close()

    if (!assignment) {
      return res.json({
        id: date,
        date,
        teams: {}
      })
    }

    res.json({
      id: assignment.id,
      date: assignment.date,
      teams: JSON.parse(assignment.teams || '{}'),
      createdAt: assignment.created_at,
      updatedAt: assignment.updated_at
    })

  } catch (error) {
    console.error('取得護理分配錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得護理分配失敗'
    })
  }
})

/**
 * PUT /api/schedules/nurse-assignments/:date
 * 更新護理人員分配
 */
router.put('/nurse-assignments/:date', ...isEditor, async (req, res) => {
  try {
    const { date } = req.params
    const { teams } = req.body

    const db = getDatabase()

    db.prepare(`
      INSERT INTO nurse_assignments (id, date, teams, updated_at)
      VALUES (?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(date) DO UPDATE SET
        teams = excluded.teams,
        updated_at = datetime('now', 'localtime')
    `).run(date, date, JSON.stringify(teams))

    db.close()

    res.json({
      success: true,
      date,
      teams
    })

  } catch (error) {
    console.error('更新護理分配錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新護理分配失敗'
    })
  }
})

export default router
