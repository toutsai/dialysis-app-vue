// 檔案路徑: src/services/baseScheduleService.js
// 專門處理總床位表的服務函數

import ApiManager from '@/services/api_manager.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'

const baseSchedulesApi = ApiManager('base_schedules')

/**
 * 從總床位表中移除指定病人的所有規則
 * @param {string} patientId - 病人ID
 * @returns {Promise<void>}
 */
export async function removePatientFromBaseSchedule(patientId) {
  console.log(`🗑️ [BaseScheduleService] 開始從總床位表移除病人: ${patientId}`)

  try {
    // 1. 讀取當前總床位表
    const masterDoc = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')

    if (!masterDoc || !masterDoc.schedule) {
      console.log('⚠️ [BaseScheduleService] 總床位表不存在或為空，無需操作')
      return
    }

    // 2. 過濾掉該病人的所有規則
    const currentRules = masterDoc.schedule
    const filteredRules = {}
    let removedCount = 0

    for (const ruleId in currentRules) {
      const rule = currentRules[ruleId]
      if (rule && rule.patientId === patientId) {
        removedCount++
        console.log(`🗑️ [BaseScheduleService] 移除規則: ${ruleId}`)
      } else {
        filteredRules[ruleId] = rule
      }
    }

    // 3. 如果有規則被移除，則更新總床位表
    if (removedCount > 0) {
      await baseSchedulesApi.save('MASTER_SCHEDULE', {
        schedule: filteredRules,
        updatedAt: new Date(),
        lastModifiedBy: 'system_auto_cleanup',
      })

      console.log(`✅ [BaseScheduleService] 成功移除 ${removedCount} 條規則，總床位表已更新`)
    } else {
      console.log('ℹ️ [BaseScheduleService] 該病人在總床位表中沒有規則，無需更新')
    }
  } catch (error) {
    console.error('❌ [BaseScheduleService] 移除病人規則失敗:', error)
    throw new Error(`移除病人規則失敗: ${error.message}`)
  }
}

/**
 * 更新總床位表中指定病人的頻率
 * @param {string} patientId - 病人ID
 * @param {string} newFreq - 新頻率
 * @param {object} patientData - 完整的病人資料（用於重新生成autoNote）
 * @returns {Promise<void>}
 */
export async function updatePatientFreqInBaseSchedule(patientId, newFreq, patientData) {
  console.log(`🔄 [BaseScheduleService] 開始更新病人頻率: ${patientId} → ${newFreq}`)

  try {
    // 1. 讀取當前總床位表
    const masterDoc = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')

    if (!masterDoc || !masterDoc.schedule) {
      console.log('⚠️ [BaseScheduleService] 總床位表不存在，無法更新頻率')
      return
    }

    // 2. 找到該病人的所有規則並更新
    const currentRules = { ...masterDoc.schedule }
    let updatedCount = 0

    for (const ruleId in currentRules) {
      const rule = currentRules[ruleId]
      if (rule && rule.patientId === patientId) {
        // 解析舊規則ID以獲取床位和班別信息
        const parts = ruleId.split('-')
        let bedNum, shiftIndex, oldFreq

        if (parts.length >= 4 && /[一二三四五六]/.test(parts[parts.length - 1])) {
          // 新格式: bed-shift-freq 或 peripheral-num-shift-freq
          oldFreq = parts[parts.length - 1]
          if (parts[0] === 'peripheral') {
            bedNum = `${parts[0]}-${parts[1]}`
            shiftIndex = parseInt(parts[2], 10)
          } else {
            bedNum = parts[0]
            shiftIndex = parseInt(parts[1], 10)
          }
        } else {
          console.warn(`⚠️ [BaseScheduleService] 無法解析規則ID格式: ${ruleId}`)
          continue
        }

        // 生成新的規則ID
        let newRuleId
        if (bedNum.startsWith('peripheral-')) {
          newRuleId = `${bedNum}-${shiftIndex}-${newFreq}`
        } else {
          newRuleId = `${bedNum}-${shiftIndex}-${newFreq}`
        }

        // 更新規則內容
        const updatedRule = {
          ...rule,
          freq: newFreq,
          autoNote: generateAutoNote(patientData), // 重新生成自動備註
        }

        // 移除舊規則，添加新規則
        delete currentRules[ruleId]
        currentRules[newRuleId] = updatedRule

        updatedCount++
        console.log(`🔄 [BaseScheduleService] 更新規則: ${ruleId} → ${newRuleId}`)
      }
    }

    // 3. 如果有規則被更新，則保存總床位表
    if (updatedCount > 0) {
      await baseSchedulesApi.save('MASTER_SCHEDULE', {
        schedule: currentRules,
        updatedAt: new Date(),
        lastModifiedBy: 'system_freq_update',
      })

      console.log(`✅ [BaseScheduleService] 成功更新 ${updatedCount} 條規則的頻率`)
    } else {
      console.log('ℹ️ [BaseScheduleService] 該病人在總床位表中沒有規則，無需更新')
    }
  } catch (error) {
    console.error('❌ [BaseScheduleService] 更新病人頻率失敗:', error)
    throw new Error(`更新病人頻率失敗: ${error.message}`)
  }
}

// 注意：generateAutoNote 函數已從 scheduleUtils.js 導入，無需重複定義

/**
 * 檢查總床位表中是否存在指定病人的規則
 * @param {string} patientId - 病人ID
 * @returns {Promise<boolean>}
 */
export async function hasPatientInBaseSchedule(patientId) {
  try {
    const masterDoc = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')

    if (!masterDoc || !masterDoc.schedule) {
      return false
    }

    return Object.values(masterDoc.schedule).some((rule) => rule && rule.patientId === patientId)
  } catch (error) {
    console.error('❌ [BaseScheduleService] 檢查病人規則失敗:', error)
    return false
  }
}
