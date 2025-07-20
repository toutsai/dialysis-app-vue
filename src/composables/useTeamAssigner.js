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

    // H, I, J, K 組: 住院 + 急診
    if (inPatientTeams && inPatientCapacity) {
      const unassignedInPatients = allPatients.filter(
        (p) => isInPatientOrER(p) && !assignedPatientIds.has(p.id),
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

    // 分離住院/急診病人和一般病人
    const remainingInPatients = remainingPatients.filter((p) => isInPatientOrER(p))
    const remainingOutPatients = remainingPatients.filter((p) => !isInPatientOrER(p))

    let inPatientIndex = 0
    let outPatientIndex = 0

    const { specialTeam, regularTeams, primaryCapacity, fillMethod } = rules.mainDistribution

    // 填充特殊組 (如早A) - 只給一般病人
    if (specialTeam) {
      while (
        assignments[specialTeam.name].length < specialTeam.capacity &&
        outPatientIndex < remainingOutPatients.length
      ) {
        addPatient(specialTeam.name, remainingOutPatients[outPatientIndex++])
      }
    }

    const finalRegularTeams = regularTeams.filter((t) => t !== specialTeam?.name)

    if (fillMethod === 'block') {
      // --- 區塊填充邏輯 ---
      // 先分配住院/急診病人到 B-F 組
      for (const team of finalRegularTeams) {
        while (
          assignments[team].length < primaryCapacity &&
          inPatientIndex < remainingInPatients.length
        ) {
          addPatient(team, remainingInPatients[inPatientIndex++])
        }
      }
      // 再分配一般病人到 B-F 組
      for (const team of finalRegularTeams) {
        while (
          assignments[team].length < primaryCapacity &&
          outPatientIndex < remainingOutPatients.length
        ) {
          addPatient(team, remainingOutPatients[outPatientIndex++])
        }
      }
    } else if (fillMethod === 'average') {
      // --- 平均填充邏輯 ---
      // 先計算住院/急診病人的分配
      const inPatientsToDistribute = [...remainingInPatients]
      let totalInPatientsForRegularTeams = 0
      finalRegularTeams.forEach((team) => {
        totalInPatientsForRegularTeams += assignments[team].filter((p) => isInPatientOrER(p)).length
      })
      totalInPatientsForRegularTeams += inPatientsToDistribute.length

      const numTeams = finalRegularTeams.length
      if (numTeams > 0 && inPatientsToDistribute.length > 0) {
        const baseInCount = Math.floor(totalInPatientsForRegularTeams / numTeams)
        let inRemainder = totalInPatientsForRegularTeams % numTeams

        for (const team of finalRegularTeams) {
          const currentInPatients = assignments[team].filter((p) => isInPatientOrER(p)).length
          const targetInCount = baseInCount + (inRemainder > 0 ? 1 : 0)
          const inNeeded = Math.max(0, targetInCount - currentInPatients)
          for (let i = 0; i < inNeeded && inPatientsToDistribute.length > 0; i++) {
            const patient = inPatientsToDistribute.shift()
            addPatient(team, patient)
          }
          if (inRemainder > 0) inRemainder--
        }
      }

      // 再分配一般病人
      const outPatientsToDistribute = [...remainingOutPatients]
      let totalOutPatientsForRegularTeams = 0
      finalRegularTeams.forEach((team) => {
        totalOutPatientsForRegularTeams += assignments[team].filter(
          (p) => !isInPatientOrER(p),
        ).length
      })
      totalOutPatientsForRegularTeams += outPatientsToDistribute.length

      if (numTeams > 0 && outPatientsToDistribute.length > 0) {
        const baseOutCount = Math.floor(totalOutPatientsForRegularTeams / numTeams)
        let outRemainder = totalOutPatientsForRegularTeams % numTeams

        for (const team of finalRegularTeams) {
          const currentOutPatients = assignments[team].filter((p) => !isInPatientOrER(p)).length
          const targetOutCount = baseOutCount + (outRemainder > 0 ? 1 : 0)
          const outNeeded = Math.max(0, targetOutCount - currentOutPatients)
          for (let i = 0; i < outNeeded && outPatientsToDistribute.length > 0; i++) {
            const patient = outPatientsToDistribute.shift()
            addPatient(team, patient)
          }
          if (outRemainder > 0) outRemainder--
        }
      }
    }

    // --- 3. 溢出分配 (Overflow Pass) ---
    // 在區塊填充後，可能還有剩餘病人需要輪循分配
    const overflowInPatients = remainingInPatients.filter((p) => !assignedPatientIds.has(p.id))
    const overflowOutPatients = remainingOutPatients.filter((p) => !assignedPatientIds.has(p.id))

    // 住院/急診病人溢出分配到 B-F 組
    let inOverflowIndex = 0
    while (inOverflowIndex < overflowInPatients.length) {
      const team = finalRegularTeams[inOverflowIndex % finalRegularTeams.length]
      addPatient(team, overflowInPatients[inOverflowIndex++])
    }

    // 一般病人溢出分配到所有可用組別
    const allAvailableTeams = [specialTeam?.name, ...finalRegularTeams].filter(Boolean)
    let outOverflowIndex = 0
    while (outOverflowIndex < overflowOutPatients.length) {
      const team = allAvailableTeams[outOverflowIndex % allAvailableTeams.length]
      addPatient(team, overflowOutPatients[outOverflowIndex++])
    }

    return assignments
  }

  return { distributePatients }
}
