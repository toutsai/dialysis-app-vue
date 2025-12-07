// 系統相關路由 (任務、通知、庫存、配置等)
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../db/init.js'
import { authenticate, isAdmin, isEditor, isContributor, logAudit } from '../middleware/auth.js'

const router = Router()

// ========================================
// 任務 API
// ========================================

/**
 * GET /api/system/tasks
 * 取得任務列表
 */
router.get('/tasks', authenticate, (req, res) => {
  try {
    const { status, assignedTo, category, patientId } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM tasks WHERE status != ?'
    const params = ['deleted']

    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    if (assignedTo) {
      query += ' AND assigned_to = ?'
      params.push(assignedTo)
    }

    if (category) {
      query += ' AND category = ?'
      params.push(category)
    }

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    query += ' ORDER BY created_at DESC'

    const tasks = db.prepare(query).all(...params)
    db.close()

    res.json(tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      content: t.content,
      status: t.status,
      priority: t.priority,
      category: t.category,
      type: t.type,
      patientId: t.patient_id,
      patientName: t.patient_name,
      targetDate: t.target_date,
      assignedTo: t.assigned_to,
      assignee: JSON.parse(t.assignee || '{}'),
      creator: JSON.parse(t.creator || t.created_by || '{}'),
      createdBy: JSON.parse(t.created_by || '{}'),
      resolvedBy: JSON.parse(t.resolved_by || '{}'),
      resolvedAt: t.resolved_at,
      dueDate: t.due_date,
      completedAt: t.completed_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at
    })))

  } catch (error) {
    console.error('取得任務列表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得任務列表失敗'
    })
  }
})

/**
 * POST /api/system/tasks
 * 新增任務
 */
router.post('/tasks', authenticate, async (req, res) => {
  try {
    const {
      id: providedId,
      title,
      description,
      content,
      priority,
      category,
      type,
      patientId,
      patientName,
      targetDate,
      assignedTo,
      assignee,
      dueDate
    } = req.body

    // 允許沒有 title，但內容相關的 task/message 需要有 content
    const id = providedId || uuidv4()
    const db = getDatabase()

    const creator = JSON.stringify({ uid: req.user.id, name: req.user.name })

    db.prepare(`
      INSERT INTO tasks (
        id, title, description, content, priority, category, type,
        patient_id, patient_name, target_date, assigned_to, assignee,
        due_date, creator, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title || '',
      description || '',
      content || '',
      priority || 'normal',
      category || 'task',
      type || '常規',
      patientId || null,
      patientName || null,
      targetDate || null,
      assignedTo || null,
      assignee ? JSON.stringify(assignee) : '{}',
      dueDate || null,
      creator,
      creator
    )

    db.close()

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('新增任務錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增任務失敗'
    })
  }
})

/**
 * PUT /api/system/tasks/:id
 * 更新任務
 */
router.put('/tasks/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const updateData = req.body

    const db = getDatabase()

    const updates = ["updated_at = datetime('now', 'localtime')"]
    const params = []

    // 支援所有可能的欄位更新
    if (updateData.title !== undefined) {
      updates.push('title = ?')
      params.push(updateData.title)
    }
    if (updateData.description !== undefined) {
      updates.push('description = ?')
      params.push(updateData.description)
    }
    if (updateData.content !== undefined) {
      updates.push('content = ?')
      params.push(updateData.content)
    }
    if (updateData.status !== undefined) {
      updates.push('status = ?')
      params.push(updateData.status)
      if (updateData.status === 'completed') {
        updates.push("completed_at = datetime('now', 'localtime')")
      }
    }
    if (updateData.priority !== undefined) {
      updates.push('priority = ?')
      params.push(updateData.priority)
    }
    if (updateData.assignedTo !== undefined) {
      updates.push('assigned_to = ?')
      params.push(typeof updateData.assignedTo === 'object' ? JSON.stringify(updateData.assignedTo) : updateData.assignedTo)
    }
    if (updateData.assignee !== undefined) {
      updates.push('assignee = ?')
      params.push(JSON.stringify(updateData.assignee))
    }
    if (updateData.dueDate !== undefined) {
      updates.push('due_date = ?')
      params.push(updateData.dueDate)
    }
    if (updateData.targetDate !== undefined) {
      updates.push('target_date = ?')
      params.push(updateData.targetDate)
    }
    if (updateData.resolvedBy !== undefined) {
      updates.push('resolved_by = ?')
      params.push(JSON.stringify(updateData.resolvedBy))
    }
    if (updateData.resolvedAt !== undefined) {
      updates.push('resolved_at = ?')
      params.push(updateData.resolvedAt)
    }
    if (updateData.patientId !== undefined) {
      updates.push('patient_id = ?')
      params.push(updateData.patientId)
    }
    if (updateData.patientName !== undefined) {
      updates.push('patient_name = ?')
      params.push(updateData.patientName)
    }
    if (updateData.category !== undefined) {
      updates.push('category = ?')
      params.push(updateData.category)
    }
    if (updateData.type !== undefined) {
      updates.push('type = ?')
      params.push(updateData.type)
    }

    params.push(id)

    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    db.close()

    res.json({
      success: true,
      message: '任務已更新'
    })

  } catch (error) {
    console.error('更新任務錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新任務失敗'
    })
  }
})

/**
 * DELETE /api/system/tasks/:id
 * 刪除任務
 */
router.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    // 使用軟刪除：將狀態設為 deleted
    db.prepare(`
      UPDATE tasks
      SET status = 'deleted', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(id)

    db.close()

    res.json({
      success: true,
      message: '任務已刪除'
    })

  } catch (error) {
    console.error('刪除任務錯誤:', error)
    res.status(500).json({
      error: true,
      message: '刪除任務失敗'
    })
  }
})

// ========================================
// 通知 API
// ========================================

/**
 * GET /api/system/notifications
 * 取得通知列表
 */
router.get('/notifications', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE recipient_id = ? OR recipient_id IS NULL
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.user.id)

    db.close()

    res.json(notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      recipientId: n.recipient_id,
      isRead: n.is_read === 1,
      data: JSON.parse(n.data || '{}'),
      createdAt: n.created_at
    })))

  } catch (error) {
    console.error('取得通知錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得通知失敗'
    })
  }
})

/**
 * POST /api/system/notifications
 * 建立通知
 */
router.post('/notifications', authenticate, async (req, res) => {
  try {
    const { type, title, message, recipientId, data } = req.body

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO notifications (id, type, title, message, recipient_id, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      type || 'info',
      title || '',
      message || '',
      recipientId || null,
      JSON.stringify(data || {})
    )

    db.close()

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('建立通知錯誤:', error)
    res.status(500).json({
      error: true,
      message: '建立通知失敗'
    })
  }
})

/**
 * PATCH /api/system/notifications/:id/read
 * 標記通知為已讀
 */
router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(id)
    db.close()

    res.json({
      success: true
    })

  } catch (error) {
    console.error('更新通知錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新通知失敗'
    })
  }
})

// ========================================
// 庫存 API
// ========================================

/**
 * GET /api/system/inventory
 * 取得庫存列表
 */
router.get('/inventory', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    const items = db.prepare(`SELECT * FROM inventory_items ORDER BY name`).all()
    db.close()

    res.json(items.map(i => ({
      id: i.id,
      name: i.name,
      category: i.category,
      unit: i.unit,
      currentQuantity: i.current_quantity,
      minQuantity: i.min_quantity,
      location: i.location,
      notes: i.notes,
      createdAt: i.created_at,
      updatedAt: i.updated_at
    })))

  } catch (error) {
    console.error('取得庫存錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得庫存失敗'
    })
  }
})

/**
 * POST /api/system/inventory
 * 新增庫存項目
 */
router.post('/inventory', authenticate, async (req, res) => {
  try {
    const { name, category, unit, currentQuantity, minQuantity, location, notes } = req.body

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO inventory_items (id, name, category, unit, current_quantity, min_quantity, location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, category, unit, currentQuantity || 0, minQuantity || 0, location, notes)

    db.close()

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('新增庫存錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增庫存失敗'
    })
  }
})

/**
 * PUT /api/system/inventory/:id
 * 更新庫存項目
 */
router.put('/inventory/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const { name, category, unit, currentQuantity, minQuantity, location, notes } = req.body

    const db = getDatabase()

    db.prepare(`
      UPDATE inventory_items
      SET name = ?, category = ?, unit = ?, current_quantity = ?, min_quantity = ?, location = ?, notes = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(name, category, unit, currentQuantity, minQuantity, location, notes, id)

    db.close()

    res.json({
      success: true,
      message: '庫存已更新'
    })

  } catch (error) {
    console.error('更新庫存錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新庫存失敗'
    })
  }
})

// ========================================
// 站點配置 API
// ========================================

/**
 * GET /api/system/site-config/:id
 * 取得站點配置
 */
router.get('/site-config/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const config = db.prepare(`SELECT * FROM site_config WHERE id = ?`).get(id)
    db.close()

    if (!config) {
      return res.json({
        id,
        configData: {}
      })
    }

    res.json({
      id: config.id,
      configData: JSON.parse(config.config_data || '{}'),
      createdAt: config.created_at,
      updatedAt: config.updated_at
    })

  } catch (error) {
    console.error('取得站點配置錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得站點配置失敗'
    })
  }
})

/**
 * PUT /api/system/site-config/:id
 * 更新站點配置
 */
router.put('/site-config/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const configData = req.body

    const db = getDatabase()

    db.prepare(`
      INSERT INTO site_config (id, config_data, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        config_data = excluded.config_data,
        updated_at = datetime('now', 'localtime')
    `).run(id, JSON.stringify(configData))

    db.close()

    res.json({
      success: true,
      message: '站點配置已更新'
    })

  } catch (error) {
    console.error('更新站點配置錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新站點配置失敗'
    })
  }
})

// ========================================
// 稽核日誌 API (僅管理員)
// ========================================

/**
 * GET /api/system/audit-logs
 * 取得稽核日誌
 */
router.get('/audit-logs', ...isAdmin, (req, res) => {
  try {
    const { action, userId, startDate, endDate, limit = 100 } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM audit_logs WHERE 1=1'
    const params = []

    if (action) {
      query += ' AND action = ?'
      params.push(action)
    }

    if (userId) {
      query += ' AND user_id = ?'
      params.push(userId)
    }

    if (startDate) {
      query += ' AND created_at >= ?'
      params.push(startDate)
    }

    if (endDate) {
      query += ' AND created_at <= ?'
      params.push(endDate)
    }

    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(parseInt(limit))

    const logs = db.prepare(query).all(...params)
    db.close()

    res.json(logs.map(l => ({
      id: l.id,
      action: l.action,
      userId: l.user_id,
      userName: l.user_name,
      collection: l.collection_name,
      documentId: l.document_id,
      details: JSON.parse(l.details || '{}'),
      ipAddress: l.ip_address,
      success: l.success === 1,
      createdAt: l.created_at
    })))

  } catch (error) {
    console.error('取得稽核日誌錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得稽核日誌失敗'
    })
  }
})

// ========================================
// 醫師相關 API
// ========================================

/**
 * GET /api/system/physicians
 * 取得醫師列表 (從 physicians 表)
 */
router.get('/physicians', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    const physicians = db.prepare(`SELECT * FROM physicians WHERE is_active = 1 ORDER BY name`).all()
    db.close()

    res.json(physicians.map(p => ({
      id: p.id,
      name: p.name,
      specialty: p.specialty,
      staffId: p.staff_id,
      phone: p.phone,
      clinicHours: JSON.parse(p.clinic_hours || '[]'),
      defaultSchedules: JSON.parse(p.default_schedules || '[]'),
      defaultConsultationSchedules: JSON.parse(p.default_consultation_schedules || '[]'),
      isActive: p.is_active === 1,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    })))

  } catch (error) {
    console.error('取得醫師列表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得醫師列表失敗'
    })
  }
})

/**
 * POST /api/system/physicians
 * 新增醫師
 */
router.post('/physicians', ...isAdmin, async (req, res) => {
  try {
    const { name, specialty } = req.body

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO physicians (id, name, specialty)
      VALUES (?, ?, ?)
    `).run(id, name, specialty)

    db.close()

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('新增醫師錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增醫師失敗'
    })
  }
})

// ========================================
// 醫師班表 API
// ========================================

/**
 * GET /api/system/physician-schedules/:date
 * 取得特定日期的醫師班表
 */
router.get('/physician-schedules/:date', authenticate, (req, res) => {
  try {
    const { date } = req.params
    const db = getDatabase()

    const schedule = db.prepare(`
      SELECT * FROM physician_schedules WHERE id = ?
    `).get(date)

    db.close()

    if (!schedule) {
      return res.json({
        id: date,
        scheduleData: {},
        createdAt: null,
        updatedAt: null
      })
    }

    res.json({
      id: schedule.id,
      scheduleData: JSON.parse(schedule.schedule_data || '{}'),
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at
    })

  } catch (error) {
    console.error('取得醫師班表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得醫師班表失敗'
    })
  }
})

/**
 * PUT /api/system/physician-schedules/:date
 * 更新特定日期的醫師班表
 */
router.put('/physician-schedules/:date', ...isEditor, async (req, res) => {
  try {
    const { date } = req.params
    const scheduleData = req.body

    const db = getDatabase()

    db.prepare(`
      INSERT INTO physician_schedules (id, schedule_data, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        schedule_data = excluded.schedule_data,
        updated_at = datetime('now', 'localtime')
    `).run(date, JSON.stringify(scheduleData))

    const updated = db.prepare(`
      SELECT * FROM physician_schedules WHERE id = ?
    `).get(date)

    db.close()

    await logAudit('PHYSICIAN_SCHEDULE_UPDATE', req.user.id, req.user.name, 'physician_schedules', date, scheduleData)

    res.json({
      success: true,
      id: updated.id,
      scheduleData: JSON.parse(updated.schedule_data || '{}'),
      updatedAt: updated.updated_at
    })

  } catch (error) {
    console.error('更新醫師班表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新醫師班表失敗'
    })
  }
})

// ========================================
// 預約變更 API
// ========================================

/**
 * GET /api/system/scheduled-updates
 * 取得預約變更列表
 */
router.get('/scheduled-updates', authenticate, (req, res) => {
  try {
    const { status, patientId } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM scheduled_patient_updates WHERE 1=1'
    const params = []

    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    query += ' ORDER BY effective_date ASC, created_at DESC'

    const updates = db.prepare(query).all(...params)
    db.close()

    res.json(updates.map(u => ({
      id: u.id,
      patientId: u.patient_id,
      patientName: u.patient_name,
      changeType: u.change_type,
      changeData: JSON.parse(u.change_data || '{}'),
      effectiveDate: u.effective_date,
      status: u.status,
      createdBy: JSON.parse(u.created_by || '{}'),
      createdAt: u.created_at,
      processedAt: u.processed_at
    })))

  } catch (error) {
    console.error('取得預約變更列表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得預約變更列表失敗'
    })
  }
})

/**
 * POST /api/system/scheduled-updates
 * 建立預約變更
 */
router.post('/scheduled-updates', ...isContributor, async (req, res) => {
  try {
    const {
      patientId,
      patientName,
      changeType,
      changeData,
      effectiveDate,
      notes
    } = req.body

    const id = uuidv4()
    const db = getDatabase()

    const createdBy = JSON.stringify({
      id: req.user.id,
      name: req.user.name
    })

    db.prepare(`
      INSERT INTO scheduled_patient_updates (
        id, patient_id, patient_name, change_type, change_data,
        effective_date, notes, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id, patientId, patientName, changeType,
      JSON.stringify(changeData || {}), effectiveDate, notes || '',
      createdBy
    )

    db.close()

    await logAudit('SCHEDULED_UPDATE_CREATE', req.user.id, req.user.name, 'scheduled_patient_updates', id, {
      patientId,
      changeType,
      effectiveDate
    })

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('建立預約變更錯誤:', error)
    res.status(500).json({
      error: true,
      message: '建立預約變更失敗'
    })
  }
})

/**
 * PUT /api/system/scheduled-updates/:id
 * 更新預約變更
 */
router.put('/scheduled-updates/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const {
      changeData,
      effectiveDate,
      notes
    } = req.body

    const db = getDatabase()

    const result = db.prepare(`
      UPDATE scheduled_patient_updates
      SET change_data = ?, effective_date = ?, notes = ?
      WHERE id = ? AND status = 'pending'
    `).run(
      JSON.stringify(changeData || {}),
      effectiveDate,
      notes || '',
      id
    )

    db.close()

    if (result.changes === 0) {
      return res.status(404).json({
        error: true,
        message: '找不到該預約變更或已被處理'
      })
    }

    await logAudit('SCHEDULED_UPDATE_MODIFY', req.user.id, req.user.name, 'scheduled_patient_updates', id, { changeData, effectiveDate })

    res.json({ success: true, id })

  } catch (error) {
    console.error('更新預約變更錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新預約變更失敗'
    })
  }
})

/**
 * DELETE /api/system/scheduled-updates/:id
 * 取消預約變更
 */
router.delete('/scheduled-updates/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const result = db.prepare(`
      UPDATE scheduled_patient_updates
      SET status = 'cancelled'
      WHERE id = ? AND status = 'pending'
    `).run(id)

    db.close()

    if (result.changes === 0) {
      return res.status(404).json({
        error: true,
        message: '找不到該預約變更或已被處理'
      })
    }

    await logAudit('SCHEDULED_UPDATE_CANCEL', req.user.id, req.user.name, 'scheduled_patient_updates', id, {})

    res.json({ success: true })

  } catch (error) {
    console.error('取消預約變更錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取消預約變更失敗'
    })
  }
})

// ========================================
// 資料備份 API
// ========================================

/**
 * POST /api/system/backup
 * 手動備份資料庫
 */
router.post('/backup', ...isAdmin, async (req, res) => {
  try {
    const { createBackup } = await import('../utils/backup.js')
    const backupFile = await createBackup('manual')

    await logAudit('DATABASE_BACKUP', req.user.id, req.user.name, 'system', null, {
      backupFile,
      type: 'manual'
    })

    res.json({
      success: true,
      message: '備份完成',
      backupFile
    })

  } catch (error) {
    console.error('備份錯誤:', error)
    res.status(500).json({
      error: true,
      message: '備份失敗'
    })
  }
})

/**
 * GET /api/system/backups
 * 取得備份列表
 */
router.get('/backups', ...isAdmin, (req, res) => {
  try {
    const db = getDatabase()

    const backups = db.prepare(`
      SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 50
    `).all()

    db.close()

    res.json(backups.map(b => ({
      id: b.id,
      backupFile: b.backup_file,
      backupType: b.backup_type,
      fileSize: b.file_size,
      createdAt: b.created_at
    })))

  } catch (error) {
    console.error('取得備份列表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得備份列表失敗'
    })
  }
})

export default router
