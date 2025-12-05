// 病人管理路由
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../db/init.js'
import { authenticate, isContributor, isEditor, logAudit } from '../middleware/auth.js'

const router = Router()

/**
 * 將資料庫記錄轉換為 API 回應格式
 */
function formatPatient(row) {
  return {
    id: row.id,
    medicalRecordNumber: row.medical_record_number,
    name: row.name,
    status: row.status,
    isDeleted: row.is_deleted === 1,
    deleteReason: row.delete_reason,
    dialysisOrders: JSON.parse(row.dialysis_orders || '{}'),
    birthDate: row.birth_date,
    gender: row.gender,
    idNumber: row.id_number,
    phone: row.phone,
    address: row.address,
    emergencyContact: row.emergency_contact,
    emergencyPhone: row.emergency_phone,
    physician: row.physician,
    firstDialysisDate: row.first_dialysis_date,
    vascAccess: row.vasc_access,
    accessCreationDate: row.access_creation_date,
    wardNumber: row.ward_number,
    bedNumber: row.bed_number,
    hospitalInfo: JSON.parse(row.hospital_info || '{}'),
    inpatientReason: row.inpatient_reason,
    dialysisReason: row.dialysis_reason,
    notes: row.notes,
    patientStatus: JSON.parse(row.patient_status || '{}'),
    isHepatitis: row.is_hepatitis === 1,
    scheduleRule: JSON.parse(row.schedule_rule || '{}'),
    lastModifiedBy: JSON.parse(row.last_modified_by || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * 將 API 請求資料轉換為資料庫格式
 */
function toDbFormat(data) {
  const result = {}

  if (data.medicalRecordNumber !== undefined) result.medical_record_number = data.medicalRecordNumber
  if (data.name !== undefined) result.name = data.name
  if (data.status !== undefined) result.status = data.status
  if (data.isDeleted !== undefined) result.is_deleted = data.isDeleted ? 1 : 0
  if (data.deleteReason !== undefined) result.delete_reason = data.deleteReason
  if (data.dialysisOrders !== undefined) result.dialysis_orders = JSON.stringify(data.dialysisOrders)
  if (data.birthDate !== undefined) result.birth_date = data.birthDate
  if (data.gender !== undefined) result.gender = data.gender
  if (data.idNumber !== undefined) result.id_number = data.idNumber
  if (data.phone !== undefined) result.phone = data.phone
  if (data.address !== undefined) result.address = data.address
  if (data.emergencyContact !== undefined) result.emergency_contact = data.emergencyContact
  if (data.emergencyPhone !== undefined) result.emergency_phone = data.emergencyPhone
  if (data.physician !== undefined) result.physician = data.physician
  if (data.firstDialysisDate !== undefined) result.first_dialysis_date = data.firstDialysisDate
  if (data.vascAccess !== undefined) result.vasc_access = data.vascAccess
  if (data.accessCreationDate !== undefined) result.access_creation_date = data.accessCreationDate
  if (data.wardNumber !== undefined) result.ward_number = data.wardNumber
  if (data.bedNumber !== undefined) result.bed_number = data.bedNumber
  if (data.hospitalInfo !== undefined) result.hospital_info = JSON.stringify(data.hospitalInfo)
  if (data.inpatientReason !== undefined) result.inpatient_reason = data.inpatientReason
  if (data.dialysisReason !== undefined) result.dialysis_reason = data.dialysisReason
  if (data.notes !== undefined) result.notes = data.notes
  if (data.patientStatus !== undefined) result.patient_status = JSON.stringify(data.patientStatus)
  if (data.isHepatitis !== undefined) result.is_hepatitis = data.isHepatitis ? 1 : 0
  if (data.scheduleRule !== undefined) result.schedule_rule = JSON.stringify(data.scheduleRule)
  if (data.lastModifiedBy !== undefined) result.last_modified_by = JSON.stringify(data.lastModifiedBy)

  return result
}

/**
 * GET /api/patients
 * 取得所有病人列表
 */
router.get('/', authenticate, (req, res) => {
  try {
    const db = getDatabase()
    const { includeDeleted } = req.query

    let query = 'SELECT * FROM patients'
    if (includeDeleted !== 'true') {
      query += ' WHERE is_deleted = 0'
    }
    query += ' ORDER BY name'

    const patients = db.prepare(query).all()
    db.close()

    res.json(patients.map(formatPatient))

  } catch (error) {
    console.error('取得病人列表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得病人列表失敗'
    })
  }
})

/**
 * GET /api/patients/with-rules
 * 取得所有病人（含排班規則）
 */
router.get('/with-rules', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    // 取得病人列表
    const patients = db.prepare(`
      SELECT * FROM patients WHERE is_deleted = 0 ORDER BY name
    `).all()

    // 取得總表規則
    const masterSchedule = db.prepare(`
      SELECT schedule FROM base_schedules WHERE id = 'MASTER_SCHEDULE'
    `).get()

    db.close()

    const masterRules = masterSchedule ? JSON.parse(masterSchedule.schedule || '{}') : {}

    // 合併規則到病人資料
    const patientsWithRules = patients.map(p => {
      const formatted = formatPatient(p)
      formatted.scheduleRule = masterRules[p.id] || null
      return formatted
    })

    res.json(patientsWithRules)

  } catch (error) {
    console.error('取得病人列表錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得病人列表失敗'
    })
  }
})

/**
 * GET /api/patients/history
 * 取得所有病人歷史記錄
 * 注意：此路由必須在 /:id 之前，否則會被 /:id 攔截
 */
router.get('/history', authenticate, (req, res) => {
  try {
    const db = getDatabase()

    const history = db.prepare(`
      SELECT * FROM patient_history
      ORDER BY timestamp DESC
      LIMIT 100
    `).all()

    db.close()

    res.json(history.map(h => ({
      id: h.id,
      patientId: h.patient_id,
      patientName: h.patient_name,
      eventType: h.event_type,
      eventDetails: JSON.parse(h.event_details || '{}'),
      snapshot: JSON.parse(h.snapshot || '{}'),
      timestamp: h.timestamp
    })))

  } catch (error) {
    console.error('取得所有病人歷史錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得病人歷史失敗'
    })
  }
})

/**
 * GET /api/patients/history/:patientId
 * 取得特定病人歷史記錄
 */
router.get('/history/:patientId', authenticate, (req, res) => {
  try {
    const { patientId } = req.params
    const db = getDatabase()

    const history = db.prepare(`
      SELECT * FROM patient_history
      WHERE patient_id = ?
      ORDER BY timestamp DESC
    `).all(patientId)

    db.close()

    res.json(history.map(h => ({
      id: h.id,
      patientId: h.patient_id,
      patientName: h.patient_name,
      eventType: h.event_type,
      eventDetails: JSON.parse(h.event_details || '{}'),
      snapshot: JSON.parse(h.snapshot || '{}'),
      timestamp: h.timestamp
    })))

  } catch (error) {
    console.error('取得病人歷史錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得病人歷史失敗'
    })
  }
})

/**
 * POST /api/patients/history
 * 建立病人歷史記錄
 */
router.post('/history', ...isContributor, async (req, res) => {
  try {
    const { patientId, changeType, changeData, notes, patientName } = req.body

    if (!patientId || !changeType) {
      return res.status(400).json({
        error: true,
        message: '缺少必要欄位：patientId, changeType'
      })
    }

    const db = getDatabase()

    // 取得病人名稱（如果沒有提供）
    let actualPatientName = patientName
    if (!actualPatientName) {
      const patient = db.prepare('SELECT name FROM patients WHERE id = ?').get(patientId)
      actualPatientName = patient?.name || '未知'
    }

    const id = `ph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO patient_history (id, patient_id, patient_name, event_type, event_details, snapshot, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      patientId,
      actualPatientName,
      changeType,
      JSON.stringify(changeData || {}),
      JSON.stringify({ notes: notes || '' }),
      now
    )

    db.close()

    res.json({
      success: true,
      id,
      message: '病人歷史記錄已建立'
    })

  } catch (error) {
    console.error('建立病人歷史記錄錯誤:', error)
    res.status(500).json({
      error: true,
      message: '建立病人歷史記錄失敗'
    })
  }
})

/**
 * GET /api/patients/:id
 * 取得單一病人
 */
router.get('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const patient = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id)
    db.close()

    if (!patient) {
      return res.status(404).json({
        error: true,
        message: '病人不存在'
      })
    }

    res.json(formatPatient(patient))

  } catch (error) {
    console.error('取得病人錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得病人資料失敗'
    })
  }
})

/**
 * POST /api/patients
 * 新增病人
 */
router.post('/', ...isContributor, async (req, res) => {
  try {
    const data = req.body

    // 驗證必填欄位
    if (!data.medicalRecordNumber || !data.name) {
      return res.status(400).json({
        error: true,
        message: '病歷號和姓名為必填'
      })
    }

    const db = getDatabase()

    // 檢查病歷號是否已存在
    const existing = db.prepare(`
      SELECT id FROM patients WHERE medical_record_number = ? AND is_deleted = 0
    `).get(data.medicalRecordNumber)

    if (existing) {
      db.close()
      return res.status(409).json({
        error: true,
        message: '此病歷號已存在'
      })
    }

    const id = data.id || uuidv4()
    const dbData = toDbFormat(data)
    dbData.last_modified_by = JSON.stringify({ uid: req.user.id, name: req.user.name })

    const columns = ['id', ...Object.keys(dbData)]
    const placeholders = columns.map(() => '?').join(', ')
    const values = [id, ...Object.values(dbData)]

    db.prepare(`
      INSERT INTO patients (${columns.join(', ')})
      VALUES (${placeholders})
    `).run(...values)

    const newPatient = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id)
    db.close()

    await logAudit('PATIENT_CREATE', req.user.id, req.user.name, 'patients', id, {
      medicalRecordNumber: data.medicalRecordNumber,
      name: data.name
    })

    res.status(201).json(formatPatient(newPatient))

  } catch (error) {
    console.error('新增病人錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增病人失敗'
    })
  }
})

/**
 * PUT /api/patients/:id
 * 更新病人
 */
router.put('/:id', ...isContributor, async (req, res) => {
  try {
    const { id } = req.params
    const data = req.body

    const db = getDatabase()

    // 檢查病人是否存在
    const existing = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id)

    if (!existing) {
      db.close()
      return res.status(404).json({
        error: true,
        message: '病人不存在'
      })
    }

    const dbData = toDbFormat(data)
    dbData.last_modified_by = JSON.stringify({ uid: req.user.id, name: req.user.name })
    dbData.updated_at = "datetime('now', 'localtime')"

    const updates = Object.keys(dbData).map(k => {
      if (k === 'updated_at') return `${k} = datetime('now', 'localtime')`
      return `${k} = ?`
    }).join(', ')

    const values = Object.entries(dbData)
      .filter(([k]) => k !== 'updated_at')
      .map(([, v]) => v)

    db.prepare(`UPDATE patients SET ${updates} WHERE id = ?`).run(...values, id)

    const updated = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id)
    db.close()

    await logAudit('PATIENT_UPDATE', req.user.id, req.user.name, 'patients', id, {
      updatedFields: Object.keys(data)
    })

    res.json(formatPatient(updated))

  } catch (error) {
    console.error('更新病人錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新病人失敗'
    })
  }
})

/**
 * DELETE /api/patients/:id
 * 軟刪除病人
 */
router.delete('/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const db = getDatabase()

    const existing = db.prepare(`SELECT * FROM patients WHERE id = ? AND is_deleted = 0`).get(id)

    if (!existing) {
      db.close()
      return res.status(404).json({
        error: true,
        message: '病人不存在'
      })
    }

    db.prepare(`
      UPDATE patients
      SET is_deleted = 1,
          delete_reason = ?,
          last_modified_by = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      reason || '未提供原因',
      JSON.stringify({ uid: req.user.id, name: req.user.name }),
      id
    )

    db.close()

    await logAudit('PATIENT_DELETE', req.user.id, req.user.name, 'patients', id, {
      name: existing.name,
      reason
    })

    res.json({
      success: true,
      message: '病人已刪除'
    })

  } catch (error) {
    console.error('刪除病人錯誤:', error)
    res.status(500).json({
      error: true,
      message: '刪除病人失敗'
    })
  }
})

/**
 * POST /api/patients/:id/restore
 * 復原已刪除的病人
 */
router.post('/:id/restore', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const db = getDatabase()

    const existing = db.prepare(`SELECT * FROM patients WHERE id = ? AND is_deleted = 1`).get(id)

    if (!existing) {
      db.close()
      return res.status(404).json({
        error: true,
        message: '找不到已刪除的病人'
      })
    }

    db.prepare(`
      UPDATE patients
      SET is_deleted = 0,
          delete_reason = NULL,
          status = ?,
          last_modified_by = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      status || 'opd',
      JSON.stringify({ uid: req.user.id, name: req.user.name }),
      id
    )

    const restored = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id)
    db.close()

    await logAudit('PATIENT_RESTORE', req.user.id, req.user.name, 'patients', id, {
      name: existing.name,
      restoredTo: status || 'opd'
    })

    res.json(formatPatient(restored))

  } catch (error) {
    console.error('復原病人錯誤:', error)
    res.status(500).json({
      error: true,
      message: '復原病人失敗'
    })
  }
})

export default router
