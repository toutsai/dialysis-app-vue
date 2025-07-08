// src/services/scheduleService.js (完整修正版)

import { doc, updateDoc, where } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import ApiManager from './api_manager.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'

const schedulesApi = ApiManager('schedules')

/**
 * 功能一：徹底刪除指定病人從某個日期（含）開始的所有未來排程。
 * 用於：中止透析、刪除病人至回收區。
 * @param {string} patientId - 要清除排程的病人 ID。
 * @param {Date} [startDate] - (可選) 清除的起始日期，預設為今天。
 */
export async function clearFutureSchedulesForPatient(patientId, startDate = new Date()) {
  if (!patientId) {
    console.error('[clearFutureSchedules] Patient ID is required.')
    return
  }

  const today = new Date(startDate)
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  console.log(`[clearFutureSchedules] Starting for patient ${patientId} from date ${todayStr}...`)

  try {
    const futureScheduleDocs = await schedulesApi.fetchAll([where('date', '>=', todayStr)])

    if (futureScheduleDocs.length === 0) {
      console.log('[clearFutureSchedules] No future schedule documents found. Nothing to do.')
      return
    }

    const updatePromises = []

    for (const docData of futureScheduleDocs) {
      const scheduleMap = docData.schedule || {}
      let isModified = false
      const newScheduleMap = { ...scheduleMap }

      for (const slotId in newScheduleMap) {
        if (newScheduleMap[slotId]?.patientId === patientId) {
          delete newScheduleMap[slotId]
          isModified = true
          console.log(`  - Marked slot ${slotId} for removal on ${docData.date}.`)
        }
      }

      if (isModified) {
        const docRef = doc(db, 'schedules', docData.id)
        updatePromises.push(updateDoc(docRef, { schedule: newScheduleMap, updatedAt: new Date() }))
      }
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises)
      console.log(
        `[clearFutureSchedules] Successfully cleared schedules for patient ${patientId} on ${updatePromises.length} dates.`,
      )
    } else {
      console.log(
        `[clearFutureSchedules] Patient ${patientId} was not found in any future schedules.`,
      )
    }
  } catch (error) {
    console.error(`[clearFutureSchedules] CRITICAL ERROR for patient ${patientId}:`, error)
    throw new Error('清除未來排程時發生錯誤，請手動檢查排班表！')
  }
}

/**
 * 功能二：僅清理未來排程中的臨時數據（不刪除排程本身）。
 * 用於：轉床（例如從住院轉門診）。
 * @param {string} patientId - 病人 ID。
 * @param {object} updatedPatientData - 包含病人新狀態的完整物件。
 * @param {Date} [startDate] - (可選) 起始日期，預設為今天。
 */
export async function cleanTemporaryDataInFutureSchedules(
  patientId,
  updatedPatientData,
  startDate = new Date(),
) {
  if (!patientId || !updatedPatientData) {
    console.error('[cleanTempData] patientId and updatedPatientData are required.')
    return
  }

  const today = new Date(startDate)
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  console.log(`[cleanTempData] Starting for patient ${patientId} from date ${todayStr}...`)

  try {
    const futureScheduleDocs = await schedulesApi.fetchAll([where('date', '>=', todayStr)])
    const updatePromises = []

    for (const docData of futureScheduleDocs) {
      let isModified = false
      const newSchedule = { ...docData.schedule }

      for (const shiftId in newSchedule) {
        if (newSchedule[shiftId]?.patientId === patientId) {
          isModified = true
          const slot = newSchedule[shiftId]
          slot.manualNote = '' // 清理手動備註
          slot.nurseTeam = null // 清理護理師分配
          slot.nurseTeamIn = null
          slot.nurseTeamOut = null
          slot.autoNote = generateAutoNote(updatedPatientData) // 根據新狀態更新自動標籤
          console.log(`  - Cleaned temporary data in slot ${shiftId} on ${docData.date}.`)
        }
      }
      if (isModified) {
        updatePromises.push(
          schedulesApi.update(docData.id, { schedule: newSchedule, updatedAt: new Date() }),
        )
      }
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises)
      console.log(
        `[cleanTempData] Successfully cleaned temp data on ${updatePromises.length} dates.`,
      )
    }
  } catch (error) {
    console.error(`[cleanTempData] CRITICAL ERROR for patient ${patientId}:`, error)
    throw new Error('清理排程臨時資料時發生錯誤！')
  }
}
