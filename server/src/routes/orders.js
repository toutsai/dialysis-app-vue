// 醫囑與相關資料路由
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../db/init.js'
import { authenticate, isContributor, isEditor, logAudit } from '../middleware/auth.js'

const router = Router()

// ========================================
// 透析醫囑歷史 API
// ========================================

/**
 * GET /api/orders/history
 * 取得透析醫囑歷史
 */
router.get('/history', authenticate, (req, res) => {
  try {
    const { patientId } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM dialysis_orders_history'
    const params = []

    if (patientId) {
      query += ' WHERE patient_id = ?'
      params.push(patientId)
    }

    query += ' ORDER BY created_at DESC'

    const history = db.prepare(query).all(...params)
    db.close()

    res.json(history.map(h => ({
      id: h.id,
      patientId: h.patient_id,
      patientName: h.patient_name,
      operationType: h.operation_type,
      orders: JSON.parse(h.orders || '{}'),
      createdAt: h.created_at,
      updatedAt: h.updated_at
    })))

  } catch (error) {
    console.error('取得醫囑歷史錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得醫囑歷史失敗'
    })
  }
})

/**
 * POST /api/orders/history
 * 新增透析醫囑記錄
 */
router.post('/history', ...isContributor, async (req, res) => {
  try {
    const { patientId, patientName, operationType, orders } = req.body

    if (!patientId) {
      return res.status(400).json({
        error: true,
        message: '病人 ID 為必填'
      })
    }

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO dialysis_orders_history (id, patient_id, patient_name, operation_type, orders)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, patientId, patientName || '', operationType || 'CREATE', JSON.stringify(orders || {}))

    // 同時更新病人的當前醫囑
    db.prepare(`
      UPDATE patients
      SET dialysis_orders = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(JSON.stringify(orders || {}), patientId)

    db.close()

    await logAudit('DIALYSIS_ORDER_CREATE', req.user.id, req.user.name, 'dialysis_orders_history', id, {
      patientId,
      patientName
    })

    res.status(201).json({
      id,
      patientId,
      patientName,
      operationType,
      orders
    })

  } catch (error) {
    console.error('新增醫囑記錄錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增醫囑記錄失敗'
    })
  }
})

/**
 * DELETE /api/orders/history/:id
 * 刪除透析醫囑記錄
 */
router.delete('/history/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const result = db.prepare(`DELETE FROM dialysis_orders_history WHERE id = ?`).run(id)
    db.close()

    if (result.changes === 0) {
      return res.status(404).json({
        error: true,
        message: '醫囑記錄不存在'
      })
    }

    await logAudit('DIALYSIS_ORDER_DELETE', req.user.id, req.user.name, 'dialysis_orders_history', id, {})

    res.json({
      success: true,
      message: '醫囑記錄已刪除'
    })

  } catch (error) {
    console.error('刪除醫囑記錄錯誤:', error)
    res.status(500).json({
      error: true,
      message: '刪除醫囑記錄失敗'
    })
  }
})

// ========================================
// 藥物訂單 API
// ========================================

/**
 * GET /api/orders/medications
 * 取得藥物訂單列表
 */
router.get('/medications', authenticate, (req, res) => {
  try {
    const { patientId, status } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM medication_orders WHERE 1=1'
    const params = []

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    query += ' ORDER BY created_at DESC'

    const orders = db.prepare(query).all(...params)
    db.close()

    res.json(orders.map(o => ({
      id: o.id,
      patientId: o.patient_id,
      patientName: o.patient_name,
      medications: JSON.parse(o.medications || '[]'),
      status: o.status,
      orderDate: o.order_date,
      createdBy: JSON.parse(o.created_by || '{}'),
      createdAt: o.created_at,
      updatedAt: o.updated_at
    })))

  } catch (error) {
    console.error('取得藥物訂單錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得藥物訂單失敗'
    })
  }
})

/**
 * POST /api/orders/medications
 * 新增藥物訂單
 */
router.post('/medications', ...isContributor, async (req, res) => {
  try {
    const { patientId, patientName, medications, orderDate } = req.body

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO medication_orders (id, patient_id, patient_name, medications, order_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      patientId,
      patientName,
      JSON.stringify(medications || []),
      orderDate || new Date().toISOString().split('T')[0],
      JSON.stringify({ uid: req.user.id, name: req.user.name })
    )

    db.close()

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('新增藥物訂單錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增藥物訂單失敗'
    })
  }
})

// ========================================
// 檢驗報告 API
// ========================================

/**
 * GET /api/orders/lab-reports
 * 取得檢驗報告列表
 */
router.get('/lab-reports', authenticate, (req, res) => {
  try {
    const { patientId, startDate, endDate } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM lab_reports WHERE 1=1'
    const params = []

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    if (startDate) {
      query += ' AND report_date >= ?'
      params.push(startDate)
    }

    if (endDate) {
      query += ' AND report_date <= ?'
      params.push(endDate)
    }

    query += ' ORDER BY report_date DESC'

    const reports = db.prepare(query).all(...params)
    db.close()

    res.json(reports.map(r => ({
      id: r.id,
      patientId: r.patient_id,
      reportDate: r.report_date,
      reportType: r.report_type,
      results: JSON.parse(r.results || '{}'),
      filePath: r.file_path,
      uploadedBy: JSON.parse(r.uploaded_by || '{}'),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })))

  } catch (error) {
    console.error('取得檢驗報告錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得檢驗報告失敗'
    })
  }
})

/**
 * POST /api/orders/lab-reports
 * 新增檢驗報告
 */
router.post('/lab-reports', authenticate, async (req, res) => {
  try {
    const { patientId, reportDate, reportType, results } = req.body

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO lab_reports (id, patient_id, report_date, report_type, results, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      patientId,
      reportDate,
      reportType,
      JSON.stringify(results || {}),
      JSON.stringify({ uid: req.user.id, name: req.user.name })
    )

    db.close()

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('新增檢驗報告錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增檢驗報告失敗'
    })
  }
})

// ========================================
// 病情記錄 API
// ========================================

/**
 * GET /api/orders/condition-records
 * 取得病情記錄
 */
router.get('/condition-records', authenticate, (req, res) => {
  try {
    const { patientId, startDate, endDate, limit: queryLimit } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM condition_records WHERE 1=1'
    const params = []

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    if (startDate) {
      query += ' AND created_at >= ?'
      params.push(startDate)
    }

    if (endDate) {
      query += ' AND created_at <= ?'
      params.push(endDate)
    }

    query += ' ORDER BY record_date DESC, created_at DESC'

    if (queryLimit) {
      query += ' LIMIT ?'
      params.push(parseInt(queryLimit))
    }

    const records = db.prepare(query).all(...params)
    db.close()

    res.json(records.map(r => ({
      id: r.id,
      patientId: r.patient_id,
      recordDate: r.record_date,
      content: r.content,
      createdBy: JSON.parse(r.created_by || '{}'),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })))

  } catch (error) {
    console.error('取得病情記錄錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得病情記錄失敗'
    })
  }
})

/**
 * POST /api/orders/condition-records
 * 新增病情記錄
 */
router.post('/condition-records', ...isContributor, async (req, res) => {
  try {
    const { patientId, recordDate, content } = req.body

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO condition_records (id, patient_id, record_date, content, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      patientId,
      recordDate || new Date().toISOString().split('T')[0],
      content,
      JSON.stringify({ uid: req.user.id, name: req.user.name })
    )

    db.close()

    res.status(201).json({
      success: true,
      id
    })

  } catch (error) {
    console.error('新增病情記錄錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增病情記錄失敗'
    })
  }
})

export default router
