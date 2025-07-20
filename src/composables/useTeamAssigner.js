// src/composables/useTeamAssigner.js

/**
 * 根據複雜的臨床規則分配病人到護理組別。
 * @returns {{ distributePatients: function }}
 */
export function useTeamAssigner() {
  /**
   * 核心分配引擎
   * @param {Array<Object>} allPatients - 所有待分配的病人 (已預先排序)
   * @param {Array<string>} teams - 本次分配可用的組別
   * @param {Object} rules - 本次分配的規則
   * @returns {Object} 分配結果
   */
  const distributePatients = (allPatients, teams, rules) => {
    const assignments = {}
    teams.forEach((t) => {
      assignments[t] = []
    })

    const assignedPatientIds = new Set()
    const addPatient = (team, patient) => {
      // 🔥 防護：拒絕K組分配
      if (team && team.includes('K')) {
        console.warn(`⚠️ 嘗試分配到K組被阻止: ${patient?.id || '未知病人'} → ${team}`)
        return false
      }

      // 確保組別存在且病人未被分配
      if (patient && assignments[team] && !assignedPatientIds.has(patient.id)) {
        assignments[team].push(patient)
        assignedPatientIds.add(patient.id)
        return true
      }
      return false
    }

    // 輔助函數：判斷是否為住院/急診病人
    const isInPatientOrER = (patient) => {
      return patient.status === 'ipd' || patient.status === 'er'
    }

    // --- 1. 優先分配 (Priority Pass) ---
    const { hepatitis, inPatientTeams, inPatientCapacity } = rules.priorityTeams

    // G組: 肝炎
    if (hepatitis) {
      allPatients.filter((p) => p.isHepatitis).forEach((p) => addPatient(hepatitis, p))
    }

    // H, I, J 組: 住院 + 急診（排除K組）
    if (inPatientTeams && inPatientCapacity) {
      const validInPatientTeams = inPatientTeams.filter((team) => !team.includes('K'))
      const unassignedInPatients = allPatients.filter(
        (p) => isInPatientOrER(p) && !assignedPatientIds.has(p.id),
      )
      unassignedInPatients.forEach((p) => {
        for (const team of validInPatientTeams) {
          if (assignments[team] && assignments[team].length < inPatientCapacity[team]) {
            if (addPatient(team, p)) break
          }
        }
      })
    }

    // --- 2. 主要分配 (平均分配 + 區塊填充) ---
    const { specialTeam, regularTeams, fillMethod } = rules.mainDistribution

    // 過濾掉K組
    const filteredRegularTeams = regularTeams.filter((team) => !team.includes('K'))

    // 計算總人數（排除外圍）
    const mainAreaPatients = allPatients.filter((p) => !p.isPeripheral)
    const totalMainAreaCount = mainAreaPatients.length

    console.log(`📊 主區域總人數: ${totalMainAreaCount}`)

    // 根據人數和班別決定參與分配的組別
    let participatingTeams = []
    let remainingPatients = allPatients.filter((p) => !assignedPatientIds.has(p.id))

    if (fillMethod === 'block' && totalMainAreaCount > 36) {
      // >36人：A組先分2人，剩下平均分給B-J組
      if (specialTeam && !specialTeam.name.includes('K')) {
        let aTeamCount = 0
        while (aTeamCount < specialTeam.capacity && remainingPatients.length > 0) {
          const patient = remainingPatients.shift()
          addPatient(specialTeam.name, patient)
          aTeamCount++
        }
        console.log(`🎯 A組分配: ${aTeamCount}人`)
      }
      participatingTeams = filteredRegularTeams.filter((t) => t !== specialTeam?.name)
    } else if (fillMethod === 'average') {
      // 晚班：A-H組都參與平均分配
      participatingTeams = [specialTeam?.name, ...filteredRegularTeams]
        .filter(Boolean)
        .filter((team) => !team.includes('K'))
    } else {
      // ≤36人：A組不分，B-J組平均分配
      participatingTeams = filteredRegularTeams.filter((t) => t !== specialTeam?.name)
    }

    console.log(`🎯 參與平均分配的組別:`, participatingTeams)

    // 重新計算剩餘病人
    remainingPatients = allPatients.filter((p) => !assignedPatientIds.has(p.id))
    const remainingCount = remainingPatients.length

    if (remainingCount > 0 && participatingTeams.length > 0) {
      // 📊 計算平均分配
      const baseCount = Math.floor(remainingCount / participatingTeams.length)
      const remainder = remainingCount % participatingTeams.length

      console.log(`📊 剩餘病人: ${remainingCount}人, 參與組別: ${participatingTeams.length}組`)
      console.log(`📊 平均分配: 基數${baseCount}人/組, 餘數${remainder}人`)

      // 🔍 檢查每組現有人數並計算目標人數
      const targetCounts = {}
      participatingTeams.forEach((team, index) => {
        const currentCount = assignments[team]?.length || 0
        const extraOne = index < remainder ? 1 : 0
        const targetCount = currentCount + baseCount + extraOne
        targetCounts[team] = {
          current: currentCount,
          target: targetCount,
          needed: Math.max(0, targetCount - currentCount),
        }
      })

      console.log(`📊 各組分配計畫:`, targetCounts)

      // 🏗️ 區塊填充：按順序補充到目標人數
      let patientIndex = 0
      for (const team of participatingTeams) {
        const needed = targetCounts[team].needed
        console.log(`🏗️ ${team}組需要補充: ${needed}人`)

        let filled = 0
        while (filled < needed && patientIndex < remainingPatients.length) {
          const patient = remainingPatients[patientIndex++]
          if (addPatient(team, patient)) {
            filled++
            console.log(`  → ${patient.id} 加入 ${team}組`)
          }
        }
      }

      // 🌊 處理剩餘病人（從B組開始+1）
      if (patientIndex < remainingPatients.length) {
        console.log(`🌊 還有 ${remainingPatients.length - patientIndex} 個剩餘病人，從B組開始+1`)
        let teamIndex = 0
        while (patientIndex < remainingPatients.length) {
          const team = participatingTeams[teamIndex % participatingTeams.length]
          const patient = remainingPatients[patientIndex++]
          if (addPatient(team, patient)) {
            console.log(`  → ${patient.id} 溢出到 ${team}組`)
          }
          teamIndex++
        }
      }
    }

    // 🔥 最終檢查：確保K組為空
    Object.keys(assignments).forEach((team) => {
      if (team.includes('K') && assignments[team].length > 0) {
        console.error(`❌ 錯誤：K組 ${team} 不應該有病人！`, assignments[team])
        assignments[team] = [] // 強制清空K組
      }
    })

    console.log(
      '✅ 分配完成，最終結果:',
      Object.fromEntries(
        Object.entries(assignments).map(([team, patients]) => [team, patients.length]),
      ),
    )

    return assignments
  }

  return { distributePatients }
}
