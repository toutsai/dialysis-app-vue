<!-- 檔案路徑: src/views/StatsView.vue -->
<template>
  <div class="page-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>正在載入 {{ formatDate(currentDate) }} 的資料...</span>
    </div>
    <div class="header-toolbar">
      <div class="toolbar-left">
        <h1 class="page-title">護理分組檢視</h1>
        <div class="date-navigator">
          <button @click="changeDate(-1)" class="date-nav-btn">&lt; 上一天</button>
          <span class="current-date-text">{{ formatDate(currentDate) }}</span>
          <span class="weekday-display">{{ weekdayDisplay }}</span>
          <button @click="changeDate(1)" class="date-nav-btn">下一天 &gt;</button>
          <button @click="goToToday">回到今日</button>
          <button
            class="btn-primary"
            @click="isCreateTaskModalVisible = true"
            :disabled="!hasPermission('viewer')"
          >
            <i class="fas fa-plus"></i> 新增交辦/留言
          </button>
          <!-- ✨ [修改] 按鈕已移動至此處，並使用 v-if 控制顯示 -->
          <button
            v-if="!lateShiftTakeOffExists"
            @click="promptDuplicateLateShift"
            class="duplicate-shift-btn"
            title="為晚班建立獨立的收針分組"
            :disabled="isPageLocked"
          >
            <i class="fas fa-copy"></i> 新增夜班收針分組
          </button>
        </div>
      </div>
      <div class="toolbar-right">
        <span class="status-indicator">{{ statusIndicator }}</span>
        <button
          id="save-changes-btn"
          class="desktop-only-flex"
          :disabled="!hasUnsavedChanges || isPageLocked"
          @click="saveChangesToCloud"
        >
          儲存變更
        </button>
        <button @click="triggerPrint" class="desktop-only-flex">列印報表</button>
      </div>
    </div>

    <div class="daily-info-bar">
      <div class="daily-staff-panel horizontal">
        <div class="staff-item shift-early">
          <span class="staff-label">早</span>
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
          <span class="staff-label">午</span>
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
          <span class="staff-label">晚</span>
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
          <span class="staff-label">專</span>
          <div class="staff-details">
            <span class="staff-name">賴若蕎</span>
            <span class="staff-contact">(電: 665129)</span>
          </div>
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
    </div>

    <div class="stats-sections-wrapper desktop-only">
      <!-- 早班區塊 -->
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

      <!-- 晚班區塊 -->
      <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
        <div class="grid-container">
          <div class="grid-header">
            <div class="row-header section-title-cell">晚班</div>
            <!-- ✨ [修改] 此處的按鈕容器已移除，版面簡化 -->
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

      <!-- 夜班收針區塊 -->
      <div
        v-if="lateShiftTakeOffExists"
        class="stats-section late-takeoff-section"
        :class="{ 'is-locked': isPageLocked }"
      >
        <div class="grid-container">
          <!-- [修正] grid-header 結構調整，以正確處理雙層表頭 -->
          <div class="grid-header">
            <div class="row-header section-title-cell takeoff-title-cell">夜班收針</div>
            <div class="takeoff-action-bar">
              <button
                @click="promptRemoveLateShiftTakeOff"
                class="duplicate-shift-btn remove"
                title="移除夜班收針分組"
                :disabled="isPageLocked"
              >
                <i class="fas fa-trash"></i> 移除收針分組
              </button>
            </div>
            <!-- 使用一個空的 display:contents wrapper 來確保 v-for 的元素被視為 grid 的直接子元素 -->
            <div style="display: contents">
              <div
                v-for="(_, teamName) in effectiveStatsData.lateTakeOff"
                :key="teamName"
                class="team-header-cell"
              >
                {{ teamName.replace('夜間收針', '') }}組
              </div>
            </div>
          </div>
          <div class="grid-body">
            <div class="grid-row">
              <div class="row-header">姓名</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.lateTakeOff"
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
              <div class="row-header">夜班收針</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.lateTakeOff"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'lateShiftTakeOff')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.lateShiftTakeOff.patients"
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
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.lateShiftTakeOff.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'lateShiftTakeOff')"
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
              v-for="(teamData, teamName) in effectiveStatsData.lateTakeOff"
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

    <!-- 行動版檢視 -->
    <div class="mobile-only" :class="{ 'is-locked': isPageLocked }">
      <!-- 早班 -->
      <div class="mobile-shift-section">
        <h2 class="mobile-shift-title">早班</h2>
        <div
          v-for="(teamData, teamName) in effectiveStatsData.early"
          :key="teamName"
          class="mobile-team-card"
        >
          <div class="mobile-team-header">
            <h3>{{ teamName.replace('早', '') }}組</h3>
            <select
              :value="teamData.nurseName"
              @change="updateNurseName(teamName, $event)"
              class="name-select"
              :disabled="true"
            >
              <option value="">-- 未指派 --</option>
              <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <div class="mobile-patient-lists">
            <div v-if="teamData.earlyShift.patients.length > 0" class="mobile-patient-list">
              <h4>早班</h4>
              <div
                v-for="patient in teamData.earlyShift.patients"
                :key="patient.shiftId"
                :class="patient.classes"
                :draggable="false"
              >
                <div class="patient-main-info">
                  <div class="patient-line-one">{{ patient.dialysisBed }} - {{ patient.name }}</div>
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
                <MemoIcon :patient-id="patient.id" />
              </div>
            </div>
            <div v-if="teamData.noonShiftOn.patients.length > 0" class="mobile-patient-list">
              <h4>午班 (上針)</h4>
              <div
                v-for="patient in teamData.noonShiftOn.patients"
                :key="patient.shiftId"
                :class="patient.classes"
                :draggable="false"
              >
                <div class="patient-main-info">
                  <div class="patient-line-one">{{ patient.dialysisBed }} - {{ patient.name }}</div>
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
                <MemoIcon :patient-id="patient.id" />
              </div>
            </div>
            <div v-if="teamData.noonShiftOff.patients.length > 0" class="mobile-patient-list">
              <h4>午班 (收針)</h4>
              <div
                v-for="patient in teamData.noonShiftOff.patients"
                :key="patient.shiftId"
                :class="patient.classes"
                :draggable="false"
              >
                <div class="patient-main-info">
                  <div class="patient-line-one">{{ patient.dialysisBed }} - {{ patient.name }}</div>
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
                <MemoIcon :patient-id="patient.id" />
              </div>
            </div>
          </div>
          <div class="mobile-team-footer">
            門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
              teamData.totalErCount
            }}
          </div>
        </div>
      </div>
      <!-- 晚班 -->
      <div class="mobile-shift-section">
        <h2 class="mobile-shift-title">晚班</h2>
        <div
          v-for="(teamData, teamName) in effectiveStatsData.late"
          :key="teamName"
          class="mobile-team-card"
        >
          <div class="mobile-team-header">
            <h3>{{ teamName.replace('晚', '') }}組</h3>
            <select
              :value="teamData.nurseName"
              @change="updateNurseName(teamName, $event)"
              class="name-select"
              :disabled="true"
            >
              <option value="">-- 未指派 --</option>
              <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <div class="mobile-patient-lists">
            <div v-if="teamData.noonShiftOff.patients.length > 0" class="mobile-patient-list">
              <h4>午班 (收針)</h4>
              <div
                v-for="patient in teamData.noonShiftOff.patients"
                :key="patient.shiftId"
                :class="patient.classes"
                :draggable="false"
              >
                <div class="patient-main-info">
                  <div class="patient-line-one">{{ patient.dialysisBed }} - {{ patient.name }}</div>
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
                <MemoIcon :patient-id="patient.id" />
              </div>
            </div>
            <div v-if="teamData.lateShift.patients.length > 0" class="mobile-patient-list">
              <h4>晚班</h4>
              <div
                v-for="patient in teamData.lateShift.patients"
                :key="patient.shiftId"
                :class="patient.classes"
                :draggable="false"
              >
                <div class="patient-main-info">
                  <div class="patient-line-one">{{ patient.dialysisBed }} - {{ patient.name }}</div>
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
                <MemoIcon :patient-id="patient.id" />
              </div>
            </div>
          </div>
          <div class="mobile-team-footer">
            門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
              teamData.totalErCount
            }}
          </div>
        </div>
        <!-- 夜班收針 (行動版) -->
        <div v-if="lateShiftTakeOffExists">
          <h2 class="mobile-shift-title" style="margin-top: 1rem; border-top: 2px solid #007bff">
            夜班收針
          </h2>
          <div
            v-for="(teamData, teamName) in effectiveStatsData.lateTakeOff"
            :key="teamName"
            class="mobile-team-card"
          >
            <div class="mobile-team-header">
              <h3>{{ teamName.replace('夜間收針', '') }}組</h3>
              <select :value="teamData.nurseName" class="name-select" :disabled="true">
                <option value="">-- 未指派 --</option>
                <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
            <div class="mobile-patient-lists">
              <div v-if="teamData.lateShiftTakeOff.patients.length > 0" class="mobile-patient-list">
                <h4>夜班收針</h4>
                <div
                  v-for="patient in teamData.lateShiftTakeOff.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  :draggable="false"
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
                  <MemoIcon :patient-id="patient.id" />
                </div>
              </div>
            </div>
            <div class="mobile-team-footer">
              門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
                teamData.totalErCount
              }}
            </div>
          </div>
        </div>
      </div>
    </div>

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
import { ref, onMounted, computed, reactive, watch, onUnmounted } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy, limit } from 'firebase/firestore'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'
import { generateAutoNote, getUnifiedCellStyle } from '@/utils/scheduleUtils.js'
import { useAuth } from '@/composables/useAuth.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import { fetchTeamsByDate, saveTeams, updateTeams } from '@/services/nurseAssignmentsService.js'
import BedChangeDialog from '@/components/BedChangeDialog.vue'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import MemoIcon from '@/components/MemoIcon.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PreparationPopover from '@/components/PreparationPopover.vue'
import TaskCreateDialog from '@/components/TaskCreateDialog.vue'
import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

// Store 實例化
const patientStore = usePatientStore()
const { patientMap } = storeToRefs(patientStore)

// API 管理器
const schedulesApi = ApiManager('schedules')
const memosApi = ApiManager('memos')
const ordersHistoryApi = ApiManager('dialysis_orders_history')
const usersApi = ApiManager('users')

// 常數定義
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

// 響應式狀態
const isFireDutyDropdownVisible = ref(false)
const currentDate = ref(new Date())
const activeMemos = ref([])
const statusIndicator = ref('')
const isLoading = ref(false)
const currentRecord = reactive({ id: null, date: '', schedule: {} })
const currentTeamsRecord = ref({ id: null, date: '', teams: {}, names: {} })
const hasUnsavedScheduleChanges = ref(false)
const hasUnsavedTeamChanges = ref(false)
const hasUnsavedChanges = computed(
  () => hasUnsavedScheduleChanges.value || hasUnsavedTeamChanges.value,
)
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
const pendingChangeInfo = ref(null)
const bedChangeTargetShift = ref(null)
const isPrepPopoverVisible = ref(false)
const prepPopoverData = reactive({ patients: [], targetElement: null })
const isCreateTaskModalVisible = ref(false)
const dailyPhysicians = ref({ early: null, noon: null, late: null })

// Hooks
const { createGlobalNotification } = useGlobalNotifier()
const auth = useAuth()
const { hasPermission } = auth

// Computed Properties
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentDay = new Date(currentDate.value)
  currentDay.setHours(0, 0, 0, 0)
  return currentDay < today
})
const weekdayDisplay = computed(
  () => ['日', '一', '二', '三', '四', '五', '六'][new Date(currentDate.value).getDay()],
)
const lateShiftTakeOffExists = computed(() => {
  return Object.values(currentTeamsRecord.value.teams || {}).some(
    (team) => team && typeof team.nurseTeamTakeOff !== 'undefined',
  )
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

  for (const shiftId in currentRecord.schedule) {
    const shiftDetails = currentRecord.schedule[shiftId]
    if (!shiftDetails || !shiftDetails.patientId) continue

    const patient = patientMap.value.get(shiftDetails.patientId)
    if (!patient) continue

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
      status: patient.status,
      mode: patient.mode,
      wardNumber: patient.wardNumber || '',
      dialysisBed: shiftId.startsWith('peripheral') ? '外圍' : shiftId.split('-')[1] || '',
      finalTags: [...new Set([...(autoNote || '').split(' '), ...(manualNote || '').split(' ')])]
        .filter((tag) => tag && !['住', '急'].includes(tag))
        .join(' '),
      classes:
        'patient-item ' +
        Object.entries(getUnifiedCellStyle(shiftDetails, patient))
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

    if (shiftCode === SHIFT_CODES.EARLY && nurseTeam && earlyShiftStats[nurseTeam]) {
      assignAndCount(earlyShiftStats[nurseTeam].earlyShift, detail)
    } else if (shiftCode === SHIFT_CODES.LATE) {
      if (nurseTeam && lateShiftStats[nurseTeam]) {
        assignAndCount(lateShiftStats[nurseTeam].lateShift, detail)
      }
      if (nurseTeamTakeOff && lateTakeOffStats[nurseTeamTakeOff]) {
        assignAndCount(lateTakeOffStats[nurseTeamTakeOff].lateShiftTakeOff, detail)
      }
    } else if (shiftCode === SHIFT_CODES.NOON) {
      if (nurseTeamIn && earlyShiftStats[nurseTeamIn]) {
        assignAndCount(earlyShiftStats[nurseTeamIn].noonShiftOn, detail)
      }
      if (nurseTeamOut) {
        if (lateShiftStats[nurseTeamOut])
          assignAndCount(lateShiftStats[nurseTeamOut].noonShiftOff, detail)
        else if (earlyShiftStats[nurseTeamOut])
          assignAndCount(earlyShiftStats[nurseTeamOut].noonShiftOff, detail)
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
        // early
        teamData.totalOpdCount =
          (teamData.earlyShift?.opdCount || 0) + (teamData.noonShiftOn?.opdCount || 0)
        teamData.totalIpdCount =
          (teamData.earlyShift?.ipdCount || 0) + (teamData.noonShiftOn?.ipdCount || 0)
        teamData.totalErCount =
          (teamData.earlyShift?.erCount || 0) + (teamData.noonShiftOn?.erCount || 0)
      } else if (index === 1) {
        // late
        teamData.totalOpdCount = teamData.lateShift?.opdCount || 0
        teamData.totalIpdCount = teamData.lateShift?.ipdCount || 0
        teamData.totalErCount = teamData.lateShift?.erCount || 0
      } else {
        // lateTakeOff
        teamData.totalOpdCount = teamData.lateShiftTakeOff?.opdCount || 0
        teamData.totalIpdCount = teamData.lateShiftTakeOff?.ipdCount || 0
        teamData.totalErCount = teamData.lateShiftTakeOff?.erCount || 0
      }
    }
  })

  return { early: earlyShiftStats, late: lateShiftStats, lateTakeOff: lateTakeOffStats }
})

// Functions
const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
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
async function loadData(date) {
  hasUnsavedScheduleChanges.value = false
  hasUnsavedTeamChanges.value = false
  statusIndicator.value = '讀取中...'
  isLoading.value = true
  const dateStr = formatDate(date)
  try {
    await patientStore.fetchPatientsIfNeeded()
    const [dailyRecords, teamsData, memosData] = await Promise.all([
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
      fetchTeamsByDate(dateStr),
      memosApi.fetchAll([where('status', '==', 'pending')]),
    ])
    activeMemos.value = memosData
    const scheduleRecord =
      dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }
    Object.assign(currentRecord, scheduleRecord)
    currentTeamsRecord.value = teamsData || { id: null, date: dateStr, teams: {}, names: {} }

    const patientIdsInSchedule = Object.values(currentRecord.schedule)
      .map((slot) => slot.patientId)
      .filter(Boolean)
    if (patientIdsInSchedule.length > 0) {
      const patientsOnSchedule = patientStore.allPatients.filter((p) =>
        patientIdsInSchedule.includes(p.id),
      )
      const patientsWithOrdersPromises = patientsOnSchedule.map(async (patient) => {
        const orders = await getEffectiveOrdersForDate(patient.id, date)
        const patientInStore = patientMap.value.get(patient.id)
        if (patientInStore) {
          patientInStore.dialysisOrders = orders
        }
      })
      await Promise.all(patientsWithOrdersPromises)
    }

    if (currentRecord.schedule && currentTeamsRecord.value.teams) {
      const localPatientMap = patientMap.value
      for (const shiftId in currentRecord.schedule) {
        const slot = currentRecord.schedule[shiftId]
        if (!slot || !slot.patientId) continue
        slot.autoNote = localPatientMap.get(slot.patientId)
          ? generateAutoNote(localPatientMap.get(slot.patientId))
          : ''
        const shiftCode = shiftId.split('-')[2]
        const teamKey = `${slot.patientId}-${shiftCode}`
        const teamInfo = currentTeamsRecord.value.teams[teamKey]
        if (teamInfo) {
          slot.nurseTeam = teamInfo.nurseTeam || null
          slot.nurseTeamIn = teamInfo.nurseTeamIn || null
          slot.nurseTeamOut = teamInfo.nurseTeamOut || null
          slot.nurseTeamTakeOff = teamInfo.nurseTeamTakeOff || null // 載入收針分組
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

  if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
    teamInfo.nurseTeam = newTeam
    slotInfo.nurseTeam = newTeam
  } else if (newResponsibility === 'noonShiftOn') {
    teamInfo.nurseTeamIn = newTeam
    slotInfo.nurseTeamIn = newTeam
  } else if (newResponsibility === 'noonShiftOff') {
    teamInfo.nurseTeamOut = newTeam
    slotInfo.nurseTeamOut = newTeam
  } else if (newResponsibility === 'lateShiftTakeOff') {
    teamInfo.nurseTeamTakeOff = newTeam
    slotInfo.nurseTeamTakeOff = newTeam
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
function triggerPrint() {
  window.print()
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

  // 步驟 1: 複製病人的分組 (這部分維持不變)
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

  // ✨ --- 新增邏輯：複製護理師姓名 --- ✨
  // 步驟 2: 遍歷所有已指派的護理師姓名，並將晚班的指派複製到夜間收針
  if (currentTeamsRecord.value.names) {
    for (const teamName in currentTeamsRecord.value.names) {
      // 確保我們只複製 "晚班" 的護理師 (例如 "晚A", "晚B")
      if (teamName.startsWith('晚')) {
        const nurseName = currentTeamsRecord.value.names[teamName]
        if (nurseName) {
          // 只複製有指派的護理師
          // 建立對應的夜間收針組別名稱 (例如 "晚A" -> "夜間收針A")
          const newTakeOffTeamName = teamName.replace('晚', '夜間收針')
          // 將護理師姓名指派給新的組別
          currentTeamsRecord.value.names[newTakeOffTeamName] = nurseName
        }
      }
    }
  }
  // ✨ --- 新增邏輯結束 --- ✨

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

// Lifecycle Hooks
onMounted(() => {
  Promise.all([loadData(currentDate.value), loadDailyStaffInfo(currentDate.value)])
})
watch(currentDate, (newDate) => {
  loadData(newDate)
  loadDailyStaffInfo(newDate)
})
</script>

<style scoped>
/* ================================== */
/* === 1. 基本樣式 === */
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
.page-container {
  box-sizing: border-box;
  position: relative;
  padding: 10px;
}
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
  margin-left: -5px;
  margin-right: 5px;
}
.status-indicator {
  font-size: 0.9em;
  font-weight: bold;
  color: #757575;
  font-style: italic;
}
.toolbar-left button,
.toolbar-right button,
.date-navigator button {
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
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
#save-changes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
button.btn-primary {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
button.btn-primary:hover:not(:disabled) {
  background-color: #0069d9;
  border-color: #0062cc;
}

/* ================================== */
/* === 2. 桌面版 Grid 樣式 === */
/* ================================== */
.grid-container {
  display: grid;
  grid-template-columns: 90px repeat(12, 1fr);
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.grid-header {
  display: contents; /* 讓內部元素直接成為 grid 的子項目 */
}
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
.grid-container div:last-child {
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
.note-display {
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
.patient-item.status-biweekly {
  background-color: #ffcc80;
  border-color: #ffb74d;
}
.patient-item.tag-chou {
  background-color: #658ee0;
  border-color: #42a5f5;
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
.patient-item.has-note-highlight .patient-line-one {
  color: #c62828;
}
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

/* ================================== */
/* === 3. 每日資訊列 & 消防編組樣式 === */
/* ================================== */
.daily-info-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem;
  background-color: #ffffff;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 1px solid #dee2e6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}
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
.duty-command-bar {
  background-color: transparent;
  border: none;
  padding: 0;
  margin-bottom: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
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
.duty-role-tag.role-worker {
  background-color: #6d28d9;
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

/* ================================== */
/* === 4. 夜班收針功能的新增/修正樣式 === */
/* ================================== */
.duplicate-shift-btn {
  padding: 8px 15px;
  font-size: 1em;
  border: 1px solid #007bff;
  background-color: #e7f1ff;
  color: #0056b3;
  border-radius: 5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;
}
.duplicate-shift-btn:hover:not(:disabled) {
  background-color: #cce0ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.duplicate-shift-btn:disabled {
  border-color: #ced4da;
  background-color: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
}

/* 夜班收針區塊的整體樣式 */
.late-takeoff-section {
  border-top: 4px solid #007bff;
  margin-top: 1.5rem;
}
.late-takeoff-section .section-title-cell {
  background-color: #e3f2fd;
  color: #005a9c;
}

/* [修正] 針對夜班收針表格的表頭進行網格佈局修正 */
.takeoff-title-cell {
  grid-row: 1 / 3; /* 讓標題儲存格垂直合併，佔據兩行的高度 */
  z-index: 3; /* 確保它在最上層 */
}

.takeoff-action-bar {
  grid-column: 2 / -1; /* 讓按鈕區塊從第二欄開始，橫跨到最後一欄 */
  grid-row: 1; /* 定位在第一行 */
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid #ddd;
  background-color: #f8f9fa;
  border-right: 1px solid #ddd;
}

/* 夜班收針表格的組別標題不需要 sticky 定位 */
.late-takeoff-section .team-header-cell {
  position: relative;
  top: 0;
}

/* 移除按鈕樣式 */
.duplicate-shift-btn.remove {
  padding: 6px 12px;
  font-size: 0.9rem;
  font-weight: 500;
  border: 1px solid #dc3545;
  background-color: #f8d7da;
  color: #721c24;
}
.duplicate-shift-btn.remove:hover:not(:disabled) {
  background-color: #f5c6cb;
}

/* ================================== */
/* === 5. 行動版與媒體查詢 === */
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
.mobile-shift-section {
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 20px;
  background-color: #fff;
}
.mobile-shift-title {
  background-color: #e3f2fd;
  color: #005a9c;
  font-size: 1.5em;
  padding: 12px;
  margin: 0;
  border-bottom: 1px solid #ddd;
  border-radius: 8px 8px 0 0;
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
.fab-mobile {
  display: flex;
  align-items: center;
  justify-content: center;
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
  .header-toolbar,
  .toolbar-left,
  .toolbar-right {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .page-title {
    text-align: center;
  }
  .date-navigator {
    justify-content: space-around;
    flex-wrap: wrap;
  }
  .date-navigator > button {
    margin: 4px 0;
  }
  .current-date-text,
  .weekday-display {
    font-size: 22px;
  }
  .duty-command-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .duty-dropdown-menu {
    width: calc(100vw - 40px);
  }
  .duty-item {
    grid-template-columns: 100px 1fr;
  }
}
</style>
