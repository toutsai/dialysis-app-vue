<!-- 檔案路徑: src/views/StatsView.vue (優化版 - 修正版 + 側欄通知) -->
<script setup>
import { ref, onMounted, computed, reactive, watch, provide, watchEffect } from 'vue'

// ✨ 核心優化 1: 替換 ApiManager 為優化版 API 服務 ✨
import {
  fetchAllPatients as optimizedFetchAllPatients,
  fetchAllMemos as optimizedFetchAllMemos,
} from '@/services/optimizedApiService.js'

// ✨ 核心優化 2: 為了確保資料一致性，schedules 使用直接 Firestore API ✨
import {
  where,
  orderBy,
  limit,
  collection,
  getDocs,
  query,
  doc,
  updateDoc,
  addDoc,
} from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'

// ✨ 核心優化 3: dialysis_orders_history 暫時保留舊 API（等待後續優化） ✨
import ApiManager from '@/services/api_manager.js'

import BedChangeDialog from '@/components/BedChangeDialog.vue'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'
import { useAuth } from '@/composables/useAuth.js'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import MemoIcon from '@/components/MemoIcon.vue'
import { useNotification } from '@/composables/useNotification.js'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PreparationPopover from '@/components/PreparationPopover.vue'

// --- API 實例 ---
// ✨ 優化 3: 保留 dialysis_orders_history API 暫時使用舊版（後續優化） ✨
const ordersHistoryApi = ApiManager('dialysis_orders_history')

// ✨ 新增：直接使用 Firestore API 讀取 schedules，確保與 ScheduleView 一致 ✨
const schedulesCollection = collection(db, 'schedules')

// ✨ 優化版 schedules 讀取函數 - 與 ScheduleView 保持一致 ✨
const fetchSchedulesByDate = async (dateStr) => {
  try {
    console.log(`📅 [StatsView] 直接查詢 Firestore schedules: ${dateStr}`)
    const q = query(schedulesCollection, where('date', '==', dateStr))
    const querySnapshot = await getDocs(q)
    const schedules = []
    querySnapshot.forEach((doc) => {
      schedules.push({ id: doc.id, ...doc.data() })
    })
    console.log(`✅ [StatsView] 直接載入 ${schedules.length} 個排程文件`)
    return schedules
  } catch (error) {
    console.error(`❌ [StatsView] 載入排程失敗:`, error)
    throw error
  }
}

// ✨ 優化版儲存函數 - 與 ScheduleView 保持一致 ✨
const saveScheduleData = async (scheduleData, scheduleId = null) => {
  try {
    if (scheduleId) {
      const docRef = doc(schedulesCollection, scheduleId)
      await updateDoc(docRef, {
        ...scheduleData,
        updatedAt: new Date(),
        lastModifiedBy: 'StatsView',
      })
      console.log(`✅ [StatsView] 更新排程文件: ${scheduleId}`)
      return { id: scheduleId, ...scheduleData }
    } else {
      const docRef = await addDoc(schedulesCollection, {
        ...scheduleData,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastModifiedBy: 'StatsView',
      })
      console.log(`✅ [StatsView] 創建新排程文件: ${docRef.id}`)
      return { id: docRef.id, ...scheduleData }
    }
  } catch (error) {
    console.error(`❌ [StatsView] 儲存排程失敗:`, error)
    throw error
  }
}

// --- 常量 ---
const nurseNameList = [
  '陳素秋',
  '古孟麗',
  '謝常菁',
  '林玉麗',
  '陳聖柔',
  '田姿瑛',
  '陳韋吟',
  '劉姿秀',
  '劉舒婷',
  '李慈賢',
  '黃羿寧',
  '高佩鳳',
  '林沛儀',
  '陳芃諭',
  '葛孟萍',
  '蘇愛玲',
  '郭芳君',
  '林馨如',
  '胡國暄',
  '施艾利',
  '陳淑玲',
  '謝慶諭',
  '林佩佳',
  '吳思婷',
  '吳幸美',
  '林芳羽',
]
const earlyBaseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const lateBaseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const nightBaseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const earlyTeams = earlyBaseTeams.map((t) => `早${t}`)
const lateTeams = lateBaseTeams.map((t) => `晚${t}`)

const dutyAssignments = {
  early: {
    現場指揮官: 'K',
    安全防護班: ['A', 'B', 'J-75'],
    引導救護班: ['C', 'D', 'E', 'G', 'H-1', 'I-2'],
    滅火班: 'F-75',
  },
  late: {
    現場指揮官: 'K',
    安全防護班: ['A', 'B', 'J-75'],
    引導救護班: ['C', 'D', 'E', 'G', 'H-1', 'I-2'],
    滅火班: 'F-75',
  },
  night: {
    現場指揮官: 'A',
    '安全防護班/通報班': 'B',
    引導救護班: ['C', 'D', 'E', 'G', 'H'],
    滅火班: 'F-128',
  },
}

const isFireDutyDropdownVisible = ref(false)

// --- 核心狀態 ---
const currentDate = ref(new Date())
const allPatients = ref([])
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })

// --- UI 狀態 ---
const isBedChangeDialogVisible = ref(false)
const editingPatientInfo = ref(null)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogMessage = ref('')
const onConfirmAction = ref(null)

// ✨ 1. 新增 Ref 來暫存換床時的資訊
const pendingChangeInfo = ref(null)
const bedChangeTargetShift = ref(null)

const isPrepPopoverVisible = ref(false)
const prepPopoverData = reactive({
  patients: [],
  targetElement: null,
})

const { addNotification } = useNotification()
const auth = useAuth()
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) {
    return true
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return currentDate.value < today
})

// --- Helper Functions & 計算屬性 ---
const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getPatientDisplayString = (patientDetail) => {
  if (!patientDetail) return ''
  let identifier = ''
  if (patientDetail.shiftId.startsWith('peripheral')) {
    identifier = patientDetail.wardNumber || '外圍'
  } else {
    const parts = patientDetail.shiftId.split('-')
    if (parts.length >= 2) {
      identifier = parts[1]
    }
  }
  const name = patientDetail.name
  const firstLineHtml = `<div class="patient-line-one">${identifier} - ${name}</div>`

  let secondLineContent = ''
  if (patientDetail.mode && patientDetail.mode !== 'HD') {
    secondLineContent += `<span class="stats-special-mode">(${patientDetail.mode})</span>`
  }
  const autoTags = (patientDetail.autoNote || '').split(' ').filter(Boolean)
  const manualTags = (patientDetail.manualNote || '').split(' ').filter(Boolean)
  const combinedTags = [...new Set([...autoTags, ...manualTags])]
  const finalTags = combinedTags.filter((tag) => !['住', '急'].includes(tag))
  if (finalTags.length > 0) {
    secondLineContent += ` <span class="note-display">${finalTags.join(' ')}</span>`
  }
  const secondLineHtml = secondLineContent
    ? `<div class="patient-line-two">${secondLineContent.trim()}</div>`
    : ''

  return firstLineHtml + secondLineHtml
}

const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)

const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))

const weekdayDisplay = computed(() => {
  if (!currentDate.value) return ''
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const dayIndex = new Date(currentDate.value).getDay()
  return weekdays[dayIndex]
})

const effectiveStatsData = ref({ early: {}, late: {} })

async function getEffectiveOrdersForDate(patientId, targetDate) {
  if (!patientId || !targetDate) {
    return {}
  }

  const dateStr = targetDate.toISOString().slice(0, 10)

  try {
    const queryConstraints = [
      where('patientId', '==', patientId),
      where('orders.effectiveDate', '<=', dateStr),
      orderBy('orders.effectiveDate', 'desc'),
      orderBy('updatedAt', 'desc'),
      limit(1),
    ]

    const results = await ordersHistoryApi.fetchAll(queryConstraints)
    return results.length > 0 ? results[0].orders : {}
  } catch (error) {
    if (error.code === 'failed-precondition') {
      console.error(
        `Firestore 錯誤：查詢需要複合索引。請檢查 Firebase 控制台並根據提示建立索引。\n` +
          `集合: dialysis_orders_history\n` +
          `欄位: patientId (ASC), orders.effectiveDate (DESC), updatedAt (DESC)`,
      )
    } else {
      console.error(`獲取病人 ${patientId} 的醫囑失敗:`, error)
    }
    return {}
  }
}

watchEffect(async () => {
  console.log(`🔄 [StatsView] watchEffect 觸發:`)
  console.log(
    `   - currentRecord.schedule:`,
    Object.keys(currentRecord.schedule || {}).length,
    '個記錄',
  )
  console.log(`   - allPatients.value:`, allPatients.value.length, '位病人')

  if (!currentRecord.schedule || allPatients.value.length === 0) {
    console.log(`⚠️ [StatsView] 資料不足，清空統計資料`)
    effectiveStatsData.value = { early: {}, late: {} }
    return
  }

  console.log(`📊 [StatsView] 開始計算統計資料...`)
  const earlyShiftStats = {}
  const lateShiftStats = {}
  earlyTeams.forEach((team) => {
    earlyShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      earlyShift: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      noonShiftOn: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      noonShiftOff: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      totalOpdCount: 0,
      totalIpdCount: 0,
      totalErCount: 0,
    }
  })
  lateTeams.forEach((team) => {
    lateShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      noonShiftOff: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      lateShift: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      totalOpdCount: 0,
      totalIpdCount: 0,
      totalErCount: 0,
    }
  })

  const scheduleValues = Object.values(currentRecord.schedule)
  const patientDetailsPromises = scheduleValues.map(async (shiftDetails) => {
    const { patientId } = shiftDetails
    if (!patientId) return null

    const patient = patientMap.value.get(patientId)
    if (!patient) return null

    const effectiveOrders = await getEffectiveOrdersForDate(patientId, currentDate.value)

    return { ...shiftDetails, effectiveOrders, patientData: patient }
  })

  const resolvedPatientDetails = (await Promise.all(patientDetailsPromises)).filter(Boolean)
  console.log(`👥 [StatsView] 解析病人詳情: ${resolvedPatientDetails.length} 個有效記錄`)

  if (resolvedPatientDetails.length === 0) {
    console.log(`⚠️ [StatsView] 沒有有效的病人詳情，可能是資料匹配問題`)
    // 檢查原始資料
    console.log(`🔍 [StatsView] 除錯資訊:`)
    console.log(
      `   - currentRecord.schedule 樣本:`,
      Object.entries(currentRecord.schedule).slice(0, 3),
    )
    console.log(
      `   - allPatients 樣本:`,
      allPatients.value.slice(0, 3).map((p) => ({ id: p.id, name: p.name })),
    )
  }

  resolvedPatientDetails.forEach((shiftDetails) => {
    const {
      patientId,
      autoNote,
      manualNote,
      wardNumber,
      nurseTeam,
      nurseTeamIn,
      nurseTeamOut,
      shiftId,
      effectiveOrders,
      patientData: patient,
    } = shiftDetails

    console.log(`👤 [StatsView] 處理病人: ${patient.name} (${shiftId})`)
    console.log(
      `   - nurseTeam: ${nurseTeam}, nurseTeamIn: ${nurseTeamIn}, nurseTeamOut: ${nurseTeamOut}`,
    )

    const detail = {
      id: patientId,
      shiftId: shiftId,
      name: patient.name,
      status: patient.status,
      mode: patient.mode,
      autoNote: autoNote || '',
      manualNote: manualNote || '',
      wardNumber: wardNumber || '',
      classes: 'patient-item',
      dialysisOrders: effectiveOrders,
    }

    if (patient.status === 'er') detail.classes += ' status-er'
    else if (patient.status === 'ipd') detail.classes += ' status-ipd'
    else detail.classes += ' status-opd'
    const combinedNote = [
      ...new Set([
        ...(autoNote || '').split(' ').filter(Boolean),
        ...(manualNote || '').split(' ').filter(Boolean),
      ]),
    ].join(' ')
    if (combinedNote) detail.classes += ' has-note-highlight'
    if (combinedNote.includes('抽')) detail.classes += ' tag-chou'
    if (combinedNote.includes('新')) detail.classes += ' tag-new'
    if (combinedNote.includes('兩')) detail.classes += ' tag-liang'
    if (combinedNote.includes('換')) detail.classes += ' tag-huan'
    if (combinedNote.includes('B')) detail.classes += ' tag-b'

    const assignAndCount = (group, patientDetail) => {
      group.patients.push(patientDetail)
      if (patientDetail.status === 'ipd') group.ipdCount++
      else if (patientDetail.status === 'er') group.erCount++
      else group.opdCount++
    }
    const shiftCode = shiftId.split('-')[2]
    console.log(
      `   - shiftCode: ${shiftCode} (${SHIFT_CODES.EARLY}=${SHIFT_CODES.EARLY}, ${SHIFT_CODES.LATE}=${SHIFT_CODES.LATE}, ${SHIFT_CODES.NOON}=${SHIFT_CODES.NOON})`,
    )

    if (shiftCode === SHIFT_CODES.EARLY && nurseTeam && earlyShiftStats[nurseTeam]) {
      console.log(`   ✅ 分配到早班 ${nurseTeam}`)
      assignAndCount(earlyShiftStats[nurseTeam].earlyShift, detail)
    } else if (shiftCode === SHIFT_CODES.LATE && nurseTeam && lateShiftStats[nurseTeam]) {
      console.log(`   ✅ 分配到晚班 ${nurseTeam}`)
      assignAndCount(lateShiftStats[nurseTeam].lateShift, detail)
    } else if (shiftCode === SHIFT_CODES.NOON) {
      console.log(`   🕐 午班處理`)
      if (nurseTeamIn && earlyShiftStats[nurseTeamIn]) {
        console.log(`   ✅ 分配到午班上針 ${nurseTeamIn}`)
        assignAndCount(earlyShiftStats[nurseTeamIn].noonShiftOn, detail)
      }
      if (nurseTeamOut) {
        if (lateShiftStats[nurseTeamOut]) {
          console.log(`   ✅ 分配到午班收針(晚班) ${nurseTeamOut}`)
          assignAndCount(lateShiftStats[nurseTeamOut].noonShiftOff, detail)
        } else if (earlyShiftStats[nurseTeamOut]) {
          console.log(`   ✅ 分配到午班收針(早班) ${nurseTeamOut}`)
          assignAndCount(earlyShiftStats[nurseTeamOut].noonShiftOff, detail)
        }
      }
    } else {
      console.log(
        `   ❌ 無法分配: shiftCode=${shiftCode}, nurseTeam=${nurseTeam}, nurseTeamIn=${nurseTeamIn}, nurseTeamOut=${nurseTeamOut}`,
      )
    }
  })

  const sortPatientsByBed = (a, b) => {
    const getSortKey = (shiftId) => {
      if (!shiftId || typeof shiftId !== 'string') return 999
      const parts = shiftId.split('-')
      if (parts[0] === 'peripheral') return 100 + parseInt(parts[1], 10)
      const num = parseInt(parts[1], 10)
      return isNaN(num) ? 999 : num
    }
    return getSortKey(a.shiftId) - getSortKey(b.shiftId)
  }
  for (const team in earlyShiftStats) {
    Object.values(earlyShiftStats[team]).forEach((group) => {
      if (group.patients) group.patients.sort(sortPatientsByBed)
    })
  }
  for (const team in lateShiftStats) {
    Object.values(lateShiftStats[team]).forEach((group) => {
      if (group.patients) group.patients.sort(sortPatientsByBed)
    })
  }

  for (const team in earlyShiftStats) {
    const teamData = earlyShiftStats[team]
    teamData.totalOpdCount =
      (teamData.earlyShift.opdCount || 0) + (teamData.noonShiftOn.opdCount || 0)
    teamData.totalIpdCount =
      (teamData.earlyShift.ipdCount || 0) + (teamData.noonShiftOn.ipdCount || 0)
    teamData.totalErCount = (teamData.earlyShift.erCount || 0) + (teamData.noonShiftOn.erCount || 0)
  }
  for (const team in lateShiftStats) {
    const teamData = lateShiftStats[team]
    teamData.totalOpdCount =
      (teamData.lateShift.opdCount || 0) + (teamData.noonShiftOff.opdCount || 0)
    teamData.totalIpdCount =
      (teamData.lateShift.ipdCount || 0) + (teamData.noonShiftOff.ipdCount || 0)
    teamData.totalErCount = (teamData.lateShift.erCount || 0) + (teamData.noonShiftOff.erCount || 0)
  }

  effectiveStatsData.value = { early: earlyShiftStats, late: lateShiftStats }

  console.log(`✅ [StatsView] 統計資料計算完成:`)
  console.log(`   - 早班組別:`, Object.keys(earlyShiftStats).length, '個')
  console.log(`   - 晚班組別:`, Object.keys(lateShiftStats).length, '個')

  // 顯示每個組別的病人數量
  Object.entries(earlyShiftStats).forEach(([team, data]) => {
    const totalPatients =
      (data.earlyShift?.patients?.length || 0) +
      (data.noonShiftOn?.patients?.length || 0) +
      (data.noonShiftOff?.patients?.length || 0)
    if (totalPatients > 0) {
      console.log(`   - ${team}: ${totalPatients} 位病人`)
    }
  })

  Object.entries(lateShiftStats).forEach(([team, data]) => {
    const totalPatients =
      (data.lateShift?.patients?.length || 0) + (data.noonShiftOff?.patients?.length || 0)
    if (totalPatients > 0) {
      console.log(`   - ${team}: ${totalPatients} 位病人`)
    }
  })
})

function getDutyTagClass(dutyName) {
  if (dutyName.includes('指揮官')) return 'role-field-commander'
  if (dutyName.includes('通報')) return 'role-reporter'
  if (dutyName.includes('安全')) return 'role-safety'
  if (dutyName.includes('引導')) return 'role-guide'
  if (dutyName.includes('滅火')) return 'role-fire'
  return 'role-default'
}

function showPrepPopover(event, teamData, shiftType) {
  const patientsInShift = teamData[shiftType]?.patients || []
  if (patientsInShift.length === 0) return

  console.log(`📋 [StatsView] 顯示備物清單: ${shiftType}, ${patientsInShift.length} 位病人`)
  prepPopoverData.patients = patientsInShift
  prepPopoverData.targetElement = event.currentTarget

  isPrepPopoverVisible.value = true
}

function onPrepPopoverClose() {
  isPrepPopoverVisible.value = false
}

function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = allPatients.value.find((p) => p.id === patientId)
  if (!patient) return
  console.log(`📝 [StatsView] 顯示病人備忘錄: ${patient.name}`)
  memosForDialog.value = activeMemos.value.filter(
    (memo) => memo.patientId === patientId && !memo.isResolved,
  )
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}

// ✨ 核心優化 4: 確保與 ScheduleView 資料一致性 ✨
async function loadData(date) {
  console.log(`🚀 [StatsView] 開始載入統計檢視資料: ${formatDate(date)}`)
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)

  try {
    console.log(`🔄 [StatsView] 查詢日期: ${dateStr}`)

    // 使用優化 API 載入病人和備忘錄，使用直接 Firestore API 載入排程
    const [patientsData, memosData] = await Promise.all([
      optimizedFetchAllPatients(),
      optimizedFetchAllMemos([where('status', '==', 'pending')]),
    ])

    // 單獨載入排程資料，確保與 ScheduleView 一致
    const dailyRecords = await fetchSchedulesByDate(dateStr)

    console.log(`✅ [StatsView] 資料載入完成:`)
    console.log(`   - 本日排程: ${dailyRecords.length} 筆`)
    console.log(`   - 患者: ${patientsData.length} 位`)
    console.log(`   - 備忘錄: ${memosData.length} 筆`)

    allPatients.value = patientsData
    activeMemos.value = memosData

    if (dailyRecords.length > 0) {
      const record = dailyRecords[0]
      console.log(`📊 [StatsView] 處理排程記錄: ${record.id}`)

      if (record.schedule) {
        const localPatientMap = new Map(patientsData.map((p) => [p.id, p]))
        let validScheduleCount = 0
        let nurseTeamCount = 0

        // ✨ 詳細檢查護理組別資料 ✨
        console.log(`🔍 [StatsView] 檢查排程資料結構...`)
        const sampleSlots = Object.entries(record.schedule).slice(0, 5)
        sampleSlots.forEach(([slotId, slotData]) => {
          console.log(`   ${slotId}:`, {
            patientId: slotData.patientId,
            nurseTeam: slotData.nurseTeam,
            nurseTeamIn: slotData.nurseTeamIn,
            nurseTeamOut: slotData.nurseTeamOut,
          })
        })

        for (const shiftId in record.schedule) {
          const slot = record.schedule[shiftId]
          if (slot && slot.patientId) {
            const patient = localPatientMap.get(slot.patientId)
            slot.autoNote = patient ? generateAutoNote(patient) : ''
            slot.manualNote = slot.manualNote || ''
            validScheduleCount++

            // 統計有護理組別的記錄數
            if (slot.nurseTeam || slot.nurseTeamIn || slot.nurseTeamOut) {
              nurseTeamCount++
            }
          }
        }
        console.log(`📈 [StatsView] 有效排程記錄: ${validScheduleCount} 個`)
        console.log(`👥 [StatsView] 有護理組別的記錄: ${nurseTeamCount} 個`)

        if (nurseTeamCount === 0) {
          console.log(`⚠️ [StatsView] 警告：沒有護理組別資料，請到「每日排程表」設定護理組別`)
        } else {
          console.log(`✅ [StatsView] 發現護理組別資料，應該能正常顯示統計`)
        }
      }

      Object.assign(currentRecord, record)
      statusIndicator.value = '資料已載入'
    } else {
      console.log(`📝 [StatsView] 無排程資料，初始化空記錄`)
      Object.assign(currentRecord, { id: null, date: dateStr, schedule: {}, names: {} })
      statusIndicator.value = '本日無排程資料'
    }
  } catch (error) {
    console.error('❌ [StatsView] 讀取報表資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  }
}

// 在 StatsView 中使用通用類型
function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'

  try {
    const dateStr = formatDate(currentDate.value)
    addNotification(`護理分組有變更: ${dateStr}`, 'stats')
  } catch (error) {
    console.error('❌ [StatsView] 發送變更通知失敗:', error)
    addNotification('護理分組有變更', 'stats')
  }
}

function notifyTeamChange(patientName, fromTeam, toTeam) {
  addNotification(`${patientName} 調整至 ${toTeam}`, 'stats')
}

// ✨ 核心優化 5: 使用與 ScheduleView 一致的儲存方式 ✨
async function saveChangesToCloud() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作禁止'
    alertDialogMessage.value = '操作被鎖定：無法儲存或權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  if (!currentRecord.id && Object.keys(currentRecord.schedule).length === 0) {
    alertDialogTitle.value = '提示'
    alertDialogMessage.value = '沒有資料可以儲存。'
    isAlertDialogVisible.value = true
    return
  }

  console.log('💾 [StatsView] 開始儲存統計檢視變更...')
  statusIndicator.value = '儲存中...'

  try {
    const cleanSchedule = {}
    let savedSlotCount = 0

    // 準備儲存資料 - 與 ScheduleView 使用相同格式
    for (const shiftId in currentRecord.schedule) {
      const slot = currentRecord.schedule[shiftId]
      if (slot && slot.patientId) {
        cleanSchedule[shiftId] = {
          patientId: slot.patientId,
          shiftId: slot.shiftId,
          autoNote: slot.autoNote || '',
          manualNote: slot.manualNote || '',
          nurseTeam: slot.nurseTeam || null,
          nurseTeamIn: slot.nurseTeamIn || null,
          nurseTeamOut: slot.nurseTeamOut || null,
          wardNumber: slot.wardNumber || null,
        }
        savedSlotCount++
      }
    }

    console.log(`📊 [StatsView] 準備儲存: ${savedSlotCount} 個排程記錄`)

    const dataToSave = {
      date: currentRecord.date,
      schedule: cleanSchedule,
      names: currentRecord.names,
    }

    // ✨ 使用與 ScheduleView 相同的儲存方式 ✨
    const savedRecord = await saveScheduleData(dataToSave, currentRecord.id)
    currentRecord.id = savedRecord.id

    hasUnsavedChanges.value = false
    statusIndicator.value = '變更已儲存！'

    console.log(`✅ [StatsView] 統計檢視儲存成功: ${currentRecord.date}`)

    // 🆕 簡化的儲存成功通知
    addNotification(`✅ 護理分組儲存成功: ${formatDate(currentDate.value)}`, 'stats')

    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '變更儲存成功！'
    isAlertDialogVisible.value = true
    await loadData(currentDate.value)
  } catch (error) {
    console.error('❌ [StatsView] 儲存變更失敗:', error)
    statusIndicator.value = '儲存失敗'

    // 🆕 簡化的儲存失敗通知
    addNotification(`❌ 護理分組儲存失敗: ${error.message}`, 'stats')

    alertDialogTitle.value = '儲存失敗'
    alertDialogMessage.value = `儲存失敗: ${error.message}`
    isAlertDialogVisible.value = true
  }
}

// ✨ 重構 onDrop 函數 - 確保拖曳換組/換班功能完全正常 ✨
function onDrop(event, newTeam, newResponsibility) {
  if (isPageLocked.value) {
    console.log(`🔒 [StatsView] 頁面已鎖定，無法拖曳`)
    return
  }

  event.preventDefault()
  event.currentTarget.classList.remove('drag-over-active')

  const patientDetail = JSON.parse(event.dataTransfer.getData('application/json'))
  const oldShiftId = patientDetail.shiftId

  console.log(`🖱️ [StatsView] 拖曳操作開始:`)
  console.log(`   - 病人: ${patientDetail.name}`)
  console.log(`   - 原床位: ${oldShiftId}`)
  console.log(`   - 目標組別: ${newTeam}`)
  console.log(`   - 目標責任區: ${newResponsibility}`)

  if (!oldShiftId || !currentRecord.schedule[oldShiftId]) {
    console.error(`❌ [StatsView] 拖曳失敗: 找不到原始紀錄 ${oldShiftId}`)
    console.log(
      `🔍 [StatsView] 當前 schedule keys:`,
      Object.keys(currentRecord.schedule).slice(0, 10),
    )
    return
  }

  const oldShiftIdParts = oldShiftId.split('-')
  const bedPart = oldShiftIdParts.slice(0, -1).join('-') // 'bed-16' or 'peripheral-1'

  let newShiftCode
  if (newResponsibility.startsWith('early')) {
    newShiftCode = SHIFT_CODES.EARLY
    console.log(`   → 目標班次: 早班 (${SHIFT_CODES.EARLY})`)
  } else if (newResponsibility.startsWith('late')) {
    newShiftCode = SHIFT_CODES.LATE
    console.log(`   → 目標班次: 晚班 (${SHIFT_CODES.LATE})`)
  } else {
    newShiftCode = SHIFT_CODES.NOON
    console.log(`   → 目標班次: 午班 (${SHIFT_CODES.NOON})`)
  }

  const newShiftId = `${bedPart}-${newShiftCode}`
  console.log(`   → 新床位ID: ${newShiftId}`)

  // 檢查目標床位是否被佔用 (只有在班次改變時才需要檢查)
  if (newShiftId !== oldShiftId && currentRecord.schedule[newShiftId]) {
    // 情境二: 床位衝突，彈出引導式換床對話框
    console.log(`⚠️ [StatsView] 床位衝突，開啟換床對話框: ${newShiftId}`)
    console.log(`   - 目標床位被佔用者: ${currentRecord.schedule[newShiftId].patientId}`)

    pendingChangeInfo.value = {
      patientDetail: patientDetail,
      newTeam: newTeam,
      newResponsibility: newResponsibility,
    }
    bedChangeTargetShift.value = newShiftCode
    openBedChangeDialog(patientDetail)
  } else {
    // 情境一: 目標床位無人，直接移動
    console.log(`✅ [StatsView] 目標床位空閒，直接移動病人`)

    const movingSlotData = { ...currentRecord.schedule[oldShiftId] }
    movingSlotData.shiftId = newShiftId

    // 清空舊的組別資訊
    const oldNurseTeam = movingSlotData.nurseTeam
    const oldNurseTeamIn = movingSlotData.nurseTeamIn
    const oldNurseTeamOut = movingSlotData.nurseTeamOut

    console.log(
      `   - 清空舊組別: nurseTeam=${oldNurseTeam}, In=${oldNurseTeamIn}, Out=${oldNurseTeamOut}`,
    )

    delete movingSlotData.nurseTeam
    delete movingSlotData.nurseTeamIn
    delete movingSlotData.nurseTeamOut

    // 根據新的責任區設定新的組別
    if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
      movingSlotData.nurseTeam = newTeam
      console.log(`   - 設定新組別: nurseTeam = ${newTeam}`)
    } else if (newResponsibility === 'noonShiftOn') {
      movingSlotData.nurseTeamIn = newTeam
      console.log(`   - 設定新組別: nurseTeamIn = ${newTeam}`)
    } else if (newResponsibility === 'noonShiftOff') {
      movingSlotData.nurseTeamOut = newTeam
      console.log(`   - 設定新組別: nurseTeamOut = ${newTeam}`)
    }

    // 處理午班對應的另一半組別
    if (newShiftCode === SHIFT_CODES.NOON) {
      const oldResponsibility = event.dataTransfer.getData('text/plain')
      console.log(`   - 午班特殊處理，原責任區: ${oldResponsibility}`)

      if (oldResponsibility === 'noonShiftOn' && oldNurseTeamOut) {
        movingSlotData.nurseTeamOut = oldNurseTeamOut
        console.log(`   - 保留原收針組別: ${oldNurseTeamOut}`)
      } else if (oldResponsibility === 'noonShiftOff' && oldNurseTeamIn) {
        movingSlotData.nurseTeamIn = oldNurseTeamIn
        console.log(`   - 保留原上針組別: ${oldNurseTeamIn}`)
      }
    }

    // 刪除舊紀錄，建立新紀錄
    delete currentRecord.schedule[oldShiftId]
    currentRecord.schedule[newShiftId] = movingSlotData

    console.log(`✅ [StatsView] 拖曳完成，病人已移動到新位置`)
    console.log(`   - 最終組別設定:`, {
      nurseTeam: movingSlotData.nurseTeam,
      nurseTeamIn: movingSlotData.nurseTeamIn,
      nurseTeamOut: movingSlotData.nurseTeamOut,
    })

    // 🆕 發送拖曳調整通知
    const targetTeamDisplay = newTeam.replace('早', '').replace('晚', '')
    const responsibilityDisplay =
      newResponsibility === 'earlyShift'
        ? '早班'
        : newResponsibility === 'lateShift'
          ? '晚班'
          : newResponsibility === 'noonShiftOn'
            ? '午班上針'
            : '午班收針'
    notifyTeamChange(patientDetail.name, '原組別', `${responsibilityDisplay}${targetTeamDisplay}組`)

    setChange()
  }
}

function onDragStart(event, patientDetail, responsibility) {
  if (isPageLocked.value) {
    console.log(`🔒 [StatsView] 頁面已鎖定，無法開始拖拽`)
    event.preventDefault()
    return
  }

  console.log(`🖱️ [StatsView] 開始拖拽:`)
  console.log(`   - 病人: ${patientDetail.name}`)
  console.log(`   - 床位: ${patientDetail.shiftId}`)
  console.log(`   - 責任區: ${responsibility}`)
  console.log(`   - 當前組別資訊:`, {
    nurseTeam: currentRecord.schedule[patientDetail.shiftId]?.nurseTeam,
    nurseTeamIn: currentRecord.schedule[patientDetail.shiftId]?.nurseTeamIn,
    nurseTeamOut: currentRecord.schedule[patientDetail.shiftId]?.nurseTeamOut,
  })

  event.dataTransfer.setData('application/json', JSON.stringify(patientDetail))
  event.dataTransfer.setData('text/plain', responsibility)
  event.dataTransfer.effectAllowed = 'move'
}

function openBedChangeDialog(patientDetail) {
  if (isPageLocked.value) {
    console.log(`🔒 [StatsView] 頁面已鎖定，無法開啟換床對話框`)
    return
  }

  console.log(`🛏️ [StatsView] 開啟換床對話框:`)
  console.log(`   - 病人: ${patientDetail.name}`)
  console.log(`   - 當前床位: ${patientDetail.shiftId}`)
  console.log(`   - 是否來自拖曳: ${pendingChangeInfo.value ? '是' : '否'}`)

  if (pendingChangeInfo.value) {
    console.log(`   - 拖曳目標組別: ${pendingChangeInfo.value.newTeam}`)
    console.log(`   - 拖曳目標責任區: ${pendingChangeInfo.value.newResponsibility}`)
  }

  editingPatientInfo.value = patientDetail
  isBedChangeDialogVisible.value = true
}

// ✨ 重構 handleBedChange - 確保換床功能完全正常 ✨
function handleBedChange({ oldShiftId, newShiftId }) {
  if (isPageLocked.value) {
    console.log(`🔒 [StatsView] 頁面已鎖定，無法換床`)
    return
  }

  if (!currentRecord.schedule[oldShiftId]) {
    console.error('❌ [StatsView] 換床失敗，找不到舊床位資料。')
    console.log(`🔍 [StatsView] 查找床位: ${oldShiftId}`)
    console.log(`🔍 [StatsView] 可用床位:`, Object.keys(currentRecord.schedule).slice(0, 10))
    isBedChangeDialogVisible.value = false
    return
  }

  console.log(`🔄 [StatsView] 處理換床:`)
  console.log(`   - 原床位: ${oldShiftId}`)
  console.log(`   - 新床位: ${newShiftId}`)

  // 檢查是否有暫存的拖曳資訊
  if (pendingChangeInfo.value) {
    console.log(`🖱️ [StatsView] 來自拖曳的換床操作`)
    const { newTeam, newResponsibility } = pendingChangeInfo.value
    const movingSlotData = { ...currentRecord.schedule[oldShiftId] }

    // 更新 slot 的 shiftId 為新選擇的床位
    movingSlotData.shiftId = newShiftId

    // 保存原有組別資訊
    const originalNurseTeam = movingSlotData.nurseTeam
    const originalNurseTeamIn = movingSlotData.nurseTeamIn
    const originalNurseTeamOut = movingSlotData.nurseTeamOut

    // 清空舊的組別資訊
    delete movingSlotData.nurseTeam
    delete movingSlotData.nurseTeamIn
    delete movingSlotData.nurseTeamOut

    // 根據最初拖曳的目標設定新的組別
    if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
      movingSlotData.nurseTeam = newTeam
      console.log(`   - 設定護理組別: ${newTeam}`)
    } else if (newResponsibility === 'noonShiftOn') {
      movingSlotData.nurseTeamIn = newTeam
      console.log(`   - 設定午班上針組別: ${newTeam}`)
    } else if (newResponsibility === 'noonShiftOff') {
      movingSlotData.nurseTeamOut = newTeam
      console.log(`   - 設定午班收針組別: ${newTeam}`)
    }

    // 刪除舊紀錄，建立新紀錄
    delete currentRecord.schedule[oldShiftId]
    currentRecord.schedule[newShiftId] = movingSlotData
    console.log(`✅ [StatsView] 拖曳換床完成`)

    // 🆕 發送拖曳換床調整通知
    const targetTeamDisplay = newTeam.replace('早', '').replace('晚', '')
    const responsibilityDisplay =
      newResponsibility === 'earlyShift'
        ? '早班'
        : newResponsibility === 'lateShift'
          ? '晚班'
          : newResponsibility === 'noonShiftOn'
            ? '午班上針'
            : '午班收針'
    notifyTeamChange(
      editingPatientInfo.value?.name || '病人',
      '原組別',
      `${responsibilityDisplay}${targetTeamDisplay}組`,
    )
  } else {
    // 原始的換床邏輯 (點擊病人卡片觸發)
    console.log(`👆 [StatsView] 來自點擊的換床操作`)
    const patientData = { ...currentRecord.schedule[oldShiftId], shiftId: newShiftId }
    delete currentRecord.schedule[oldShiftId]
    currentRecord.schedule[newShiftId] = patientData
    console.log(`✅ [StatsView] 點擊換床完成`)
  }

  setChange()
  isBedChangeDialogVisible.value = false
  // 清理暫存狀態
  pendingChangeInfo.value = null
  bedChangeTargetShift.value = null
}

// ✨ 4. 新增 handleDialogCancel 函數並綁定
function handleDialogCancel() {
  console.log(`❌ [StatsView] 取消換床對話框`)
  isBedChangeDialogVisible.value = false
  // 清理暫存狀態
  pendingChangeInfo.value = null
  bedChangeTargetShift.value = null
}

function updateNurseName(teamId, event) {
  if (isPageLocked.value) {
    event.target.value = currentRecord.names?.[teamId] || ''
    return
  }
  console.log(`👩‍⚕️ [StatsView] 更新護士姓名: ${teamId} -> ${event.target.value}`)
  if (!currentRecord.names) {
    currentRecord.names = {}
  }
  currentRecord.names[teamId] = event.target.value
  setChange()
}

function changeDate(days) {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    onConfirmAction.value = () => {
      const newDate = new Date(currentDate.value)
      newDate.setDate(newDate.getDate() + days)
      console.log(
        `📅 [StatsView] 切換日期: ${formatDate(currentDate.value)} -> ${formatDate(newDate)}`,
      )
      currentDate.value = newDate
    }
    confirmDialogMessage.value = '您有未儲存的變更，確定要切換日期嗎？'
    isConfirmDialogVisible.value = true
  } else {
    const newDate = new Date(currentDate.value)
    newDate.setDate(newDate.getDate() + days)
    console.log(
      `📅 [StatsView] 切換日期: ${formatDate(currentDate.value)} -> ${formatDate(newDate)}`,
    )
    currentDate.value = newDate
  }
}

function goToToday() {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    onConfirmAction.value = () => {
      console.log(`📅 [StatsView] 返回今日: ${formatDate(new Date())}`)
      currentDate.value = new Date()
    }
    confirmDialogMessage.value = '您有未儲存的變更，確定要切換到今天嗎？'
    isConfirmDialogVisible.value = true
  } else {
    console.log(`📅 [StatsView] 返回今日: ${formatDate(new Date())}`)
    currentDate.value = new Date()
  }
}

function handleConfirm() {
  if (onConfirmAction.value) {
    onConfirmAction.value()
  }
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

function handleCancel() {
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  event.currentTarget.classList.add('drag-over-active')
}

function onDragLeave(event) {
  event.currentTarget.classList.remove('drag-over-active')
}

function triggerPrint() {
  console.log(`🖨️ [StatsView] 觸發列印報表`)
  window.print()
}

provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

onMounted(() => {
  console.log(`🚀 [StatsView] 組件已掛載，開始初始化...`)
  loadData(currentDate.value)
})

watch(currentDate, (newDate) => {
  loadData(newDate)
})
</script>

<template>
  <div class="page-container">
    <div class="header-toolbar">
      <div class="toolbar-left">
        <h1 class="page-title">護理分組檢視</h1>
        <div class="date-navigator">
          <button @click="changeDate(-1)" class="date-nav-btn">< 上一天</button>
          <span class="current-date-text">{{ formatDate(currentDate) }}</span>
          <span class="weekday-display">{{ weekdayDisplay }}</span>
          <button @click="changeDate(1)" class="date-nav-btn">下一天 ></button>
          <button @click="goToToday">回到今日</button>
        </div>
      </div>
      <div class="toolbar-right">
        <span class="status-indicator">{{ statusIndicator }}</span>
        <button
          id="save-changes-btn"
          :disabled="!hasUnsavedChanges || isPageLocked"
          @click="saveChangesToCloud"
        >
          儲存變更
        </button>
        <button @click="triggerPrint">列印報表</button>
      </div>
    </div>

    <div class="duty-command-bar">
      <div class="main-commanders">
        <span class="duty-title">消防編組:</span>
        <span class="duty-role-tag role-commander">總指揮官</span>
        <span class="duty-person">廖丁瑩主任</span>
        <span class="duty-divider"></span>
        <span class="duty-role-tag role-reporter">通報班</span>
        <span class="duty-person">謝淑琴書記</span>
        <span class="duty-divider"></span>
        <span class="duty-role-tag role-field-commander">現場指揮官</span>
        <span class="duty-person">莊明月護理長</span>
        <span class="duty-divider"></span>
        <span class="duty-role-tag role-guide">引導救護班</span>
        <span class="duty-person">工友</span>
      </div>
      <div class="duty-dropdown-wrapper">
        <button
          class="duty-dropdown-trigger"
          @click="isFireDutyDropdownVisible = !isFireDutyDropdownVisible"
        >
          <span>勤務分組詳情</span>
          <span class="toggle-arrow" :class="{ 'is-rotated': isFireDutyDropdownVisible }">▼</span>
        </button>
        <transition name="slide-fade">
          <div v-if="isFireDutyDropdownVisible" class="duty-dropdown-menu">
            <div v-for="(duties, shift) in dutyAssignments" :key="shift" class="duty-shift-group">
              <h4 class="duty-shift-header">
                {{ shift === 'early' ? '早班' : shift === 'late' ? '午/晚班' : '夜班' }}
              </h4>
              <div class="duty-item" v-for="(teams, dutyName) in duties" :key="dutyName">
                <div class="duty-name" :class="getDutyTagClass(dutyName)">{{ dutyName }}</div>
                <div class="duty-teams">
                  <span
                    v-if="Array.isArray(teams)"
                    v-for="team in teams"
                    :key="team"
                    class="duty-team-tag"
                    >{{ team }}</span
                  >
                  <span v-else class="duty-team-tag">{{ teams }}</span>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <div class="stats-sections-wrapper">
      <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
        <div class="grid-container">
          <div class="grid-header">
            <div class="row-header section-title-cell">早班</div>
            <div
              v-for="(_, teamName) in effectiveStatsData.early"
              :key="teamName"
              class="team-header-cell"
            >
              {{ teamName.replace('早', '') }}組
            </div>
          </div>
          <div class="grid-body">
            <div class="grid-row">
              <div class="row-header">姓名</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.early"
                :key="teamName"
                class="grid-cell name-cell"
              >
                <select
                  :value="teamData.nurseName"
                  @change="updateNurseName(teamName, $event)"
                  class="name-select"
                  :disabled="isPageLocked"
                >
                  <option value="">-- 未指派 --</option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">早班</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.early"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'earlyShift')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.earlyShift.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'earlyShift')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.earlyShift.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'earlyShift')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">午班(上針)</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.early"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOn')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.noonShiftOn.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOn')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.noonShiftOn.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'noonShiftOn')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">午班(收針)</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.early"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOff')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.noonShiftOff.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOff')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.noonShiftOff.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'noonShiftOff')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
          </div>
          <div class="grid-footer">
            <div class="row-header">照護人數</div>
            <div
              v-for="(teamData, teamName) in effectiveStatsData.early"
              :key="teamName"
              class="total-count-summary"
            >
              門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
                teamData.totalErCount
              }}
            </div>
          </div>
        </div>
      </div>

      <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
        <div class="grid-container">
          <div class="grid-header">
            <div class="row-header section-title-cell">晚班</div>
            <div
              v-for="(_, teamName) in effectiveStatsData.late"
              :key="teamName"
              class="team-header-cell"
            >
              {{ teamName.replace('晚', '') }}組
            </div>
          </div>
          <div class="grid-body">
            <div class="grid-row">
              <div class="row-header">姓名</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.late"
                :key="teamName"
                class="grid-cell name-cell"
              >
                <select
                  :value="teamData.nurseName"
                  @change="updateNurseName(teamName, $event)"
                  class="name-select"
                  :disabled="isPageLocked"
                >
                  <option value="">-- 未指派 --</option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">午班(收針)</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.late"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOff')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.noonShiftOff.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOff')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.noonShiftOff.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'noonShiftOff')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">晚班</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.late"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'lateShift')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.lateShift.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'lateShift')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.lateShift.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'lateShift')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
          </div>
          <div class="grid-footer">
            <div class="row-header">照護人數</div>
            <div
              v-for="(teamData, teamName) in effectiveStatsData.late"
              :key="teamName"
              class="total-count-summary"
            >
              門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
                teamData.totalErCount
              }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />
    <BedChangeDialog
      :is-visible="isBedChangeDialogVisible"
      :patient-info="editingPatientInfo"
      :current-schedule="currentRecord.schedule"
      :target-shift-filter="bedChangeTargetShift"
      @confirm="handleBedChange"
      @cancel="handleDialogCancel"
    />
    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
    <ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      title="請確認"
      :message="confirmDialogMessage"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
    <PreparationPopover
      :is-visible="isPrepPopoverVisible"
      :patients="prepPopoverData.patients"
      :target-element="prepPopoverData.targetElement"
      @close="onPrepPopoverClose"
    />
  </div>
</template>

<style scoped>
.stats-sections-wrapper {
  overflow-y: auto;
  flex-grow: 1;
}
.stats-section {
  margin-bottom: 20px;
}
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 10px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}
.page-title {
  font-size: 32px;
  color: #333;
  margin: 0;
  white-space: nowrap;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 5px;
}
.current-date-text {
  font-size: 26px;
  font-weight: bold;
  color: #333;
  padding: 0 10px;
}
.weekday-display {
  font-size: 26px;
  font-weight: bold;
  color: var(--primary-color);
  margin-left: -10px;
  margin-right: 10px;
}
.status-indicator {
  font-size: 0.9em;
  font-weight: bold;
  color: #757575;
  font-style: italic;
}
.toolbar-left button,
.toolbar-right button {
  padding: 8px 15px;
  font-size: 1em;
  cursor: pointer;
  border-radius: 5px;
  border: 1px solid #ccc;
  background-color: #fff;
  transition:
    background-color 0.2s,
    border-color 0.2s;
  white-space: nowrap;
}
#save-changes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
.grid-container {
  display: grid;
  grid-template-columns: 90px repeat(12, 1fr);
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.grid-header,
.grid-body,
.grid-footer {
  display: contents;
}
.grid-row {
  display: contents;
}
.row-header,
.team-header-cell,
.grid-cell,
.total-count-summary {
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  padding: 8px;
  word-wrap: break-word;
}
.grid-container div:nth-child(13n) {
  border-right: none;
}
.grid-footer > div {
  border-bottom: none;
}
.row-header {
  background-color: #f2f2f2;
  font-weight: bold;
  text-align: center;
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.team-header-cell {
  background-color: #e3f2fd;
  font-weight: bold;
  text-align: center;
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.section-title-cell {
  font-size: 1.5em;
  color: #005a9c;
  background-color: #e3f2fd;
  position: sticky;
  top: 0;
  left: 0;
  z-index: 3;
}
.name-cell {
  padding: 0 !important;
}
.name-select {
  width: 100%;
  height: 100%;
  border: none;
  background-color: #fffde7;
  text-align: center;
  font-size: 1em;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  padding: 8px;
}
.name-select:focus {
  outline: 2px solid #fbc02d;
}
.patient-list-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  text-align: left;
  vertical-align: top;
  min-height: 120px;
  transition: background-color 0.2s;
}
.patient-list-cell.drag-over-active {
  background-color: #e8f5e9;
  border: 2px dashed #4caf50;
}
.patient-wrapper {
  flex-grow: 1;
}
.total-count-summary {
  background-color: #f8f9fa;
  font-weight: bold;
  text-align: center;
  color: #333;
  padding: 10px 8px;
}
.patient-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  padding: 6px 8px;
  margin-bottom: 5px;
  border-radius: 4px;
  border: 1px solid #b0bec5;
  background-color: #f5f5f5;
  font-size: 0.95em;
  line-height: 1.4;
  user-select: none;
}
.patient-main-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-grow: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
:deep(.patient-line-one) {
  font-weight: bold;
  font-size: 1em;
  white-space: nowrap;
}
:deep(.patient-line-two) {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
  white-space: nowrap;
}
:deep(.note-display) {
  color: #c62828;
  font-weight: bold;
}
:deep(.memo-icon-wrapper) {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
  align-self: center;
}
.patient-item:active {
  cursor: grabbing;
  background-color: #e0e0e0;
  opacity: 0.8;
  transform: scale(1.02);
}
.patient-item.status-opd {
  background-color: var(--green-bg, #e8f5e9);
  border-color: #a5d6a7;
}
.patient-item.status-ipd {
  background-color: var(--red-bg, #ffebee);
  border-color: #ef9a9a;
}
.patient-item.status-er {
  background-color: var(--purple-bg, #f3e5f5);
  border-color: #ce93d8;
}
.patient-item.tag-b {
  background-color: #fff9c4;
  border-color: #fff59d;
}
.patient-item.tag-liang {
  background-color: #fff3e0;
  border-color: #ffe0b2;
}
.patient-item.tag-huan {
  background-color: #e0f7fa;
  border-color: #b2ebf2;
}
.patient-item.tag-new {
  background-color: #f5ec8e;
  border-color: #e0d567;
}
.patient-item.tag-chou {
  background-color: #8cbdf6;
  border-color: #42a5f5;
}
.patient-item.has-note-highlight :deep(.patient-line-one) {
  color: #c62828;
}
:deep(.stats-special-mode) {
  display: inline-block;
  vertical-align: middle;
  padding: 1px 5px;
  background-color: var(--red-bg, #ffebee);
  color: #c62828;
  border: 1px solid #ef9a9a;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.9em;
  line-height: 1.2;
}
.prep-list-trigger {
  position: absolute;
  bottom: 4px;
  right: 6px;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 2px;
  border-radius: 4px;
  transition: background-color 0.2s;
  user-select: none;
}
.prep-list-trigger:hover {
  background-color: #e0e0e0;
}
.is-locked .stats-section {
  cursor: not-allowed;
}
.is-locked .patient-list-cell {
  background-color: #f5f5f5;
}
.is-locked .name-select {
  pointer-events: none;
  background-color: #eeeeee;
}
.is-locked .patient-main-info {
  cursor: not-allowed;
}
.is-locked .patient-item {
  pointer-events: none;
}
.is-locked :deep(.memo-icon-wrapper),
.is-locked .prep-list-trigger {
  pointer-events: auto;
  cursor: pointer;
}
.duty-command-bar {
  background-color: #fffbeb;
  border: 1px solid #fef3c7;
  padding: 4px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.main-commanders {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.duty-title {
  font-weight: 600;
  font-size: 1.1em;
  color: #b45309;
}
.duty-role-tag {
  font-size: 0.85em;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  color: #fff;
}
.duty-role-tag.role-commander {
  background-color: #be185d;
}
.duty-role-tag.role-reporter {
  background-color: #059669;
}
.duty-role-tag.role-field-commander {
  background-color: #d97706;
}
.duty-role-tag.role-worker {
  background-color: #6d28d9;
}
.duty-role-tag.role-guide {
  background-color: #0d9488;
}
.duty-person {
  font-weight: 500;
  color: #1e293b;
  margin-left: -4px;
}
.duty-divider {
  width: 1px;
  height: 16px;
  background-color: #d1d5db;
  margin: 0 4px;
}
.duty-dropdown-wrapper {
  position: relative;
}
.duty-dropdown-trigger {
  background-color: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  height: 40px;
}
.duty-dropdown-trigger:hover {
  background-color: #e2e8f0;
}
.duty-dropdown-trigger .toggle-arrow {
  transition: transform 0.2s ease-in-out;
  font-size: 0.8em;
}
.duty-dropdown-trigger .toggle-arrow.is-rotated {
  transform: rotate(180deg);
}
.duty-dropdown-menu {
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
  background-color: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 600px;
  z-index: 100;
  padding: 12px;
}
.duty-shift-group {
  margin-bottom: 12px;
}
.duty-shift-group:last-child {
  margin-bottom: 0;
}
.duty-shift-header {
  font-size: 1.1em;
  font-weight: bold;
  color: #005a9c;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 2px solid #e2e8f0;
}
.duty-item {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
  font-size: 0.95em;
}
.duty-name {
  font-size: 0.9em;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  color: #fff;
  text-align: center;
  justify-self: end;
}
.duty-name.role-field-commander {
  background-color: #d97706;
}
.duty-name.role-safety {
  background-color: #2563eb;
}
.duty-name.role-guide {
  background-color: #0d9488;
}
.duty-name.role-fire {
  background-color: #be185d;
}
.duty-name.role-reporter,
.duty-name[class*='通報班'] {
  background-color: #059669;
}
.duty-name.role-default {
  background-color: #475569;
}
.duty-teams {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.duty-team-tag {
  background-color: #e0e7ff;
  color: #3730a3;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.slide-fade-enter-active {
  transition: all 0.2s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-5px);
  opacity: 0;
}
</style>
