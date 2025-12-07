// 醫囑與相關資料路由
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import XLSX from 'xlsx'
import { getDatabase } from '../db/init.js'
import { authenticate, isContributor, isEditor, logAudit } from '../middleware/auth.js'

const router = Router()

// ========================================
// Excel 檔案處理工具函式
// ========================================

/**
 * 取得台北時間今天的 YYYY-MM 格式
 */
function getTaipeiMonthString() {
  const now = new Date()
  return now.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
  }).replace(/\//g, '-')
}

/**
 * 檢驗報告項目對應表
 */
const LAB_ITEM_MAPPING = {
  '白血球': 'WBC',
  '紅血球': 'RBC',
  '血色素': 'Hb',
  '血球容積比': 'Hct',
  '平均紅血球容積': 'MCV',
  '平均紅血球血紅素量': 'MCH',
  '平均紅血球血紅素濃度': 'MCHC',
  '血小板': 'Platelet',
  '總膽固醇(血)': 'Cholesterol',
  'BUN(Blood)': 'BUN',
  '三酸甘油酯(血)': 'Triglyceride',
  '飯前血糖': 'GlucoseAC',
  'Calcium(Blood)': 'Ca',
  '磷': 'P',
  'Uric Acid (B)': 'UricAcid',
  'eGFR': 'eGFR',
  '肌酐、血(洗腎專用)': 'Creatinine',
  '血中鈉': 'Na',
  '血中鉀': 'K',
  '總鐵結合能力TIBC': 'TIBC',
  'Iron': 'Iron',
  '白蛋白(BCG法)': 'Albumin',
  '總蛋白(血)': 'TotalProtein',
  '高密度脂蛋白': 'HDL',
  '低密度脂蛋白': 'LDL',
  '副甲狀腺素': 'iPTH',
  '血中尿素氮(洗後專用)': 'PostBUN',
  '鐵蛋白': 'Ferritin',
  '丙胺酸轉胺酶': 'ALT',
}

/**
 * 口服藥物代碼列表
 */
const ORAL_MED_CODES = ['OALK1', 'OCAA', 'OCAL1', 'OFOS4', 'OUCA1', 'OVAF', 'OORK']

/**
 * 針劑藥物代碼列表
 */
const INJECTION_MED_CODES = ['INES2', 'IPAR1', 'ICAC', 'IFER2', 'IREC1']

/**
 * 確保資料表存在
 */
function ensureTablesExist(db) {
  // 確保 injection_orders 表存在 (用於 Excel 匯入的藥囑記錄)
  db.exec(`
    CREATE TABLE IF NOT EXISTS injection_orders (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      patient_name TEXT,
      medical_record_number TEXT,
      order_code TEXT,
      order_name TEXT,
      change_date TEXT,
      upload_month TEXT,
      dose TEXT,
      frequency TEXT,
      note TEXT,
      action TEXT DEFAULT 'MODIFY',
      order_type TEXT,
      source_file TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_injection_orders_patient ON injection_orders(patient_id);
    CREATE INDEX IF NOT EXISTS idx_injection_orders_month ON injection_orders(upload_month);
    CREATE INDEX IF NOT EXISTS idx_injection_orders_type ON injection_orders(order_type);
  `)

  // 確保 consumables_reports 有 patient_id 欄位
  const tableInfo = db.prepare(`PRAGMA table_info(consumables_reports)`).all()
  const hasPatientId = tableInfo.some(col => col.name === 'patient_id')
  if (!hasPatientId) {
    db.exec(`
      ALTER TABLE consumables_reports ADD COLUMN patient_id TEXT;
      ALTER TABLE consumables_reports ADD COLUMN patient_name TEXT;
      ALTER TABLE consumables_reports ADD COLUMN medical_record_number TEXT;
      ALTER TABLE consumables_reports ADD COLUMN source_file TEXT;
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_consumables_patient ON consumables_reports(patient_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_consumables_date ON consumables_reports(report_date)`)
  }
}

// ========================================
// 透析醫囑歷史 API
// ========================================

/**
 * GET /api/orders/history
 * 取得透析醫囑歷史
 */
router.get('/history', authenticate, (req, res) => {
  try {
    const { patientId, effectiveDateBefore, limit: queryLimit } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM dialysis_orders_history WHERE 1=1'
    const params = []

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    // 支援篩選 effectiveDate <= 指定日期
    if (effectiveDateBefore) {
      query += ` AND json_extract(orders, '$.effectiveDate') <= ?`
      params.push(effectiveDateBefore)
    }

    query += ' ORDER BY created_at DESC'

    if (queryLimit) {
      query += ' LIMIT ?'
      params.push(parseInt(queryLimit))
    }

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

/**
 * PUT /api/orders/medications/:id
 * 更新藥物訂單
 */
router.put('/medications/:id', ...isContributor, async (req, res) => {
  try {
    const { id } = req.params
    const { medications, status, orderDate } = req.body
    const db = getDatabase()

    const updates = []
    const params = []

    if (medications !== undefined) {
      updates.push('medications = ?')
      params.push(JSON.stringify(medications))
    }

    if (status !== undefined) {
      updates.push('status = ?')
      params.push(status)
    }

    if (orderDate !== undefined) {
      updates.push('order_date = ?')
      params.push(orderDate)
    }

    updates.push("updated_at = datetime('now', 'localtime')")
    params.push(id)

    const query = `UPDATE medication_orders SET ${updates.join(', ')} WHERE id = ?`
    const result = db.prepare(query).run(...params)
    db.close()

    if (result.changes === 0) {
      return res.status(404).json({
        error: true,
        message: '藥物訂單不存在'
      })
    }

    res.json({
      success: true,
      message: '藥物訂單已更新'
    })

  } catch (error) {
    console.error('更新藥物訂單錯誤:', error)
    res.status(500).json({
      error: true,
      message: '更新藥物訂單失敗'
    })
  }
})

/**
 * DELETE /api/orders/medications/:id
 * 刪除藥物訂單
 */
router.delete('/medications/:id', ...isEditor, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const result = db.prepare(`DELETE FROM medication_orders WHERE id = ?`).run(id)
    db.close()

    if (result.changes === 0) {
      return res.status(404).json({
        error: true,
        message: '藥物訂單不存在'
      })
    }

    res.json({
      success: true,
      message: '藥物訂單已刪除'
    })

  } catch (error) {
    console.error('刪除藥物訂單錯誤:', error)
    res.status(500).json({
      error: true,
      message: '刪除藥物訂單失敗'
    })
  }
})

// ========================================
// 藥物草稿 API
// ========================================

/**
 * GET /api/orders/medication-drafts
 * 取得藥物草稿列表
 */
router.get('/medication-drafts', authenticate, (req, res) => {
  try {
    const { patientId, authorId } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM medication_drafts WHERE 1=1'
    const params = []

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    if (authorId) {
      query += ' AND author_id = ?'
      params.push(authorId)
    }

    query += ' ORDER BY created_at DESC'

    const drafts = db.prepare(query).all(...params)
    db.close()

    res.json(drafts.map(d => ({
      id: d.id,
      authorId: d.author_id,
      patientId: d.patient_id,
      ...JSON.parse(d.draft_data || '{}'),
      createdAt: d.created_at,
      updatedAt: d.updated_at
    })))

  } catch (error) {
    console.error('取得藥物草稿錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得藥物草稿失敗'
    })
  }
})

/**
 * POST /api/orders/medication-drafts
 * 新增藥物草稿
 */
router.post('/medication-drafts', ...isContributor, async (req, res) => {
  try {
    const draftData = req.body
    const { patientId } = draftData

    if (!patientId) {
      return res.status(400).json({
        error: true,
        message: '病人 ID 為必填'
      })
    }

    const id = uuidv4()
    const db = getDatabase()

    db.prepare(`
      INSERT INTO medication_drafts (id, author_id, patient_id, draft_data)
      VALUES (?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      patientId,
      JSON.stringify(draftData)
    )

    db.close()

    res.status(201).json({
      success: true,
      id,
      ...draftData
    })

  } catch (error) {
    console.error('新增藥物草稿錯誤:', error)
    res.status(500).json({
      error: true,
      message: '新增藥物草稿失敗'
    })
  }
})

/**
 * DELETE /api/orders/medication-drafts/:id
 * 刪除藥物草稿
 */
router.delete('/medication-drafts/:id', ...isContributor, async (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const result = db.prepare(`DELETE FROM medication_drafts WHERE id = ?`).run(id)
    db.close()

    if (result.changes === 0) {
      return res.status(404).json({
        error: true,
        message: '藥物草稿不存在'
      })
    }

    res.json({
      success: true,
      message: '藥物草稿已刪除'
    })

  } catch (error) {
    console.error('刪除藥物草稿錯誤:', error)
    res.status(500).json({
      error: true,
      message: '刪除藥物草稿失敗'
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

// ========================================
// Excel 檔案上傳處理 API
// ========================================

/**
 * POST /api/orders/lab-reports/upload
 * 上傳並處理檢驗報告 Excel 檔案
 * 對應 Firebase: processLabReport
 */
router.post('/lab-reports/upload', ...isContributor, async (req, res) => {
  try {
    const { fileName, fileContent } = req.body

    if (!fileName || !fileContent) {
      return res.status(400).json({
        error: true,
        message: '請求中缺少檔案名稱或內容。'
      })
    }

    console.log(`[LabReport] 接收到檔案 ${fileName}，開始解析...`)

    const buffer = Buffer.from(fileContent, 'base64')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const sheetAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    if (sheetAsArray.length < 2) {
      return res.status(400).json({
        error: true,
        message: 'Excel 檔案內容行數不足。'
      })
    }

    // 尋找標題行
    let headerRowIndex = -1
    let headers = []
    for (let i = 0; i < sheetAsArray.length; i++) {
      const row = sheetAsArray[i]
      if (row.includes('病歷號') && row.includes('細項名稱')) {
        headerRowIndex = i
        headers = row
        break
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({
        error: true,
        message: "找不到有效的標題行 (需包含 '病歷號' 和 '細項名稱')。"
      })
    }

    const dataRows = sheetAsArray.slice(headerRowIndex + 1)
    const headerToIndex = {}
    headers.forEach((header, index) => {
      if (header) headerToIndex[String(header).trim()] = index
    })

    const db = getDatabase()
    const reports = new Map()
    const errors = []
    const patientCache = new Map()

    // 預先載入所有病人
    const allPatients = db.prepare(`SELECT id, name, medical_record_number FROM patients WHERE is_deleted = 0`).all()
    allPatients.forEach(p => {
      if (p.medical_record_number) {
        const normalizedMrn = String(p.medical_record_number).replace(/^0+/, '')
        patientCache.set(normalizedMrn, p)
      }
    })

    for (const rowArray of dataRows) {
      let medicalRecordNumber = String(rowArray[headerToIndex['病歷號']] || '').trim()
      if (medicalRecordNumber) {
        medicalRecordNumber = medicalRecordNumber.replace(/^0+/, '')
      }

      // 標準化日期：只取前 8 位 (YYYYMMDD)
      const originalReportDateStr = String(rowArray[headerToIndex['報告日']] || '').trim()
      const reportDateStr = originalReportDateStr.substring(0, 8)

      const labItemName = String(rowArray[headerToIndex['細項名稱']] || '').trim()
      const labResult = rowArray[headerToIndex['結果']]

      if (!medicalRecordNumber || !reportDateStr || !labItemName || labResult === undefined || labResult === null) {
        // 跳過完全空白行
        if (rowArray.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) continue
        errors.push({
          rowData: JSON.stringify(rowArray),
          reason: '該行缺少 病歷號/報告日/細項名稱/結果'
        })
        continue
      }

      const reportKey = `${medicalRecordNumber}_${reportDateStr}`

      if (!reports.has(reportKey)) {
        const patientData = patientCache.get(medicalRecordNumber)
        if (!patientData) {
          errors.push({ rowData: `病歷號: ${medicalRecordNumber}`, reason: '找不到對應的病人' })
          continue
        }

        // 解析日期
        const year = reportDateStr.substring(0, 4)
        const month = reportDateStr.substring(4, 6)
        const day = reportDateStr.substring(6, 8)
        const reportDate = `${year}-${month}-${day}`

        reports.set(reportKey, {
          id: uuidv4(),
          patientId: patientData.id,
          patientName: patientData.name,
          medicalRecordNumber: patientData.medical_record_number,
          reportDate,
          sourceFile: fileName,
          data: {}
        })
      }

      const report = reports.get(reportKey)
      if (report) {
        const dbField = LAB_ITEM_MAPPING[labItemName]
        if (dbField) {
          const value = parseFloat(labResult)
          report.data[dbField] = isNaN(value) ? String(labResult) : value
        }
      }
    }

    // 批次寫入資料庫
    if (reports.size > 0) {
      const insertStmt = db.prepare(`
        INSERT INTO lab_reports (id, patient_id, report_date, report_type, results, file_path, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      const insertMany = db.transaction((reportList) => {
        for (const report of reportList) {
          insertStmt.run(
            report.id,
            report.patientId,
            report.reportDate,
            'excel_import',
            JSON.stringify(report.data),
            report.sourceFile,
            JSON.stringify({ uid: req.user.id, name: req.user.name })
          )
        }
      })

      insertMany(Array.from(reports.values()))
    }

    db.close()

    await logAudit('LAB_REPORT_UPLOAD', req.user.id, req.user.name, 'lab_reports', fileName, {
      processedCount: reports.size,
      errorCount: errors.length
    })

    console.log(`[LabReport] 處理完成，成功匯入 ${reports.size} 份報告，${errors.length} 個問題行。`)

    res.json({
      success: true,
      message: `處理完成！成功聚合並匯入 ${reports.size} 份報告，發現 ${errors.length} 個問題行。`,
      processedCount: reports.size,
      errorCount: errors.length,
      errors: errors.slice(0, 50)
    })

  } catch (error) {
    console.error('[LabReport] 處理檔案時發生錯誤:', error)
    res.status(500).json({
      error: true,
      message: `處理 Excel 檔案時發生錯誤: ${error.message}`
    })
  }
})

/**
 * POST /api/orders/consumables/upload
 * 上傳並處理耗材報告 Excel 檔案
 * 對應 Firebase: processConsumables
 */
router.post('/consumables/upload', ...isContributor, async (req, res) => {
  try {
    const { fileName, fileContent } = req.body

    if (!fileName || !fileContent) {
      return res.status(400).json({
        error: true,
        message: '請求中缺少檔案名稱或內容。'
      })
    }

    console.log(`[Consumables] 接收到檔案 ${fileName}，開始解析...`)

    const buffer = Buffer.from(fileContent, 'base64')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const sheetAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    if (sheetAsArray.length < 3) {
      return res.status(400).json({
        error: true,
        message: 'Excel 檔案內容行數不足。'
      })
    }

    // 從第二列抓取「迄日」來決定報表月份
    const dateString = sheetAsArray[1][0] || ''
    const monthMatch = dateString.match(/&迄日(\d{4})(\d{2})/)

    if (!monthMatch) {
      return res.status(400).json({
        error: true,
        message: 'Excel 格式錯誤，在第二列找不到有效的迄日(需為 &迄日YYYYMM 格式)。'
      })
    }

    const reportMonth = `${monthMatch[1]}-${monthMatch[2]}`
    console.log(`[Consumables] 解析到報表月份為 (迄日): ${reportMonth}`)

    // 尋找標題行
    let headerRowIndex = -1
    for (let i = 0; i < sheetAsArray.length; i++) {
      if (sheetAsArray[i].includes('病歷號')) {
        headerRowIndex = i
        break
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({
        error: true,
        message: "找不到有效的標題行 (需包含 '病歷號')。"
      })
    }

    const headers = sheetAsArray[headerRowIndex]
    const dataRows = sheetAsArray.slice(headerRowIndex + 1)

    // 判斷耗材類型
    let consumableHeader = ''
    let firestoreField = ''
    if (headers.includes('人工腎臟')) {
      consumableHeader = '人工腎臟'
      firestoreField = 'artificialKidney'
    } else if (headers.includes('透析藥水CA')) {
      consumableHeader = '透析藥水CA'
      firestoreField = 'dialysateCa'
    } else if (headers.includes('B液種類')) {
      consumableHeader = 'B液種類'
      firestoreField = 'bicarbonateType'
    } else {
      return res.status(400).json({
        error: true,
        message: '在標題行中找不到關鍵的耗材欄位。'
      })
    }

    const headerToIndex = {}
    headers.forEach((header, index) => {
      if (header) headerToIndex[String(header).trim()] = index
    })

    const db = getDatabase()
    ensureTablesExist(db)

    const patientCache = new Map()
    const updatesMap = new Map()
    const errors = []
    let processedRowCount = 0

    // 預先載入所有病人
    const allPatients = db.prepare(`SELECT id, name, medical_record_number FROM patients WHERE is_deleted = 0`).all()
    allPatients.forEach(p => {
      if (p.medical_record_number) {
        const normalizedMrn = String(p.medical_record_number).replace(/^0+/, '')
        patientCache.set(normalizedMrn, p)
      }
    })

    for (const rowArray of dataRows) {
      let medicalRecordNumber = String(rowArray[headerToIndex['病歷號']] || '').trim()
      const consumableValue = rowArray[headerToIndex[consumableHeader]]
      const count = rowArray[headerToIndex['COUNT(*)']]

      if (!medicalRecordNumber || consumableValue === undefined || consumableValue === null) {
        if (rowArray.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) continue
        errors.push({ rowData: JSON.stringify(rowArray), reason: '該行缺少病歷號或耗材數值' })
        continue
      }

      medicalRecordNumber = medicalRecordNumber.replace(/^0+/, '')

      const patientData = patientCache.get(medicalRecordNumber)
      if (!patientData) {
        errors.push({ rowData: `病歷號: ${medicalRecordNumber}`, reason: '找不到對應的病人' })
        continue
      }

      const reportId = `${reportMonth}_${patientData.id}`
      if (!updatesMap.has(reportId)) {
        updatesMap.set(reportId, {
          id: reportId,
          patientId: patientData.id,
          patientName: patientData.name,
          medicalRecordNumber: patientData.medical_record_number,
          reportDate: `${reportMonth}-01`,
          sourceFile: fileName,
          data: {}
        })
      }

      const patientUpdate = updatesMap.get(reportId)
      if (!patientUpdate.data[firestoreField]) {
        patientUpdate.data[firestoreField] = []
      }
      patientUpdate.data[firestoreField].push({
        item: consumableValue,
        count: count || 0
      })

      processedRowCount++
    }

    // 批次寫入資料庫 (使用 UPSERT)
    if (updatesMap.size > 0) {
      const upsertStmt = db.prepare(`
        INSERT INTO consumables_reports (id, patient_id, patient_name, medical_record_number, report_date, report_data, source_file, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          report_data = json_patch(report_data, excluded.report_data),
          source_file = excluded.source_file,
          updated_at = datetime('now', 'localtime')
      `)

      const upsertMany = db.transaction((reportList) => {
        for (const report of reportList) {
          upsertStmt.run(
            report.id,
            report.patientId,
            report.patientName,
            report.medicalRecordNumber,
            report.reportDate,
            JSON.stringify(report.data),
            report.sourceFile,
            JSON.stringify({ uid: req.user.id, name: req.user.name })
          )
        }
      })

      upsertMany(Array.from(updatesMap.values()))
    }

    db.close()

    await logAudit('CONSUMABLES_UPLOAD', req.user.id, req.user.name, 'consumables_reports', fileName, {
      processedCount: updatesMap.size,
      errorCount: errors.length
    })

    console.log(`[Consumables] 處理完成，處理 ${processedRowCount} 筆資料，聚合為 ${updatesMap.size} 份報表。`)

    res.json({
      success: true,
      message: `處理完成！成功處理 ${processedRowCount} 筆耗材資料，聚合為 ${updatesMap.size} 份月報表，發現 ${errors.length} 個問題行。`,
      processedCount: updatesMap.size,
      errorCount: errors.length,
      errors: errors.slice(0, 50)
    })

  } catch (error) {
    console.error('[Consumables] 處理檔案時發生錯誤:', error)
    res.status(500).json({
      error: true,
      message: `處理 Excel 檔案時發生錯誤: ${error.message}`
    })
  }
})

/**
 * POST /api/orders/medications/upload
 * 上傳並處理藥囑 Excel 檔案
 * 對應 Firebase: processOrders
 */
router.post('/medications/upload', ...isContributor, async (req, res) => {
  try {
    const { fileName, fileContent } = req.body

    if (!fileName || !fileContent) {
      return res.status(400).json({
        error: true,
        message: '請求中缺少檔案名稱或內容。'
      })
    }

    console.log(`[ProcessOrders] 接收到檔案 ${fileName}，開始解析...`)

    const uploadMonth = getTaipeiMonthString()
    console.log(`[ProcessOrders] 本次上傳將歸檔至月份: ${uploadMonth}`)

    const buffer = Buffer.from(fileContent, 'base64')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const dataRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: false,
      dateNF: 'YYYY-MM-DD'
    })

    // 尋找標題行
    let headerRowIndex = -1
    let headers = []
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i].map(h => String(h).trim())
      if (row.includes('病歷號') && row.includes('醫令碼') && row.includes('名稱')) {
        headerRowIndex = i
        headers = row
        break
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({
        error: true,
        message: "找不到有效的標題行 (需包含 '病歷號', '醫令碼', '名稱')。"
      })
    }

    const headerToIndex = {}
    headers.forEach((header, index) => {
      if (header) headerToIndex[header.trim()] = index
    })

    const requiredHeaders = ['病歷號', '醫令碼', '名稱', '異動日期', '次劑量']
    const missingHeaders = requiredHeaders.filter(h => headerToIndex[h] === undefined)
    if (missingHeaders.length > 0) {
      return res.status(400).json({
        error: true,
        message: `Excel 檔案缺少必要的欄位: ${missingHeaders.join(', ')}`
      })
    }

    const db = getDatabase()
    ensureTablesExist(db)

    const patientCache = new Map()
    const errors = []
    let processedCount = 0

    // 預先載入所有病人
    const allPatients = db.prepare(`SELECT id, name, medical_record_number FROM patients WHERE is_deleted = 0`).all()
    allPatients.forEach(p => {
      if (p.medical_record_number) {
        const normalizedMrn = String(p.medical_record_number).replace(/^0+/, '')
        patientCache.set(normalizedMrn, p)
      }
    })

    const ordersToInsert = []

    for (let i = headerRowIndex + 1; i < dataRows.length; i++) {
      const row = dataRows[i]
      if (row.every(cell => String(cell).trim() === '')) continue

      let medicalRecordNumber = String(row[headerToIndex['病歷號']] || '').trim().replace(/^0+/, '')
      const orderCode = String(row[headerToIndex['醫令碼']] || '').trim()
      const orderName = String(row[headerToIndex['名稱']] || '').trim()
      const rawChangeDate = row[headerToIndex['異動日期']]
      let changeDate = ''

      // 解析日期
      if (rawChangeDate) {
        const dateStr = String(rawChangeDate).trim()
        if (/^\d{8,}/.test(dateStr)) {
          const year = dateStr.substring(0, 4)
          const month = dateStr.substring(4, 6)
          const day = dateStr.substring(6, 8)
          if (parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
            changeDate = `${year}-${month}-${day}`
          }
        }
        if (!changeDate) {
          try {
            const dateObj = new Date(rawChangeDate)
            if (!isNaN(dateObj.getTime())) {
              const year = dateObj.getUTCFullYear()
              const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0')
              const day = dateObj.getUTCDate().toString().padStart(2, '0')
              changeDate = `${year}-${month}-${day}`
            }
          } catch (e) { /* 忽略解析錯誤 */ }
        }
      }

      if (!medicalRecordNumber || !orderCode || !orderName || !changeDate || !/^\d{4}-\d{2}-\d{2}$/.test(changeDate)) {
        let reason = '缺少必要欄位或日期格式不正確'
        if (!changeDate || !/^\d{4}-\d{2}-\d{2}$/.test(changeDate)) {
          reason = `異動日期格式錯誤或為空 (應為 YYYY-MM-DD)，讀取到的值為: "${rawChangeDate}"`
        }
        errors.push({ rowNumber: i + 1, reason })
        continue
      }

      const patientData = patientCache.get(medicalRecordNumber)
      if (!patientData) {
        errors.push({ rowNumber: i + 1, reason: `病歷號 ${medicalRecordNumber} 找不到對應的病人` })
        continue
      }

      // 判斷藥物類型
      let orderType = null
      const orderPayload = {
        id: uuidv4(),
        patientId: patientData.id,
        patientName: patientData.name,
        medicalRecordNumber: patientData.medical_record_number,
        orderCode,
        orderName,
        changeDate,
        uploadMonth,
        dose: String(row[headerToIndex['次劑量']] || ''),
        action: 'MODIFY',
        sourceFile: fileName
      }

      if (ORAL_MED_CODES.includes(orderCode)) {
        orderType = 'oral'
        orderPayload.frequency = String(row[headerToIndex['頻率服法']] || '')
      } else if (INJECTION_MED_CODES.includes(orderCode)) {
        orderType = 'injection'
        orderPayload.note = String(row[headerToIndex['備註']] || '')
      }

      if (orderType) {
        orderPayload.orderType = orderType
        ordersToInsert.push(orderPayload)
        processedCount++
      }
    }

    // 批次寫入資料庫
    if (ordersToInsert.length > 0) {
      const insertStmt = db.prepare(`
        INSERT INTO injection_orders (id, patient_id, patient_name, medical_record_number, order_code, order_name, change_date, upload_month, dose, frequency, note, action, order_type, source_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const insertMany = db.transaction((orders) => {
        for (const order of orders) {
          insertStmt.run(
            order.id,
            order.patientId,
            order.patientName,
            order.medicalRecordNumber,
            order.orderCode,
            order.orderName,
            order.changeDate,
            order.uploadMonth,
            order.dose,
            order.frequency || '',
            order.note || '',
            order.action,
            order.orderType,
            order.sourceFile
          )
        }
      })

      insertMany(ordersToInsert)
    }

    db.close()

    await logAudit('MEDICATION_ORDERS_UPLOAD', req.user.id, req.user.name, 'injection_orders', fileName, {
      processedCount,
      errorCount: errors.length
    })

    console.log(`[ProcessOrders] 處理完成，成功處理 ${processedCount} 筆藥囑，${errors.length} 個問題。`)

    res.json({
      success: true,
      message: `處理完成！成功匯入 ${processedCount} 筆藥囑紀錄，發現 ${errors.length} 個問題行。`,
      processedCount,
      errorCount: errors.length,
      errors: errors.slice(0, 50)
    })

  } catch (error) {
    console.error('[ProcessOrders] 處理檔案時發生錯誤:', error)
    res.status(500).json({
      error: true,
      message: `處理 Excel 檔案時發生錯誤: ${error.message}`
    })
  }
})

/**
 * GET /api/orders/consumables
 * 取得耗材報告列表
 */
router.get('/consumables', authenticate, (req, res) => {
  try {
    const { patientId, startDate, endDate } = req.query
    const db = getDatabase()

    let query = 'SELECT * FROM consumables_reports WHERE 1=1'
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
      patientName: r.patient_name,
      medicalRecordNumber: r.medical_record_number,
      reportDate: r.report_date,
      data: JSON.parse(r.report_data || '{}'),
      sourceFile: r.source_file,
      createdBy: JSON.parse(r.created_by || '{}'),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })))

  } catch (error) {
    console.error('取得耗材報告錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得耗材報告失敗'
    })
  }
})

/**
 * GET /api/orders/injection-orders
 * 取得藥囑訂單列表 (Excel 匯入的)
 */
router.get('/injection-orders', authenticate, (req, res) => {
  try {
    const { patientId, uploadMonth, orderType } = req.query
    const db = getDatabase()
    ensureTablesExist(db)

    let query = 'SELECT * FROM injection_orders WHERE 1=1'
    const params = []

    if (patientId) {
      query += ' AND patient_id = ?'
      params.push(patientId)
    }

    if (uploadMonth) {
      query += ' AND upload_month = ?'
      params.push(uploadMonth)
    }

    if (orderType) {
      query += ' AND order_type = ?'
      params.push(orderType)
    }

    query += ' ORDER BY change_date DESC, created_at DESC'

    const orders = db.prepare(query).all(...params)
    db.close()

    res.json(orders.map(o => ({
      id: o.id,
      patientId: o.patient_id,
      patientName: o.patient_name,
      medicalRecordNumber: o.medical_record_number,
      orderCode: o.order_code,
      orderName: o.order_name,
      changeDate: o.change_date,
      uploadMonth: o.upload_month,
      dose: o.dose,
      frequency: o.frequency,
      note: o.note,
      action: o.action,
      orderType: o.order_type,
      sourceFile: o.source_file,
      createdAt: o.created_at
    })))

  } catch (error) {
    console.error('取得藥囑訂單錯誤:', error)
    res.status(500).json({
      error: true,
      message: '取得藥囑訂單失敗'
    })
  }
})

export default router
