// 用藥管理路由
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../db/init.js'
import { authenticate, isEditor, logAudit } from '../middleware/auth.js'

const router = Router()

/**
 * 解析彈性日期格式
 */
function parseFlexibleDate(part, refDate) {
  // 嘗試解析 MM/DD 或 M/D 格式
  const slashMatch = part.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10)
    const day = parseInt(slashMatch[2], 10)
    const year = refDate.getFullYear()
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateStr
  }

  // 嘗試解析 YYYY-MM-DD 格式
  if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
    return part
  }

  return null
}

/**
 * POST /api/medications/daily-injections
 * 計算每日應打針劑
 */
router.post('/daily-injections', authenticate, async (req, res) => {
  try {
    const { targetDate, patientIds } = req.body

    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return res.status(400).json({
        error: true,
        message: '請提供有效的目標日期 (格式 YYYY-MM-DD)'
      })
    }

    if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
      return res.json([])
    }

    const db = getDatabase()

    // 步驟 1: 查詢這些病人的針劑藥囑
    // 使用 injection_orders 表（如果存在），否則使用 medication_orders
    let injectionOrders = []

    try {
      // 嘗試從 injection_orders 表查詢
      const placeholders = patientIds.map(() => '?').join(',')
      injectionOrders = db.prepare(`
        SELECT * FROM injection_orders
        WHERE patient_id IN (${placeholders})
        ORDER BY upload_month DESC, change_date DESC
      `).all(...patientIds)
    } catch (e) {
      // 如果表不存在，嘗試 medication_orders
      try {
        const placeholders = patientIds.map(() => '?').join(',')
        const orders = db.prepare(`
          SELECT * FROM medication_orders
          WHERE patient_id IN (${placeholders})
        `).all(...patientIds)

        // 將 medications JSON 展開
        for (const order of orders) {
          const meds = JSON.parse(order.medications || '[]')
          for (const med of meds) {
            if (med.orderType === 'injection') {
              injectionOrders.push({
                patient_id: order.patient_id,
                patient_name: order.patient_name,
                order_code: med.orderCode,
                order_name: med.orderName,
                dose: med.dose,
                note: med.note || '',
                change_date: med.changeDate || order.order_date,
                upload_month: med.uploadMonth
              })
            }
          }
        }
      } catch (e2) {
        console.log('[Medications] 無法找到針劑資料表')
      }
    }

    if (injectionOrders.length === 0) {
      db.close()
      return res.json([])
    }

    // 步驟 2: 聚合每個病人每個藥物的最新紀錄
    const patientLatestOrders = new Map()

    for (const order of injectionOrders) {
      const key = `${order.patient_id}-${order.order_code}`
      const existing = patientLatestOrders.get(key)

      if (!existing || new Date(order.change_date) > new Date(existing.change_date)) {
        patientLatestOrders.set(key, order)
      }
    }

    const patientHistory = Array.from(patientLatestOrders.values())

    // 步驟 3: 取得排班資料
    const schedule = db.prepare(`SELECT * FROM schedules WHERE date = ?`).get(targetDate)
    const scheduleData = schedule ? JSON.parse(schedule.schedule || '{}') : {}

    // 建立病人到床位/班次的映射
    const patientSlotMap = new Map()
    for (const shiftId in scheduleData) {
      const slot = scheduleData[shiftId]
      if (slot.patientId) {
        patientSlotMap.set(slot.patientId, {
          bedNum: shiftId.startsWith('peripheral')
            ? `外${shiftId.split('-')[1]}`
            : shiftId.split('-')[1],
          shift: shiftId.split('-')[2]
        })
      }
    }

    db.close()

    // 步驟 4: 計算應打針劑
    const finalInjectionList = []
    const dateObj = new Date(targetDate + 'T00:00:00Z')
    const targetDayOfWeek = dateObj.getUTCDay()

    for (const order of patientHistory) {
      const slotInfo = patientSlotMap.get(order.patient_id) || { bedNum: 'N/A', shift: 'N/A' }
      const note = (order.note || '').trim()
      let shouldAdminister = false
      let reason = ''

      // 解析備註中的頻率規則
      const noteParts = note.split(/\s+/).filter(Boolean)

      for (const part of noteParts) {
        if (part.toUpperCase().startsWith('QW')) {
          // 解析 QW 規則（如 QW135, QW3.6, QW3,6 等格式）
          const dayString = part.substring(2)
          if (dayString) {
            const days = []
            const matches = dayString.match(/[1-7]/g)
            if (matches) {
              matches.forEach(d => days.push(parseInt(d, 10)))
            }

            // 醫院系統：1=週一, 2=週二, ..., 7=週日
            const hospitalSystemDayOfWeek = targetDayOfWeek === 0 ? 7 : targetDayOfWeek

            if (days.includes(hospitalSystemDayOfWeek)) {
              shouldAdminister = true
              reason = `規則匹配: ${part}`
              break
            }
          }
        } else {
          // 檢查是否為日期
          const parsedDate = parseFlexibleDate(part, dateObj)
          if (parsedDate && parsedDate === targetDate) {
            shouldAdminister = true
            reason = `日期匹配: ${part}`
            break
          }
        }
      }

      if (shouldAdminister) {
        finalInjectionList.push({
          patientId: order.patient_id,
          patientName: order.patient_name,
          medicalRecordNumber: order.medical_record_number,
          bedNum: slotInfo.bedNum,
          shift: slotInfo.shift,
          orderCode: order.order_code,
          orderName: order.order_name,
          dose: order.dose,
          note: order.note,
          reason: reason,
          changeDate: order.change_date
        })
      }
    }

    // 步驟 5: 排序結果
    finalInjectionList.sort((a, b) => {
      const shiftOrder = { early: 1, noon: 2, late: 3, N: 98, A: 99 }
      const shiftA = a.shift || 'A'
      const shiftB = b.shift || 'A'

      if (shiftA !== shiftB) {
        return (shiftOrder[shiftA] || 99) - (shiftOrder[shiftB] || 99)
      }

      const bedA = String(a.bedNum).startsWith('外')
        ? 1000 + parseInt(String(a.bedNum).substring(1))
        : parseInt(a.bedNum)
      const bedB = String(b.bedNum).startsWith('外')
        ? 1000 + parseInt(String(b.bedNum).substring(1))
        : parseInt(b.bedNum)

      return bedA - bedB
    })

    console.log(`[Medications] 計算完成，找到 ${finalInjectionList.length} 筆應打針劑`)
    res.json(finalInjectionList)

  } catch (error) {
    console.error('計算每日應打針劑錯誤:', error)
    res.status(500).json({
      error: true,
      message: '計算每日應打針劑失敗'
    })
  }
})

/**
 * GET /api/medications/patient/:patientId
 * 取得特定病人的用藥列表
 */
router.get('/patient/:patientId', authenticate, (req, res) => {
  try {
    const { patientId } = req.params
    const db = getDatabase()

    const orders = db.prepare(`
      SELECT * FROM medication_orders
      WHERE patient_id = ?
      ORDER BY created_at DESC
    `).all(patientId)

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
    console.error('取得病人用藥錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得病人用藥失敗'
    })
  }
})

/**
 * POST /api/medications
 * 新增用藥記錄
 */
router.post('/', ...isEditor, async (req, res) => {
  try {
    const data = req.body
    const id = uuidv4()

    const db = getDatabase()

    db.prepare(`
      INSERT INTO medication_orders (id, patient_id, patient_name, medications, order_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.patientId,
      data.patientName || '',
      JSON.stringify(data.medications || []),
      data.orderDate || new Date().toISOString().split('T')[0],
      JSON.stringify({ uid: req.user.id, name: req.user.name })
    )

    const created = db.prepare(`SELECT * FROM medication_orders WHERE id = ?`).get(id)
    db.close()

    await logAudit('MEDICATION_CREATE', req.user.id, req.user.name, 'medication_orders', id, {
      patientId: data.patientId
    })

    res.status(201).json({
      id: created.id,
      patientId: created.patient_id,
      patientName: created.patient_name,
      medications: JSON.parse(created.medications || '[]'),
      createdAt: created.created_at
    })

  } catch (error) {
    console.error('新增用藥記錄錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增用藥記錄失敗'
    })
  }
})

/**
 * PUT /api/medications/:id
 * 更新用藥記錄
 */
router.put('/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const data = req.body

    const db = getDatabase()

    db.prepare(`
      UPDATE medication_orders
      SET medications = ?,
          status = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      JSON.stringify(data.medications || []),
      data.status || 'pending',
      id
    )

    db.close()

    await logAudit('MEDICATION_UPDATE', req.user.id, req.user.name, 'medication_orders', id, {})

    res.json({ success: true })

  } catch (error) {
    console.error('更新用藥記錄錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新用藥記錄失敗'
    })
  }
})

/**
 * DELETE /api/medications/:id
 * 刪除用藥記錄
 */
router.delete('/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const result = db.prepare(`DELETE FROM medication_orders WHERE id = ?`).run(id)
    db.close()

    if (result.changes === 0) {
      return res.status(404).json({
        error: true,
        message: '用藥記錄不存在'
      })
    }

    await logAudit('MEDICATION_DELETE', req.user.id, req.user.name, 'medication_orders', id, {})

    res.json({ success: true })

  } catch (error) {
    console.error('刪除用藥記錄錯誤:', error)
    res.status(500).json({
      error: true,
      message: '刪除用藥記錄失敗'
    })
  }
})

export default router
