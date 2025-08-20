<!-- 檔案路徑: src/views/StatsView.vue (行動版唯讀優化) -->
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
          <button @click="changeDate(-1)" class="date-nav-btn">< 上一天</button>
          <span class="current-date-text">{{ formatDate(currentDate) }}</span>
          <span class="weekday-display">{{ weekdayDisplay }}</span>
          <button @click="changeDate(1)" class="date-nav-btn">下一天 ></button>
          <button @click="goToToday">回到今日</button>
        </div>
      </div>
      <div class="toolbar-right">
        <span class="status-indicator">{{ statusIndicator }}</span>
        <!-- ✨ 修改點 #1: 加上 .desktop-only-flex 讓按鈕在行動版隱藏 -->
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

    <!-- ... duty-command-bar 維持不變 ... -->
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

    <!-- 桌面版專用視圖 -->
    <div class="stats-sections-wrapper desktop-only">
      <!-- ... 桌面版內容不變 ... -->
      <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
        <div class="grid-container">
          <!-- ... 桌面版早班 grid ... -->
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
      <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
        <div class="grid-container">
          <!-- ... 桌面版晚班 grid ... -->
          <div class="grid-header">
            <div class="row-header section-title-cell">晚班</div>
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
    </div>

    <!-- 行動版專用視圖 -->
    <div class="mobile-only">
      <!-- 早班區塊 -->
      <div class="mobile-shift-section">
        <h2 class="mobile-shift-title">早班</h2>
        <div
          v-for="(teamData, teamName) in effectiveStatsData.early"
          :key="teamName"
          class="mobile-team-card"
        >
          <div class="mobile-team-header">
            <h3>{{ teamName.replace('早', '') }}組</h3>
            <!-- ✨ 修改點 #2: 為 select 加上 :disabled="true" -->
            <select :value="teamData.nurseName" class="name-select" :disabled="true">
              <option value="">-- 未指派 --</option>
              <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <div class="mobile-patient-lists">
            <!-- 早班病人 -->
            <div v-if="teamData.earlyShift.patients.length > 0" class="mobile-patient-list">
              <h4>早班</h4>
              <div
                v-for="patient in teamData.earlyShift.patients"
                :key="patient.shiftId"
                :class="patient.classes"
              >
                <!-- ✨ 修改點 #3: 移除 patient-main-info 的 @click 事件 -->
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
            <!-- 午班上針 -->
            <div v-if="teamData.noonShiftOn.patients.length > 0" class="mobile-patient-list">
              <h4>午班 (上針)</h4>
              <div
                v-for="patient in teamData.noonShiftOn.patients"
                :key="patient.shiftId"
                :class="patient.classes"
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
            <!-- 午班收針 -->
            <div v-if="teamData.noonShiftOff.patients.length > 0" class="mobile-patient-list">
              <h4>午班 (收針)</h4>
              <div
                v-for="patient in teamData.noonShiftOff.patients"
                :key="patient.shiftId"
                :class="patient.classes"
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

      <!-- 晚班區塊 -->
      <div class="mobile-shift-section">
        <h2 class="mobile-shift-title">晚班</h2>
        <div
          v-for="(teamData, teamName) in effectiveStatsData.late"
          :key="teamName"
          class="mobile-team-card"
        >
          <div class="mobile-team-header">
            <h3>{{ teamName.replace('晚', '') }}組</h3>
            <select :value="teamData.nurseName" class="name-select" :disabled="true">
              <option value="">-- 未指派 --</option>
              <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <div class="mobile-patient-lists">
            <!-- 午班收針 -->
            <div v-if="teamData.noonShiftOff.patients.length > 0" class="mobile-patient-list">
              <h4>午班 (收針)</h4>
              <div
                v-for="patient in teamData.noonShiftOff.patients"
                :key="patient.shiftId"
                :class="patient.classes"
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
            <!-- 晚班病人 -->
            <div v-if="teamData.lateShift.patients.length > 0" class="mobile-patient-list">
              <h4>晚班</h4>
              <div
                v-for="patient in teamData.lateShift.patients"
                :key="patient.shiftId"
                :class="patient.classes"
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
    </div>

    <!-- Dialogs -->
    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
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

// ✨ --- 核心修改 #1: 引入 Pinia Store --- ✨
import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

// ✨ --- 核心修改 #2: 實例化 Store 並獲取響應式狀態 --- ✨
const patientStore = usePatientStore()
const { patientMap } = storeToRefs(patientStore)

const schedulesApi = ApiManager('schedules')
const memosApi = ApiManager('memos')
const ordersHistoryApi = ApiManager('dialysis_orders_history')

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
const isFireDutyDropdownVisible = ref(false)

const currentDate = ref(new Date())
// allPatients 和 patientMap 已由 Pinia 提供
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

const { createGlobalNotification } = useGlobalNotifier()
const auth = useAuth()
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentDay = new Date(currentDate.value)
  currentDay.setHours(0, 0, 0, 0)
  return currentDay < today
})

const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
    .getDate()
    .toString()
    .padStart(2, '0')}`
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

function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter((memo) => memo.patientId === patientId)
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}

const weekdayDisplay = computed(() => {
  if (!currentDate.value) return ''
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(currentDate.value).getDay()]
})

const effectiveStatsData = computed(() => {
  const createTeamStats = (teams, names) => {
    const stats = {}
    teams.forEach((team) => {
      stats[team] = {
        nurseName: currentTeamsRecord.value.names?.[team] || '',
        totalOpdCount: 0,
        totalIpdCount: 0,
        totalErCount: 0,
      }
    })
    return stats
  }

  const earlyShiftStats = createTeamStats(earlyTeams, currentTeamsRecord.value.names)
  earlyTeams.forEach((team) => {
    earlyShiftStats[team] = {
      ...earlyShiftStats[team],
      earlyShift: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      noonShiftOn: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      noonShiftOff: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
    }
  })

  const lateShiftStats = createTeamStats(lateTeams, currentTeamsRecord.value.names)
  lateTeams.forEach((team) => {
    lateShiftStats[team] = {
      ...lateShiftStats[team],
      noonShiftOff: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      lateShift: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
    }
  })

  if (!currentRecord.schedule || patientMap.value.size === 0) {
    return { early: earlyShiftStats, late: lateShiftStats }
  }

  for (const shiftId in currentRecord.schedule) {
    const shiftDetails = currentRecord.schedule[shiftId]
    if (!shiftDetails || !shiftDetails.patientId) continue

    const patient = patientMap.value.get(shiftDetails.patientId)
    if (!patient) continue

    const { patientId, autoNote, manualNote, nurseTeam, nurseTeamIn, nurseTeamOut } = shiftDetails

    const autoTags = (autoNote || '').split(' ').filter(Boolean)
    const manualTags = (manualNote || '').split(' ').filter(Boolean)
    const finalTags = [...new Set([...autoTags, ...manualTags])]
      .filter((tag) => !['住', '急'].includes(tag))
      .join(' ')

    const detail = {
      id: patientId,
      shiftId,
      name: patient.name,
      status: patient.status,
      mode: patient.mode,
      wardNumber: patient.wardNumber || '',
      dialysisBed: shiftId.startsWith('peripheral') ? '外圍' : shiftId.split('-')[1] || '',
      finalTags: finalTags,
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
    if (shiftCode === SHIFT_CODES.EARLY && nurseTeam && earlyShiftStats[nurseTeam])
      assignAndCount(earlyShiftStats[nurseTeam].earlyShift, detail)
    else if (shiftCode === SHIFT_CODES.LATE && nurseTeam && lateShiftStats[nurseTeam])
      assignAndCount(lateShiftStats[nurseTeam].lateShift, detail)
    else if (shiftCode === SHIFT_CODES.NOON) {
      if (nurseTeamIn && earlyShiftStats[nurseTeamIn])
        assignAndCount(earlyShiftStats[nurseTeamIn].noonShiftOn, detail)
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

  for (const team in earlyShiftStats) {
    Object.values(earlyShiftStats[team]).forEach((group) => group.patients?.sort(sortPatientsByBed))
    const teamData = earlyShiftStats[team]
    teamData.totalOpdCount =
      (teamData.earlyShift.opdCount || 0) + (teamData.noonShiftOn.opdCount || 0)
    teamData.totalIpdCount =
      (teamData.earlyShift.ipdCount || 0) + (teamData.noonShiftOn.ipdCount || 0)
    teamData.totalErCount = (teamData.earlyShift.erCount || 0) + (teamData.noonShiftOn.erCount || 0)
  }
  for (const team in lateShiftStats) {
    Object.values(lateShiftStats[team]).forEach((group) => group.patients?.sort(sortPatientsByBed))
    const teamData = lateShiftStats[team]
    teamData.totalOpdCount = teamData.lateShift.opdCount || 0
    teamData.totalIpdCount = teamData.lateShift.ipdCount || 0
    teamData.totalErCount = teamData.lateShift.erCount || 0
  }
  return { early: earlyShiftStats, late: lateShiftStats }
})

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

// ✨ 核心修改 #3: 改造 loadData，使其依賴 Pinia Store
async function loadData(date) {
  hasUnsavedScheduleChanges.value = false
  hasUnsavedTeamChanges.value = false
  statusIndicator.value = '讀取中...'
  isLoading.value = true
  const dateStr = formatDate(date)
  try {
    // 1. 確保 Pinia Store 中的病人數據已載入
    await patientStore.fetchPatientsIfNeeded()

    // 2. 並行獲取當天的排程、護理分組和備忘錄數據
    const [dailyRecords, teamsData, memosData] = await Promise.all([
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
      fetchTeamsByDate(dateStr),
      memosApi.fetchAll([where('status', '==', 'pending')]),
    ])

    activeMemos.value = memosData

    // 處理排程數據
    const scheduleRecord =
      dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }
    Object.assign(currentRecord, scheduleRecord)

    // 處理護理分組數據
    currentTeamsRecord.value = teamsData || { id: null, date: dateStr, teams: {}, names: {} }

    // ✨ 核心修改 #4: 醫囑獲取現在是一個獨立的步驟
    // 我們只為當天有排班的病人獲取醫囑
    const patientIdsInSchedule = Object.values(currentRecord.schedule)
      .map((slot) => slot.patientId)
      .filter(Boolean)

    if (patientIdsInSchedule.length > 0) {
      const patientsOnSchedule = patientStore.allPatients.filter((p) =>
        patientIdsInSchedule.includes(p.id),
      )
      const patientsWithOrdersPromises = patientsOnSchedule.map(async (patient) => {
        const orders = await getEffectiveOrdersForDate(patient.id, date)
        // 直接更新 Store 中的數據
        const patientInStore = patientMap.value.get(patient.id)
        if (patientInStore) {
          patientInStore.dialysisOrders = orders
        }
      })
      await Promise.all(patientsWithOrdersPromises)
    }

    // 組合最終數據
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
    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '變更儲存成功！'
    isAlertDialogVisible.value = true
    await loadData(currentDate.value)
  } catch (error) {
    console.error('儲存變更失敗:', error)
    statusIndicator.value = '儲存失敗'
    alertDialogTitle.value = '儲存失敗'
    alertDialogMessage.value = `儲存失敗: ${error.message}`
    isAlertDialogVisible.value = true
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
      : newResponsibility === 'lateShift'
        ? SHIFT_CODES.LATE
        : SHIFT_CODES.NOON
  if (newShiftCode !== oldShiftCode) {
    pendingChangeInfo.value = { patientDetail, newTeam, newResponsibility }
    bedChangeTargetShift.value = newShiftCode
    openBedChangeDialog(patientDetail)
  } else {
    performTeamChange(patientDetail, newTeam, newResponsibility)
  }
}

function performTeamChange(patientDetail, newTeam, newResponsibility) {
  const patientId = patientDetail.id
  const shiftId = patientDetail.shiftId
  const shiftCode = shiftId.split('-')[2]
  const teamKey = `${patientId}-${shiftCode}`
  if (!currentTeamsRecord.value.teams[teamKey]) {
    currentTeamsRecord.value.teams[teamKey] = {}
  }
  const teamInfo = currentTeamsRecord.value.teams[teamKey]
  const slotInfo = currentRecord.schedule[shiftId]
  if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
    teamInfo.nurseTeam = newTeam
    slotInfo.nurseTeam = newTeam
  } else if (newResponsibility === 'noonShiftOn') {
    teamInfo.nurseTeamIn = newTeam
    slotInfo.nurseTeamIn = newTeam
  } else if (newResponsibility === 'noonShiftOff') {
    teamInfo.nurseTeamOut = newTeam
    slotInfo.nurseTeamOut = newTeam
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
  event.dataTransfer.setData('text/plain', responsibility)
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
  const movingSlotData = { ...currentRecord.schedule[oldShiftId] }
  delete currentRecord.schedule[oldShiftId]
  currentRecord.schedule[newShiftId] = movingSlotData
  setScheduleChange()
  if (pendingChangeInfo.value) {
    const { patientDetail, newTeam, newResponsibility } = pendingChangeInfo.value
    const patientId = patientDetail.id
    const oldShiftCode = oldShiftId.split('-')[2]
    const oldTeamKey = `${patientId}-${oldShiftCode}`
    if (currentTeamsRecord.value.teams[oldTeamKey]) {
      if (patientDetail.sourceResponsibility === 'earlyShift')
        delete currentTeamsRecord.value.teams[oldTeamKey].nurseTeam
      if (patientDetail.sourceResponsibility === 'lateShift')
        delete currentTeamsRecord.value.teams[oldTeamKey].nurseTeam
      if (patientDetail.sourceResponsibility === 'noonShiftOn')
        delete currentTeamsRecord.value.teams[oldTeamKey].nurseTeamIn
      if (patientDetail.sourceResponsibility === 'noonShiftOff')
        delete currentTeamsRecord.value.teams[oldTeamKey].nurseTeamOut
      if (Object.keys(currentTeamsRecord.value.teams[oldTeamKey]).length === 0) {
        delete currentTeamsRecord.value.teams[oldTeamKey]
      }
    }
    const newShiftCode = newShiftId.split('-')[2]
    const newTeamKey = `${patientId}-${newShiftCode}`
    if (!currentTeamsRecord.value.teams[newTeamKey]) {
      currentTeamsRecord.value.teams[newTeamKey] = {}
    }
    if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
      currentTeamsRecord.value.teams[newTeamKey].nurseTeam = newTeam
    } else if (newResponsibility === 'noonShiftOn') {
      currentTeamsRecord.value.teams[newTeamKey].nurseTeamIn = newTeam
    } else if (newResponsibility === 'noonShiftOff') {
      currentTeamsRecord.value.teams[newTeamKey].nurseTeamOut = newTeam
    }
    setTeamChange()
  }
  isBedChangeDialogVisible.value = false
  pendingChangeInfo.value = null
  bedChangeTargetShift.value = null
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

function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  event.currentTarget.classList.add('drag-over-active')
}

function onDragLeave(event) {
  event.currentTarget.classList.remove('drag-over-active')
}

function handleDialogCancel() {
  isBedChangeDialogVisible.value = false
  pendingChangeInfo.value = null
  bedChangeTargetShift.value = null
}

function triggerPrint() {
  window.print()
}

onMounted(() => {
  // ✨ 核心修改 #5: onMounted 邏輯簡化
  loadData(currentDate.value)
})

watch(currentDate, (newDate) => {
  loadData(newDate)
})
</script>

<style scoped>
/* ================================== */
/* === 1. 基本樣式 (與原版相同) === */
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
.toolbar-right button {
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
}
#save-changes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
/* ... 省略其他按鈕樣式 ... */

/* ================================== */
/* === 2. 桌面版 Grid 樣式 (微調) === */
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
/* ... 省略大部分 grid 樣式，它們在原檔案中已存在 ... */
.grid-header,
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
.grid-container div:nth-child(13n) {
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
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
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
/* ... 省略 duty command bar 和其他既有樣式 ... */
.duty-command-bar {
  background-color: #fffbeb;
  border: 1px solid #fef3c7;
  padding: 4px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.main-commanders {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.duty-title {
  font-weight: 600;
  font-size: 1.1em;
  color: #b45309;
}
.duty-role-tag {
  font-size: 0.85em;
  font-weight: 600;
  padding: 3px 8px;
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
  margin-left: -4px;
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
/* === 3. ✨ 行動版與唯讀樣式 ✨ === */
/* ================================== */

/* 預設隱藏行動版，顯示桌面版 */
.mobile-only {
  display: none;
}
.desktop-only {
  display: block;
}
/* ✨ 新增: 為了能讓 flex item 也被隱藏 */
.desktop-only-flex {
  display: flex;
}

/* 行動版總體佈局 */
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

/* ✨ 新增: 行動版唯讀狀態下的樣式 */
.mobile-only .name-select:disabled {
  background-color: #f5f5f5;
  border-color: #ddd;
  color: #555;
  -webkit-appearance: none;
  appearance: none;
  cursor: default;
}
.mobile-only .patient-main-info {
  cursor: default; /* 移除點擊換床的指標 */
}

/* 媒體查詢：當螢幕寬度小於 992px 時啟用 */
@media screen and (max-width: 992px) {
  /* 切換顯示/隱藏 */
  .desktop-only,
  .desktop-only-flex {
    display: none !important;
  }
  .mobile-only {
    display: block !important;
  }

  /* 調整頁首 */
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
  }
  .current-date-text,
  .weekday-display {
    font-size: 22px;
  }

  /* 調整消防編組列 */
  .duty-command-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .duty-dropdown-menu {
    width: calc(100vw - 40px); /* 讓下拉選單寬度符合螢幕 */
  }
  .duty-item {
    grid-template-columns: 100px 1fr; /* 調整下拉選單內項目寬度 */
  }
}
</style>
