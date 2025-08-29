<!-- 檔案路徑: src/views/ScheduleView.vue (最終整合版) -->
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
            :show-patient-numbers="true"
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
          <!-- 按鈕一 -->
          <button
            class="view-toggle-btn desktop-only"
            @click="isSimplifiedViewVisible = !isSimplifiedViewVisible"
          >
            <span class="toggle-icon">{{ isSimplifiedViewVisible ? '▼' : '▶' }}</span>
            {{ isSimplifiedViewVisible ? '收合臨床查閱模式' : '展開臨床查閱模式' }}
          </button>
          <!-- 按鈕二 -->
          <button
            class="btn-secondary desktop-only"
            @click="isInpatientRoundsDialogVisible = true"
            :disabled="todayInpatients.length === 0"
            title="顯示今日住院病人總覽"
          >
            <i class="fas fa-walking"></i> 住院病人趴趴走 ({{ todayInpatients.length }})
          </button>
        </div>
        <div class="controls-right">
          <div class="daily-staff-panel horizontal">
            <div class="staff-item shift-early">
              <span class="staff-label">早班</span>
              <div class="staff-details">
                <div class="staff-name">
                  <span class="staff-job-title">醫師</span>
                  {{ dailyPhysicians.early?.name || '--' }}
                </div>
                <span v-if="dailyPhysicians.early" class="staff-contact">
                  (員:{{ dailyPhysicians.early.staffId || 'N/A' }} / 電:{{
                    dailyPhysicians.early.phone || 'N/A'
                  }})
                </span>
              </div>
            </div>
            <div class="staff-item shift-noon">
              <span class="staff-label">午班</span>
              <div class="staff-details">
                <div class="staff-name">
                  <span class="staff-job-title">醫師</span>
                  {{ dailyPhysicians.noon?.name || '--' }}
                </div>
                <span v-if="dailyPhysicians.noon" class="staff-contact">
                  (員:{{ dailyPhysicians.noon.staffId || 'N/A' }} / 電:{{
                    dailyPhysicians.noon.phone || 'N/A'
                  }})
                </span>
              </div>
            </div>
            <div class="staff-item shift-late">
              <span class="staff-label">晚班</span>
              <div class="staff-details">
                <div class="staff-name">
                  <span class="staff-job-title">醫師</span>
                  {{ dailyPhysicians.late?.name || '--' }}
                </div>
                <span v-if="dailyPhysicians.late" class="staff-contact">
                  (員:{{ dailyPhysicians.late.staffId || 'N/A' }} / 電:{{
                    dailyPhysicians.late.phone || 'N/A'
                  }})
                </span>
              </div>
            </div>
            <div class="staff-item shift-specialist">
              <span class="staff-label">專師</span>
              <div class="staff-details">
                <span class="staff-name">賴若蕎</span>
                <span class="staff-contact">(電: 665129)</span>
              </div>
            </div>
          </div>

          <StatsToolbar
            :stats-data="statsToolbarData"
            :weekdays="statsToolbarWeekdays"
            :show-patient-numbers="true"
          />
        </div>
      </div>
    </header>

    <main class="page-main-content" :class="{ 'is-locked': isPageLocked }">
      <!-- (A) 臨床查閱模式 (桌面覆蓋層) -->
      <div v-if="isSimplifiedViewVisible" class="simplified-view-wrapper desktop-only">
        <div class="simplified-view">
          <table class="simplified-table">
            <thead>
              <tr>
                <th class="col-bed">床號</th>
                <th v-for="shiftCode in ORDERED_SHIFT_CODES" :key="shiftCode">
                  <div class="shift-header-content">
                    <span>{{ getShiftDisplayName(shiftCode) }}</span>
                    <button
                      @click="showShiftRecordsSummary(shiftCode)"
                      class="summary-icon-btn-table"
                      title="查看此班紀錄"
                    >
                      📋
                    </button>
                  </div>
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
                >
                  <div
                    v-if="currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]"
                    class="patient-info-cell"
                  >
                    <div class="patient-mrn-name">
                      <span
                        class="medical-record-number"
                        @click.stop="
                          copyMedicalRecordNumber(
                            patientMap.get(
                              currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId,
                            )?.medicalRecordNumber,
                          )
                        "
                        title="點擊以複製病歷號"
                      >
                        {{
                          patientMap.get(
                            currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId,
                          )?.medicalRecordNumber
                        }}
                      </span>
                      <div
                        class="patient-name-wrapper"
                        @click="handleSimplifiedCellClick(`bed-${bedNum}-${shiftCode}`)"
                        title="點擊查看詳細資料"
                      >
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
                        <span
                          v-if="
                            getPatientMode(`bed-${bedNum}-${shiftCode}`) &&
                            getPatientMode(`bed-${bedNum}-${shiftCode}`) !== 'HD'
                          "
                          class="stats-special-mode"
                        >
                          ({{ getPatientMode(`bed-${bedNum}-${shiftCode}`) }})
                        </span>
                      </div>
                    </div>
                    <div class="patient-note">
                      <span
                        v-if="
                          getPatientWardNumber(
                            currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]?.patientId,
                          )
                        "
                        class="ward-number-display"
                      >
                        [{{
                          getPatientWardNumber(
                            currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]?.patientId,
                          )
                        }}]
                      </span>
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
                >
                  <div
                    v-if="currentRecord.schedule[`peripheral-${i}-${shiftCode}`]"
                    class="patient-info-cell"
                  >
                    <div class="patient-mrn-name">
                      <span
                        class="medical-record-number"
                        @click.stop="
                          copyMedicalRecordNumber(
                            patientMap.get(
                              currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId,
                            )?.medicalRecordNumber,
                          )
                        "
                        title="點擊以複製病歷號"
                      >
                        {{
                          patientMap.get(
                            currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId,
                          )?.medicalRecordNumber
                        }}
                      </span>
                      <div
                        class="patient-name-wrapper"
                        @click="handleSimplifiedCellClick(`peripheral-${i}-${shiftCode}`)"
                        title="點擊查看詳細資料"
                      >
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
                        <span
                          v-if="
                            getPatientMode(`peripheral-${i}-${shiftCode}`) &&
                            getPatientMode(`peripheral-${i}-${shiftCode}`) !== 'HD'
                          "
                          class="stats-special-mode"
                        >
                          ({{ getPatientMode(`peripheral-${i}-${shiftCode}`) }})
                        </span>
                      </div>
                    </div>
                    <div class="patient-ward-note">
                      <span class="ward-number">{{
                        getPatientWardNumber(
                          currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.patientId,
                        )
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
                      ]"
                    >
                      <div class="shift-label">{{ getShiftDisplayName(shiftCode) }}</div>
                      <div v-if="shiftCode === SHIFT_CODES.NOON" class="nurse-split-column">
                        <select
                          class="nurse-team-select nurse-in"
                          :value="getNurseTeam(`bed-${bedNum}-${shiftCode}`, 'in')"
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
                          :value="getNurseTeam(`bed-${bedNum}-${shiftCode}`, 'out')"
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
                        :value="getNurseTeam(`bed-${bedNum}-${shiftCode}`, 'single')"
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
                        <div
                          v-if="getPatientName(`bed-${bedNum}-${shiftCode}`)"
                          class="patient-cell-layout"
                        >
                          <div class="patient-name-text">
                            <span>{{ getPatientName(`bed-${bedNum}-${shiftCode}`) }}</span>
                            <span
                              v-if="
                                getPatientMode(`bed-${bedNum}-${shiftCode}`) &&
                                getPatientMode(`bed-${bedNum}-${shiftCode}`) !== 'HD'
                              "
                              class="stats-special-mode-inline"
                            >
                              ({{ getPatientMode(`bed-${bedNum}-${shiftCode}`) }})
                            </span>
                          </div>
                          <div class="patient-icons-row">
                            <span
                              v-if="
                                getPatientWardNumber(
                                  currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]?.patientId,
                                )
                              "
                              class="ward-badge-inline"
                              @click.stop="promptWardNumber(`bed-${bedNum}-${shiftCode}`)"
                              :title="
                                '床號：' +
                                getPatientWardNumber(
                                  currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]?.patientId,
                                ) +
                                '（點擊編輯）'
                              "
                            >
                              {{
                                getPatientWardNumber(
                                  currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]?.patientId,
                                )
                              }}
                            </span>
                            <button
                              v-else-if="isInpatientOrER(`bed-${bedNum}-${shiftCode}`)"
                              class="ward-icon-inline"
                              @click.stop="promptWardNumber(`bed-${bedNum}-${shiftCode}`)"
                              :disabled="isPageLocked"
                              title="設定床號"
                            >
                              🛏️
                            </button>
                            <MemoIcon
                              :patient-id="
                                currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.patientId
                              "
                            />
                          </div>
                        </div>
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
                  :class="[getPatientCellStyle(`peripheral-${i}-${shiftCode}`)]"
                >
                  <div class="shift-label">{{ getShiftDisplayName(shiftCode) }}</div>
                  <select
                    class="nurse-team-select"
                    :value="
                      getNurseTeam(
                        `peripheral-${i}-${shiftCode}`,
                        shiftCode === SHIFT_CODES.NOON ? 'in' : 'single',
                      )
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
                    @click="
                      isInpatientOrER(`peripheral-${i}-${shiftCode}`) &&
                      promptWardNumber(`peripheral-${i}-${shiftCode}`)
                    "
                    :style="{
                      cursor:
                        isPageLocked || !isInpatientOrER(`peripheral-${i}-${shiftCode}`)
                          ? 'default'
                          : 'pointer',
                    }"
                  >
                    <span
                      v-if="
                        getPatientWardNumber(
                          currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.patientId,
                        )
                      "
                      class="ward-number-badge"
                      :title="
                        '床號：' +
                        getPatientWardNumber(
                          currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.patientId,
                        ) +
                        '（點擊編輯）'
                      "
                    >
                      {{
                        getPatientWardNumber(
                          currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.patientId,
                        )
                      }}
                    </span>
                    <button
                      v-else-if="
                        getPatientName(`peripheral-${i}-${shiftCode}`) &&
                        isInpatientOrER(`peripheral-${i}-${shiftCode}`)
                      "
                      class="ward-edit-icon"
                      :disabled="isPageLocked"
                      title="設定床號"
                    >
                      🛏️
                    </button>
                    <span v-else>-</span>
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
                    <div
                      v-if="getPatientName(`peripheral-${i}-${shiftCode}`)"
                      class="patient-cell-layout"
                    >
                      <div class="patient-name-text">
                        <span>{{ getPatientName(`peripheral-${i}-${shiftCode}`) }}</span>
                        <span
                          v-if="
                            getPatientMode(`peripheral-${i}-${shiftCode}`) &&
                            getPatientMode(`peripheral-${i}-${shiftCode}`) !== 'HD'
                          "
                          class="stats-special-mode-inline"
                        >
                          ({{ getPatientMode(`peripheral-${i}-${shiftCode}`) }})
                        </span>
                      </div>
                      <div class="patient-icons-row">
                        <MemoIcon
                          :patient-id="
                            currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.patientId
                          "
                        />
                      </div>
                    </div>
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
              <th v-for="shiftCode in ORDERED_SHIFT_CODES" :key="`mobile-header-${shiftCode}`">
                <div class="shift-header-content">
                  <span>{{ getShiftDisplayName(shiftCode) }}</span>
                  <button
                    @click="showShiftRecordsSummary(shiftCode)"
                    class="summary-icon-btn-table"
                    title="查看此班紀錄"
                  >
                    📋
                  </button>
                </div>
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
                    <span>
                      {{
                        patientMap.get(
                          currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId,
                        )?.medicalRecordNumber
                      }}
                    </span>
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
                      <span
                        v-if="
                          getPatientMode(`bed-${bedNum}-${shiftCode}`) &&
                          getPatientMode(`bed-${bedNum}-${shiftCode}`) !== 'HD'
                        "
                        class="stats-special-mode"
                      >
                        ({{ getPatientMode(`bed-${bedNum}-${shiftCode}`) }})
                      </span>
                    </div>
                  </div>
                  <div class="patient-note">
                    <span
                      v-if="
                        getPatientWardNumber(
                          currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]?.patientId,
                        )
                      "
                      class="ward-number-display"
                    >
                      [{{
                        getPatientWardNumber(
                          currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]?.patientId,
                        )
                      }}]
                    </span>
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
                    <span>
                      {{
                        patientMap.get(
                          currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId,
                        )?.medicalRecordNumber
                      }}
                    </span>
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
                      <span
                        v-if="
                          getPatientMode(`peripheral-${i}-${shiftCode}`) &&
                          getPatientMode(`peripheral-${i}-${shiftCode}`) !== 'HD'
                        "
                        class="stats-special-mode"
                      >
                        ({{ getPatientMode(`peripheral-${i}-${shiftCode}`) }})
                      </span>
                    </div>
                  </div>
                  <div class="patient-ward-note">
                    <span class="ward-number">{{
                      getPatientWardNumber(
                        currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.patientId,
                      )
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
    <PatientDetailModal
      :is-visible="isDetailModalVisible"
      :patient="selectedPatientForDetail"
      :current-date="currentDate"
      :has-pending-memos="patientWithMemoIds.has(selectedPatientForDetail?.id)"
      :patient-shift="shiftForDetailModal"
      @close="isDetailModalVisible = false"
      @record-updated="fetchRecentRecords"
    />
    <WardNumberDialog
      :is-visible="isWardDialogVisible"
      :current-value="currentWardNumber"
      @confirm="handleWardNumberConfirm"
      @cancel="isWardDialogVisible = false"
    />
    <InpatientRoundsDialog
      :is-visible="isInpatientRoundsDialogVisible"
      :patients-on-schedule="todayInpatients"
      :target-date="formatDate(currentDate)"
      @close="isInpatientRoundsDialogVisible = false"
      @save="handleInpatientTransportUpdate"
    />
    <DailyRecordsSummaryDialog
      :is-visible="isRecordsSummaryDialogVisible"
      :target-date="formatDate(currentDate)"
      :shift-code="shiftCodeForDialog"
      :patient-ids="patientIdsForDialog"
      @close="closeRecordsSummaryDialog"
    />
    <div class="print-only-view">
      <h1 class="print-header">{{ currentDateDisplay }} 每日排程總表</h1>
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
                    getPatientWardNumber(
                      currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.patientId,
                    )
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
  fetchAllSchedules as optimizedFetchAllSchedules,
  saveSchedule as optimizedSaveSchedule,
  updateSchedule as optimizedUpdateSchedule,
  fetchAllMemos as optimizedFetchAllMemos,
  updatePatient as optimizedUpdatePatient,
} from '@/services/optimizedApiService.js'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'
import { useTeamAssigner } from '@/composables/useTeamAssigner.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import { useScheduleAnalysis } from '@/composables/useScheduleAnalysis.js'
import { fetchTeamsByDate, saveTeams, updateTeams } from '@/services/nurseAssignmentsService.js'

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
import PatientDetailModal from '@/components/PatientDetailModal.vue'
import WardNumberDialog from '@/components/WardNumberDialog.vue'
import InpatientRoundsDialog from '@/components/InpatientRoundsDialog.vue'
import DailyRecordsSummaryDialog from '@/components/DailyRecordsSummaryDialog.vue'

import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

const patientStore = usePatientStore()
const { allPatients, patientMap } = storeToRefs(patientStore)

const conditionRecordsApi = ApiManager('condition_records')
const usersApi = ApiManager('users') // ✨ 新增

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

const currentDate = ref(new Date())
const activeMemos = ref([])
const recentConditionRecords = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })
const currentTeamsRecord = ref({ id: null, date: '', teams: {} })
const hasUnsavedTeamChanges = ref(false)

const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isAssignmentDialogVisible = ref(false)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const isPatientSelectDialogVisible = ref(false)
const currentSlotId = ref(null)
const isConfirmDialogVisible = ref(false)
const confirmDialogMessage = ref('')
const onConfirmAction = ref(null)
const isLoading = ref(true)
const isSimplifiedViewVisible = ref(false)
const isDetailModalVisible = ref(false)
const selectedPatientForDetail = ref(null)
const shiftForDetailModal = ref(null)
const isWardDialogVisible = ref(false)
const currentWardNumber = ref('')
const currentEditingShiftId = ref(null)
const isInpatientRoundsDialogVisible = ref(false)
const isRecordsSummaryDialogVisible = ref(false)
// ✨ 步驟 2: 修改 ref 名稱，使其更符合新邏輯
const shiftCodeForDialog = ref(null)
const patientIdsForDialog = ref([]) // 新增一個 ref 來存放病人 ID 列表

// ✨ 新增
const dailyPhysicians = ref({ early: null, noon: null, late: null })
const specialistNurse = ref({ name: '賴若蕎', phone: '讀取中...' })

const auth = useAuth()
const { createGlobalNotification } = useGlobalNotifier()
const router = useRouter()

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
    for (const [shiftKey, slotData] of Object.entries(currentRecord.schedule)) {
      if (slotData && slotData.patientId) {
        const patient = patientMap.value.get(slotData.patientId)
        if (!patient) continue
        const shiftCode = shiftKey.split('-').pop()
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
  patientWithMemoIds.value.forEach((id) => patientIdsWithInfo.add(id))
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

// ✨ [新增] 計算今日住院病人的 computed 屬性
const todayInpatients = computed(() => {
  const inpatientsMap = new Map()

  // 1. 處理已排床病人
  if (currentRecord && currentRecord.schedule) {
    for (const shiftId in currentRecord.schedule) {
      const slot = currentRecord.schedule[shiftId]

      // ✨ [核心修正] 增加條件：排除外圍床位的病人 ✨
      if (slot && slot.patientId && !shiftId.startsWith('peripheral')) {
        const patient = patientMap.value.get(slot.patientId)

        // 只篩選出住院 (ipd) 和急診 (er) 的病人
        if (patient && (patient.status === 'ipd' || patient.status === 'er')) {
          const shiftCode = shiftId.split('-')[2]
          // ✨ 修正：外圍床位已排除，這裡不再需要 '外圍' 的判斷
          const dialysisBed = String(shiftId.split('-')[1] || 'N/A')

          if (!inpatientsMap.has(patient.id)) {
            inpatientsMap.set(patient.id, {
              id: `${patient.id}-${shiftId}`,
              shiftId: shiftId,
              dialysisBed,
              medicalRecordNumber: patient.medicalRecordNumber,
              name: patient.name,
              wardNumber: patient.wardNumber || '未登錄',
              shift: shiftCode,
              transportMethod: slot.transportMethod,
            })
          }
        }
      }
    }
  }

  // 2. 處理未排床病人 (這部分不變，因為他們也需要被移動)
  const unassignedInpatients = getDailyUnassignedPatients(dayOfWeek).value.filter(
    (p) => p.status === 'ipd' || p.status === 'er',
  )

  unassignedInpatients.forEach((patient) => {
    if (!inpatientsMap.has(patient.id)) {
      inpatientsMap.set(patient.id, {
        id: `${patient.id}-unassigned`,
        shiftId: null,
        dialysisBed: '未排床',
        medicalRecordNumber: patient.medicalRecordNumber,
        name: patient.name,
        wardNumber: patient.wardNumber || '未登錄',
        shift: 'unknown',
        transportMethod: null,
      })
    }
  })

  const inpatients = Array.from(inpatientsMap.values())

  // 排序邏輯不變
  inpatients.sort((a, b) => {
    const shiftOrder = { early: 1, noon: 2, late: 3, unknown: 4 }
    if (a.shift !== b.shift) {
      return shiftOrder[a.shift] - shiftOrder[b.shift]
    }
    // ✨ 修正：排序不再需要處理 '外圍'
    const bedA = a.dialysisBed === '未排床' ? 1000 : parseInt(a.dialysisBed)
    const bedB = b.dialysisBed === '未排床' ? 1000 : parseInt(b.dialysisBed)
    return bedA - bedB
  })

  return inpatients
})

// --- Functions ---
function getPatientMode(shiftId) {
  const patientId = currentRecord.schedule[shiftId]?.patientId
  if (!patientId) return null
  const patient = patientMap.value.get(patientId)
  return patient?.mode || null
}

// ✨✨✨ 核心修正點：移除 createGlobalNotification 的呼叫 ✨✨✨
async function copyMedicalRecordNumber(mrn) {
  if (!mrn) return

  try {
    await navigator.clipboard.writeText(mrn)
    // 成功複製後，不做任何事，保持安靜
    console.log(`病歷號 ${mrn} 已成功複製到剪貼簿。`) // 在開發者控制台保留一條日誌，方便偵錯
  } catch (err) {
    console.error('複製失敗:', err)
    // 失敗時，可以選擇性地跳出一個警告，或者也保持安靜
    // 這裡我建議保留失敗時的提示，以防使用者遇到問題卻不知道原因
    showAlert('複製失敗', '無法將病歷號複製到剪貼簿，您的瀏覽器可能不支援或未授予權限。')
  }
}

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
function setTeamChange() {
  if (isPageLocked.value) return
  hasUnsavedTeamChanges.value = true
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

// ✨ 新增
async function loadDailyStaffInfo(date) {
  try {
    const dateStr = formatDate(date).substring(0, 7) // "YYYY-MM"
    const physicianSchedulesApi = ApiManager('physician_schedules')

    // 步驟 1: 取得當月的醫師班表
    const monthScheduleDoc = await physicianSchedulesApi.fetchById(dateStr)

    // 步驟 2: 只取得所有「主治醫師」的詳細資料
    const physiciansSnapshot = await usersApi.fetchAll([where('title', '==', '主治醫師')])
    const userMap = new Map(physiciansSnapshot.map((u) => [u.id, u]))

    // 步驟 3: (已移除) 不再需要處理專師資料

    // 步驟 4: 處理當日三班醫師
    if (monthScheduleDoc && monthScheduleDoc.schedule) {
      const dayOfMonth = date.getDate()
      const daySchedule = monthScheduleDoc.schedule[dayOfMonth]

      if (daySchedule) {
        dailyPhysicians.value.early = userMap.get(daySchedule.early?.physicianId) || null
        dailyPhysicians.value.noon = userMap.get(daySchedule.noon?.physicianId) || null
        dailyPhysicians.value.late = userMap.get(daySchedule.late?.physicianId) || null
      } else {
        dailyPhysicians.value = { early: null, noon: null, late: null }
      }
    } else {
      dailyPhysicians.value = { early: null, noon: null, late: null }
    }
  } catch (error) {
    console.error('載入每日負責人資訊失敗:', error)
    dailyPhysicians.value = { early: null, noon: null, late: null }
  }
}

async function loadDataForDay(date) {
  hasUnsavedChanges.value = false
  hasUnsavedTeamChanges.value = false
  statusIndicator.value = '讀取中...'
  isLoading.value = true
  const dateStr = formatDate(date)
  try {
    await patientStore.fetchPatientsIfNeeded()
    const [dailyRecords, teamsData, memosData, recentRecs] = await Promise.all([
      optimizedFetchAllSchedules([where('date', '==', dateStr)]),
      fetchTeamsByDate(dateStr),
      optimizedFetchAllMemos([where('status', '==', 'pending')]),
      fetchRecentRecords(),
    ])
    activeMemos.value = memosData
    recentConditionRecords.value = recentRecs || []
    const record = dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }
    const finalSchedule = {}
    if (record.schedule) {
      for (const shiftId in record.schedule) {
        const dbSlotData = record.schedule[shiftId]
        if (dbSlotData?.patientId && patientMap.value.has(dbSlotData.patientId)) {
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
    currentTeamsRecord.value = teamsData || { id: null, date: dateStr, teams: {} }
    statusIndicator.value = record.id ? '資料已載入' : '本日無排程'
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  } finally {
    isLoading.value = false
  }
}
async function saveDataToCloud() {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足或日期已過。')
    return
  }
  statusIndicator.value = '儲存中...'
  try {
    const promises = []
    if (hasUnsavedChanges.value) {
      const dataToSave = {
        date: currentRecord.date,
        schedule: currentRecord.schedule || {},
        names: currentRecord.names || {},
      }
      if (currentRecord.id) {
        promises.push(optimizedUpdateSchedule(currentRecord.id, dataToSave))
      } else if (Object.keys(dataToSave.schedule).length > 0) {
        promises.push(
          optimizedSaveSchedule(dataToSave).then((savedRecord) => {
            currentRecord.id = savedRecord.id
          }),
        )
      }
    }
    if (hasUnsavedTeamChanges.value && Object.keys(currentTeamsRecord.value.teams).length > 0) {
      const teamsToSave = {
        date: currentTeamsRecord.value.date,
        teams: currentTeamsRecord.value.teams,
      }
      if (currentTeamsRecord.value.id) {
        promises.push(updateTeams(currentTeamsRecord.value.id, teamsToSave))
      } else {
        promises.push(
          saveTeams(teamsToSave).then((savedRecord) => {
            currentTeamsRecord.value.id = savedRecord.id
          }),
        )
      }
    }
    await Promise.all(promises)
    hasUnsavedChanges.value = false
    hasUnsavedTeamChanges.value = false
    statusIndicator.value = '儲存成功！'
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
    return await conditionRecordsApi.fetchAll([where('createdAt', '>=', sevenDaysAgo)])
  } catch (error) {
    console.error('獲取近期病情紀錄失敗:', error)
    return []
  }
}
function getPatientCellStyle(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData || !slotData.patientId) return {}
  const patient = patientMap.value.get(slotData.patientId)
  if (!patient) return {}
  return getUnifiedCellStyle(slotData, patient)
}
function getPatientWardNumber(patientId) {
  if (!patientId) return ''
  const patient = patientMap.value.get(patientId)
  return patient?.wardNumber || ''
}
function isInpatientOrER(shiftId) {
  const slot = currentRecord.schedule[shiftId]
  if (!slot?.patientId) return false
  const patient = patientMap.value.get(slot.patientId)
  return patient?.status === 'ipd' || patient?.status === 'er'
}
function promptWardNumber(shiftId) {
  if (isPageLocked.value) return
  const slot = currentRecord.schedule[shiftId]
  if (!slot?.patientId) return
  const patient = patientMap.value.get(slot.patientId)
  if (!patient || (patient.status !== 'ipd' && patient.status !== 'er')) {
    showAlert('提示', '只有住院或急診病人才能設定床號')
    return
  }
  currentEditingShiftId.value = shiftId
  currentWardNumber.value = patient.wardNumber || ''
  isWardDialogVisible.value = true
}
async function handleWardNumberConfirm(value) {
  if (!currentEditingShiftId.value) return
  const slot = currentRecord.schedule[currentEditingShiftId.value]
  if (!slot?.patientId) return
  try {
    await optimizedUpdatePatient(slot.patientId, { wardNumber: value })
    await patientStore.forceRefreshPatients()
    showAlert('操作成功', '床號已更新')
  } catch (error) {
    console.error('更新床號失敗:', error)
    showAlert('操作失敗', '更新床號失敗')
  }
  isWardDialogVisible.value = false
  currentEditingShiftId.value = null
  currentWardNumber.value = ''
}
function getNurseTeam(shiftId, type) {
  const slot = currentRecord.schedule[shiftId]
  if (!slot?.patientId) return ''
  const shiftCode = shiftId.split('-').pop()
  const key = `${slot.patientId}-${shiftCode}`
  const teamData = currentTeamsRecord.value.teams[key]
  if (!teamData) return ''
  if (type === 'single') return teamData.nurseTeam || ''
  else if (type === 'in') return teamData.nurseTeamIn || ''
  else if (type === 'out') return teamData.nurseTeamOut || ''
  return ''
}
function changeDate(days) {
  const performChange = () => {
    const newDate = new Date(currentDate.value)
    newDate.setDate(newDate.getDate() + days)
    currentDate.value = newDate
  }
  if ((hasUnsavedChanges.value || hasUnsavedTeamChanges.value) && !isPageLocked.value) {
    showConfirm('注意', '您有未儲存的變更，確定要切換日期嗎？', performChange)
  } else {
    performChange()
  }
}
function goToToday() {
  const performChange = () => (currentDate.value = new Date())
  if ((hasUnsavedChanges.value || hasUnsavedTeamChanges.value) && !isPageLocked.value) {
    showConfirm('注意', '您有未儲存的變更，確定要切換到今天嗎？', performChange)
  } else {
    performChange()
  }
}
function handleSlotClick(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (isPageLocked.value || !slotData?.patientId) {
    if (!slotData?.patientId && !isPageLocked.value) {
      currentSlotId.value = shiftId
      isPatientSelectDialogVisible.value = true
    }
    return
  }
  const patient = patientMap.value.get(slotData.patientId)
  showConfirm(`確認移除`, `確定要將「${patient?.name}」從此班次中移除嗎？`, () => {
    handleSlotUpdate(shiftId, null)
  })
}
function handleSimplifiedCellClick(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  const patientId = slotData?.patientId
  if (patientId) {
    const patient = patientMap.value.get(patientId)
    if (!patient) return
    selectedPatientForDetail.value = patient
    isDetailModalVisible.value = true
  }
}
function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter((memo) => memo.patientId === patientId)
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
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
  const targetSlotData = currentRecord.schedule[targetShiftId]
  if (sourceShiftId === 'sidebar' && scheduledPatientIds.value.has(patient.id)) {
    showConfirm('重複排班警告', `病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`, () => {
      if (targetSlotData?.patientId) {
        showAlert('操作失敗', '目標床位已被佔用，無法放置！')
        return
      }
      handleSlotUpdate(targetShiftId, droppedSlotData.patientId, droppedSlotData)
    })
    return
  }
  if (targetSlotData && targetSlotData.patientId) {
    if (sourceShiftId === 'sidebar') {
      showAlert('操作失敗', '目標床位已被佔用，無法從側邊欄拖曳至此。')
      return
    }
    handleSlotUpdate(targetShiftId, droppedSlotData.patientId, droppedSlotData)
    handleSlotUpdate(sourceShiftId, targetSlotData.patientId, targetSlotData)
  } else {
    handleSlotUpdate(targetShiftId, droppedSlotData.patientId, droppedSlotData)
    if (sourceShiftId && sourceShiftId !== 'sidebar') {
      handleSlotUpdate(sourceShiftId, null)
    }
  }
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
    patientId: patient.id,
    autoNote: generateAutoNote(patient),
    manualNote: patient.status === 'ipd' ? '住' : '',
  }
  event.dataTransfer.setData('sourceShiftId', 'sidebar')
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
function handleSlotUpdate(shiftId, patientId, fullSlotData = null) {
  if (isPageLocked.value) return
  if (patientId) {
    const patient = patientMap.value.get(patientId)
    if (!patient) return
    const correctShiftCode = shiftId.split('-').pop()
    let newSlotData
    if (fullSlotData) {
      newSlotData = { ...fullSlotData, patientId: patientId }
    } else {
      newSlotData = { patientId: patientId, manualNote: patient.status === 'ipd' ? '住' : '' }
    }
    newSlotData.autoNote = generateAutoNote(patient)
    newSlotData.shiftId = correctShiftCode
    currentRecord.schedule[shiftId] = newSlotData
  } else {
    delete currentRecord.schedule[shiftId]
  }
  setChange()
}

// ✨ [核心修改] 將此函式改為 async，並直接處理雲端儲存
async function handleInpatientTransportUpdate(updatedPatients) {
  if (isPageLocked.value || !updatedPatients || updatedPatients.length === 0) {
    console.warn('[Save Transport] Page is locked or no data to save.')
    return
  }

  let changesMade = false
  updatedPatients.forEach((patient) => {
    // ✨ [修正] patient.id 的格式可能是 `${patient.id}-${shiftId}` 或 `${patient.id}-unassigned`
    const originalShiftId = patient.shiftId // 直接使用我們傳遞的 shiftId

    // 只有已排床的病人才需要更新 schedule
    if (originalShiftId && currentRecord.schedule[originalShiftId]) {
      const existingMethod = currentRecord.schedule[originalShiftId].transportMethod || '推床'
      if (existingMethod !== patient.transportMethod) {
        currentRecord.schedule[originalShiftId].transportMethod = patient.transportMethod
        changesMade = true
      }
    }
  })

  if (changesMade) {
    console.log('[Save Transport] Changes detected, saving to cloud...')
    statusIndicator.value = '儲存中...' // 讓使用者看到狀態變化

    // 直接建立要儲存的資料物件
    const dataToSave = {
      date: currentRecord.date,
      schedule: currentRecord.schedule,
      names: currentRecord.names || {}, // 確保 names 也被包含
    }

    try {
      // 判斷是新增還是更新
      if (currentRecord.id) {
        await optimizedUpdateSchedule(currentRecord.id, dataToSave)
      } else if (Object.keys(dataToSave.schedule).length > 0) {
        const savedRecord = await optimizedSaveSchedule(dataToSave)
        currentRecord.id = savedRecord.id // 更新 id，以便下次是更新操作
      }

      statusIndicator.value = '儲存成功！'
      hasUnsavedChanges.value = false // 因為已經存了，所以重設未儲存狀態
      console.log('[Save Transport] Successfully saved to cloud.')

      // 可以選擇性地彈出一個短暫的成功提示
      // showAlert('成功', '病人運送方式已儲存！');
    } catch (error) {
      console.error('儲存住院病人運送方式失敗:', error)
      statusIndicator.value = '儲存失敗'
      // 如果失敗，應該通知使用者
      showAlert('儲存失敗', `儲存病人運送方式時發生錯誤: ${error.message}`)
      // 拋出錯誤，讓子元件知道儲存失敗了
      throw error
    }
  } else {
    console.log('[Save Transport] No changes detected, skipping save.')
  }
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
    event.target.value = getNurseTeam(shiftId, type)
    return
  }
  const slot = currentRecord.schedule[shiftId]
  if (!slot?.patientId) {
    event.target.value = ''
    return
  }
  const value = event.target.value
  const shiftCode = shiftId.split('-').pop()
  const key = `${slot.patientId}-${shiftCode}`
  if (!currentTeamsRecord.value.teams[key]) {
    currentTeamsRecord.value.teams[key] = {}
  }
  const teamData = currentTeamsRecord.value.teams[key]
  const isPeripheralNoon = shiftId.startsWith('peripheral') && shiftId.endsWith(SHIFT_CODES.NOON)
  if (type === 'single' && isPeripheralNoon) {
    teamData.nurseTeamIn = value || null
    teamData.nurseTeamOut = value || null
    teamData.nurseTeam = null
  } else if (type === 'single') {
    teamData.nurseTeam = value || null
  } else if (type === 'in') {
    teamData.nurseTeamIn = value || null
  } else if (type === 'out') {
    teamData.nurseTeamOut = value || null
  }
  if (!teamData.nurseTeam && !teamData.nurseTeamIn && !teamData.nurseTeamOut) {
    delete currentTeamsRecord.value.teams[key]
  }
  currentTeamsRecord.value = { ...currentTeamsRecord.value }
  setTeamChange()
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
function executeAutoAssignment() {
  currentTeamsRecord.value.teams = {}
  const getRichPatientList = (shiftCode) => {
    return Object.entries(currentRecord.schedule)
      .filter(([shiftId, slot]) => slot?.patientId && shiftId.endsWith(shiftCode))
      .map(([shiftId, slot]) => {
        const patientData = patientMap.value.get(slot.patientId)
        if (!patientData) return null
        const bedNumberStr = shiftId.split('-')[1]
        const bedNumber = parseInt(bedNumberStr, 10)
        return {
          id: slot.patientId,
          shiftId,
          shiftCode,
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
  const allEarlyPatients = getRichPatientList(SHIFT_CODES.EARLY)
  const allNoonPatients = getRichPatientList(SHIFT_CODES.NOON)
  const allLatePatients = getRichPatientList(SHIFT_CODES.LATE)
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
  earlyAssignments['早外圍'] = peripheral(allEarlyPatients)
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
  const lateTeamsToUse = baseTeams.filter((t) => t <= 'H').map((t) => `晚${t}`)
  const lateRules = {
    priorityTeams: { hepatitis: '晚F', inPatientTeams: ['晚H'], inPatientCapacity: { 晚H: 2 } },
    mainDistribution: { specialTeam: null, regularTeams: lateTeamsToUse },
  }
  const noonOffAssignments = distributePatients(sort(noonMain), lateTeamsToUse, lateRules)
  noonOffAssignments['晚外圍'] = peripheral(allNoonPatients)
  const lateMain = mainArea(allLatePatients)
  const lateAssignments = distributePatients(sort(lateMain), lateTeamsToUse, lateRules)
  lateAssignments['晚外圍'] = peripheral(allLatePatients)
  for (const team in earlyAssignments) {
    for (const patient of earlyAssignments[team]) {
      const key = `${patient.id}-${SHIFT_CODES.EARLY}`
      if (!currentTeamsRecord.value.teams[key]) {
        currentTeamsRecord.value.teams[key] = {}
      }
      currentTeamsRecord.value.teams[key].nurseTeam = team
    }
  }
  for (const team in noonOnAssignments) {
    for (const patient of noonOnAssignments[team]) {
      const key = `${patient.id}-${SHIFT_CODES.NOON}`
      if (!currentTeamsRecord.value.teams[key]) {
        currentTeamsRecord.value.teams[key] = {}
      }
      currentTeamsRecord.value.teams[key].nurseTeamIn = team
    }
  }
  for (const team in noonOffAssignments) {
    for (const patient of noonOffAssignments[team]) {
      const key = `${patient.id}-${SHIFT_CODES.NOON}`
      if (!currentTeamsRecord.value.teams[key]) {
        currentTeamsRecord.value.teams[key] = {}
      }
      currentTeamsRecord.value.teams[key].nurseTeamOut = team
    }
  }
  for (const team in lateAssignments) {
    for (const patient of lateAssignments[team]) {
      const key = `${patient.id}-${SHIFT_CODES.LATE}`
      if (!currentTeamsRecord.value.teams[key]) {
        currentTeamsRecord.value.teams[key] = {}
      }
      currentTeamsRecord.value.teams[key].nurseTeam = team
    }
  }
  setTeamChange()
  hasUnsavedChanges.value = true
  statusIndicator.value = '自動分組完成，請確認並儲存'
  showAlert('操作成功', '四個班次的自動分組已全部完成！請檢視結果並點擊「儲存」。')
}

// ✨ 步驟 3: 重構 showShiftRecordsSummary 函式
function showShiftRecordsSummary(shiftCode) {
  // 1. 收集該班別所有的病人 ID
  const patientIds = new Set()
  for (const shiftId in currentRecord.schedule) {
    // 確保只處理當前點擊的班別
    if (shiftId.endsWith(`-${shiftCode}`)) {
      const slot = currentRecord.schedule[shiftId]
      if (slot && slot.patientId) {
        patientIds.add(slot.patientId)
      }
    }
  }

  // 2. 更新 ref 的值
  shiftCodeForDialog.value = shiftCode
  patientIdsForDialog.value = Array.from(patientIds) // 將 Set 轉換為 Array
  isRecordsSummaryDialogVisible.value = true // 打開 Dialog
}

// ✨ 步驟 4: 重構關閉 Dialog 的函式
function closeRecordsSummaryDialog() {
  isRecordsSummaryDialogVisible.value = false
  shiftCodeForDialog.value = null
  patientIdsForDialog.value = [] // 關閉時清空
}

onMounted(async () => {
  isLoading.value = true
  await auth.waitForAuthInit()
  await Promise.all([loadDataForDay(currentDate.value), loadDailyStaffInfo(currentDate.value)])
  isLoading.value = false
})

watch(currentDate, (newDate, oldDate) => {
  if (oldDate && formatDate(newDate) !== formatDate(oldDate)) {
    loadDataForDay(newDate)
    loadDailyStaffInfo(newDate)
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
  padding: 0 0 0.3rem 0.3rem;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  /* ✨ 我們不再依賴 gap，而是讓子元素自己產生間距 */
}

/* ✨ [核心修正] 使用 > 子選擇器來精確指定目標 */
.controls-left > button {
  margin-right: 12px; /* 為每個按鈕增加右邊距 */
}

/* ✨ 為了避免最後一個按鈕也有多餘的邊距，我們把它移除 */
.controls-left > button:last-child {
  margin-right: 0;
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
  gap: 20px;
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
/* 備註區樣式（純粹的醫療備註） */
.patient-tag {
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 6px;
  color: #dc3545;
  font-weight: bold;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 姓名區的床號徽章 */
.ward-badge-inline {
  display: inline-block;
  background-color: #007bff;
  color: white;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.75em;
  font-weight: bold;
  margin-left: 4px;
  cursor: pointer;
  vertical-align: middle;
  transition: background-color 0.2s;
}

.ward-badge-inline:hover {
  background-color: #0056b3;
}

/* 姓名區的小床圖示 */
.ward-icon-inline {
  font-size: 0.85em;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  opacity: 0.6;
  margin-left: 4px;
  line-height: 1;
  transition: opacity 0.2s;
}

.ward-icon-inline:hover:not(:disabled) {
  opacity: 1;
}

.ward-icon-inline:disabled {
  cursor: not-allowed;
  opacity: 0.3;
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
/* 病人姓名區 */
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
  gap: 4px;
}
.patient-name > span {
  display: flex;
  align-items: center;
  gap: 4px;
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

/* ✨ 方案一：team-highlight-container 的樣式已被移除 */

.memo-icon-inline {
  position: relative;
  z-index: 2;
}
.patient-name {
  position: relative;
}
.patient-cell-layout {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 2px;
  line-height: 1.2;
}
.patient-name-text {
  font-weight: bold;
}
.patient-icons-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.patient-name,
.peripheral-patient-name {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}
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
.desktop-only :deep(.simplified-table td[class*='status-']) .patient-mrn-name {
  color: #212529;
  font-weight: 600;
}
.desktop-only :deep(.simplified-table td[class*='status-']) .patient-note {
  color: #dc3545;
}
/* ✨ 步驟 7: 為表格中的新圖示按鈕增加樣式 */
.shift-header-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px; /* 班別名稱和圖示之間的間距 */
}

.summary-icon-btn-table {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 1.2rem;
  opacity: 0.6;
  transition: all 0.2s;
}

.summary-icon-btn-table:hover {
  opacity: 1;
  transform: scale(1.1);
}
/* 用於臨床查閱模式和行動版 */
.stats-special-mode {
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

/* 用於排班操作模式，樣式微調以適應版面 */
.stats-special-mode-inline {
  display: inline-block;
  vertical-align: baseline;
  margin-left: 4px; /* 與姓名保持一點間距 */
  color: #c62828;
  font-weight: bold;
  font-size: 0.9em;
}

/* 確保排班模式下的姓名和標籤能在同一行 */
.patient-name-text {
  display: flex;
  align-items: baseline; /* 讓文字底部對齊 */
  justify-content: center;
  flex-wrap: nowrap; /* 防止換行 */
}
/* ✨ 步驟 4: 為可複製的病歷號和可點擊的姓名加上樣式 */
.medical-record-number {
  cursor: copy; /* 顯示複製游標 */
  transition: color 0.2s;
  color: #6c757d; /* 預設顏色 */
}
.medical-record-number:hover {
  color: #007bff; /* 滑鼠移上去時變色 */
  text-decoration: underline;
}

/* 讓姓名區塊看起來更像一個可點擊的按鈕 */
.patient-name-wrapper {
  cursor: pointer;
  transition: background-color 0.2s;
  padding: 2px 4px;
  border-radius: 4px;
}
.patient-name-wrapper:hover {
  background-color: #e9ecef;
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

.ward-number-display {
  font-weight: bold;
  color: #007bff;
  margin-right: 8px;
}
.peripheral-bed-number {
  font-size: 0.9em;
  min-width: 80px;
  padding: 4px 8px;
  border-left: 1px solid #e0e0e0;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.peripheral-bed-number:focus {
  outline: 2px solid #007bff;
  outline-offset: -2px;
  background-color: #f0f8ff;
}
.peripheral-bed-number[contenteditable='false'] {
  background-color: #f5f5f5;
}
.peripheral-bed-number .ward-number-badge {
  display: inline-block;
  background-color: #007bff;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;
}
.peripheral-bed-number .ward-number-badge:hover {
  background-color: #0056b3;
}
.peripheral-bed-number .ward-edit-icon {
  font-size: 0.9em;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  opacity: 0.6;
  line-height: 1;
}
.print-only-view {
  position: absolute;
  left: -9999px;
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
  :deep(body > #app > *) {
    display: none !important;
  }
  :deep(body > #app > .page-container) {
    display: block !important;
  }
  .page-container > :not(.print-only-view) {
    display: none !important;
  }
  .print-only-view {
    display: block !important;
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
  }
  @page {
    size: A4 horizontal;
    margin: 1cm;
  }
  body,
  .page-container {
    padding: 0 !important;
    margin: 0 !important;
    background: none !important;
  }
  tr,
  .patient-info-cell {
    page-break-inside: avoid;
  }
  .print-table td[class*='status-'] {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .patient-cell-layout {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    gap: 2px;
    line-height: 1.2;
    padding: 2px 0;
  }
  .patient-name-text {
    font-weight: bold;
  }
  .patient-icons-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .patient-name,
  .peripheral-patient-name {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
  }
}

/* ✨ 新增：每日負責人資訊面板的樣式 ✨ */
.daily-staff-panel.horizontal {
  display: flex;
  gap: 12px;
  background-color: #f8f9fa; /* 與背景色融合 */
  border: none; /* 移除邊框 */
  padding: 0;
  align-items: stretch; /* 讓所有項目等高 */
}

.staff-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 20px; /* 膠囊形狀 */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease-in-out;
}

.staff-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.staff-label {
  font-weight: 700;
  font-size: 0.9rem;
  margin-right: 10px;
  color: white;
}

.staff-details {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.staff-name {
  font-weight: 600;
  font-size: 1rem;
}

.staff-contact {
  font-size: 0.8rem;
  opacity: 0.9;
}

/* 顏色設定，參考班表統計 */
.staff-item.shift-early {
  background-color: #28a745;
  color: white;
}
.staff-item.shift-noon {
  background-color: #ffc107;
  color: #212529; /* 黃色背景搭配深色字 */
}
.staff-item.shift-noon .staff-label {
  color: #212529;
}
.staff-item.shift-late {
  background-color: #17a2b8;
  color: white;
}
.staff-item.shift-specialist {
  background-color: #6c757d;
  color: white;
}
.controls-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
/* ✨ 新增：醫師職稱的樣式 ✨ */
.staff-name {
  display: flex; /* 讓 "醫師" 和姓名可以並排 */
  align-items: baseline; /* 讓文字底部對齊 */
  gap: 0.3em; /* 增加一點間距 */
  font-weight: 600;
  font-size: 1rem;
}

.staff-job-title {
  font-size: 0.85em; /* 讓 "醫師" 兩個字稍微小一點 */
  font-weight: 500;
  opacity: 0.9;
}
</style>
