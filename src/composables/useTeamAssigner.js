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
    console.log('--- 🚀 正在運行【v3 - 最終修正版】的分配引擎！---')
    const assignments = {}
    teams.forEach((t) => {
      assignments[t] = []
    })

    const assignedPatientIds = new Set()
    const addPatient = (team, patient) => {
      if (team && team.includes('K')) {
        console.warn(`⚠️ 偵測到K組分配嘗試，已阻止: ${patient?.id} -> ${team}`)
        return false
      }
      if (patient && assignments[team] && !assignedPatientIds.has(patient.id)) {
        assignments[team].push(patient)
        assignedPatientIds.add(patient.id)
        return true
      }
      return false
    }

    const isOpd = (p) => p.status === 'opd'
    const isInPatientOrER = (p) => p.status === 'ipd' || p.status === 'er'

    // --- 步驟一：優先分配 (與之前相同) ---
    console.log('--- 步驟一：執行優先分配 (G, H, I, J)...')
    const { hepatitis, inPatientTeams, inPatientCapacity } = rules.priorityTeams

    if (hepatitis) {
      allPatients.filter((p) => p.isHepatitis).forEach((p) => addPatient(hepatitis, p))
    }
    if (inPatientTeams && inPatientCapacity) {
      const unassignedInPatients = allPatients.filter(
        (p) => isInPatientOrER(p) && !assignedPatientIds.has(p.id),
      )
      unassignedInPatients.forEach((p) => {
        for (const team of inPatientTeams) {
          if (assignments[team].length < inPatientCapacity[team]) {
            if (addPatient(team, p)) break
          }
        }
      })
    }

    // --- 步驟二：處理特殊組 (A組) (與之前相同) ---
    console.log('--- 步驟二：處理特殊A組...')
    const { specialTeam, regularTeams } = rules.mainDistribution
    if (specialTeam) {
      const availableOpdPatients = allPatients.filter(
        (p) => !assignedPatientIds.has(p.id) && isOpd(p) && !p.isHepatitis,
      )
      const patientsForSpecialTeam = availableOpdPatients.slice(0, specialTeam.capacity)
      patientsForSpecialTeam.forEach((p) => addPatient(specialTeam.name, p))
    }

    // 🔥↓↓↓【演算法核心重構】↓↓↓
    // --- 步驟三：為常規組計算最終目標人數 ---
    console.log('--- 步驟三：為常規組計算最終目標人數 ---')
    const participatingTeams = regularTeams.filter((team) => !team.includes('K'))

    // 3.1 計算這些常規組(B-J)總共要負責多少病人
    const remainingPatientsForRegularTeams = allPatients.filter(
      (p) => !assignedPatientIds.has(p.id),
    )

    let totalWorkload = remainingPatientsForRegularTeams.length
    participatingTeams.forEach((team) => {
      totalWorkload += assignments[team]?.length || 0
    })

    console.log(
      `📊 常規組(B-J)總工作量: ${totalWorkload} 人，由 ${participatingTeams.length} 組分攤。`,
    )

    if (totalWorkload > 0 && participatingTeams.length > 0) {
      // 3.2 根據總工作量，計算每組的【最終目標總人數】
      const baseSize = Math.floor(totalWorkload / participatingTeams.length)
      const remainder = totalWorkload % participatingTeams.length
      console.log(`📊 平均分配結果: ${remainder} 組為 ${baseSize + 1} 人, 其餘為 ${baseSize} 人。`)

      const finalTargetSize = {}
      participatingTeams.forEach((team, index) => {
        finalTargetSize[team] = baseSize + (index < remainder ? 1 : 0)
      })
      console.log('📊 各組最終目標人數:', finalTargetSize)

      // 3.3 計算每組還需要補充多少病人
      const neededCounts = {}
      participatingTeams.forEach((team) => {
        const currentCount = assignments[team]?.length || 0
        const target = finalTargetSize[team]
        neededCounts[team] = Math.max(0, target - currentCount)
      })
      console.log('📊 各組需補充人數:', neededCounts)

      // 3.4 執行區塊填充
      let patientIndex = 0
      for (const team of participatingTeams) {
        const needed = neededCounts[team]
        if (needed > 0) {
          const patientsToFill = remainingPatientsForRegularTeams.slice(
            patientIndex,
            patientIndex + needed,
          )
          patientsToFill.forEach((p) => addPatient(team, p))
          patientIndex += needed
        }
      }
    }
    // 🔥↑↑↑【演算法核心重構】↑↑↑

    console.log(
      '✅ 分配完成，最終結果:',
      Object.fromEntries(
        Object.entries(assignments)
          .filter(([_, patients]) => patients.length > 0)
          .map(([team, patients]) => [team, patients.length]),
      ),
    )

    return assignments
  }

  return { distributePatients }
}
