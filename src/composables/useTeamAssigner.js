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
      // 確保組別存在且病人未被分配
      if (patient && assignments[team] && !assignedPatientIds.has(patient.id)) {
        assignments[team].push(patient)
        assignedPatientIds.add(patient.id)
        return true
      }
      return false
    }

    // --- 1. 優先分配 (Priority Pass) ---
    const { hepatitis, inPatientTeams, inPatientCapacity } = rules.priorityTeams

    // G組: 肝炎
    if (hepatitis) {
      allPatients.filter((p) => p.isHepatitis).forEach((p) => addPatient(hepatitis, p))
    }

    // H, I, J, K 組: 住院
    if (inPatientTeams && inPatientCapacity) {
      const unassignedInPatients = allPatients.filter(
        (p) => p.status === 'ipd' && !assignedPatientIds.has(p.id),
      )
      unassignedInPatients.forEach((p) => {
        for (const team of inPatientTeams) {
          if (assignments[team] && assignments[team].length < inPatientCapacity[team]) {
            if (addPatient(team, p)) break
          }
        }
      })
    }

    // --- 2. 主要分配 (Main Pass) ---
    const remainingPatients = allPatients.filter((p) => !assignedPatientIds.has(p.id))
    let patientIndex = 0

    const { specialTeam, regularTeams, primaryCapacity, fillMethod } = rules.mainDistribution

    // 填充特殊組 (如早A)
    if (specialTeam) {
      while (
        assignments[specialTeam.name].length < specialTeam.capacity &&
        patientIndex < remainingPatients.length
      ) {
        addPatient(specialTeam.name, remainingPatients[patientIndex++])
      }
    }

    const finalRegularTeams = regularTeams.filter((t) => t !== specialTeam?.name)

    if (fillMethod === 'block') {
      // --- 區塊填充邏輯 ---
      for (const team of finalRegularTeams) {
        while (
          assignments[team].length < primaryCapacity &&
          patientIndex < remainingPatients.length
        ) {
          addPatient(team, remainingPatients[patientIndex++])
        }
      }
    } else if (fillMethod === 'average') {
      // --- 平均填充邏輯 ---
      const patientsToDistribute = [...remainingPatients] // 創建副本以安全地操作
      // 計算每個常規組最終應該有多少病人
      let totalPatientsForRegularTeams = 0
      finalRegularTeams.forEach((team) => {
        totalPatientsForRegularTeams += assignments[team].length
      })
      totalPatientsForRegularTeams += patientsToDistribute.length

      const numTeams = finalRegularTeams.length
      if (numTeams > 0) {
        const baseCount = Math.floor(totalPatientsForRegularTeams / numTeams)
        let remainder = totalPatientsForRegularTeams % numTeams

        for (const team of finalRegularTeams) {
          const targetCount = baseCount + (remainder > 0 ? 1 : 0)
          const needed = targetCount - assignments[team].length
          for (let i = 0; i < needed && patientsToDistribute.length > 0; i++) {
            const patient = patientsToDistribute.shift() // 從頭部取出病人
            addPatient(team, patient)
          }
          if (remainder > 0) remainder--
        }
        // 如果還有剩餘（通常不應該發生，但作為保險），則輪循分配
        patientIndex = 0
        while (patientIndex < patientsToDistribute.length) {
          const team = finalRegularTeams[patientIndex % finalRegularTeams.length]
          addPatient(team, patientsToDistribute[patientIndex++])
        }
      }
    }

    // --- 3. 溢出分配 (Overflow Pass) ---
    // 在區塊填充後，可能還有剩餘病人需要輪循分配
    const overflowPatients = allPatients.filter((p) => !assignedPatientIds.has(p.id))
    let overflowIndex = 0
    while (overflowIndex < overflowPatients.length) {
      const team = finalRegularTeams[overflowIndex % finalRegularTeams.length]
      addPatient(team, overflowPatients[overflowIndex++])
    }

    return assignments
  }

  return { distributePatients }
}
