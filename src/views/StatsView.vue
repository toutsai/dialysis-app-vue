<!-- 檔案路徑: src/views/StatsView.vue (✨ 最終功能整合版 ✨) -->
<template>
  <div class="page-container">
    <!-- 1. 固定的頂部，此區塊不滾動 -->
    <div class="page-header-content">
      <!-- 頂部主要工具列 -->
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">護理分組</h1>
          <div class="date-navigator">
            <button @click="changeDate(-1)">&lt; 上一天</button>
            <span class="current-date-text">{{ formatDate(currentDate) }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
            <button @click="changeDate(1)">下一天 &gt;</button>
          </div>
          <button @click="goToToday">回到今日</button>
          <button
            class="btn-primary"
            @click="isCreateTaskModalVisible = true"
            :disabled="!hasPermission('viewer')"
          >
            <i class="fas fa-plus"></i> 新增交辦/留言
          </button>
          <button
            v-if="!lateShiftTakeOffExists"
            @click="promptDuplicateLateShift"
            class="duplicate-shift-btn desktop-only"
            title="為晚班建立獨立的收針分組"
            :disabled="isPageLocked"
          >
            <i class="fas fa-copy"></i> 新增夜班收針分組
          </button>
        </div>
        <div class="toolbar-right desktop-only-flex">
          <span class="status-indicator">{{ statusIndicator }}</span>
          <button
            id="save-changes-btn"
            :disabled="!hasUnsavedChanges || isPageLocked"
            @click="saveChangesToCloud"
          >
            儲存變更
          </button>
          <button @click="exportAssignmentsToExcel" class="btn-secondary">
            <i class="fas fa-file-excel"></i> 匯出Excel
          </button>
        </div>
      </div>

      <!-- ✨ [這是最重要的修改！] ✨ -->
      <!-- 我們用下面這個 info-row-wrapper，把「醫師」和「消防」包在一起，才能讓它們並排 -->
      <div class="info-row-wrapper desktop-only">
        <!-- (左側) 醫師資訊區塊 -->
        <div class="daily-staff-panel horizontal">
          <div class="staff-item shift-early">
            <span class="staff-label">早</span>
            <div class="staff-details">
              <div class="staff-name">
                <span class="staff-job-title">醫師</span>
                {{ dailyPhysicians.early?.name || '--' }}
              </div>
            </div>
          </div>
          <div class="staff-item shift-noon">
            <span class="staff-label">午</span>
            <div class="staff-details">
              <div class="staff-name">
                <span class="staff-job-title">醫師</span>
                {{ dailyPhysicians.noon?.name || '--' }}
              </div>
            </div>
          </div>
          <div class="staff-item shift-late">
            <span class="staff-label">晚</span>
            <div class="staff-details">
              <div class="staff-name">
                <span class="staff-job-title">醫師</span>
                {{ dailyPhysicians.late?.name || '--' }}
              </div>
            </div>
          </div>
          <div class="staff-item shift-specialist">
            <span class="staff-label">專</span>
            <div class="staff-details">
              <span class="staff-name">賴若蕎</span>
              <span class="staff-contact">(電: 665129)</span>
            </div>
          </div>
        </div>
        <!-- (右側) 消防編組區塊 -->
        <div class="duty-command-bar">
          <div class="main-commanders">
            <span class="duty-title">消防編組:</span>
            <span class="duty-role-tag role-commander">總指揮官</span>
            <span class="duty-person">廖丁瑩主任</span>
            <span class="duty-divider"></span>
            <span class="duty-role-tag role-field-commander">現場指揮官</span>
            <span class="duty-person">莊明月護理長</span>
            <span class="duty-divider"></span>
            <span class="duty-role-tag role-reporter">通報班</span>
            <span class="duty-person">謝淑琴書記</span>
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
              <span class="toggle-arrow" :class="{ 'is-rotated': isFireDutyDropdownVisible }"
                >▼</span
              >
            </button>
            <transition name="slide-fade">
              <div v-if="isFireDutyDropdownVisible" class="duty-dropdown-menu">
                <div
                  v-for="(duties, shift) in dutyAssignments"
                  :key="shift"
                  class="duty-shift-group"
                >
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
      </div>
    </div>

    <!-- 2. 可滾動的主要內容區 -->
    <div class="scrollable-main-content">
      <div v-if="isLoading" class="loading-overlay">
        <div class="loading-spinner"></div>
        <span>正在載入 {{ formatDate(currentDate) }} 的資料...</span>
      </div>

      <!-- (A) 桌面版大表格 -->
      <div class="stats-sections-wrapper desktop-only">
        <!-- 早班區塊 -->
        <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
          <div
            class="grid-container"
            :style="{ gridTemplateColumns: `90px repeat(${sortedEarlyTeams.length}, 1fr)` }"
          >
            <div class="grid-header">
              <div class="row-header section-title-cell">早班</div>
              <div
                v-for="teamName in sortedEarlyTeams"
                :key="teamName"
                class="team-header-cell"
                :class="{ 'unassigned-header': teamName.includes('未分組') }"
              >
                {{ teamName.includes('未分組') ? '未分組' : teamName.replace('早', '') + '組' }}
              </div>
            </div>
            <div class="grid-body">
              <div class="grid-row">
                <div class="row-header">姓名</div>
                <div
                  v-for="teamName in sortedEarlyTeams"
                  :key="teamName"
                  class="grid-cell name-cell"
                >
                  <select
                    v-if="!teamName.includes('未分組')"
                    :value="effectiveStatsData.early[teamName]?.nurseName"
                    @change="updateNurseName(teamName, $event)"
                    class="name-select"
                    :disabled="isPageLocked"
                  >
                    <option value="">-- 未指派 --</option>
                    <option v-for="name in nurseNameList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <div v-else class="unassigned-placeholder"></div>
                </div>
              </div>
              <div class="grid-row">
                <div class="row-header">早班</div>
                <div
                  v-for="teamName in sortedEarlyTeams"
                  :key="teamName"
                  class="grid-cell patient-list-cell"
                  :class="{ 'unassigned-cell': teamName.includes('未分組') }"
                  @drop="!isPageLocked && onDrop($event, teamName, 'earlyShift')"
                  @dragover.prevent="!isPageLocked && onDragOver($event)"
                  @dragleave="onDragLeave"
                >
                  <div class="patient-wrapper">
                    <div
                      v-for="patient in effectiveStatsData.early[teamName]?.earlyShift.patients"
                      :key="patient.shiftId"
                      :class="patient.classes"
                      :draggable="!isPageLocked"
                      @dragstart="!isPageLocked && onDragStart($event, patient, 'earlyShift')"
                    >
                      <div
                        class="patient-main-info"
                        @click="!isPageLocked && openBedChangeDialog(patient)"
                        title="點擊換床"
                      >
                        <div class="patient-line-one">
                          {{ patient.dialysisBed }} - {{ patient.name }}
                        </div>
                        <div class="patient-line-two">
                          <span v-if="patient.wardNumber" class="ward-number-display">{{
                            patient.wardNumber
                          }}</span>
                          <span
                            v-if="patient.mode && patient.mode !== 'HD'"
                            class="stats-special-mode"
                            >({{ patient.mode }})</span
                          >
                          <span v-if="patient.finalTags" class="note-display">{{
                            patient.finalTags
                          }}</span>
                        </div>
                      </div>
                      <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                    </div>
                  </div>
                  <div class="cell-actions-container">
                    <div
                      class="prep-list-trigger"
                      v-if="effectiveStatsData.early[teamName]?.earlyShift.patients.length > 0"
                      @click="
                        showPrepPopover($event, effectiveStatsData.early[teamName], 'earlyShift')
                      "
                      title="顯示備物清單"
                    >
                      📋
                    </div>
                    <div
                      class="injection-list-trigger"
                      v-if="effectiveStatsData.early[teamName]?.earlyShift.patients.length > 0"
                      @click="showInjectionList(effectiveStatsData.early[teamName], 'earlyShift')"
                      title="顯示本日應打針劑"
                    >
                      💉
                    </div>
                  </div>
                </div>
              </div>
              <div class="grid-row">
                <div class="row-header">午班(上針)</div>
                <div
                  v-for="teamName in sortedEarlyTeams"
                  :key="teamName"
                  class="grid-cell patient-list-cell"
                  :class="{ 'unassigned-cell': teamName.includes('未分組') }"
                  @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOn')"
                  @dragover.prevent="!isPageLocked && onDragOver($event)"
                  @dragleave="onDragLeave"
                >
                  <div class="patient-wrapper">
                    <div
                      v-for="patient in effectiveStatsData.early[teamName]?.noonShiftOn.patients"
                      :key="patient.shiftId"
                      :class="patient.classes"
                      :draggable="!isPageLocked"
                      @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOn')"
                    >
                      <div
                        class="patient-main-info"
                        @click="!isPageLocked && openBedChangeDialog(patient)"
                        title="點擊換床"
                      >
                        <div class="patient-line-one">
                          {{ patient.dialysisBed }} - {{ patient.name }}
                        </div>
                        <div class="patient-line-two">
                          <span v-if="patient.wardNumber" class="ward-number-display">{{
                            patient.wardNumber
                          }}</span>
                          <span
                            v-if="patient.mode && patient.mode !== 'HD'"
                            class="stats-special-mode"
                            >({{ patient.mode }})</span
                          >
                          <span v-if="patient.finalTags" class="note-display">{{
                            patient.finalTags
                          }}</span>
                        </div>
                      </div>
                      <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                    </div>
                  </div>
                  <div class="cell-actions-container">
                    <div
                      class="prep-list-trigger"
                      v-if="effectiveStatsData.early[teamName]?.noonShiftOn.patients.length > 0"
                      @click="
                        showPrepPopover($event, effectiveStatsData.early[teamName], 'noonShiftOn')
                      "
                      title="顯示備物清單"
                    >
                      📋
                    </div>
                    <div
                      class="injection-list-trigger"
                      v-if="effectiveStatsData.early[teamName]?.noonShiftOn.patients.length > 0"
                      @click="showInjectionList(effectiveStatsData.early[teamName], 'noonShiftOn')"
                      title="顯示本日應打針劑"
                    >
                      💉
                    </div>
                  </div>
                </div>
              </div>
              <div class="grid-row">
                <div class="row-header collapsible-header" @click="toggleNoonTakeoff('early')">
                  <span>午班(收針)</span>
                  <span
                    class="collapse-icon"
                    :class="{ 'is-expanded': noonTakeoffVisibility.early }"
                    >►</span
                  >
                </div>
              </div>
              <transition name="grid-row-fade">
                <div class="grid-row" v-if="noonTakeoffVisibility.early">
                  <div class="row-header">午班(收針)</div>
                  <div
                    v-for="teamName in sortedEarlyTeams"
                    :key="teamName"
                    class="grid-cell patient-list-cell"
                    :class="{ 'unassigned-cell': teamName.includes('未分組') }"
                    @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOff')"
                    @dragover.prevent="!isPageLocked && onDragOver($event)"
                    @dragleave="onDragLeave"
                  >
                    <div class="patient-wrapper">
                      <div
                        v-for="patient in effectiveStatsData.early[teamName]?.noonShiftOff.patients"
                        :key="patient.shiftId"
                        :class="patient.classes"
                        :draggable="!isPageLocked"
                        @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOff')"
                      >
                        <div
                          class="patient-main-info"
                          @click="!isPageLocked && openBedChangeDialog(patient)"
                          title="點擊換床"
                        >
                          <div class="patient-line-one">
                            {{ patient.dialysisBed }} - {{ patient.name }}
                          </div>
                          <div class="patient-line-two">
                            <span v-if="patient.wardNumber" class="ward-number-display">{{
                              patient.wardNumber
                            }}</span>
                            <span
                              v-if="patient.mode && patient.mode !== 'HD'"
                              class="stats-special-mode"
                              >({{ patient.mode }})</span
                            >
                            <span v-if="patient.finalTags" class="note-display">{{
                              patient.finalTags
                            }}</span>
                          </div>
                        </div>
                        <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                      </div>
                    </div>
                    <div class="cell-actions-container">
                      <div
                        class="prep-list-trigger"
                        v-if="effectiveStatsData.early[teamName]?.noonShiftOff.patients.length > 0"
                        @click="
                          showPrepPopover(
                            $event,
                            effectiveStatsData.early[teamName],
                            'noonShiftOff',
                          )
                        "
                        title="顯示備物清單"
                      >
                        📋
                      </div>
                      <div
                        class="injection-list-trigger"
                        v-if="effectiveStatsData.early[teamName]?.noonShiftOff.patients.length > 0"
                        @click="
                          showInjectionList(effectiveStatsData.early[teamName], 'noonShiftOff')
                        "
                        title="顯示本日應打針劑"
                      >
                        💉
                      </div>
                    </div>
                  </div>
                </div>
              </transition>
            </div>
            <div class="grid-footer">
              <div class="row-header">照護人數</div>
              <div v-for="teamName in sortedEarlyTeams" :key="teamName" class="total-count-summary">
                門{{ effectiveStatsData.early[teamName]?.totalOpdCount || 0 }} 住{{
                  effectiveStatsData.early[teamName]?.totalIpdCount || 0
                }}
                急{{ effectiveStatsData.early[teamName]?.totalErCount || 0 }}
              </div>
            </div>
          </div>
        </div>

        <!-- 晚班區塊 -->
        <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
          <div
            class="grid-container"
            :style="{ gridTemplateColumns: `90px repeat(${sortedLateTeams.length}, 1fr)` }"
          >
            <div class="grid-header">
              <div class="row-header section-title-cell">晚班</div>
              <div
                v-for="teamName in sortedLateTeams"
                :key="teamName"
                class="team-header-cell"
                :class="{ 'unassigned-header': teamName.includes('未分組') }"
              >
                {{ teamName.includes('未分組') ? '未分組' : teamName.replace('晚', '') + '組' }}
              </div>
            </div>
            <div class="grid-body">
              <div class="grid-row">
                <div class="row-header">姓名</div>
                <div
                  v-for="teamName in sortedLateTeams"
                  :key="teamName"
                  class="grid-cell name-cell"
                >
                  <select
                    v-if="!teamName.includes('未分組')"
                    :value="effectiveStatsData.late[teamName]?.nurseName"
                    @change="updateNurseName(teamName, $event)"
                    class="name-select"
                    :disabled="isPageLocked"
                  >
                    <option value="">-- 未指派 --</option>
                    <option v-for="name in nurseNameList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <div v-else class="unassigned-placeholder"></div>
                </div>
              </div>
              <div class="grid-row">
                <div class="row-header collapsible-header" @click="toggleNoonTakeoff('late')">
                  <span>午班(收針)</span>
                  <span class="collapse-icon" :class="{ 'is-expanded': noonTakeoffVisibility.late }"
                    >►</span
                  >
                </div>
              </div>
              <transition name="grid-row-fade">
                <div class="grid-row" v-if="noonTakeoffVisibility.late">
                  <div class="row-header">午班(收針)</div>
                  <div
                    v-for="teamName in sortedLateTeams"
                    :key="teamName"
                    class="grid-cell patient-list-cell"
                    :class="{ 'unassigned-cell': teamName.includes('未分組') }"
                    @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOff')"
                    @dragover.prevent="!isPageLocked && onDragOver($event)"
                    @dragleave="onDragLeave"
                  >
                    <div class="patient-wrapper">
                      <div
                        v-for="patient in effectiveStatsData.late[teamName]?.noonShiftOff.patients"
                        :key="patient.shiftId"
                        :class="patient.classes"
                        :draggable="!isPageLocked"
                        @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOff')"
                      >
                        <div
                          class="patient-main-info"
                          @click="!isPageLocked && openBedChangeDialog(patient)"
                          title="點擊換床"
                        >
                          <div class="patient-line-one">
                            {{ patient.dialysisBed }} - {{ patient.name }}
                          </div>
                          <div class="patient-line-two">
                            <span v-if="patient.wardNumber" class="ward-number-display">{{
                              patient.wardNumber
                            }}</span>
                            <span
                              v-if="patient.mode && patient.mode !== 'HD'"
                              class="stats-special-mode"
                              >({{ patient.mode }})</span
                            >
                            <span v-if="patient.finalTags" class="note-display">{{
                              patient.finalTags
                            }}</span>
                          </div>
                        </div>
                        <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                      </div>
                    </div>
                    <div class="cell-actions-container">
                      <div
                        class="prep-list-trigger"
                        v-if="effectiveStatsData.late[teamName]?.noonShiftOff.patients.length > 0"
                        @click="
                          showPrepPopover($event, effectiveStatsData.late[teamName], 'noonShiftOff')
                        "
                        title="顯示備物清單"
                      >
                        📋
                      </div>
                      <div
                        class="injection-list-trigger"
                        v-if="effectiveStatsData.late[teamName]?.noonShiftOff.patients.length > 0"
                        @click="
                          showInjectionList(effectiveStatsData.late[teamName], 'noonShiftOff')
                        "
                        title="顯示本日應打針劑"
                      >
                        💉
                      </div>
                    </div>
                  </div>
                </div>
              </transition>
              <div class="grid-row">
                <div class="row-header">晚班</div>
                <div
                  v-for="teamName in sortedLateTeams"
                  :key="teamName"
                  class="grid-cell patient-list-cell"
                  :class="{ 'unassigned-cell': teamName.includes('未分組') }"
                  @drop="!isPageLocked && onDrop($event, teamName, 'lateShift')"
                  @dragover.prevent="!isPageLocked && onDragOver($event)"
                  @dragleave="onDragLeave"
                >
                  <div class="patient-wrapper">
                    <div
                      v-for="patient in effectiveStatsData.late[teamName]?.lateShift.patients"
                      :key="patient.shiftId"
                      :class="patient.classes"
                      :draggable="!isPageLocked"
                      @dragstart="!isPageLocked && onDragStart($event, patient, 'lateShift')"
                    >
                      <div
                        class="patient-main-info"
                        @click="!isPageLocked && openBedChangeDialog(patient)"
                        title="點擊換床"
                      >
                        <div class="patient-line-one">
                          {{ patient.dialysisBed }} - {{ patient.name }}
                        </div>
                        <div class="patient-line-two">
                          <span v-if="patient.wardNumber" class="ward-number-display">{{
                            patient.wardNumber
                          }}</span>
                          <span
                            v-if="patient.mode && patient.mode !== 'HD'"
                            class="stats-special-mode"
                            >({{ patient.mode }})</span
                          >
                          <span v-if="patient.finalTags" class="note-display">{{
                            patient.finalTags
                          }}</span>
                        </div>
                      </div>
                      <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                    </div>
                  </div>
                  <div class="cell-actions-container">
                    <div
                      class="prep-list-trigger"
                      v-if="effectiveStatsData.late[teamName]?.lateShift.patients.length > 0"
                      @click="
                        showPrepPopover($event, effectiveStatsData.late[teamName], 'lateShift')
                      "
                      title="顯示備物清單"
                    >
                      📋
                    </div>
                    <div
                      class="injection-list-trigger"
                      v-if="effectiveStatsData.late[teamName]?.lateShift.patients.length > 0"
                      @click="showInjectionList(effectiveStatsData.late[teamName], 'lateShift')"
                      title="顯示本日應打針劑"
                    >
                      💉
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="grid-footer">
              <div class="row-header">照護人數</div>
              <div v-for="teamName in sortedLateTeams" :key="teamName" class="total-count-summary">
                門{{ effectiveStatsData.late[teamName]?.totalOpdCount || 0 }} 住{{
                  effectiveStatsData.late[teamName]?.totalIpdCount || 0
                }}
                急{{ effectiveStatsData.late[teamName]?.totalErCount || 0 }}
              </div>
            </div>
          </div>
        </div>

        <!-- ✨ [核心修改 1] 為夜班收針區塊補上完整的顯示內容 -->
        <div
          v-if="lateShiftTakeOffExists"
          class="stats-section late-takeoff-section"
          :class="{ 'is-locked': isPageLocked }"
        >
          <div
            class="grid-container"
            :style="{ gridTemplateColumns: `90px repeat(${sortedLateTakeOffTeams.length}, 1fr)` }"
          >
            <div class="grid-header">
              <div class="row-header section-title-cell">夜班收針</div>
              <div
                v-for="teamName in sortedLateTakeOffTeams"
                :key="teamName"
                class="team-header-cell"
                :class="{ 'unassigned-header': teamName.includes('未分組') }"
              >
                {{
                  teamName.includes('未分組') ? '未分組' : teamName.replace('夜間收針', '') + '組'
                }}
              </div>
            </div>
            <div class="grid-body">
              <div class="grid-row">
                <div class="row-header">姓名</div>
                <div
                  v-for="teamName in sortedLateTakeOffTeams"
                  :key="teamName"
                  class="grid-cell name-cell"
                >
                  <select
                    v-if="!teamName.includes('未分組')"
                    :value="effectiveStatsData.lateTakeOff[teamName]?.nurseName"
                    @change="updateNurseName(teamName, $event)"
                    class="name-select"
                    :disabled="isPageLocked"
                  >
                    <option value="">-- 未指派 --</option>
                    <option v-for="name in nurseNameList" :key="name" :value="name">
                      {{ name }}
                    </option>
                  </select>
                  <div v-else class="unassigned-placeholder"></div>
                </div>
              </div>
              <div class="grid-row">
                <div class="row-header">夜班收針</div>
                <div
                  v-for="teamName in sortedLateTakeOffTeams"
                  :key="teamName"
                  class="grid-cell patient-list-cell"
                  :class="{ 'unassigned-cell': teamName.includes('未分組') }"
                  @drop="!isPageLocked && onDrop($event, teamName, 'lateShiftTakeOff')"
                  @dragover.prevent="!isPageLocked && onDragOver($event)"
                  @dragleave="onDragLeave"
                >
                  <div class="patient-wrapper">
                    <div
                      v-for="patient in effectiveStatsData.lateTakeOff[teamName]?.lateShiftTakeOff
                        .patients"
                      :key="patient.shiftId"
                      :class="patient.classes"
                      :draggable="!isPageLocked"
                      @dragstart="!isPageLocked && onDragStart($event, patient, 'lateShiftTakeOff')"
                    >
                      <div
                        class="patient-main-info"
                        @click="!isPageLocked && openBedChangeDialog(patient)"
                        title="點擊換床"
                      >
                        <div class="patient-line-one">
                          {{ patient.dialysisBed }} - {{ patient.name }}
                        </div>
                        <div class="patient-line-two">
                          <span v-if="patient.wardNumber" class="ward-number-display">{{
                            patient.wardNumber
                          }}</span>
                          <span
                            v-if="patient.mode && patient.mode !== 'HD'"
                            class="stats-special-mode"
                            >({{ patient.mode }})</span
                          >
                          <span v-if="patient.finalTags" class="note-display">{{
                            patient.finalTags
                          }}</span>
                        </div>
                      </div>
                      <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                    </div>
                  </div>
                  <div class="cell-actions-container">
                    <div
                      class="prep-list-trigger"
                      v-if="
                        effectiveStatsData.lateTakeOff[teamName]?.lateShiftTakeOff.patients.length >
                        0
                      "
                      @click="
                        showPrepPopover(
                          $event,
                          effectiveStatsData.lateTakeOff[teamName],
                          'lateShiftTakeOff',
                        )
                      "
                      title="顯示備物清單"
                    >
                      📋
                    </div>
                    <div
                      class="injection-list-trigger"
                      v-if="
                        effectiveStatsData.lateTakeOff[teamName]?.lateShiftTakeOff.patients.length >
                        0
                      "
                      @click="
                        showInjectionList(
                          effectiveStatsData.lateTakeOff[teamName],
                          'lateShiftTakeOff',
                        )
                      "
                      title="顯示本日應打針劑"
                    >
                      💉
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="grid-footer">
              <div class="row-header">照護人數</div>
              <div
                v-for="teamName in sortedLateTakeOffTeams"
                :key="teamName"
                class="total-count-summary"
              >
                門{{ effectiveStatsData.lateTakeOff[teamName]?.totalOpdCount || 0 }} 住{{
                  effectiveStatsData.lateTakeOff[teamName]?.totalIpdCount || 0
                }}
                急{{ effectiveStatsData.lateTakeOff[teamName]?.totalErCount || 0 }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- (B) 行動版卡片列表 -->
      <div class="mobile-only" :class="{ 'is-locked': isPageLocked }">
        <!-- 早班 -->
        <div class="mobile-shift-section">
          <h2 class="mobile-shift-title">早班</h2>
          <div
            v-for="teamName in sortedEarlyTeams"
            :key="`mobile-early-${teamName}`"
            class="mobile-team-card"
          >
            <div class="mobile-team-header">
              <h3>
                {{ teamName.includes('未分組') ? '未分組' : teamName.replace('早', '') + '組' }}
              </h3>
              <select
                v-if="!teamName.includes('未分組')"
                :value="effectiveStatsData.early[teamName]?.nurseName"
                class="name-select"
                disabled
              >
                <option value="">-- 未指派 --</option>
                <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
            <div class="mobile-patient-lists">
              <div
                class="mobile-patient-list"
                v-if="effectiveStatsData.early[teamName]?.earlyShift.patients.length > 0"
              >
                <h4>早班</h4>
                <div
                  v-for="patient in effectiveStatsData.early[teamName]?.earlyShift.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                >
                  <div class="patient-main-info">
                    <div class="patient-line-one">
                      {{ patient.dialysisBed }} - {{ patient.name }}
                    </div>
                    <div class="patient-line-two">
                      <span v-if="patient.wardNumber" class="ward-number-display">{{
                        patient.wardNumber
                      }}</span>
                      <span v-if="patient.mode && patient.mode !== 'HD'" class="stats-special-mode"
                        >({{ patient.mode }})</span
                      >
                      <span v-if="patient.finalTags" class="note-display">{{
                        patient.finalTags
                      }}</span>
                    </div>
                  </div>
                  <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                </div>
              </div>
              <div
                class="mobile-patient-list"
                v-if="effectiveStatsData.early[teamName]?.noonShiftOn.patients.length > 0"
              >
                <h4>午班(上針)</h4>
                <div
                  v-for="patient in effectiveStatsData.early[teamName]?.noonShiftOn.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                >
                  <div class="patient-main-info">
                    <div class="patient-line-one">
                      {{ patient.dialysisBed }} - {{ patient.name }}
                    </div>
                    <div class="patient-line-two">
                      <span v-if="patient.wardNumber" class="ward-number-display">{{
                        patient.wardNumber
                      }}</span>
                      <span v-if="patient.mode && patient.mode !== 'HD'" class="stats-special-mode"
                        >({{ patient.mode }})</span
                      >
                      <span v-if="patient.finalTags" class="note-display">{{
                        patient.finalTags
                      }}</span>
                    </div>
                  </div>
                  <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                </div>
              </div>
              <div
                class="mobile-patient-list collapsible"
                v-if="effectiveStatsData.early[teamName]?.noonShiftOff.patients.length > 0"
              >
                <h4 @click="toggleNoonTakeoff('early')">
                  <span>午班(收針)</span>
                  <span
                    class="collapse-icon"
                    :class="{ 'is-expanded': noonTakeoffVisibility.early }"
                    >►</span
                  >
                </h4>
                <div v-if="noonTakeoffVisibility.early" class="collapsible-content">
                  <div
                    v-for="patient in effectiveStatsData.early[teamName]?.noonShiftOff.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                  >
                    <div class="patient-main-info">
                      <div class="patient-line-one">
                        {{ patient.dialysisBed }} - {{ patient.name }}
                      </div>
                      <div class="patient-line-two">
                        <span v-if="patient.wardNumber" class="ward-number-display">{{
                          patient.wardNumber
                        }}</span>
                        <span
                          v-if="patient.mode && patient.mode !== 'HD'"
                          class="stats-special-mode"
                          >({{ patient.mode }})</span
                        >
                        <span v-if="patient.finalTags" class="note-display">{{
                          patient.finalTags
                        }}</span>
                      </div>
                    </div>
                    <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                  </div>
                </div>
              </div>
            </div>
            <div class="mobile-team-footer">
              門{{ effectiveStatsData.early[teamName]?.totalOpdCount || 0 }} 住{{
                effectiveStatsData.early[teamName]?.totalIpdCount || 0
              }}
              急{{ effectiveStatsData.early[teamName]?.totalErCount || 0 }}
            </div>
          </div>
        </div>

        <!-- 晚班 -->
        <div class="mobile-shift-section">
          <h2 class="mobile-shift-title">晚班</h2>
          <div
            v-for="teamName in sortedLateTeams"
            :key="`mobile-late-${teamName}`"
            class="mobile-team-card"
          >
            <div class="mobile-team-header">
              <h3>
                {{ teamName.includes('未分組') ? '未分組' : teamName.replace('晚', '') + '組' }}
              </h3>
              <select
                v-if="!teamName.includes('未分組')"
                :value="effectiveStatsData.late[teamName]?.nurseName"
                class="name-select"
                disabled
              >
                <option value="">-- 未指派 --</option>
                <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
            <div class="mobile-patient-lists">
              <div
                class="mobile-patient-list collapsible"
                v-if="effectiveStatsData.late[teamName]?.noonShiftOff.patients.length > 0"
              >
                <h4 @click="toggleNoonTakeoff('late')">
                  <span>午班(收針)</span>
                  <span class="collapse-icon" :class="{ 'is-expanded': noonTakeoffVisibility.late }"
                    >►</span
                  >
                </h4>
                <div v-if="noonTakeoffVisibility.late" class="collapsible-content">
                  <div
                    v-for="patient in effectiveStatsData.late[teamName]?.noonShiftOff.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                  >
                    <div class="patient-main-info">
                      <div class="patient-line-one">
                        {{ patient.dialysisBed }} - {{ patient.name }}
                      </div>
                      <div class="patient-line-two">
                        <span v-if="patient.wardNumber" class="ward-number-display">{{
                          patient.wardNumber
                        }}</span>
                        <span
                          v-if="patient.mode && patient.mode !== 'HD'"
                          class="stats-special-mode"
                          >({{ patient.mode }})</span
                        >
                        <span v-if="patient.finalTags" class="note-display">{{
                          patient.finalTags
                        }}</span>
                      </div>
                    </div>
                    <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                  </div>
                </div>
              </div>
              <div
                class="mobile-patient-list"
                v-if="effectiveStatsData.late[teamName]?.lateShift.patients.length > 0"
              >
                <h4>晚班</h4>
                <div
                  v-for="patient in effectiveStatsData.late[teamName]?.lateShift.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                >
                  <div class="patient-main-info">
                    <div class="patient-line-one">
                      {{ patient.dialysisBed }} - {{ patient.name }}
                    </div>
                    <div class="patient-line-two">
                      <span v-if="patient.wardNumber" class="ward-number-display">{{
                        patient.wardNumber
                      }}</span>
                      <span v-if="patient.mode && patient.mode !== 'HD'" class="stats-special-mode"
                        >({{ patient.mode }})</span
                      >
                      <span v-if="patient.finalTags" class="note-display">{{
                        patient.finalTags
                      }}</span>
                    </div>
                  </div>
                  <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                </div>
              </div>
            </div>
            <div class="mobile-team-footer">
              門{{ effectiveStatsData.late[teamName]?.totalOpdCount || 0 }} 住{{
                effectiveStatsData.late[teamName]?.totalIpdCount || 0
              }}
              急{{ effectiveStatsData.late[teamName]?.totalErCount || 0 }}
            </div>
          </div>
        </div>

        <!-- 夜班收針 -->
        <div v-if="lateShiftTakeOffExists" class="mobile-shift-section">
          <h2 class="mobile-shift-title">夜班收針</h2>
          <div
            v-for="teamName in sortedLateTakeOffTeams"
            :key="`mobile-takeoff-${teamName}`"
            class="mobile-team-card"
          >
            <div class="mobile-team-header">
              <h3>
                {{
                  teamName.includes('未分組') ? '未分組' : teamName.replace('夜間收針', '') + '組'
                }}
              </h3>
              <select
                v-if="!teamName.includes('未分組')"
                :value="effectiveStatsData.lateTakeOff[teamName]?.nurseName"
                class="name-select"
                disabled
              >
                <option value="">-- 未指派 --</option>
                <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
            <div class="mobile-patient-lists">
              <div
                class="mobile-patient-list"
                v-if="
                  effectiveStatsData.lateTakeOff[teamName]?.lateShiftTakeOff.patients.length > 0
                "
              >
                <h4>夜班收針</h4>
                <div
                  v-for="patient in effectiveStatsData.lateTakeOff[teamName]?.lateShiftTakeOff
                    .patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                >
                  <div class="patient-main-info">
                    <div class="patient-line-one">
                      {{ patient.dialysisBed }} - {{ patient.name }}
                    </div>
                    <div class="patient-line-two">
                      <span v-if="patient.wardNumber" class="ward-number-display">{{
                        patient.wardNumber
                      }}</span>
                      <span v-if="patient.mode && patient.mode !== 'HD'" class="stats-special-mode"
                        >({{ patient.mode }})</span
                      >
                      <span v-if="patient.finalTags" class="note-display">{{
                        patient.finalTags
                      }}</span>
                    </div>
                  </div>
                  <PatientMessagesIcon :patient-id="patient.id" context="dialog" />
                </div>
              </div>
            </div>
            <div class="mobile-team-footer">
              門{{ effectiveStatsData.lateTakeOff[teamName]?.totalOpdCount || 0 }} 住{{
                effectiveStatsData.lateTakeOff[teamName]?.totalIpdCount || 0
              }}
              急{{ effectiveStatsData.lateTakeOff[teamName]?.totalErCount || 0 }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <TaskCreateDialog
      :is-visible="isCreateTaskModalVisible"
      :all-patients="patientStore.allPatients"
      :preselected-patient="null"
      @close="isCreateTaskModalVisible = false"
      @submit="handleTaskCreated"
    />
    <BedChangeDialog
      :is-visible="isBedChangeDialogVisible"
      :patient-info="editingPatientInfo"
      :current-schedule="currentRecord.schedule"
      :target-shift-filter="bedChangeTargetShift"
      @confirm="handleBedChange"
      @cancel="handleDialogCancel"
    />
    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-id="selectedPatientForDialog?.id"
      :patient-name="selectedPatientForDialog?.name"
      @close=";(isMemoDialogVisible = false), (selectedPatientForDialog = null)"
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
    <!-- ✨ 核心修改：綁定 @open-order-modal 事件 -->
    <PreparationPopover
      :is-visible="isPrepPopoverVisible"
      :patients="prepPopoverData.patients"
      :target-element="prepPopoverData.targetElement"
      @close="onPrepPopoverClose"
      @open-order-modal="openOrderModalFromPopover"
    />
    <DailyInjectionListDialog
      :is-visible="isInjectionDialogVisible"
      :is-loading="isInjectionLoading"
      :injections="dailyInjections"
      :target-date="formatDate(currentDate)"
      @close="isInjectionDialogVisible = false"
      :show-filter="false"
    />
    <!-- ✨ 核心修改：確保 DialysisOrderModal 存在並綁定正確 -->
    <DialysisOrderModal
      :is-visible="isOrderModalVisible"
      :patient-data="editingPatientForOrder"
      @close="isOrderModalVisible = false"
      @save="handleSaveOrder"
    />
    <button
      class="fab-mobile mobile-only"
      @click="isCreateTaskModalVisible = true"
      :disabled="!hasPermission('viewer')"
    >
      <i class="fas fa-plus"></i>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive, watch, onUnmounted, provide } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy, limit } from 'firebase/firestore'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'
import { generateAutoNote, getUnifiedCellStyle } from '@/utils/scheduleUtils.js'
import { useAuth } from '@/composables/useAuth.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import { fetchTeamsByDate, saveTeams, updateTeams } from '@/services/nurseAssignmentsService.js'
// ✨ 核心修改：從 optimizedApiService 引入儲存醫囑的函式
import { createDialysisOrderAndUpdatePatient } from '@/services/optimizedApiService.js'
import BedChangeDialog from '@/components/BedChangeDialog.vue'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import PatientMessagesIcon from '@/components/PatientMessagesIcon.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PreparationPopover from '@/components/PreparationPopover.vue'
import TaskCreateDialog from '@/components/TaskCreateDialog.vue'
import { usePatientStore } from '@/stores/patientStore.js'
import { useTaskStore } from '@/stores/taskStore.js'
import { storeToRefs } from 'pinia'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/composables/useFirebase.js'
import DailyInjectionListDialog from '@/components/DailyInjectionListDialog.vue'
import DialysisOrderModal from '@/components/DialysisOrderModal.vue'
import * as XLSX from 'xlsx'

const patientStore = usePatientStore()
const taskStore = useTaskStore()
const { patientMap } = storeToRefs(patientStore)
const { currentUser, hasPermission, canEditSchedules } = useAuth()
const { createGlobalNotification } = useGlobalNotifier()

const schedulesApi = ApiManager('schedules')
const ordersHistoryApi = ApiManager('dialysis_orders_history')
const usersApi = ApiManager('users')

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
  '蔡靜怡',
]
const earlyBaseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍', '未分組']
const lateBaseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍', '未分組']
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

async function getEffectiveOrdersForDate(patientId, targetDate) {
  if (!patientId || !targetDate) return {}
  const dateStr = targetDate.toISOString().slice(0, 10)
  try {
    const results = await ordersHistoryApi.fetchAll([
      where('patientId', '==', patientId),
      where('orders.effectiveDate', '<=', dateStr),
      orderBy('orders.effectiveDate', 'desc'),
      orderBy('updatedAt', 'desc'),
      limit(1),
    ])
    return results.length > 0 ? results[0].orders : {}
  } catch (error) {
    console.error(`獲取病人 ${patientId} 的醫囑失敗:`, error)
    return {}
  }
}

const isFireDutyDropdownVisible = ref(false)
const currentDate = ref(new Date())
const statusIndicator = ref('')
const isLoading = ref(false)
const currentRecord = reactive({ id: null, date: '', schedule: {} })
const currentTeamsRecord = ref({ id: null, date: '', teams: {}, names: {} })
const hasUnsavedScheduleChanges = ref(false)
const hasUnsavedTeamChanges = ref(false)
const isBedChangeDialogVisible = ref(false)
const editingPatientInfo = ref(null)
const isMemoDialogVisible = ref(false)
const selectedPatientForDialog = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogMessage = ref('')
const onConfirmAction = ref(null)
const pendingChangeInfo = ref(null)
const bedChangeTargetShift = ref(null)
const isPrepPopoverVisible = ref(false)
const prepPopoverData = reactive({ patients: [], targetElement: null })
const isCreateTaskModalVisible = ref(false)
const dailyPhysicians = ref({ early: null, noon: null, late: null })
const isInjectionDialogVisible = ref(false)
const dailyInjections = ref([])
const isInjectionLoading = ref(false)
const noonTakeoffVisibility = ref({ early: false, late: false })

// ✨ 核心修改：新增醫囑 Modal 相關的 ref
const isOrderModalVisible = ref(false)
const editingPatientForOrder = ref(null)

provide('viewingDate', currentDate)

const hasUnsavedChanges = computed(
  () => hasUnsavedScheduleChanges.value || hasUnsavedTeamChanges.value,
)
const isPageLocked = computed(() => {
  if (!canEditSchedules.value) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentDay = new Date(currentDate.value)
  currentDay.setHours(0, 0, 0, 0)
  return currentDay < today
})
const weekdayDisplay = computed(
  () => ['日', '一', '二', '三', '四', '五', '六'][new Date(currentDate.value).getDay()],
)
const lateShiftTakeOffExists = computed(() =>
  Object.values(currentTeamsRecord.value.teams || {}).some(
    (team) => team && typeof team.nurseTeamTakeOff !== 'undefined',
  ),
)
const sortedEarlyTeams = computed(() => {
  if (!effectiveStatsData.value || !effectiveStatsData.value.early) return []
  const teams = Object.keys(effectiveStatsData.value.early)
  return teams.sort((a, b) => {
    if (a.includes('未分組')) return 1
    if (b.includes('未分組')) return -1
    if (a.includes('外圍')) return 1
    if (b.includes('外圍')) return -1
    return a.localeCompare(b)
  })
})
const sortedLateTeams = computed(() => {
  if (!effectiveStatsData.value || !effectiveStatsData.value.late) return []
  const teams = Object.keys(effectiveStatsData.value.late)
  return teams.sort((a, b) => {
    if (a.includes('未分組')) return 1
    if (b.includes('未分組')) return -1
    if (a.includes('外圍')) return 1
    if (b.includes('外圍')) return -1
    return a.localeCompare(b)
  })
})
const sortedLateTakeOffTeams = computed(() => {
  if (!effectiveStatsData.value || !effectiveStatsData.value.lateTakeOff) return []
  const teams = Object.keys(effectiveStatsData.value.lateTakeOff)
  return teams.sort((a, b) => {
    if (a.includes('未分組')) return 1
    if (b.includes('未分組')) return -1
    if (a.includes('外圍')) return 1
    if (b.includes('外圍')) return -1
    return a.localeCompare(b)
  })
})
const effectiveStatsData = computed(() => {
  const createTeamStats = (teams, shiftType) => {
    const stats = {}
    teams.forEach((team) => {
      stats[team] = {
        nurseName: currentTeamsRecord.value.names?.[team] || '',
        totalOpdCount: 0,
        totalIpdCount: 0,
        totalErCount: 0,
      }
      if (shiftType === 'early') {
        stats[team].earlyShift = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
        stats[team].noonShiftOn = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
        stats[team].noonShiftOff = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
      } else if (shiftType === 'late') {
        stats[team].noonShiftOff = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
        stats[team].lateShift = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
      } else if (shiftType === 'lateTakeOff') {
        stats[team].lateShiftTakeOff = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
      }
    })
    return stats
  }
  const lateTakeOffTeams = lateBaseTeams.map((t) => `夜間收針${t}`)
  const earlyShiftStats = createTeamStats(earlyTeams, 'early')
  const lateShiftStats = createTeamStats(lateTeams, 'late')
  const lateTakeOffStats = createTeamStats(lateTakeOffTeams, 'lateTakeOff')
  if (!currentRecord.schedule || patientMap.value.size === 0) {
    return { early: earlyShiftStats, late: lateShiftStats, lateTakeOff: lateTakeOffStats }
  }
  const messagesMap = taskStore.getPatientMessageTypesMapForDate(currentDate.value)
  for (const shiftId in currentRecord.schedule) {
    const shiftDetails = currentRecord.schedule[shiftId]
    if (!shiftDetails || !shiftDetails.patientId) continue
    const patient = patientMap.value.get(shiftDetails.patientId)
    if (!patient) continue
    const messageTypesForPatient = messagesMap.get(patient.id) || []
    const cellStyles = getUnifiedCellStyle(shiftDetails, patient, null, messageTypesForPatient)
    const {
      patientId,
      autoNote,
      manualNote,
      nurseTeam,
      nurseTeamIn,
      nurseTeamOut,
      nurseTeamTakeOff,
    } = shiftDetails || {}
    const detail = {
      id: patientId,
      shiftId,
      name: patient.name,
      medicalRecordNumber: patient.medicalRecordNumber,
      status: patient.status,
      mode: patient.mode,
      wardNumber: patient.wardNumber || '',
      dialysisBed: shiftId.startsWith('peripheral') ? '外圍' : shiftId.split('-')[1] || '',
      finalTags: [...new Set([...(autoNote || '').split(' '), ...(manualNote || '').split(' ')])]
        .filter((tag) => tag && !['住', '急'].includes(tag))
        .join(' '),
      classes:
        'patient-item ' +
        Object.entries(cellStyles)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(' '),
      dialysisOrders: patient.dialysisOrders || {},
    }
    const assignAndCount = (group, pDetail) => {
      if (!group) return
      group.patients.push(pDetail)
      if (pDetail.status === 'ipd') group.ipdCount++
      else if (pDetail.status === 'er') group.erCount++
      else group.opdCount++
    }
    const shiftCode = shiftId.split('-')[2]
    if (shiftCode === SHIFT_CODES.EARLY) {
      const targetTeam = nurseTeam || '早未分組'
      if (earlyShiftStats[targetTeam]) {
        assignAndCount(earlyShiftStats[targetTeam].earlyShift, detail)
      }
    } else if (shiftCode === SHIFT_CODES.LATE) {
      const targetTeam = nurseTeam || '晚未分組'
      if (lateShiftStats[targetTeam]) {
        assignAndCount(lateShiftStats[targetTeam].lateShift, detail)
      }
      const targetTakeOffTeam = nurseTeamTakeOff || '夜間收針未分組'
      if (lateTakeOffStats[targetTakeOffTeam]) {
        assignAndCount(lateTakeOffStats[targetTakeOffTeam].lateShiftTakeOff, detail)
      }
    } else if (shiftCode === SHIFT_CODES.NOON) {
      const targetInTeam = nurseTeamIn || '早未分組'
      if (earlyShiftStats[targetInTeam]) {
        assignAndCount(earlyShiftStats[targetInTeam].noonShiftOn, detail)
      }
      const targetOutTeam = nurseTeamOut
      if (targetOutTeam) {
        if (lateShiftStats[targetOutTeam])
          assignAndCount(lateShiftStats[targetOutTeam].noonShiftOff, detail)
        else if (earlyShiftStats[targetOutTeam])
          assignAndCount(earlyShiftStats[targetOutTeam].noonShiftOff, detail)
      } else {
        if (lateShiftStats['晚未分組']) {
          assignAndCount(lateShiftStats['晚未分組'].noonShiftOff, detail)
        }
      }
    }
  }
  const sortPatientsByBed = (a, b) =>
    (a.dialysisBed === '外圍' ? 100 : parseInt(a.dialysisBed, 10)) -
    (b.dialysisBed === '外圍' ? 100 : parseInt(b.dialysisBed, 10))
  ;[earlyShiftStats, lateShiftStats, lateTakeOffStats].forEach((stats, index) => {
    for (const team in stats) {
      const teamData = stats[team]
      if (!teamData) continue
      Object.values(teamData).forEach((group) => {
        if (group && Array.isArray(group.patients)) {
          group.patients.sort(sortPatientsByBed)
        }
      })
      if (index === 0) {
        teamData.totalOpdCount =
          (teamData.earlyShift?.opdCount || 0) + (teamData.noonShiftOn?.opdCount || 0)
        teamData.totalIpdCount =
          (teamData.earlyShift?.ipdCount || 0) + (teamData.noonShiftOn?.ipdCount || 0)
        teamData.totalErCount =
          (teamData.earlyShift?.erCount || 0) + (teamData.noonShiftOn?.erCount || 0)
      } else if (index === 1) {
        teamData.totalOpdCount = teamData.lateShift?.opdCount || 0
        teamData.totalIpdCount = teamData.lateShift?.ipdCount || 0
        teamData.totalErCount = teamData.lateShift?.erCount || 0
      } else {
        teamData.totalOpdCount = teamData.lateShiftTakeOff?.opdCount || 0
        teamData.totalIpdCount = teamData.lateShiftTakeOff?.ipdCount || 0
        teamData.totalErCount = teamData.lateShiftTakeOff?.erCount || 0
      }
    }
  })
  return { early: earlyShiftStats, late: lateShiftStats, lateTakeOff: lateTakeOffStats }
})
const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}
function toggleNoonTakeoff(shiftType) {
  if (shiftType === 'early' || shiftType === 'late') {
    noonTakeoffVisibility.value[shiftType] = !noonTakeoffVisibility.value[shiftType]
  }
}
function setScheduleChange() {
  if (isPageLocked.value) return
  hasUnsavedScheduleChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}
function setTeamChange() {
  if (isPageLocked.value) return
  hasUnsavedTeamChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}
async function loadDailyStaffInfo(date) {
  try {
    const dateStr = formatDate(date).substring(0, 7)
    const physicianSchedulesApi = ApiManager('physician_schedules')
    const [monthScheduleDoc, usersSnapshot] = await Promise.all([
      physicianSchedulesApi.fetchById(dateStr),
      usersApi.fetchAll([where('title', 'in', ['主治醫師', '專科護理師'])]),
    ])
    const userMap = new Map(usersSnapshot.map((u) => [u.id, u]))
    if (monthScheduleDoc && monthScheduleDoc.schedule) {
      const dayOfMonth = date.getDate()
      const daySchedule = monthScheduleDoc.schedule[dayOfMonth]
      dailyPhysicians.value.early = daySchedule
        ? userMap.get(daySchedule.early?.physicianId) || null
        : null
      dailyPhysicians.value.noon = daySchedule
        ? userMap.get(daySchedule.noon?.physicianId) || null
        : null
      dailyPhysicians.value.late = daySchedule
        ? userMap.get(daySchedule.late?.physicianId) || null
        : null
    } else {
      dailyPhysicians.value = { early: null, noon: null, late: null }
    }
  } catch (error) {
    console.error('載入每日負責人資訊失敗:', error)
    dailyPhysicians.value = { early: null, noon: null, late: null }
  }
}

async function loadData(date) {
  hasUnsavedScheduleChanges.value = false
  hasUnsavedTeamChanges.value = false
  statusIndicator.value = '讀取中...'
  isLoading.value = true
  const dateStr = formatDate(date)
  try {
    // 1. 確保 Pinia Store 中的病人基本資料已載入
    await patientStore.fetchPatientsIfNeeded()

    // 2. 並行獲取當天的排程和護理分組數據
    const [dailyRecords, teamsData] = await Promise.all([
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
      fetchTeamsByDate(dateStr),
    ])

    const scheduleRecord =
      dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }
    Object.assign(currentRecord, scheduleRecord)
    currentTeamsRecord.value = teamsData || { id: null, date: dateStr, teams: {}, names: {} }

    // ✅ [核心修正] 獲取排班內所有病人的 ID
    const patientIdsInSchedule = [
      ...new Set(
        Object.values(currentRecord.schedule)
          .map((slot) => slot.patientId)
          .filter(Boolean),
      ),
    ]

    // 如果排班中有病人，則為他們獲取最新的醫囑
    if (patientIdsInSchedule.length > 0) {
      // 為每個病人並行獲取醫囑
      const ordersPromises = patientIdsInSchedule.map(async (patientId) => {
        const orders = await getEffectiveOrdersForDate(patientId, date)
        const patientInStore = patientMap.value.get(patientId)
        if (patientInStore) {
          // ✨ 將獲取到的醫囑直接附加到 Pinia Store 的病人物件上
          patientInStore.dialysisOrders = orders
        }
      })
      // 等待所有醫囑都獲取完畢
      await Promise.all(ordersPromises)
    }

    // 重新組合最終數據 (這部分邏輯不變，但現在 patientMap 中的病人已經有 dialysisOrders 了)
    if (currentRecord.schedule) {
      for (const shiftId in currentRecord.schedule) {
        const slot = currentRecord.schedule[shiftId]
        if (!slot || !slot.patientId) continue

        const patient = patientMap.value.get(slot.patientId)
        slot.autoNote = patient ? generateAutoNote(patient) : ''

        const shiftCode = shiftId.split('-')[2]
        const teamKey = `${slot.patientId}-${shiftCode}`
        const teamInfo = currentTeamsRecord.value.teams[teamKey]

        if (teamInfo) {
          slot.nurseTeam = teamInfo.nurseTeam || null
          slot.nurseTeamIn = teamInfo.nurseTeamIn || null
          slot.nurseTeamOut = teamInfo.nurseTeamOut || null
          slot.nurseTeamTakeOff = teamInfo.nurseTeamTakeOff || null
        } else {
          slot.nurseTeam = null
          slot.nurseTeamIn = null
          slot.nurseTeamOut = null
          slot.nurseTeamTakeOff = null
        }
      }
    }

    statusIndicator.value = currentRecord.id ? '資料已載入' : '本日無排程資料'
  } catch (error) {
    console.error('讀取報表資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  } finally {
    isLoading.value = false
  }
}

async function saveChangesToCloud() {
  if (isPageLocked.value || !hasUnsavedChanges.value) return
  statusIndicator.value = '儲存中...'
  const promises = []
  try {
    if (hasUnsavedScheduleChanges.value) {
      const scheduleToSave = JSON.parse(JSON.stringify(currentRecord.schedule))
      for (const key in scheduleToSave) {
        delete scheduleToSave[key].nurseTeam
        delete scheduleToSave[key].nurseTeamIn
        delete scheduleToSave[key].nurseTeamOut
        delete scheduleToSave[key].nurseTeamTakeOff
        delete scheduleToSave[key].autoNote
      }
      const scheduleData = { date: currentRecord.date, schedule: scheduleToSave }
      if (currentRecord.id) {
        promises.push(schedulesApi.update(currentRecord.id, scheduleData))
      } else if (Object.keys(scheduleData.schedule).length > 0) {
        promises.push(
          schedulesApi.save(scheduleData).then((saved) => (currentRecord.id = saved.id)),
        )
      }
    }
    if (hasUnsavedTeamChanges.value) {
      const teamsData = {
        date: currentTeamsRecord.value.date,
        teams: currentTeamsRecord.value.teams || {},
        names: currentTeamsRecord.value.names || {},
      }
      if (currentTeamsRecord.value.id) {
        promises.push(updateTeams(currentTeamsRecord.value.id, teamsData))
      } else {
        promises.push(
          saveTeams(teamsData).then((saved) => (currentTeamsRecord.value.id = saved.id)),
        )
      }
    }
    await Promise.all(promises)
    hasUnsavedScheduleChanges.value = false
    hasUnsavedTeamChanges.value = false
    statusIndicator.value = '變更已儲存！'
    const message = `修改護理分組: ${currentRecord.date}`
    createGlobalNotification(message, 'team', { routePath: `/stats?date=${currentRecord.date}` })
    showAlert('操作成功', '變更儲存成功！')
    await loadData(currentDate.value)
  } catch (error) {
    console.error('儲存變更失敗:', error)
    statusIndicator.value = '儲存失敗'
    showAlert('儲存失敗', `儲存失敗: ${error.message}`)
  }
}
function getDutyTagClass(dutyName) {
  if (dutyName.includes('指揮官')) return 'role-field-commander'
  if (dutyName.includes('安全')) return 'role-safety'
  if (dutyName.includes('引導')) return 'role-guide'
  if (dutyName.includes('滅火')) return 'role-fire'
  if (dutyName.includes('通報')) return 'role-reporter'
  return 'role-default'
}
function applyTeamAndScheduleChange(
  patientDetail,
  oldShiftId,
  newShiftId,
  newTeam,
  newResponsibility,
) {
  const movingSlotData = { ...currentRecord.schedule[oldShiftId] }
  delete currentRecord.schedule[oldShiftId]
  currentRecord.schedule[newShiftId] = movingSlotData
  setScheduleChange()
  const patientId = patientDetail.id
  const oldShiftCode = oldShiftId.split('-')[2]
  const oldTeamKey = `${patientId}-${oldShiftCode}`
  if (currentTeamsRecord.value.teams && currentTeamsRecord.value.teams[oldTeamKey]) {
    const sourceResp = patientDetail.sourceResponsibility
    if (sourceResp === 'earlyShift' || sourceResp === 'lateShift')
      delete currentTeamsRecord.value.teams[oldTeamKey].nurseTeam
    if (sourceResp === 'noonShiftOn') delete currentTeamsRecord.value.teams[oldTeamKey].nurseTeamIn
    if (sourceResp === 'noonShiftOff')
      delete currentTeamsRecord.value.teams[oldTeamKey].nurseTeamOut
    if (sourceResp === 'lateShiftTakeOff')
      delete currentTeamsRecord.value.teams[oldTeamKey].nurseTeamTakeOff
    if (Object.keys(currentTeamsRecord.value.teams[oldTeamKey]).length === 0) {
      delete currentTeamsRecord.value.teams[oldTeamKey]
    }
  }
  const newShiftCode = newShiftId.split('-')[2]
  const newTeamKey = `${patientId}-${newShiftCode}`
  if (!currentTeamsRecord.value.teams) currentTeamsRecord.value.teams = {}
  if (!currentTeamsRecord.value.teams[newTeamKey]) {
    currentTeamsRecord.value.teams[newTeamKey] = {}
  }
  performTeamChange({ ...patientDetail, shiftId: newShiftId }, newTeam, newResponsibility)
}
function onDrop(event, newTeam, newResponsibility) {
  if (isPageLocked.value) return
  event.preventDefault()
  event.currentTarget.classList.remove('drag-over-active')
  const patientDetail = JSON.parse(event.dataTransfer.getData('application/json'))
  const oldShiftId = patientDetail.shiftId
  if (!oldShiftId || !currentRecord.schedule[oldShiftId]) return
  const oldShiftCode = oldShiftId.split('-')[2]
  const newShiftCode =
    newResponsibility === 'earlyShift'
      ? SHIFT_CODES.EARLY
      : newResponsibility === 'lateShift' || newResponsibility === 'lateShiftTakeOff'
        ? SHIFT_CODES.LATE
        : SHIFT_CODES.NOON
  if (newShiftCode !== oldShiftCode) {
    const shiftIdParts = oldShiftId.split('-')
    const newShiftId = `${shiftIdParts[0]}-${shiftIdParts[1]}-${newShiftCode}`
    if (currentRecord.schedule[newShiftId]) {
      pendingChangeInfo.value = { patientDetail, newTeam, newResponsibility }
      bedChangeTargetShift.value = newShiftCode
      openBedChangeDialog(patientDetail)
    } else {
      applyTeamAndScheduleChange(patientDetail, oldShiftId, newShiftId, newTeam, newResponsibility)
    }
  } else {
    performTeamChange(patientDetail, newTeam, newResponsibility)
  }
}
function performTeamChange(patientDetail, newTeam, newResponsibility) {
  const patientId = patientDetail.id
  const shiftId = patientDetail.shiftId
  const shiftCode = shiftId.split('-')[2]
  const teamKey = `${patientId}-${shiftCode}`
  if (!currentTeamsRecord.value.teams) currentTeamsRecord.value.teams = {}
  if (!currentTeamsRecord.value.teams[teamKey]) {
    currentTeamsRecord.value.teams[teamKey] = {}
  }
  const teamInfo = currentTeamsRecord.value.teams[teamKey]
  const slotInfo = currentRecord.schedule[shiftId]
  if (!slotInfo) return
  const isUnassigned = newTeam.includes('未分組')
  const finalTeamValue = isUnassigned ? null : newTeam
  if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
    teamInfo.nurseTeam = finalTeamValue
    slotInfo.nurseTeam = finalTeamValue
  } else if (newResponsibility === 'noonShiftOn') {
    teamInfo.nurseTeamIn = finalTeamValue
    slotInfo.nurseTeamIn = finalTeamValue
  } else if (newResponsibility === 'noonShiftOff') {
    teamInfo.nurseTeamOut = finalTeamValue
    slotInfo.nurseTeamOut = finalTeamValue
  } else if (newResponsibility === 'lateShiftTakeOff') {
    teamInfo.nurseTeamTakeOff = finalTeamValue
    slotInfo.nurseTeamTakeOff = finalTeamValue
  }
  if (
    !teamInfo.nurseTeam &&
    !teamInfo.nurseTeamIn &&
    !teamInfo.nurseTeamOut &&
    !teamInfo.nurseTeamTakeOff
  ) {
    delete currentTeamsRecord.value.teams[teamKey]
  }
  setTeamChange()
}
function onDragStart(event, patientDetail, responsibility) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const detailWithSource = { ...patientDetail, sourceResponsibility: responsibility }
  event.dataTransfer.setData('application/json', JSON.stringify(detailWithSource))
  event.dataTransfer.effectAllowed = 'move'
}
function openBedChangeDialog(patientDetail) {
  if (isPageLocked.value) return
  if (!bedChangeTargetShift.value) {
    const currentShiftCode = patientDetail.shiftId.split('-')[2]
    bedChangeTargetShift.value = currentShiftCode
  }
  editingPatientInfo.value = patientDetail
  isBedChangeDialogVisible.value = true
}
function handleBedChange({ oldShiftId, newShiftId }) {
  if (isPageLocked.value || !oldShiftId || !newShiftId || !currentRecord.schedule[oldShiftId]) {
    isBedChangeDialogVisible.value = false
    return
  }
  if (pendingChangeInfo.value) {
    const { patientDetail, newTeam, newResponsibility } = pendingChangeInfo.value
    applyTeamAndScheduleChange(patientDetail, oldShiftId, newShiftId, newTeam, newResponsibility)
  } else {
    const movingSlotData = { ...currentRecord.schedule[oldShiftId] }
    delete currentRecord.schedule[oldShiftId]
    currentRecord.schedule[newShiftId] = movingSlotData
    setScheduleChange()
  }
  isBedChangeDialogVisible.value = false
  pendingChangeInfo.value = null
  bedChangeTargetShift.value = null
}
function handleDialogCancel() {
  isBedChangeDialogVisible.value = false
  pendingChangeInfo.value = null
  bedChangeTargetShift.value = null
}
function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  event.currentTarget.classList.add('drag-over-active')
}
function onDragLeave(event) {
  event.currentTarget.classList.remove('drag-over-active')
}
function showPrepPopover(event, teamData, shiftType) {
  const patientsInShift = teamData[shiftType]?.patients || []
  if (patientsInShift.length === 0) return
  prepPopoverData.patients = patientsInShift
  prepPopoverData.targetElement = event.currentTarget
  isPrepPopoverVisible.value = true
}
function onPrepPopoverClose() {
  isPrepPopoverVisible.value = false
}
function updateNurseName(teamId, event) {
  if (isPageLocked.value) {
    event.target.value = currentTeamsRecord.value.names?.[teamId] || ''
    return
  }
  if (!currentTeamsRecord.value.names) {
    currentTeamsRecord.value.names = {}
  }
  currentTeamsRecord.value.names[teamId] = event.target.value
  setTeamChange()
}
function changeDate(days) {
  const performChange = () => {
    const newDate = new Date(currentDate.value)
    newDate.setDate(newDate.getDate() + days)
    currentDate.value = newDate
  }
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    confirmDialogMessage.value = '您有未儲存的變更，確定要切換日期嗎？'
    onConfirmAction.value = performChange
    isConfirmDialogVisible.value = true
  } else {
    performChange()
  }
}
function goToToday() {
  const performChange = () => {
    currentDate.value = new Date()
  }
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    confirmDialogMessage.value = '您有未儲存的變更，確定要切換到今天嗎？'
    onConfirmAction.value = performChange
    isConfirmDialogVisible.value = true
  } else {
    performChange()
  }
}
function handleConfirm() {
  if (onConfirmAction.value) onConfirmAction.value()
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}
function handleCancel() {
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}
function handleTaskCreated() {
  showAlert('操作成功', '交辦/留言已成功新增！')
  isCreateTaskModalVisible.value = false
}
async function showInjectionList(teamData, shiftType = null) {
  const patientIds = new Set()
  if (shiftType && teamData[shiftType] && Array.isArray(teamData[shiftType].patients)) {
    teamData[shiftType].patients.forEach((p) => patientIds.add(p.id))
  } else {
    for (const key in teamData) {
      if (teamData[key] && Array.isArray(teamData[key].patients)) {
        teamData[key].patients.forEach((p) => patientIds.add(p.id))
      }
    }
  }
  const patientIdArray = Array.from(patientIds)
  if (patientIdArray.length === 0) {
    dailyInjections.value = []
    isInjectionDialogVisible.value = true
    return
  }
  isInjectionDialogVisible.value = true
  isInjectionLoading.value = true
  dailyInjections.value = []
  try {
    const getDailyInjections = httpsCallable(functions, 'getDailyInjections')
    const result = await getDailyInjections({
      targetDate: formatDate(currentDate.value),
      patientIds: patientIdArray,
    })
    if (result.data && result.data.success) {
      dailyInjections.value = result.data.injections
    } else {
      throw new Error(result.data?.message || '從後端獲取針劑資料失敗')
    }
  } catch (error) {
    console.error('獲取本日應打針劑失敗:', error)
    showAlert('查詢失敗', `獲取應打針劑清單時發生錯誤: ${error.message}`)
  } finally {
    isInjectionLoading.value = false
  }
}
function exportAssignmentsToExcel() {
  if (isLoading.value) {
    showAlert('提示', '資料仍在載入中，請稍後再試。')
    return
  }
  const aoa = []
  const formatPatientCell = (patients) => {
    if (!patients || patients.length === 0) return ''
    return patients
      .map((p) => {
        const parts = [`${p.dialysisBed} - ${p.name}`]
        if (p.finalTags) {
          parts.push(`(${p.finalTags})`)
        }
        return parts.join(' ')
      })
      .join('\n')
  }
  const formatCountCell = (teamData) => {
    return `門${teamData?.totalOpdCount || 0} 住${teamData?.totalIpdCount || 0} 急${teamData?.totalErCount || 0}`
  }
  const earlyHeaders = [
    '早班',
    ...sortedEarlyTeams.value.map((name) =>
      name.includes('未分組') ? '未分組' : name.replace('早', '') + '組',
    ),
  ]
  aoa.push(earlyHeaders)
  const earlyNames = [
    '姓名',
    ...sortedEarlyTeams.value.map(
      (name) => effectiveStatsData.value.early[name]?.nurseName || '-- 未指派 --',
    ),
  ]
  aoa.push(earlyNames)
  const earlyShiftRow = [
    '早班',
    ...sortedEarlyTeams.value.map((name) =>
      formatPatientCell(effectiveStatsData.value.early[name]?.earlyShift.patients),
    ),
  ]
  aoa.push(earlyShiftRow)
  const noonOnShiftRow = [
    '午班(上針)',
    ...sortedEarlyTeams.value.map((name) =>
      formatPatientCell(effectiveStatsData.value.early[name]?.noonShiftOn.patients),
    ),
  ]
  aoa.push(noonOnShiftRow)
  const noonOffShiftRowEarly = [
    '午班(收針)',
    ...sortedEarlyTeams.value.map((name) =>
      formatPatientCell(effectiveStatsData.value.early[name]?.noonShiftOff.patients),
    ),
  ]
  aoa.push(noonOffShiftRowEarly)
  const earlyCounts = [
    '照護人數',
    ...sortedEarlyTeams.value.map((name) => formatCountCell(effectiveStatsData.value.early[name])),
  ]
  aoa.push(earlyCounts)
  aoa.push([])
  const lateHeaders = [
    '晚班',
    ...sortedLateTeams.value.map((name) =>
      name.includes('未分組') ? '未分組' : name.replace('晚', '') + '組',
    ),
  ]
  aoa.push(lateHeaders)
  const lateNames = [
    '姓名',
    ...sortedLateTeams.value.map(
      (name) => effectiveStatsData.value.late[name]?.nurseName || '-- 未指派 --',
    ),
  ]
  aoa.push(lateNames)
  const noonOffShiftRowLate = [
    '午班(收針)',
    ...sortedLateTeams.value.map((name) =>
      formatPatientCell(effectiveStatsData.value.late[name]?.noonShiftOff.patients),
    ),
  ]
  aoa.push(noonOffShiftRowLate)
  const lateShiftRow = [
    '晚班',
    ...sortedLateTeams.value.map((name) =>
      formatPatientCell(effectiveStatsData.value.late[name]?.lateShift.patients),
    ),
  ]
  aoa.push(lateShiftRow)
  const lateCounts = [
    '照護人數',
    ...sortedLateTeams.value.map((name) => formatCountCell(effectiveStatsData.value.late[name])),
  ]
  aoa.push(lateCounts)
  if (lateShiftTakeOffExists.value) {
    aoa.push([])
    const lateTakeoffHeaders = [
      '夜班收針',
      ...sortedLateTakeOffTeams.value.map((name) =>
        name.includes('未分組') ? '未分組' : name.replace('夜間收針', '') + '組',
      ),
    ]
    aoa.push(lateTakeoffHeaders)
    const lateTakeoffNames = [
      '姓名',
      ...sortedLateTakeOffTeams.value.map(
        (name) => effectiveStatsData.value.lateTakeOff[name]?.nurseName || '-- 未指派 --',
      ),
    ]
    aoa.push(lateTakeoffNames)
    const lateTakeoffShiftRow = [
      '夜班收針',
      ...sortedLateTakeOffTeams.value.map((name) =>
        formatPatientCell(effectiveStatsData.value.lateTakeOff[name]?.lateShiftTakeOff.patients),
      ),
    ]
    aoa.push(lateTakeoffShiftRow)
    const lateTakeoffCounts = [
      '照護人數',
      ...sortedLateTakeOffTeams.value.map((name) =>
        formatCountCell(effectiveStatsData.value.lateTakeOff[name]),
      ),
    ]
    aoa.push(lateTakeoffCounts)
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const colWidths = [{ wch: 12 }]
  for (let i = 1; i < earlyHeaders.length; i++) {
    colWidths.push({ wch: 25 })
  }
  ws['!cols'] = colWidths
  const rowHeights = []
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = range.s.r; R <= range.e.r; ++R) {
    let maxLines = 1
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell_address = { c: C, r: R }
      const cell_ref = XLSX.utils.encode_cell(cell_address)
      if (ws[cell_ref] && ws[cell_ref].v) {
        const cellValue = String(ws[cell_ref].v)
        const lines = cellValue.split('\n').length
        if (lines > maxLines) {
          maxLines = lines
        }
        ws[cell_ref].s = { alignment: { wrapText: true, vertical: 'top' } }
      }
    }
    if (maxLines > 1) {
      rowHeights.push({ hpt: maxLines * 15 })
    } else {
      rowHeights.push({ hpt: 20 })
    }
  }
  ws['!rows'] = rowHeights
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '護理分組表')
  const fileName = `護理分組表_${formatDate(currentDate.value)}.xlsx`
  XLSX.writeFile(wb, fileName)
}
function promptDuplicateLateShift() {
  if (isPageLocked.value) return
  confirmDialogMessage.value =
    '您確定要為夜班建立一個獨立的「收針」分組嗎？\n這將會複製目前的夜班病人分配，讓您可以單獨調整。'
  onConfirmAction.value = duplicateLateShiftForTakeOff
  isConfirmDialogVisible.value = true
}
function duplicateLateShiftForTakeOff() {
  if (isPageLocked.value) return
  for (const shiftId in currentRecord.schedule) {
    const slot = currentRecord.schedule[shiftId]
    if (!slot) continue
    const shiftCode = shiftId.split('-')[2]
    if (shiftCode === SHIFT_CODES.LATE && slot.patientId) {
      const teamKey = `${slot.patientId}-${shiftCode}`
      if (!currentTeamsRecord.value.teams) currentTeamsRecord.value.teams = {}
      const teamInfo = currentTeamsRecord.value.teams[teamKey] || {}
      if (teamInfo.nurseTeam) {
        const newTeamName = teamInfo.nurseTeam.replace('晚', '夜間收針')
        teamInfo.nurseTeamTakeOff = newTeamName
        slot.nurseTeamTakeOff = newTeamName
      }
      currentTeamsRecord.value.teams[teamKey] = teamInfo
    }
  }
  if (currentTeamsRecord.value.names) {
    for (const teamName in currentTeamsRecord.value.names) {
      if (teamName.startsWith('晚')) {
        const nurseName = currentTeamsRecord.value.names[teamName]
        if (nurseName) {
          const newTakeOffTeamName = teamName.replace('晚', '夜間收針')
          currentTeamsRecord.value.names[newTakeOffTeamName] = nurseName
        }
      }
    }
  }
  setTeamChange()
  showAlert('操作成功', '夜班收針分組已建立，您可以開始調整。')
}
function promptRemoveLateShiftTakeOff() {
  if (isPageLocked.value) return
  confirmDialogMessage.value =
    '您確定要移除「夜班收針」分組嗎？\n所有收針的分配將會被刪除，此操作無法復原。'
  onConfirmAction.value = removeLateShiftTakeOff
  isConfirmDialogVisible.value = true
}
function removeLateShiftTakeOff() {
  if (isPageLocked.value) return
  for (const shiftId in currentRecord.schedule) {
    const slot = currentRecord.schedule[shiftId]
    if (!slot) continue
    const shiftCode = shiftId.split('-')[2]
    if (shiftCode === SHIFT_CODES.LATE && slot.patientId) {
      const teamKey = `${slot.patientId}-${shiftCode}`
      const teamInfo = currentTeamsRecord.value.teams[teamKey]
      if (teamInfo && typeof teamInfo.nurseTeamTakeOff !== 'undefined') {
        delete teamInfo.nurseTeamTakeOff
      }
      if (typeof slot.nurseTeamTakeOff !== 'undefined') {
        delete slot.nurseTeamTakeOff
      }
    }
  }
  setTeamChange()
  showAlert('操作成功', '夜班收針分組已移除。')
}
const handleIconClick = (patientId, context) => {
  if (context === 'dialog') {
    const patient = patientMap.value.get(patientId)
    if (patient) {
      selectedPatientForDialog.value = { id: patientId, name: patient.name }
      isMemoDialogVisible.value = true
    }
  }
}
provide('handleIconClick', handleIconClick)

// ✨ 核心修改：新增醫囑儲存函式和從備物清單打開醫囑的函式
async function handleSaveOrder(orderData) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }
  if (!editingPatientForOrder.value?.id) {
    showAlert('儲存失敗', '找不到有效的病人資訊。')
    return
  }

  const patientId = editingPatientForOrder.value.id
  const patientName = editingPatientForOrder.value.name

  try {
    // 直接呼叫從 optimizedApiService 引入的函式
    await createDialysisOrderAndUpdatePatient(patientId, patientName, orderData)

    // 操作成功後續處理
    await loadData(currentDate.value) // 重新載入所有資料以更新畫面
    isOrderModalVisible.value = false
    createGlobalNotification(`更新醫囑：${patientName}`, 'team') // 'team' 是一個示例，您可以改成 'order'
    showAlert('儲存成功', `已成功更新 ${patientName} 的透析醫囑。`)
  } catch (error) {
    console.error('儲存醫囑失敗:', error)
    showAlert('操作失敗', `儲存醫囑時發生錯誤: ${error.message}`)
  }
}

const openOrderModalFromPopover = (patient) => {
  if (patient && patient.id) {
    editingPatientForOrder.value = patient
    isOrderModalVisible.value = true
  }
}

onMounted(() => {
  Promise.all([loadData(currentDate.value), loadDailyStaffInfo(currentDate.value)])
})
watch(currentUser, (newUser) => {
  if (!newUser) {
  }
})
watch(currentDate, (newDate) => {
  noonTakeoffVisibility.value = { early: false, late: false }
  loadData(newDate)
  loadDailyStaffInfo(newDate)
})
onUnmounted(() => {})
</script>

<style scoped>
/* ================================== */
/* === 1. 頁面佈局 (核心修改) === */
/* ================================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 10px;
  box-sizing: border-box;
  overflow: hidden;
  background-color: #f8f9fa;
}

.page-header-content {
  flex-shrink: 0;
  padding-bottom: 10px;
}

/* ✨ 移除此處的 overflow，讓它只是一個 flex 容器 */
.scrollable-main-content {
  flex-grow: 1;
  min-height: 0;
  position: relative;
  display: flex; /* 新增，使其子元素可以 flex */
}

/* ✨ 將滾動功能移到這個包裝層 */
.stats-sections-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex-grow: 1; /* 新增，使其填滿父容器 */
  overflow-y: auto; /* ✨ 核心修改：讓這個元素自己滾動 */
  min-height: 0; /* 新增，確保 flex-grow 能正常運作 */
  padding-bottom: 10px; /* 增加一點底部空間 */
}

/* ================================== */
/* === 2. 按鈕樣式 (統一基礎) === */
/* ================================== */
button,
.btn {
  padding: 8px 15px;
  font-size: 1em;
  cursor: pointer;
  border-radius: 5px;
  border: 1px solid #ccc;
  background-color: #fff;
  transition: all 0.2s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* 按鈕變體 */
#save-changes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
#save-changes-btn:hover:not(:disabled) {
  background-color: #45a049;
}

.btn-primary {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
.btn-primary:hover:not(:disabled) {
  background-color: #0069d9;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
.btn-secondary:hover:not(:disabled) {
  background-color: #5a6268;
}

.duplicate-shift-btn {
  border-color: #6f42c1;
  color: #6f42c1;
}

/* ... 以下所有其他樣式保持不變 ... */

/* ================================== */
/* === 3. 頂部工具列 === */
/* ================================== */
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 15px;
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
  color: #007bff;
}

.status-indicator {
  font-size: 0.9em;
  font-weight: bold;
  color: #757575;
  font-style: italic;
  white-space: nowrap;
}

/* ================================== */
/* === 4. 醫師與消防並排佈局 (核心) === */
/* ================================== */
.info-row-wrapper {
  display: flex !important;
  flex-direction: row !important;
  justify-content: space-between; /* 一個靠左，一個靠右 */
  align-items: center; /* 垂直置中對齊 */
  gap: 1.5rem;
  margin-bottom: 15px;
}

/* 醫師面板 */
.daily-staff-panel.horizontal {
  display: flex;
  gap: 8px;
  align-items: stretch;
  flex-wrap: wrap;
}

.staff-item {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 25px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.staff-label {
  font-weight: 700;
  font-size: 0.9rem;
  margin-right: 8px;
  color: white;
}

.staff-details {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  white-space: nowrap;
}

.staff-name {
  display: flex;
  align-items: baseline;
  gap: 0.3em;
  font-weight: 600;
  font-size: 1rem;
}

.staff-job-title {
  font-size: 0.85em;
  font-weight: 500;
  opacity: 0.9;
}

.staff-contact {
  font-size: 0.75rem;
  opacity: 0.9;
}

/* 班別顏色 */
.staff-item.shift-early {
  background-color: #28a745;
  color: white;
}
.staff-item.shift-noon {
  background-color: #ffc107;
  color: #212529;
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

/* 消防編組 */
.duty-command-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  padding: 0;
  margin-top: 0;
}

.main-commanders {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.duty-title {
  font-weight: 600;
  font-size: 1em;
  color: #b45309;
}

.duty-role-tag {
  font-size: 0.8em;
  font-weight: 600;
  padding: 2px 6px;
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
.duty-role-tag.role-guide {
  background-color: #0d9488;
}

.duty-person {
  font-weight: 500;
  color: #1e293b;
  font-size: 0.9em;
  margin-left: -2px;
}

.duty-divider {
  width: 1px;
  height: 16px;
  background-color: #d1d5db;
  margin: 0 4px;
}

/* 消防下拉選單 */
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

.toggle-arrow {
  transition: transform 0.2s ease-in-out;
  font-size: 0.8em;
}

.toggle-arrow.is-rotated {
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

/* 消防職務顏色 */
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

/* ================================== */
/* === 5. 主表格樣式 === */
/* ================================== */
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

.stats-section {
  overflow-x: auto;
  padding-bottom: 10px;
  scrollbar-width: thin;
  scrollbar-color: #aab7c4 #f1f1f1;
}

.stats-section::-webkit-scrollbar {
  height: 8px;
}
.stats-section::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}
.stats-section::-webkit-scrollbar-thumb {
  background: #aab7c4;
  border-radius: 4px;
}
.stats-section::-webkit-scrollbar-thumb:hover {
  background: #888;
}

/* Grid 佈局 */
.grid-container {
  min-width: 1800px;
  display: grid;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.grid-header,
.grid-body,
.grid-footer,
.grid-row {
  display: contents;
}

/* Grid 儲存格共同樣式 */
.row-header,
.team-header-cell,
.grid-cell,
.total-count-summary {
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  padding: 8px;
  word-wrap: break-word;
}

/* 移除最後一欄右邊框 */
.grid-container > * > *:last-child {
  border-right: none;
}

/* 移除最後一列下邊框 */
.grid-footer > * {
  border-bottom: none;
}

/* 標題儲存格 */
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
  display: flex;
  align-items: center;
  justify-content: center;
  position: sticky;
  top: 0;
  z-index: 1;
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

/* 姓名選擇器 */
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

/* 病人儲存格 */
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

/* 病人項目 */
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

.patient-item:active {
  cursor: grabbing;
  background-color: #e0e0e0;
  opacity: 0.8;
  transform: scale(1.02);
}

.patient-main-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-grow: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.patient-line-one {
  font-weight: bold;
  font-size: 1em;
  white-space: nowrap;
}

.patient-line-two {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
  white-space: nowrap;
}

/* 病人狀態顏色 */
.patient-item.status-opd {
  background-color: #e8f5e9;
  border-color: #a5d6a7;
}
.patient-item.status-ipd {
  background-color: #ffebee;
  border-color: #ef9a9a;
}
.patient-item.status-er {
  background-color: #f3e5f5;
  border-color: #ce93d8;
}
.patient-item.status-biweekly {
  background-color: #ffcc80;
  border-color: #ffb74d;
}

/* 特殊標籤 */
.patient-item.tag-chou {
  background-color: #658ee0 !important;
  color: white !important;
  border-color: #3949ab !important;
}
.patient-item.tag-chou * {
  color: white !important;
}
.patient-item.tag-new {
  background-color: #f5ec8e;
  border-color: #e0d567;
}
.patient-item.tag-huan {
  background-color: #e0f7fa;
  border-color: #b2ebf2;
}
.patient-item.tag-liang {
  background-color: #fff3e0;
  border-color: #ffe0b2;
}
.patient-item.tag-b {
  background-color: #fff9c4;
  border-color: #fff59d;
}

/* 顯示元素 */
.note-display {
  color: #c62828;
  font-weight: bold;
}

.stats-special-mode {
  display: inline-block;
  vertical-align: middle;
  padding: 1px 5px;
  background-color: #ffebee;
  color: #c62828;
  border: 1px solid #ef9a9a;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.9em;
  line-height: 1.2;
}

.ward-number-display {
  display: inline-block;
  background-color: #4a90e2;
  color: white;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 0.9em;
  font-weight: 500;
  margin-right: 4px;
  vertical-align: middle;
}

/* 統計摘要 */
.total-count-summary {
  background-color: #f8f9fa;
  font-weight: bold;
  text-align: center;
  color: #333;
  padding: 10px 8px;
}

/* 收合功能 */
.collapsible-header {
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s;
  grid-column: 1 / -1;
  padding: 8px;
}

.collapsible-header:hover {
  background-color: #e9ecef;
}

.collapse-icon {
  font-size: 0.8em;
  transition: transform 0.3s ease-in-out;
}

.collapse-icon.is-expanded {
  transform: rotate(90deg);
}

/* 動畫效果 */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-5px);
  opacity: 0;
}

.grid-row-fade-enter-active,
.grid-row-fade-leave-active {
  transition: all 0.3s ease-out;
}

.grid-row-fade-enter-from .grid-cell,
.grid-row-fade-leave-to .grid-cell {
  opacity: 0;
  transform: translateY(-10px);
}

/* 未分組樣式 */
.unassigned-header {
  background-color: #ffe0b2 !important;
  color: #8d6e63 !important;
}

.unassigned-cell {
  background-color: #fff8e1 !important;
  border-left: 2px solid #ffb74d;
}

.unassigned-placeholder {
  width: 100%;
  height: 100%;
  background-color: #fffde7;
}

/* 夜班收針區塊 */
.late-takeoff-section {
  border-top: 4px solid #007bff;
  margin-top: 1.5rem;
}

/* 操作按鈕 */
.cell-actions-container {
  position: absolute;
  bottom: 4px;
  right: 6px;
  display: flex;
  gap: 8px;
}

.prep-list-trigger,
.injection-list-trigger {
  cursor: pointer;
  font-size: 1.2rem;
  padding: 2px;
  border-radius: 4px;
  transition: background-color 0.2s;
  user-select: none;
}

.prep-list-trigger:hover,
.injection-list-trigger:hover {
  background-color: #e0e0e0;
}

/* 鎖定狀態 */
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
.is-locked .prep-list-trigger,
.is-locked .injection-list-trigger {
  pointer-events: auto;
  cursor: pointer;
}

/* Deep 選擇器 */
:deep(.memo-icon-wrapper) {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
  align-self: center;
}

/* ================================== */
/* === 6. 響應式設計 === */
/* ================================== */
.mobile-only {
  display: none;
}
.desktop-only {
  display: block;
}
.desktop-only-flex {
  display: flex;
}

@media screen and (max-width: 1200px) {
  .toolbar-left {
    gap: 1rem;
  }
}

@media screen and (max-width: 992px) {
  .desktop-only,
  .desktop-only-flex {
    display: none !important;
  }

  .mobile-only {
    display: block !important;
  }

  .page-container {
    padding: 0;
  }

  .page-header-content {
    padding: 10px;
  }

  .scrollable-main-content {
    padding: 0 10px 80px 10px;
  }

  .header-toolbar,
  .toolbar-left {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .page-title {
    text-align: center;
    font-size: 1.5rem;
  }

  .date-navigator {
    display: grid;
    grid-template-columns: auto 1fr auto;
    width: 100%;
  }

  .current-date-text,
  .weekday-display {
    font-size: 1.25rem;
    text-align: center;
  }

  .toolbar-left > button {
    width: 100%;
    box-sizing: border-box;
    justify-content: center;
  }

  /* 行動版卡片樣式 */
  .mobile-shift-section {
    border: 1px solid #ddd;
    border-radius: 8px;
    margin-bottom: 20px;
    background-color: #fff;
    overflow: hidden;
  }

  .mobile-shift-title {
    background-color: #e3f2fd;
    color: #005a9c;
    font-size: 1.5em;
    padding: 12px;
    margin: 0;
    border-bottom: 1px solid #ddd;
  }

  .mobile-team-card {
    padding: 12px;
    border-top: 1px solid #eee;
  }

  .mobile-team-card:first-of-type {
    border-top: none;
  }

  .mobile-team-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .mobile-team-header h3 {
    margin: 0;
    font-size: 1.3em;
    color: #333;
  }

  .mobile-team-header .name-select {
    width: 150px;
    height: auto;
    font-size: 1em;
    padding: 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .mobile-patient-lists {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mobile-patient-list h4 {
    margin: 0 0 8px 0;
    font-size: 1.1em;
    color: #555;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 4px;
  }

  .mobile-patient-list.collapsible h4 {
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .collapsible-content {
    padding-top: 8px;
  }

  .mobile-team-footer {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #eee;
    text-align: right;
    font-weight: bold;
    color: #333;
  }

  .mobile-only .name-select:disabled {
    background-color: #f5f5f5;
    border-color: #ddd;
    color: #555;
    -webkit-appearance: none;
    appearance: none;
    cursor: default;
  }

  .mobile-only .patient-main-info {
    cursor: default;
  }

  /* FAB 按鈕 */
  .fab-mobile {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: #007bff;
    color: white;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    font-size: 1.5rem;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
