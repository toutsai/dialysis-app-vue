<!-- 檔案路徑: src/views/ScheduleView.vue (整合臨床查閱模式的最終版) -->
<template>
  <div class="page-container" :class="{ 'is-locked': isPageLocked }">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>正在載入 {{ formatDate(currentDate) }} 的資料...</span>
    </div>

    <header class="page-header">
      <!-- 第一列：主工具列 -->
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">每日排程表</h1>
          <div class="date-navigator">
            <button class="btn" @click="changeDate(-1)">< 上一天</button>
            <span class="current-date-text">{{ currentDateDisplay }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
            <button class="btn" @click="changeDate(1)">下一天 ></button>
            <button class="btn" @click="goToToday">回到今日</button>
          </div>
          <!-- 以下按鈕僅在桌面版顯示 -->
          <button class="btn btn-warning desktop-only" @click="runScheduleCheck">排程檢視</button>
          <button
            class="btn btn-info desktop-only"
            @click="isAssignmentDialogVisible = true"
            :disabled="isPageLocked"
          >
            智慧排床
          </button>
          <button
            class="btn desktop-only"
            @click="autoAssignNurseTeams"
            :disabled="isPageLocked"
            style="background-color: #007bff; color: white; border-color: #007bff"
          >
            自動分組
          </button>
        </div>
        <div class="toolbar-right">
          <StatsToolbar
            :stats-data="statsToolbarData"
            :weekdays="statsToolbarWeekdays"
            size="compact"
            class="mobile-and-print-only"
          />
          <span class="status-indicator">{{ statusIndicator }}</span>
          <button
            class="btn btn-success desktop-only"
            @click="saveDataToCloud"
            :disabled="!hasUnsavedChanges || isPageLocked"
          >
            儲存
          </button>
          <button class="btn btn-info desktop-only" @click="triggerPrint">列印</button>
        </div>
      </div>

      <!-- 第二列：控制面板 -->
      <div class="controls-panel desktop-only">
        <div class="controls-left">
          <!-- ✨ 新增：臨床查閱的切換按鈕和容器 (僅桌面) ✨ -->
          <div class="view-toggle-wrapper desktop-only">
            <button
              class="view-toggle-btn"
              @click="isSimplifiedViewVisible = !isSimplifiedViewVisible"
            >
              <span class="toggle-icon">{{ isSimplifiedViewVisible ? '▼' : '▶' }}</span>
              {{ isSimplifiedViewVisible ? '收合臨床查閱模式' : '展開臨床查閱模式' }}
            </button>
          </div>
          <!--<button class="btn btn-secondary" @click="clearInpatients" :disabled="isPageLocked">
            清除住院病人
          </button> -->
          <!--<button class="btn btn-secondary" @click="clearNurseTeams" :disabled="isPageLocked">
            清除護理分組
          </button> -->
          <div class="team-highlight-container">
            <div class="team-group">
              <span class="team-group-label">早</span>
              <div class="team-buttons">
                <button
                  v-for="team in baseTeams"
                  :key="`early-${team}`"
                  class="team-btn"
                  :class="{
                    active: highlightedTeam?.type === 'early' && highlightedTeam?.team === team,
                  }"
                  @click="toggleHighlight('early', team)"
                >
                  {{ team }}
                </button>
              </div>
            </div>
            <div class="team-group">
              <span class="team-group-label">晚</span>
              <div class="team-buttons">
                <button
                  v-for="team in baseTeams"
                  :key="`late-${team}`"
                  class="team-btn"
                  :class="{
                    active: highlightedTeam?.type === 'late' && highlightedTeam?.team === team,
                  }"
                  @click="toggleHighlight('late', team)"
                >
                  {{ team }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="controls-right">
          <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
        </div>
      </div>
    </header>

    <main class="page-main-content" :class="{ 'is-locked': isPageLocked }">
      <!-- ✨ 修改：為兩個視圖加上 v-if/v-show，並調整 class ✨ -->
      <!-- (A) 臨床查閱模式 (桌面/手機/列印共用) -->
      <div v-if="isSimplifiedViewVisible" class="simplified-view-wrapper desktop-only">
        <div class="simplified-view">
          <table class="simplified-table">
            <thead>
              <tr>
                <th class="col-bed">床號</th>
                <th v-for="shiftCode in ORDERED_SHIFT_CODES" :key="shiftCode">
                  {{ getShiftDisplayName(shiftCode) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="bedNum in sortedBedNumbers" :key="bedNum">
                <td class="col-bed">{{ bedNum }}</td>
                <td
                  v-for="shiftCode in ORDERED_SHIFT_CODES"
                  :key="shiftCode"
                  :class="getPatientCellStyle(`bed-${bedNum}-${shiftCode}`)"
                  @click="handleSimplifiedCellClick(`bed-${bedNum}-${shiftCode}`)"
                >
                  <div
                    v-if="currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]"
                    class="patient-info-cell"
                  >
                    <div class="patient-mrn-name">
                      <span>{{
                        patientMap.get(
                          currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId,
                        )?.medicalRecordNumber
                      }}</span>
                      <div class="patient-name-wrapper">
                        <span
                          v-if="
                            patientHasNotification.has(
                              currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId,
                            )
                          "
                          class="record-indicator"
                          title="有新的病情紀錄或交班備忘"
                          >📝</span
                        >
                        <span>{{ getPatientName(`bed-${bedNum}-${shiftCode}`) }}</span>
                      </div>
                    </div>
                    <div class="patient-note">
                      {{ getCombinedNote(`bed-${bedNum}-${shiftCode}`) }}
                    </div>
                  </div>
                </td>
              </tr>
              <tr v-for="i in peripheralBedCount" :key="`p-${i}`">
                <td class="col-bed">外圍 {{ i }}</td>
                <td
                  v-for="shiftCode in ORDERED_SHIFT_CODES"
                  :key="shiftCode"
                  :class="getPatientCellStyle(`peripheral-${i}-${shiftCode}`)"
                  @click="handleSimplifiedCellClick(`peripheral-${i}-${shiftCode}`)"
                >
                  <div
                    v-if="currentRecord.schedule[`peripheral-${i}-${shiftCode}`]"
                    class="patient-info-cell"
                  >
                    <div class="patient-mrn-name">
                      <span>{{
                        patientMap.get(
                          currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId,
                        )?.medicalRecordNumber
                      }}</span>
                      <div class="patient-name-wrapper">
                        <span
                          v-if="
                            patientHasNotification.has(
                              currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId,
                            )
                          "
                          class="record-indicator"
                          title="有新的病情紀錄或交班備忘"
                          >📝</span
                        >
                        <span>{{ getPatientName(`peripheral-${i}-${shiftCode}`) }}</span>
                      </div>
                    </div>
                    <div class="patient-ward-note">
                      <span class="ward-number">{{
                        currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.wardNumber
                      }}</span>
                      <span class="patient-note">{{
                        getCombinedNote(`peripheral-${i}-${shiftCode}`)
                      }}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- (B) 排班操作模式 (原本的 schedule-content) -->
      <div v-show="!isSimplifiedViewVisible" class="schedule-content desktop-only">
        <div class="dialysis-unit">
          <template
            v-for="(wing, wingName) in {
              left: layoutData.leftWingRows,
              right: layoutData.rightWingRows,
            }"
            :key="wingName"
          >
            <div :class="`${wingName}-wing`">
              <div v-for="(row, rowIndex) in wing" :key="`${wingName}-${rowIndex}`" class="bed-row">
                <div
                  v-for="bedNum in row"
                  :key="`bed-${wingName}-${bedNum}`"
                  class="bed"
                  :class="{
                    unassigned: bedNum === '空',
                    hepatitis: hepatitisBeds.includes(bedNum),
                    'aisle-side': aisleSideBeds.includes(bedNum),
                    [`${wingName}-wing-bed`]: true,
                  }"
                >
                  <div class="bed-header">
                    {{ bedNum === '空' ? '未排床' : `床號 ${bedNum}` }}
                    <span v-if="hepatitisBeds.includes(bedNum) && bedNum !== '空'">(BC肝炎)</span>
                  </div>
                  <template v-if="bedNum !== '空'">
                    <div
                      v-for="shiftCode in ORDERED_SHIFT_CODES"
                      :key="shiftCode"
                      class="shift-row"
                      :class="[
                        getPatientCellStyle(`bed-${bedNum}-${shiftCode}`),
                        { 'split-shift': shiftCode === SHIFT_CODES.NOON },
                        { 'highlighted-slot': isSlotHighlighted(`bed-${bedNum}-${shiftCode}`) },
                      ]"
                    >
                      <div class="shift-label">{{ getShiftDisplayName(shiftCode) }}</div>
                      <div v-if="shiftCode === SHIFT_CODES.NOON" class="nurse-split-column">
                        <select
                          class="nurse-team-select nurse-in"
                          :value="
                            currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeamIn
                          "
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'in')"
                          :disabled="isPageLocked"
                        >
                          <option value="">上針</option>
                          <option v-for="team in earlyTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                        <select
                          class="nurse-team-select nurse-out"
                          :value="
                            currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeamOut
                          "
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'out')"
                          :disabled="isPageLocked"
                        >
                          <option value="">收針</option>
                          <option v-for="team in allTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                      </div>
                      <select
                        v-else
                        class="nurse-team-select"
                        :value="
                          currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeam
                        "
                        @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'single')"
                        :disabled="isPageLocked"
                      >
                        <option value="">-</option>
                        <option
                          v-for="team in shiftCode === SHIFT_CODES.EARLY ? earlyTeams : lateTeams"
                          :key="team"
                          :value="team"
                        >
                          {{ team }}組
                        </option>
                      </select>
                      <div
                        class="patient-name"
                        :draggable="!isPageLocked && !!getPatientName(`bed-${bedNum}-${shiftCode}`)"
                        @click="handleSlotClick(`bed-${bedNum}-${shiftCode}`)"
                        @drop="!isPageLocked && onDrop($event, `bed-${bedNum}-${shiftCode}`)"
                        @dragover.prevent="!isPageLocked && onDragOver($event)"
                        @dragleave="onDragLeave"
                        @dragstart="
                          !isPageLocked && onBedDragStart($event, `bed-${bedNum}-${shiftCode}`)
                        "
                      >
                        <span v-if="getPatientName(`bed-${bedNum}-${shiftCode}`)">
                          {{ getPatientName(`bed-${bedNum}-${shiftCode}`) }}
                          <MemoIcon
                            :patient-id="
                              currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.patientId
                            "
                          />
                        </span>
                        <span v-else class="empty-slot-placeholder">+</span>
                      </div>
                      <div
                        class="patient-tag"
                        :contenteditable="!isPageLocked"
                        @blur="updateNote($event, `bed-${bedNum}-${shiftCode}`)"
                      >
                        {{ getCombinedNote(`bed-${bedNum}-${shiftCode}`) }}
                      </div>
                    </div>
                  </template>
                </div>
              </div>
              <div v-if="wingName === 'left'" class="bed-row">
                <div class="nursing-station">護理站</div>
              </div>
            </div>
            <div v-if="wingName === 'left'" class="aisle">中 央 走 道</div>
          </template>
        </div>
        <div class="extra-sections">
          <div class="peripheral-section">
            <div class="peripheral-bed-container">
              <div v-for="i in peripheralBedCount" :key="`p-bed-${i}`" class="peripheral-bed">
                <div class="peripheral-header">外圍床位 {{ i }}</div>
                <div
                  v-for="shiftCode in ORDERED_SHIFT_CODES"
                  :key="shiftCode"
                  class="peripheral-shift-row"
                  :class="[
                    getPatientCellStyle(`peripheral-${i}-${shiftCode}`),
                    { 'highlighted-slot': isSlotHighlighted(`peripheral-${i}-${shiftCode}`) },
                  ]"
                >
                  <div class="shift-label">{{ getShiftDisplayName(shiftCode) }}</div>
                  <select
                    class="nurse-team-select"
                    :value="
                      shiftCode === SHIFT_CODES.NOON
                        ? currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.nurseTeamIn
                        : currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.nurseTeam
                    "
                    @change="
                      updateNurseTeam(
                        $event,
                        `peripheral-${i}-${shiftCode}`,
                        shiftCode === SHIFT_CODES.NOON ? 'in' : 'single',
                      )
                    "
                    :disabled="isPageLocked"
                  >
                    <option value="">-</option>
                    <option
                      v-for="team in shiftCode === SHIFT_CODES.EARLY
                        ? earlyTeams
                        : shiftCode === SHIFT_CODES.LATE
                          ? lateTeams
                          : allTeams"
                      :key="team"
                      :value="team"
                    >
                      {{ team }}組
                    </option>
                  </select>
                  <div
                    class="peripheral-bed-number"
                    :contenteditable="!isPageLocked"
                    @blur="updateWardNumber($event, `peripheral-${i}-${shiftCode}`)"
                  >
                    {{ currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.wardNumber }}
                  </div>
                  <div
                    class="peripheral-patient-name"
                    :draggable="!isPageLocked && !!getPatientName(`peripheral-${i}-${shiftCode}`)"
                    @click="handleSlotClick(`peripheral-${i}-${shiftCode}`)"
                    @drop="!isPageLocked && onDrop($event, `peripheral-${i}-${shiftCode}`)"
                    @dragover.prevent="!isPageLocked && onDragOver($event)"
                    @dragleave="onDragLeave"
                    @dragstart="
                      !isPageLocked && onBedDragStart($event, `peripheral-${i}-${shiftCode}`)
                    "
                  >
                    <span v-if="getPatientName(`peripheral-${i}-${shiftCode}`)">
                      {{ getPatientName(`peripheral-${i}-${shiftCode}`) }}
                      <MemoIcon
                        :patient-id="
                          currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.patientId
                        "
                      />
                    </span>
                    <span v-else class="empty-slot-placeholder">+</span>
                  </div>
                  <div
                    class="patient-tag"
                    :contenteditable="!isPageLocked"
                    @blur="updateNote($event, `peripheral-${i}-${shiftCode}`)"
                  >
                    {{ getCombinedNote(`peripheral-${i}-${shiftCode}`) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- (C) 行動版專用視圖 -->
      <div class="simplified-view mobile-and-print-only">
        <table class="simplified-table">
          <thead>
            <tr>
              <th class="col-bed">床號</th>
              <th v-for="shiftCode in ORDERED_SHIFT_CODES" :key="shiftCode">
                {{ getShiftDisplayName(shiftCode) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bedNum in sortedBedNumbers" :key="bedNum">
              <td class="col-bed">{{ bedNum }}</td>
              <td
                v-for="shiftCode in ORDERED_SHIFT_CODES"
                :key="shiftCode"
                :class="getPatientCellStyle(`bed-${bedNum}-${shiftCode}`)"
                @click="handleSimplifiedCellClick(`bed-${bedNum}-${shiftCode}`)"
              >
                <div
                  v-if="currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]"
                  class="patient-info-cell"
                >
                  <div class="patient-mrn-name">
                    <span>{{
                      patientMap.get(currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId)
                        ?.medicalRecordNumber
                    }}</span>
                    <div class="patient-name-wrapper">
                      <span
                        v-if="
                          patientHasNotification.has(
                            currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId,
                          )
                        "
                        class="record-indicator"
                        title="有新的病情紀錄或交班備忘"
                        >📝</span
                      >
                      <span>{{ getPatientName(`bed-${bedNum}-${shiftCode}`) }}</span>
                    </div>
                  </div>
                  <div class="patient-note">
                    {{ getCombinedNote(`bed-${bedNum}-${shiftCode}`) }}
                  </div>
                </div>
              </td>
            </tr>
            <tr v-for="i in peripheralBedCount" :key="`p-${i}`">
              <td class="col-bed">外圍 {{ i }}</td>
              <td
                v-for="shiftCode in ORDERED_SHIFT_CODES"
                :key="shiftCode"
                :class="getPatientCellStyle(`peripheral-${i}-${shiftCode}`)"
                @click="handleSimplifiedCellClick(`peripheral-${i}-${shiftCode}`)"
              >
                <div
                  v-if="currentRecord.schedule[`peripheral-${i}-${shiftCode}`]"
                  class="patient-info-cell"
                >
                  <div class="patient-mrn-name">
                    <span>{{
                      patientMap.get(
                        currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId,
                      )?.medicalRecordNumber
                    }}</span>
                    <div class="patient-name-wrapper">
                      <span
                        v-if="
                          patientHasNotification.has(
                            currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId,
                          )
                        "
                        class="record-indicator"
                        title="有新的病情紀錄或交班備忘"
                        >📝</span
                      >
                      <span>{{ getPatientName(`peripheral-${i}-${shiftCode}`) }}</span>
                    </div>
                  </div>
                  <div class="patient-ward-note">
                    <span class="ward-number">{{
                      currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.wardNumber
                    }}</span>
                    <span class="patient-note">{{
                      getCombinedNote(`peripheral-${i}-${shiftCode}`)
                    }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <InpatientSidebar
        :patients="allPatients"
        :scheduled-ids="scheduledPatientIds"
        @drag-start="onSidebarDragStart"
        class="desktop-only"
        :class="{ 'sidebar-locked': isPageLocked }"
        :use-daily-filter="true"
        :day-of-week="dayOfWeek"
      />
    </main>

    <!-- Modal 組件 -->
    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />
    <BedAssignmentDialog
      :is-visible="isAssignmentDialogVisible"
      :all-patients="allPatients"
      :bed-layout="allBedNumbers"
      :schedule-data="currentRecord.schedule"
      :shifts="ORDERED_SHIFT_CODES"
      :freq-map="freqToDays"
      assignment-mode="singleDay"
      :day-of-week="dayOfWeek"
      :predefined-patient-groups="patientGroupsForDialog"
      :is-page-locked="isPageLocked"
      @close="isAssignmentDialogVisible = false"
      @assign-bed="handleAssignBed"
    />
    <PatientSelectDialog
      :is-visible="isPatientSelectDialogVisible"
      title="選擇病人 (單次排班)"
      :patients="allPatients"
      :show-fill-options="false"
      :is-page-locked="isPageLocked"
      @confirm="handlePatientSelect"
      @cancel="isPatientSelectDialogVisible = false"
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
    <ConditionRecordModal
      :is-visible="isConditionModalVisible"
      :patient="selectedPatientForRecord"
      :current-date="currentDate"
      @close="isConditionModalVisible = false"
      @save="handleSaveConditionRecord"
      @update="handleUpdateConditionRecord"
      @delete="handleDeleteConditionRecord"
    />
    <PatientActionModal
      :is-visible="isActionModalVisible"
      :patient="selectedPatientForAction"
      :has-memo="patientWithMemoIds.has(selectedPatientForAction?.id)"
      @select="handleActionSelect"
      @close="isActionModalVisible = false"
    />
    <PatientLabSummaryModal
      :is-visible="isLabSummaryModalVisible"
      :patient="selectedPatientForLabSummary"
      @close="isLabSummaryModalVisible = false"
      @save-record="handleSaveLabSummaryAsRecord"
    />
    <!-- ======================================================= -->
    <!--                  ✨ 全新：專為列印設計的區塊 ✨            -->
    <!-- ======================================================= -->
    <div class="print-only-view">
      <!-- 1. 列印頁首 -->
      <h1 class="print-header">{{ currentDateDisplay }} 每日排程總表</h1>

      <!-- 2. 人數統計 -->
      <div v-if="statsToolbarData[0]" class="print-stats">
        <span class="stat-item"><strong>本日總計:</strong> {{ statsToolbarData[0].total }}人</span>
        <span class="stat-item"
          ><strong>早班:</strong> {{ statsToolbarData[0].counts.early.total }}人</span
        >
        <span class="stat-item"
          ><strong>午班:</strong> {{ statsToolbarData[0].counts.noon.total }}人</span
        >
        <span class="stat-item"
          ><strong>晚班:</strong> {{ statsToolbarData[0].counts.late.total }}人</span
        >
      </div>

      <hr class="print-divider" />

      <!-- 3. A4 表格 -->
      <table class="simplified-table print-table">
        <thead>
          <tr>
            <th class="col-bed">床號</th>
            <th>早班</th>
            <th>午班</th>
            <th>晚班</th>
          </tr>
        </thead>
        <tbody>
          <!-- 主要床位 -->
          <tr v-for="bedNum in sortedBedNumbers" :key="`print-bed-${bedNum}`">
            <td class="col-bed">{{ bedNum }}</td>
            <td
              v-for="shiftCode in ORDERED_SHIFT_CODES"
              :key="shiftCode"
              :class="getPatientCellStyle(`bed-${bedNum}-${shiftCode}`)"
            >
              <div
                v-if="currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]"
                class="patient-info-cell"
              >
                <div class="patient-mrn-name">
                  <span>{{
                    patientMap.get(currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId)
                      ?.medicalRecordNumber
                  }}</span>
                  <span>{{ getPatientName(`bed-${bedNum}-${shiftCode}`) }}</span>
                </div>
                <div class="patient-note">{{ getCombinedNote(`bed-${bedNum}-${shiftCode}`) }}</div>
              </div>
            </td>
          </tr>
          <!-- 外圍床位 -->
          <tr v-for="i in peripheralBedCount" :key="`print-p-${i}`">
            <td class="col-bed">外圍 {{ i }}</td>
            <td
              v-for="shiftCode in ORDERED_SHIFT_CODES"
              :key="shiftCode"
              :class="getPatientCellStyle(`peripheral-${i}-${shiftCode}`)"
            >
              <div
                v-if="currentRecord.schedule[`peripheral-${i}-${shiftCode}`]"
                class="patient-info-cell"
              >
                <div class="patient-mrn-name">
                  <span>{{
                    patientMap.get(currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId)
                      ?.medicalRecordNumber
                  }}</span>
                  <span>{{ getPatientName(`peripheral-${i}-${shiftCode}`) }}</span>
                </div>
                <div class="patient-ward-note">
                  <span class="ward-number">{{
                    currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.wardNumber
                  }}</span>
                  <span class="patient-note">{{
                    getCombinedNote(`peripheral-${i}-${shiftCode}`)
                  }}</span>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchAllPatients as optimizedFetchAllPatients,
  fetchAllSchedules as optimizedFetchAllSchedules,
  saveSchedule as optimizedSaveSchedule,
  updateSchedule as optimizedUpdateSchedule,
  fetchAllMemos as optimizedFetchAllMemos,
} from '@/services/optimizedApiService.js'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'
import { useTeamAssigner } from '@/composables/useTeamAssigner.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import { useScheduleAnalysis } from '@/composables/useScheduleAnalysis.js'

import {
  SHIFT_CODES,
  ORDERED_SHIFT_CODES,
  getShiftDisplayName,
  earlyTeams,
  lateTeams,
  allTeams,
} from '@/constants/scheduleConstants.js'
import {
  createEmptySlotData,
  generateAutoNote,
  getUnifiedCellStyle,
} from '@/utils/scheduleUtils.js'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import MemoIcon from '@/components/MemoIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ConditionRecordModal from '@/components/ConditionRecordModal.vue'
import PatientActionModal from '@/components/PatientActionModal.vue'
import PatientLabSummaryModal from '@/components/PatientLabSummaryModal.vue'

// --- API and Constants ---
const conditionRecordsApi = ApiManager('condition_records')
const layoutData = {
  leftWingRows: [
    ['空', 32, 31],
    [33, 35, 36],
    [39, 38, 37],
    [51, 52, 53],
    [57, 56, 55],
    [58, 59, 61],
    [65, 63, 62],
  ],
  rightWingRows: [
    [29, 28, 27],
    [23, 25, 26],
    [22, 21, 19],
    [16, 17, 18],
    [15, 13, 12],
    [8, 9, 11],
    [7, 6, 5],
    [1, 2, 3],
  ],
}
const allBedNumbers = [
  ...layoutData.leftWingRows.flat(),
  ...layoutData.rightWingRows.flat(),
].filter((b) => b !== '空')
const hepatitisBeds = ['空', 31, 32, 33, 35, 36]
const aisleSideBeds = [1, 7, 8, 15, 16, 22, 23, 29, 31, 36, 37, 53, 55, 61, 62, 65]
const peripheralBedCount = 6
const freqToDays = {
  一三五: [1, 3, 5],
  二四六: [2, 4, 6],
  一四: [1, 4],
  二五: [2, 5],
  三六: [3, 6],
  一五: [1, 5],
  二六: [2, 6],
  每周一次: [0, 1, 2, 3, 4, 5, 6],
  臨時: [],
}
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

// --- Reactive State ---
const currentDate = ref(new Date())
const allPatients = ref([])
const activeMemos = ref([])
const recentConditionRecords = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isAssignmentDialogVisible = ref(false)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const isPatientSelectDialogVisible = ref(false)
const currentSlotId = ref(null)
const highlightedTeam = ref(null)
const isConfirmDialogVisible = ref(false)
const confirmDialogMessage = ref('')
const onConfirmAction = ref(null)
const isLoading = ref(true)
const isConditionModalVisible = ref(false)
const selectedPatientForRecord = ref(null)
const isActionModalVisible = ref(false)
const selectedPatientForAction = ref(null)
const isLabSummaryModalVisible = ref(false)
const selectedPatientForLabSummary = ref(null)
const isSimplifiedViewVisible = ref(false)

const auth = useAuth()
const { createGlobalNotification } = useGlobalNotifier()
const router = useRouter()

// --- Computed Properties ---
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentDay = new Date(currentDate.value)
  currentDay.setHours(0, 0, 0, 0)
  return currentDay < today
})
const sortedBedNumbers = computed(() => {
  const numericBeds = allBedNumbers.filter((b) => typeof b === 'number')
  return [...numericBeds].sort((a, b) => a - b)
})
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)
const currentDateDisplay = computed(() => formatDate(currentDate.value))
const weekdayDisplay = computed(
  () => ['日', '一', '二', '三', '四', '五', '六'][currentDate.value.getDay()],
)
const dayOfWeek = computed(() => {
  const day = currentDate.value.getDay()
  return day === 0 ? 7 : day
})
const { scheduledPatientIds, getDailyUnassignedPatients, getDailyTemporaryPatients } =
  useScheduleAnalysis(
    allPatients,
    computed(() => currentRecord.schedule),
    freqToDays,
  )
const patientGroupsForDialog = computed(() => {
  const groups = {
    '今日應排 - 急診': [],
    '今日應排 - 住院': [],
    '今日應排 - 門診': [],
    '今日非排 (臨洗) - 急診': [],
    '今日非排 (臨洗) - 住院': [],
    '今日非排 (臨洗) - 門診': [],
  }
  getDailyUnassignedPatients(dayOfWeek).value.forEach((p) => {
    if (p.status === 'er') groups['今日應排 - 急診'].push(p)
    else if (p.status === 'ipd') groups['今日應排 - 住院'].push(p)
    else if (p.status === 'opd') groups['今日應排 - 門診'].push(p)
  })
  getDailyTemporaryPatients(dayOfWeek).value.forEach((p) => {
    if (p.status === 'er') groups['今日非排 (臨洗) - 急診'].push(p)
    else if (p.status === 'ipd') groups['今日非排 (臨洗) - 住院'].push(p)
    else if (p.status === 'opd') groups['今日非排 (臨洗) - 門診'].push(p)
  })
  return groups
})
const statsToolbarData = computed(() => {
  const counts = {}
  ORDERED_SHIFT_CODES.forEach((shiftCode) => {
    counts[shiftCode] = { total: 0, opd: 0, ipd: 0, er: 0 }
  })
  const dailyData = { counts: counts, total: 0 }
  if (currentRecord.schedule) {
    for (const slotData of Object.values(currentRecord.schedule)) {
      if (slotData && slotData.patientId) {
        const patient = patientMap.value.get(slotData.patientId)
        if (!patient) continue
        const shiftCode = slotData.shiftId?.split('-').pop()
        if (shiftCode && dailyData.counts[shiftCode]) {
          const shiftStats = dailyData.counts[shiftCode]
          shiftStats.total++
          dailyData.total++
          if (patient.status === 'opd') shiftStats.opd++
          else if (patient.status === 'ipd') shiftStats.ipd++
          else if (patient.status === 'er') shiftStats.er++
        }
      }
    }
  }
  return [dailyData]
})
const statsToolbarWeekdays = computed(() => ['本日'])
const latestRecordDateByPatientId = computed(() => {
  const map = new Map()
  for (const record of recentConditionRecords.value) {
    if (record.patientId) {
      const existingDate = map.get(record.patientId)
      const recordDate = record.recordDate
      if (!existingDate || recordDate > existingDate) {
        map.set(record.patientId, recordDate)
      }
    }
  }
  return map
})

const patientHasNotification = computed(() => {
  const patientIdsWithInfo = new Set()

  // 1. 加入有待處理備忘的病人 ID
  patientWithMemoIds.value.forEach((id) => patientIdsWithInfo.add(id))

  // 2. 加入有近期病情紀錄的病人 ID
  for (const record of recentConditionRecords.value) {
    if (record.patientId) {
      const lastTreatmentDate = getLastTreatmentDate(
        patientMap.value.get(record.patientId)?.freq,
        currentDate.value,
      )
      if (!lastTreatmentDate || record.recordDate >= lastTreatmentDate) {
        patientIdsWithInfo.add(record.patientId)
      }
    }
  }
  return patientIdsWithInfo
})

// --- Helper Functions ---
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}
function showConfirm(title, message, onConfirm) {
  confirmDialogMessage.value = message
  onConfirmAction.value = onConfirm
  isConfirmDialogVisible.value = true
}
function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
function getLastTreatmentDate(patientFreq, today) {
  if (!patientFreq || !freqToDays[patientFreq]) return null
  const scheduleDays = freqToDays[patientFreq]
  if (scheduleDays.length === 0) return null
  const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay()
  let lastDayOfWeek = -1
  let daysToSubtract = 7
  for (const day of scheduleDays) {
    if (day < todayDayOfWeek) {
      lastDayOfWeek = Math.max(lastDayOfWeek, day)
    }
  }
  if (lastDayOfWeek !== -1) {
    daysToSubtract = todayDayOfWeek - lastDayOfWeek
  } else {
    const lastWeekDay = Math.max(...scheduleDays)
    daysToSubtract = todayDayOfWeek + (7 - lastWeekDay)
  }
  const lastDate = new Date(today)
  lastDate.setDate(today.getDate() - daysToSubtract)
  return formatDate(lastDate)
}

function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

// --- Data Loading and Saving ---
async function loadDataForDay(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  isLoading.value = true
  const dateStr = formatDate(date)
  try {
    const dailyRecords = await optimizedFetchAllSchedules([where('date', '==', dateStr)])
    const record = dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }
    const finalSchedule = {}
    if (record.schedule) {
      for (const shiftId in record.schedule) {
        const dbSlotData = record.schedule[shiftId]
        if (dbSlotData?.patientId) {
          const patient = patientMap.value.get(dbSlotData.patientId)
          const mergedSlot = { ...createEmptySlotData(shiftId), ...dbSlotData }
          if (patient) mergedSlot.autoNote = generateAutoNote(patient)
          finalSchedule[shiftId] = mergedSlot
        }
      }
    }
    Object.assign(currentRecord, {
      id: record.id || null,
      date: dateStr,
      schedule: finalSchedule,
      names: record.names || {},
    })
    statusIndicator.value = record.id ? '資料已載入' : '本日無排程'
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  } finally {
    isLoading.value = false
  }
}
async function loadAllData() {
  try {
    const [patientsData, memosData] = await Promise.all([
      optimizedFetchAllPatients(),
      optimizedFetchAllMemos([where('status', '==', 'pending')]),
      fetchRecentRecords(),
    ])
    allPatients.value = patientsData
    activeMemos.value = memosData
  } catch (error) {
    console.error('獲取初始資料失敗:', error)
    statusIndicator.value = '獲取初始資料失敗'
  }
}
async function saveDataToCloud() {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足或日期已過。')
    return
  }
  statusIndicator.value = '儲存中...'
  try {
    const dataToSave = {
      date: currentRecord.date,
      schedule: currentRecord.schedule || {},
      names: currentRecord.names || {},
    }
    if (currentRecord.id) {
      await optimizedUpdateSchedule(currentRecord.id, dataToSave)
    } else if (Object.keys(dataToSave.schedule).length > 0) {
      const savedRecord = await optimizedSaveSchedule(dataToSave)
      currentRecord.id = savedRecord.id
    }
    hasUnsavedChanges.value = false
    statusIndicator.value = '儲存成功！'
    window.dispatchEvent(
      new CustomEvent('schedule-updated', { detail: { date: currentRecord.date } }),
    )
    createGlobalNotification(`修改每日排程: ${currentRecord.date}`, 'schedule')
    showAlert('操作成功', '排程已成功儲存！')
  } catch (error) {
    console.error('儲存失敗:', error)
    statusIndicator.value = '儲存失敗'
    showAlert('操作失敗', `儲存失敗: ${error.message}`)
  }
}
async function fetchRecentRecords() {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const records = await conditionRecordsApi.fetchAll([where('createdAt', '>=', sevenDaysAgo)])
    recentConditionRecords.value = records
  } catch (error) {
    console.error('獲取近期病情紀錄失敗:', error)
  }
}

// --- Event Handlers & Logic ---
function changeDate(days) {
  const performChange = () => {
    const newDate = new Date(currentDate.value)
    newDate.setDate(newDate.getDate() + days)
    currentDate.value = newDate
  }
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    showConfirm('注意', '您有未儲存的變更，確定要切換日期嗎？', performChange)
  } else {
    performChange()
  }
}
function goToToday() {
  const performChange = () => (currentDate.value = new Date())
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    showConfirm('注意', '您有未儲存的變更，確定要切換到今天嗎？', performChange)
  } else {
    performChange()
  }
}

// ✨ 1. 修改 handleSlotClick (排班模式)
function handleSlotClick(shiftId) {
  const slotData = currentRecord.schedule[shiftId]

  // 如果頁面鎖定，或者格子裡沒有病人，直接返回 (排班者不能操作空格子外的東西)
  if (isPageLocked.value || !slotData?.patientId) {
    if (!slotData?.patientId && !isPageLocked.value) {
      currentSlotId.value = shiftId
      isPatientSelectDialogVisible.value = true
    }
    return
  }

  // 對於排班者，點擊有病人的格子，直接彈出移除確認
  const patient = patientMap.value.get(slotData.patientId)
  showConfirm(`確認移除`, `確定要將「${patient?.name}」從此班次中移除嗎？`, () => {
    handleSlotUpdate(shiftId, null)
  })
}

// ✨ 2. 新增 handleSimplifiedCellClick (臨床查閱模式)
function handleSimplifiedCellClick(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  const patientId = slotData?.patientId

  if (patientId) {
    const patient = patientMap.value.get(patientId)
    if (!patient) return

    // 點擊有病人的格子，打開 Action Modal
    selectedPatientForAction.value = patient
    isActionModalVisible.value = true
  }
  // 如果點擊空格子，則不做任何事
}

// ✨ 3. 修改 handleActionSelect 以處理來自臨床模式的新增操作
function handleActionSelect(actionType) {
  isActionModalVisible.value = false
  const patient = selectedPatientForAction.value
  if (!patient) return

  nextTick(() => {
    if (actionType === 'view-condition-record') {
      selectedPatientForRecord.value = patient
      isConditionModalVisible.value = true
    } else if (actionType === 'view-memos') {
      showPatientMemos(patient.id)
    } else if (actionType === 'view-lab-reports') {
      selectedPatientForLabSummary.value = patient
      isLabSummaryModalVisible.value = true
    } else if (actionType === 'remove-patient') {
      // 這個選項現在只應該在 PatientActionModal 內被觸發
      const shiftId = Object.keys(currentRecord.schedule).find(
        (id) => currentRecord.schedule[id]?.patientId === patient.id,
      )
      if (shiftId && !isPageLocked.value) {
        showConfirm(`確認移除`, `確定要將「${patient.name}」從此班次中移除嗎？`, () => {
          handleSlotUpdate(shiftId, null)
        })
      }
    }
  })
}

function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter((memo) => memo.patientId === patientId)
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}
function toggleHighlight(type, team) {
  const currentHighlight = highlightedTeam.value
  if (currentHighlight && currentHighlight.type === type && currentHighlight.team === team) {
    highlightedTeam.value = null
  } else {
    highlightedTeam.value = { type, team }
  }
}
function isSlotHighlighted(shiftId) {
  if (!highlightedTeam.value) return false
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData) return false
  const { type, team } = highlightedTeam.value
  const shiftCode = shiftId.split('-')[2]
  if (type === 'early') {
    if (shiftCode === SHIFT_CODES.EARLY && slotData.nurseTeam === `早${team}`) return true
    if (shiftCode === SHIFT_CODES.NOON && slotData.nurseTeamIn === `早${team}`) return true
  } else if (type === 'late') {
    if (shiftCode === SHIFT_CODES.LATE && slotData.nurseTeam === `晚${team}`) return true
    if (shiftCode === SHIFT_CODES.NOON && slotData.nurseTeamOut === `晚${team}`) return true
  }
  return false
}
function onDrop(event, targetShiftId) {
  if (isPageLocked.value) return
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
  event.target.closest('.patient-name, .peripheral-patient-name')?.classList.remove('drag-over')
  const sourceShiftId = event.dataTransfer.getData('sourceShiftId')
  const droppedSlotData = JSON.parse(event.dataTransfer.getData('application/json'))
  if (!droppedSlotData || !droppedSlotData.patientId) return
  const patient = patientMap.value.get(droppedSlotData.patientId)
  if (!patient) return
  if (!sourceShiftId && scheduledPatientIds.value.has(patient.id)) {
    showConfirm('重複排班警告', `病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`, () => {
      if (currentRecord.schedule[targetShiftId]?.patientId) {
        showAlert('操作失敗', '目標床位已被佔用，無法放置！')
        return
      }
      handleSlotUpdate(targetShiftId, droppedSlotData.patientId)
    })
    return
  }
  const targetSlotData = currentRecord.schedule[targetShiftId]
  if (targetSlotData && targetSlotData.patientId) {
    if (!sourceShiftId) {
      showAlert('操作失敗', '目標床位已被佔用，無法放置！')
      return
    }
    currentRecord.schedule[targetShiftId] = { ...droppedSlotData }
    currentRecord.schedule[sourceShiftId] = { ...targetSlotData }
  } else {
    currentRecord.schedule[targetShiftId] = { ...droppedSlotData }
    if (sourceShiftId) delete currentRecord.schedule[sourceShiftId]
  }
  setChange()
}
function onBedDragStart(event, sourceShiftId) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = currentRecord.schedule[sourceShiftId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  event.dataTransfer.setData('sourceShiftId', sourceShiftId)
  event.dataTransfer.setData('application/json', JSON.stringify(slotData))
  event.dataTransfer.effectAllowed = 'move'
}
function onSidebarDragStart(event, patient) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = {
    ...createEmptySlotData('sidebar-source'),
    patientId: patient.id,
    autoNote: generateAutoNote(patient),
    manualNote: patient.status === 'ipd' ? '住' : '',
  }
  event.dataTransfer.setData('application/json', JSON.stringify(slotData))
  event.dataTransfer.effectAllowed = 'move'
}
function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  const targetCell = event.target.closest('.patient-name, .peripheral-patient-name')
  if (targetCell) targetCell.classList.add('drag-over')
}
function onDragLeave(event) {
  event.target.closest('.patient-name, .peripheral-patient-name')?.classList.remove('drag-over')
}
function handleSlotUpdate(shiftId, patientId) {
  if (isPageLocked.value) return
  if (patientId) {
    const patient = patientMap.value.get(patientId)
    currentRecord.schedule[shiftId] = {
      ...createEmptySlotData(shiftId),
      patientId: patientId,
      autoNote: generateAutoNote(patient),
      manualNote: patient.status === 'ipd' ? '住' : '',
    }
  } else {
    delete currentRecord.schedule[shiftId]
  }
  setChange()
}
function handlePatientSelect({ patientId }) {
  if (!patientId || !currentSlotId.value) return
  isPatientSelectDialogVisible.value = false
  if (scheduledPatientIds.value.has(patientId)) {
    const patient = patientMap.value.get(patientId)
    showAlert('重複排班警告', `病人 ${patient.name} 在本日已有排班，無法重複排入。`)
    currentSlotId.value = null
    return
  }
  handleSlotUpdate(currentSlotId.value, patientId)
  currentSlotId.value = null
}
function handleAssignBed({ patientId, shiftId }) {
  if (!patientId || !shiftId || isPageLocked.value) return
  if (scheduledPatientIds.value.has(patientId)) {
    const patient = patientMap.value.get(patientId)
    showConfirm('重複排班警告', `病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`, () => {
      if (currentRecord.schedule[shiftId]?.patientId) {
        showAlert('錯誤', '目標床位已被佔用！')
        return
      }
      handleSlotUpdate(shiftId, patientId)
    })
    return
  }
  handleSlotUpdate(shiftId, patientId)
}
function updateNurseTeam(event, shiftId, type) {
  if (isPageLocked.value) {
    event.target.value =
      currentRecord.schedule[shiftId]?.[
        type === 'single' ? 'nurseTeam' : type === 'in' ? 'nurseTeamIn' : 'nurseTeamOut'
      ] || ''
    return
  }
  const value = event.target.value
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  const slot = currentRecord.schedule[shiftId]
  const isPeripheralNoon = shiftId.startsWith('peripheral') && shiftId.endsWith(SHIFT_CODES.NOON)
  if (type === 'single' && isPeripheralNoon) {
    slot.nurseTeamIn = value || null
    slot.nurseTeamOut = value || null
    slot.nurseTeam = null
  } else if (type === 'single') {
    slot.nurseTeam = value || null
  } else if (type === 'in') {
    slot.nurseTeamIn = value || null
  } else if (type === 'out') {
    slot.nurseTeamOut = value || null
  }
  setChange()
}
function updateNote(event, shiftId) {
  if (isPageLocked.value) {
    event.target.textContent = getCombinedNote(shiftId)
    return
  }
  if (!currentRecord.schedule[shiftId]) {
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  }
  currentRecord.schedule[shiftId].manualNote = event.target.textContent.trim()
  setChange()
}
const updateWardNumber = (event, shiftId) => {
  if (isPageLocked.value) {
    event.target.textContent = currentRecord.schedule[shiftId]?.wardNumber || ''
    return
  }
  const value = event.target.textContent.trim()
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  currentRecord.schedule[shiftId].wardNumber = value
  setChange()
}
function clearInpatients() {
  if (isPageLocked.value) return
  showConfirm(
    '確認清除',
    '確定要清除畫面上所有的「住院/急診」病人嗎？(此操作需儲存後才會生效)',
    () => {
      const newSchedule = { ...currentRecord.schedule }
      let clearedCount = 0
      for (const shiftId in newSchedule) {
        const slotData = newSchedule[shiftId]
        if (slotData?.patientId) {
          const patient = patientMap.value.get(slotData.patientId)
          if (patient && (patient.status === 'ipd' || patient.status === 'er')) {
            delete newSchedule[shiftId]
            clearedCount++
          }
        }
      }
      if (clearedCount > 0) {
        currentRecord.schedule = newSchedule
        setChange()
        createGlobalNotification(`已清除 ${clearedCount} 位住院/急診病人`, 'schedule')
      } else {
        showAlert('提示', '畫面上沒有住院或急診病人可供清除。')
      }
    },
  )
}
function clearNurseTeams() {
  if (isPageLocked.value) return
  showConfirm('確認清除', '確定要清除畫面上所有的「護理分組」嗎？(此操作需儲存後才會生效)', () => {
    const newSchedule = { ...currentRecord.schedule }
    let cleared = false
    for (const shiftId in newSchedule) {
      const slotData = newSchedule[shiftId]
      if (slotData) {
        if (slotData.nurseTeam || slotData.nurseTeamIn || slotData.nurseTeamOut) cleared = true
        slotData.nurseTeam = null
        slotData.nurseTeamIn = null
        slotData.nurseTeamOut = null
      }
    }
    if (cleared) {
      currentRecord.schedule = newSchedule
      setChange()
      createGlobalNotification(`已清除所有護理分組`, 'team')
    } else {
      showAlert('提示', '畫面上沒有護理分組可供清除。')
    }
  })
}
function runScheduleCheck() {
  const warnings = []
  const duplicateNames = new Set()
  let tempScheduled = {}
  Object.values(currentRecord.schedule).forEach((slot) => {
    if (slot && slot.patientId) {
      if (tempScheduled[slot.patientId]) {
        const patientName = patientMap.value.get(slot.patientId)?.name
        if (patientName) duplicateNames.add(patientName)
      }
      tempScheduled[slot.patientId] = true
    }
  })
  if (duplicateNames.size > 0) {
    warnings.push(
      `【重複排班】:\n- 病人 ${Array.from(duplicateNames).join(', ')} 在本日出現超過一次。`,
    )
  }
  const missingPatients = getDailyUnassignedPatients(dayOfWeek).value
  if (missingPatients.length > 0) {
    const missingPatientNames = missingPatients
      .map((p) => `${p.name} (${p.status === 'ipd' ? '住院' : '門診'})`)
      .join('\n- ')
    warnings.push(`【未排床病人】:\n- ${missingPatientNames}`)
  }
  if (warnings.length > 0) {
    showAlert('排班檢視警告', warnings.join('\n\n'))
  } else {
    showAlert('排班檢視完畢', '未發現明顯的排班或遺漏問題。')
  }
}
function getPatientName(shiftId) {
  const patientId = currentRecord.schedule[shiftId]?.patientId
  return patientMap.value.get(patientId)?.name || ''
}
function getCombinedNote(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData) return ''
  const autoTags = (slotData.autoNote || '').split(' ').filter(Boolean)
  const manualTags = (slotData.manualNote || '').split(' ').filter(Boolean)
  const combinedTags = [...new Set([...autoTags, ...manualTags])]
  const finalTags = combinedTags.filter((tag) => !['住', '急'].includes(tag))
  return finalTags.join(' ')
}
function getPatientCellStyle(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData || !slotData.patientId) return {}
  const patient = patientMap.value.get(slotData.patientId)
  if (!patient) return {}
  return getUnifiedCellStyle(slotData, patient)
}
function triggerPrint() {
  window.print()
}
function handleConfirm() {
  if (typeof onConfirmAction.value === 'function') onConfirmAction.value()
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}
function handleCancel() {
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

async function handleSaveConditionRecord(recordData) {
  // ‼️ 核心修正：在存取 currentUser 之前，增加更嚴格的檢查
  if (!auth.isContributor.value || !auth.currentUser.value) {
    // 檢查 isContributor 和 currentUser.value 是否都存在
    showAlert('權限不足', '您可能尚未登入或權限不足，無法儲存病情紀錄。')
    return
  }

  if (!selectedPatientForRecord.value || !recordData.content) {
    showAlert('資料不完整', '請確保已選擇病人且紀錄內容不為空。')
    return
  }

  try {
    const dataToSave = {
      patientId: selectedPatientForRecord.value.id,
      patientName: selectedPatientForRecord.value.name,
      recordDate: formatDate(currentDate.value),
      content: recordData.content,
      // 經過上面的檢查，這裡現在是安全的
      authorId: auth.currentUser.value.uid,
      authorName: auth.currentUser.value.name,
      createdAt: new Date(),
    }
    await conditionRecordsApi.save(dataToSave)
    createGlobalNotification(
      `已為 ${selectedPatientForRecord.value.name} 新增一筆病情紀錄`,
      'schedule',
    )
    await fetchRecentRecords()
  } catch (error) {
    console.error('儲存病情紀錄失敗:', error)
    showAlert('儲存失敗', `儲存病情紀錄時發生錯誤: ${error.message}`)
  }
}

async function handleUpdateConditionRecord({ id, content }) {
  // ‼️ 加入前端權限檢查 ‼️
  if (!auth.isContributor.value) {
    showAlert('權限不足', '您沒有權限更新病情紀錄。')
    return
  }

  try {
    await conditionRecordsApi.update(id, { content: content })
    createGlobalNotification('病情紀錄已更新', 'schedule')
    await fetchRecentRecords()
  } catch (error) {
    console.error('更新病情紀錄失敗:', error)
    showAlert('更新失敗', `更新病情紀錄時發生錯誤: ${error.message}`)
  }
}

// 修正後的 handleDeleteConditionRecord 函式
async function handleDeleteConditionRecord(recordId) {
  // ‼️ 同樣加入前端權限檢查 ‼️
  if (!auth.isContributor.value) {
    showAlert('權限不足', '您沒有權限刪除病情紀錄。')
    return
  }

  showConfirm('確認刪除', '您確定要永久刪除這筆病情紀錄嗎？此操作無法復原。', async () => {
    try {
      await conditionRecordsApi.delete(recordId)
      createGlobalNotification('病情紀錄已刪除', 'schedule')
      await fetchRecentRecords()
    } catch (error) {
      console.error('刪除病情紀錄失敗:', error)
      showAlert('刪除失敗', `刪除病情紀錄時發生錯誤: ${error.message}`)
    }
  })
}

async function handleSaveLabSummaryAsRecord({ patient, content }) {
  if (!auth.isContributor.value || !auth.currentUser.value) {
    showAlert('權限不足', '您可能尚未登入或權限不足，無法儲存病情紀錄。')
    return
  }

  try {
    const dataToSave = {
      patientId: patient.id,
      patientName: patient.name,
      recordDate: formatDate(currentDate.value),
      content: content,
      authorId: auth.currentUser.value.uid,
      authorName: auth.currentUser.value.name,
      createdAt: new Date(),
    }
    await conditionRecordsApi.save(dataToSave)
    createGlobalNotification(`已為 ${patient.name} 新增一筆檢驗報告處置紀錄`, 'schedule')
    // 刷新病情紀錄，這樣紅點提示才會更新
    await fetchRecentRecords()
  } catch (error) {
    console.error('儲存檢驗摘要紀錄失敗:', error)
    showAlert('儲存失敗', `儲存紀錄時發生錯誤: ${error.message}`)
  }
}

// --- Auto Assignment Logic ---
const { distributePatients } = useTeamAssigner()
function autoAssignNurseTeams() {
  if (isPageLocked.value) {
    showAlert('操作失敗', '頁面已鎖定，無法執行自動分組。')
    return
  }
  showConfirm('確認操作', '此操作將會覆蓋現有的護理師分組，您確定要繼續嗎？', () => {
    executeAutoAssignment()
  })
}

// 在 src/views/ScheduleView.vue 中，找到 executeAutoAssignment 函式並替換成以下內容：

function executeAutoAssignment() {
  const scheduleCopy = JSON.parse(JSON.stringify(currentRecord.schedule))

  // --- 輔助函式 (從您的正常版本中提取) ---
  const getRichPatientList = (shiftCode) => {
    return Object.entries(scheduleCopy)
      .filter(([shiftId, slot]) => slot?.patientId && shiftId.endsWith(shiftCode))
      .map(([shiftId, slot]) => {
        const patientData = patientMap.value.get(slot.patientId)
        if (!patientData) return null
        const bedNumberStr = shiftId.split('-')[1]
        const bedNumber = parseInt(bedNumberStr, 10)
        return {
          id: slot.patientId,
          shiftId: shiftId,
          status: patientData.status,
          isHepatitis: !isNaN(bedNumber) && hepatitisBeds.includes(bedNumber),
          isPeripheral: shiftId.startsWith('peripheral'),
        }
      })
      .filter(Boolean)
  }

  const mainArea = (list) => list.filter((p) => !p.isPeripheral)
  const peripheral = (list) => list.filter((p) => p.isPeripheral)
  const sort = (list) => {
    const getSortKey = (shiftId) => {
      if (!shiftId || typeof shiftId !== 'string') return 999
      const parts = shiftId.split('-')
      if (parts[0] === 'peripheral') return 100 + parseInt(parts[1], 10)
      const num = parseInt(parts[1], 10)
      return isNaN(num) ? 999 : num
    }
    return [...list].sort((a, b) => getSortKey(a.shiftId) - getSortKey(b.shiftId))
  }

  // --- 提前獲取所有班別的病人列表 ---
  const allEarlyPatients = getRichPatientList(SHIFT_CODES.EARLY)
  const allNoonPatients = getRichPatientList(SHIFT_CODES.NOON)
  const allLatePatients = getRichPatientList(SHIFT_CODES.LATE)

  // =================================================================
  // === 1. 早班分配 (完全遵照您的原始邏輯)
  // =================================================================
  console.log('--- 🚀 開始早班分配 ---')
  const earlyMain = mainArea(allEarlyPatients)
  const useEarlyTeamA = earlyMain.length > 36
  const earlyTeamsToUse = baseTeams.filter((t) => t !== 'L' && t !== '外圍').map((t) => `早${t}`)
  const earlyRegularTeams = baseTeams
    .filter((t) => !['A', 'K', 'L', '外圍'].includes(t))
    .map((t) => `早${t}`)

  const earlyRules = {
    priorityTeams: {
      hepatitis: '早G',
      inPatientTeams: ['早H', '早I', '早J'],
      inPatientCapacity: { 早H: 2, 早I: 2, 早J: 2 },
    },
    mainDistribution: {
      specialTeam: useEarlyTeamA ? { name: '早A', capacity: 2 } : null,
      regularTeams: earlyRegularTeams,
    },
  }
  const earlyAssignments = distributePatients(sort(earlyMain), earlyTeamsToUse, earlyRules)
  earlyAssignments['早外圍'] = peripheral(allEarlyPatients) // 現在 peripheral() 是正確的了

  // =================================================================
  // === 2. 午班上針分配 (完全遵照您的原始邏輯)
  // =================================================================
  console.log('--- 🌞 開始午班上針分配 (規則同早班) ---')
  const noonMain = mainArea(allNoonPatients)
  const useNoonTeamA = noonMain.length > 36
  const noonOnRules = {
    ...earlyRules,
    mainDistribution: {
      specialTeam: useNoonTeamA ? { name: '早A', capacity: 2 } : null,
      regularTeams: earlyRegularTeams,
    },
  }
  const noonOnAssignments = distributePatients(sort(noonMain), earlyTeamsToUse, noonOnRules)
  noonOnAssignments['早外圍'] = peripheral(allNoonPatients)

  // =================================================================
  // === 3. 午班收針分配 (完全遵照您的原始邏輯)
  // =================================================================
  console.log('--- 🌙 開始午班收針分配 (規則同晚班) ---')
  const lateTeamsToUse = baseTeams.filter((t) => t <= 'H').map((t) => `晚${t}`)
  const lateRules = {
    priorityTeams: {
      hepatitis: '晚G',
      inPatientTeams: ['晚H'],
      inPatientCapacity: { 晚H: 2 },
    },
    mainDistribution: {
      specialTeam: null,
      regularTeams: lateTeamsToUse,
    },
  }
  const noonOffAssignments = distributePatients(sort(noonMain), lateTeamsToUse, lateRules)
  noonOffAssignments['晚外圍'] = peripheral(allNoonPatients)

  // =================================================================
  // === 4. 晚班分配 (完全遵照您的原始邏輯)
  // =================================================================
  console.log('--- 🌃 開始晚班分配 ---')
  const lateMain = mainArea(allLatePatients)
  const lateAssignments = distributePatients(sort(lateMain), lateTeamsToUse, lateRules)
  lateAssignments['晚外圍'] = peripheral(allLatePatients)

  // =================================================================
  // === 5. 應用所有分配結果 (完全遵照您的原始邏輯)
  // =================================================================
  console.log('--- ✅ 開始應用所有分配結果到排程表 ---')
  Object.values(scheduleCopy).forEach((slot) => {
    if (slot) {
      slot.nurseTeam = null
      slot.nurseTeamIn = null
      slot.nurseTeamOut = null
    }
  })
  for (const team in earlyAssignments) {
    for (const patient of earlyAssignments[team]) {
      if (scheduleCopy[patient.shiftId]) {
        scheduleCopy[patient.shiftId].nurseTeam = team
      }
    }
  }
  for (const team in noonOnAssignments) {
    for (const patient of noonOnAssignments[team]) {
      if (scheduleCopy[patient.shiftId]) {
        scheduleCopy[patient.shiftId].nurseTeamIn = team
      }
    }
  }
  for (const team in noonOffAssignments) {
    for (const patient of noonOffAssignments[team]) {
      if (scheduleCopy[patient.shiftId]) {
        scheduleCopy[patient.shiftId].nurseTeamOut = team
      }
    }
  }
  for (const team in lateAssignments) {
    for (const patient of lateAssignments[team]) {
      if (scheduleCopy[patient.shiftId]) {
        scheduleCopy[patient.shiftId].nurseTeam = team
      }
    }
  }

  currentRecord.schedule = scheduleCopy
  setChange()
  statusIndicator.value = '自動分組完成，請確認並儲存'
  showAlert('操作成功', '四個班次的自動分組已全部完成！請檢視結果並點擊「儲存」。')
}

// --- Lifecycle Hooks ---
onMounted(async () => {
  isLoading.value = true
  await auth.waitForAuthInit()
  await loadAllData()
  await loadDataForDay(currentDate.value)
  isLoading.value = false
})
watch(currentDate, (newDate, oldDate) => {
  if (oldDate && formatDate(newDate) !== formatDate(oldDate)) {
    loadDataForDay(newDate)
  }
})
</script>

<style scoped>
/* =================================================================== */
/* === 1. 原始樣式 (無變動) === */
/* =================================================================== */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 999;
  font-size: 1.5rem;
  color: #333;
  gap: 20px;
  backdrop-filter: blur(2px);
}
.loading-spinner {
  border: 8px solid #f3f3f3;
  border-top: 8px solid #3498db;
  border-radius: 50%;
  width: 60px;
  height: 60px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.page-container.is-locked .btn,
.page-container.is-locked .add-btn,
.page-container.is-locked input[type='date'] {
  opacity: 0.65;
  cursor: not-allowed;
}
.page-container.is-locked button:disabled,
.page-container.is-locked .btn:disabled {
  pointer-events: none;
}
.page-container.is-locked .page-main-content {
  cursor: not-allowed;
}
.page-container.is-locked .schedule-content,
.page-container.is-locked .sidebar-locked {
  background-color: #f5f5f5;
}
.is-locked [draggable='true'],
.is-locked [contenteditable='true'],
.is-locked .nurse-team-select {
  cursor: not-allowed;
}
.is-locked .memo-icon-inline,
.is-locked :deep(.memo-icon-wrapper) {
  pointer-events: auto;
  cursor: pointer;
}

.page-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 10px;
}
.page-header {
  flex-shrink: 0;
  border-bottom: 1px solid #e0e0e0;
  z-index: 10;
}
.page-main-content {
  flex-grow: 1;
  display: flex;
  min-height: 0;
  position: relative;
}
.schedule-content {
  flex-grow: 1;
  overflow-y: auto;
  min-width: 0;
}
.inpatient-sidebar {
  flex-shrink: 0;
  width: 240px;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.page-title {
  font-size: 32px;
  margin: 0;
  white-space: nowrap;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.current-date-text,
.weekday-display {
  font-size: 26px;
  font-weight: bold;
}
.weekday-display {
  color: var(--primary-color, #007bff);
}
.status-indicator {
  font-weight: bold;
  color: #6c757d;
}
.controls-panel {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn,
button {
  padding: 8px 15px;
  font-size: 1em;
  border: 1px solid #ccc;
  border-radius: 5px;
  cursor: pointer;
  background-color: #fff;
  transition: all 0.2s ease-in-out;
}
.btn-success {
  background-color: #28a745;
  color: white;
  border-color: #28a745;
}
.btn-success:hover:not(:disabled) {
  background-color: #218838;
}
.btn-info {
  background-color: #17a2b8;
  color: white;
  border-color: #17a2b8;
}
.btn-info:hover:not(:disabled) {
  background-color: #138496;
}
.btn-warning {
  background-color: #ffc107;
  color: #212529;
  border-color: #ffc107;
}
.btn-warning:hover:not(:disabled) {
  background-color: #e0a800;
}
.btn-secondary {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
.btn-secondary:hover:not(:disabled) {
  background-color: #545b62;
}
button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.dialysis-unit {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 20px;
}
.aisle {
  writing-mode: vertical-lr;
  text-align: center;
  padding: 20px 5px;
  background-color: #e9ecef;
  border-radius: 8px;
  font-size: 1.5em;
  letter-spacing: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6c757d;
}
.left-wing,
.right-wing {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bed-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.bed,
.nursing-station,
.peripheral-bed {
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease-in-out;
}
.bed {
  min-height: 160px;
}
.nursing-station {
  background-color: #f0f4c3;
  border: 2px dashed #afb42b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  font-weight: bold;
  color: #558b2f;
  grid-column: span 3;
  padding: 40px 0;
}
.bed-header,
.peripheral-header {
  background-color: #e3f2fd;
  color: #0d47a1;
  font-weight: bold;
  padding: 6px;
  text-align: center;
  font-size: 1em;
}
.shift-row,
.peripheral-shift-row {
  position: relative;
  display: grid;
  align-items: stretch;
  border-top: 1px solid #e0e0e0;
  transition: background-color 0.3s;
}
.shift-row {
  grid-template-columns: 28px 50px 1fr 40px;
}
.peripheral-shift-row {
  grid-template-columns: 28px 70px 80px 1fr 50px;
}
.shift-label {
  background-color: #f5f5f5;
  font-size: 0.8em;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #e0e0e0;
}
.shift-row > div,
.shift-row > select,
.peripheral-shift-row > div,
.peripheral-shift-row > select {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  min-height: 48px;
  border-left: 1px solid #e0e0e0;
  word-break: break-all;
  text-align: center;
}
.patient-tag {
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 6px;
  color: #dc3545;
  font-weight: bold;
}
.nurse-team-select {
  padding: 4px;
  border: none;
  font-size: 0.8em;
  width: 100%;
  background: transparent;
  border-radius: 0;
  appearance: none;
  text-align: center;
}
.shift-row.split-shift .nurse-split-column {
  display: flex;
  flex-direction: column;
  padding: 0;
}
.nurse-split-column .nurse-team-select {
  flex-grow: 1;
  height: 50%;
}
.nurse-split-column .nurse-team-select:first-child {
  border-bottom: 1px solid #e0e0e0;
}
.bed.hepatitis .bed-header {
  background-color: var(--hepatitis-bg, #fffde7);
  color: #af8203;
}
.bed.unassigned .bed-header {
  background-color: #bdbdbd;
  color: #424242;
}
.bed.unassigned .shift-row {
  display: none;
}
.bed.aisle-side.right-wing-bed {
  border-left: 5px solid #4caf50;
}
.bed.aisle-side.left-wing-bed {
  border-right: 5px solid #4caf50;
}
.shift-row.status-opd,
.peripheral-shift-row.status-opd {
  background-color: var(--green-bg, #e8f5e9);
}
.shift-row.status-ipd,
.peripheral-shift-row.status-ipd {
  background-color: var(--red-bg, #ffebee);
}
.shift-row.status-er,
.peripheral-shift-row.status-er {
  background-color: var(--purple-bg, #f3e5f5);
}
.shift-row.status-biweekly,
.peripheral-shift-row.status-biweekly {
  background-color: #ffcc80;
}
.shift-row.tag-chou,
.peripheral-shift-row.tag-chou {
  background-color: #658ee0;
}
.shift-row.tag-new,
.peripheral-shift-row.tag-new {
  background-color: #f5ec8e;
}
.shift-row.tag-huan,
.peripheral-shift-row.tag-huan {
  background-color: #e0f7fa;
}
.shift-row.tag-liang,
.peripheral-shift-row.tag-liang {
  background-color: #fff3e0;
}
.shift-row.tag-b,
.peripheral-shift-row.tag-b {
  background-color: #fff9c4;
}
.patient-name,
.peripheral-patient-name {
  font-size: 1.1em;
  font-weight: bold;
  padding: 4px 6px;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
}
.empty-slot-placeholder {
  color: #adb5bd;
  font-size: 1.5rem;
  user-select: none;
  transition: color 0.2s;
}
.patient-name:hover .empty-slot-placeholder,
.peripheral-patient-name:hover .empty-slot-placeholder {
  color: #007bff;
}
.patient-name.drag-over,
.peripheral-patient-name.drag-over {
  background-color: #c8e6c9 !important;
  border: 2px dashed #4caf50;
}
.extra-sections {
  margin-top: 30px;
}
.peripheral-section {
  margin-bottom: 20px;
}
.peripheral-bed-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 10px;
}
.peripheral-bed .peripheral-header {
  background-color: #fce4ec;
  color: #c2185b;
}
.team-highlight-container {
  display: flex;
  gap: 1rem;
  padding: 8px;
  background-color: #e9ecef;
  border-radius: 8px;
}
.team-group {
  display: flex;
  align-items: center;
}
.team-group-label {
  font-weight: bold;
  font-size: 1.2rem;
  color: #495057;
  margin-right: 8px;
  writing-mode: vertical-rl;
  background-color: #ced4da;
  padding: 8px 4px;
  border-radius: 4px;
}
.team-group:first-of-type .team-group-label {
  background-color: #ffe082;
  color: #333;
}
.team-group:last-of-type .team-group-label {
  background-color: #90caf9;
  color: #333;
}
.team-buttons {
  display: flex;
  border: 1px solid #ced4da;
  border-radius: 6px;
  overflow: hidden;
}
.team-btn {
  padding: 6px 12px;
  font-size: 0.9em;
  min-width: 40px;
  border: none;
  border-left: 1px solid #ced4da;
  background-color: #fff;
  transition: all 0.2s;
}
.team-buttons .team-btn:first-child {
  border-left: none;
}
.team-btn.active {
  background-color: #dc3545;
  color: white;
  border-color: #c82333;
}
.shift-row.highlighted-slot,
.peripheral-shift-row.highlighted-slot {
  outline: 3px solid #dc3545;
  outline-offset: -3px;
  z-index: 1;
}
.memo-icon-inline {
  position: relative;
  z-index: 2;
}
.patient-name {
  position: relative;
}

/* =================================================================== */
/* === 2. 整合後的響應式與新增功能樣式 === */
/* =================================================================== */
.mobile-and-print-only {
  display: none;
}
.view-toggle-wrapper {
}
.view-toggle-btn {
  background-color: #e9ecef;
  border-color: #adb5bd;
  padding: 8px 15px;
  font-weight: 500;
}
.view-toggle-btn:hover {
  background-color: #dee2e6;
}
.toggle-icon {
  transition: transform 0.2s ease-in-out;
}
.simplified-view-wrapper.desktop-only {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(248, 249, 250, 0.97);
  z-index: 20;
  padding: 1rem;
  overflow-y: auto;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.simplified-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  table-layout: fixed;
}
.simplified-table th,
.simplified-table td {
  border: 1px solid #ccc;
  padding: 0.5rem;
  text-align: center;
  vertical-align: top;
}
.simplified-table th {
  background-color: #e9ecef;
  font-weight: 600;
}
.simplified-table .col-bed {
  font-weight: bold;
  background-color: #f8f9fa;
  width: 80px;
}
.patient-info-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  cursor: pointer;
}
.patient-mrn-name {
  font-weight: bold;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.patient-note {
  font-size: 0.85rem;
  color: #dc3545;
  font-weight: 500;
}
.patient-ward-note {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ward-number {
  font-weight: bold;
  background-color: #ffc107;
  color: #333;
  padding: 0 4px;
  border-radius: 4px;
}
.patient-name-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}
.record-indicator {
  font-size: 1rem;
  line-height: 1;
}

/* 桌面版臨床查閱模式的字體顏色 */
.desktop-only .simplified-table .patient-name-wrapper {
  font-size: 1.1em;
  font-weight: 600;
  color: #212529;
}
.desktop-only .simplified-table .patient-mrn-name span:first-child {
  color: #6c757d;
  font-size: 0.85em;
  font-weight: normal;
}
.desktop-only :deep(.simplified-table td[class*='status-']) {
  color: #212529;
}
.desktop-only :deep(.simplified-table td[class*='status-']) .patient-mrn-name span:first-child {
  color: #6c757d;
}
.desktop-only :deep(.simplified-table td[class*='status-']) .patient-note {
  color: #dc3545;
}

@media screen and (min-width: 993px) {
  .desktop-only .simplified-table td {
    padding: 0.6rem;
    font-size: 1rem;
  }
  .desktop-only .simplified-table .patient-mrn-name {
    display: flex;
    flex-direction: row;
    align-items: baseline;
    gap: 0.5em;
    flex-wrap: nowrap;
  }
  .desktop-only .simplified-table .patient-ward-note {
    gap: 0.5em;
  }
}

@media screen and (max-width: 992px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-and-print-only {
    display: block;
  }
  .page-container {
    padding: 0;
  }
  .page-header {
    padding: 1rem;
  }
  .page-main-content {
    display: block;
    overflow-y: auto;
  }
  .schedule-content {
    padding: 0;
  }
  .simplified-view {
    padding: 1rem;
  }
  .header-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .toolbar-left,
  .toolbar-right {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
  .date-navigator {
    justify-content: space-between;
  }
  .page-title {
    text-align: center;
  }
}

/* =================================================================== */
/* === 3. 專業列印模式樣式 (最終解決方案) === */
/* =================================================================== */

/* ✨ 核心修正: 使用新的視覺隱藏技巧，而不是 display: none */
.print-only-view {
  position: absolute;
  left: -9999px; /* 移到螢幕外 */
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.print-header {
  text-align: center;
  font-size: 16pt;
  margin-bottom: 0.5rem;
}
.print-stats {
  display: flex;
  justify-content: center;
  gap: 2rem;
  font-size: 12pt;
  margin-bottom: 0.5rem;
}
.print-stats .stat-item strong {
  margin-right: 0.5em;
}
.print-divider {
  border: none;
  border-top: 2px solid #333;
  margin-bottom: 1rem;
}
.print-table {
  font-size: 11pt;
  table-layout: auto;
}
.print-table th,
.print-table td {
  padding: 5px;
  vertical-align: middle;
}
.print-table .patient-info-cell {
  text-align: center;
}
.print-table .patient-mrn-name {
  flex-direction: column;
}
.print-table .patient-mrn-name span:first-child {
  font-size: 0.8em;
  color: #555;
}
.print-table .patient-name-wrapper {
  font-weight: 600;
}

@media print {
  /* 1. 徹底隱藏整個主應用程式容器 */
  :deep(body > #app > *) {
    display: none !important;
  }

  /* 2. 只讓 page-container 內的 print-only-view 顯示出來 */
  :deep(body > #app > .page-container) {
    display: block !important;
  }
  .page-container > :not(.print-only-view) {
    display: none !important;
  }

  /* 3. 讓列印區塊正常顯示 */
  .print-only-view {
    display: block !important;
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
  }

  /* 4. 移除頁面邊距和背景 */
  @page {
    size: A4 landscape;
    margin: 1cm;
  }
  body,
  .page-container {
    padding: 0 !important;
    margin: 0 !important;
    background: none !important;
  }

  /* 5. 確保表格內容不斷開 */
  tr,
  .patient-info-cell {
    page-break-inside: avoid;
  }
  .print-table td[class*='status-'] {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
