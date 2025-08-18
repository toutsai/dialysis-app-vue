<!-- 檔案路徑: src/views/CollaborationView.vue (最終完整版) -->
<template>
  <div class="page-container collaboration-view">
    <header class="page-header">
      <div class="header-content">
        <h1>訊息中心</h1>
        <p class="date-display">顯示日期: {{ displayDate }} ({{ weekdayDisplay }})</p>
      </div>
      <div class="header-actions desktop-only">
        <button class="btn btn-primary" :disabled="isPageLocked" @click="openCreateModal">
          <i class="fas fa-plus"></i> 新增交辦/留言
        </button>
      </div>
    </header>

    <!-- ================== -->
    <!--    桌面版容器      -->
    <!-- ================== -->
    <div class="collaboration-container desktop-only">
      <!-- 左欄 -->
      <div class="patient-list-panel" v-show="activeMobileTab === 'patients'">
        <!-- ✨ 核心修改 #4: 新增頁籤導覽 (僅在非護理師情況下顯示) -->
        <div v-if="userTitle !== '護理師'" class="left-panel-tabs">
          <button
            :class="{ active: leftPanelActiveTab === 'all' }"
            @click="leftPanelActiveTab = 'all'"
          >
            全部
          </button>
          <button
            :class="{ active: leftPanelActiveTab === 'early' }"
            @click="leftPanelActiveTab = 'early'"
          >
            早班
          </button>
          <button
            :class="{ active: leftPanelActiveTab === 'noon' }"
            @click="leftPanelActiveTab = 'noon'"
          >
            午班
          </button>
          <button
            :class="{ active: leftPanelActiveTab === 'late' }"
            @click="leftPanelActiveTab = 'late'"
          >
            晚班
          </button>
        </div>

        <div v-if="isLoading.patients" class="panel-loading">
          <div class="loading-spinner"></div>
          <span>載入病人列表...</span>
        </div>
        <!-- ✨ 核心修改 #5: v-for 的目標改為 filteredPatients -->
        <div v-else class="patient-list-scroll-area">
          <div
            v-for="(shiftPatients, shiftName) in groupedPatients"
            :key="shiftName"
            class="shift-group"
          >
            <h3 class="shift-title">{{ shiftName }} ({{ shiftPatients.length }}人)</h3>
            <ul class="patient-list">
              <li
                v-for="patient in shiftPatients"
                :key="patient.id"
                class="patient-item"
                :class="{ active: selectedPatient?.id === patient.id }"
                @click="selectPatient(patient)"
              >
                <div class="patient-info">
                  <span class="patient-bed">{{
                    patient.bed > 999 ? `外${patient.bed - 1000}` : patient.bed
                  }}</span>
                  <span class="patient-name">{{ patient.name }}</span>
                </div>
                <span class="patient-mrn">{{ patient.medicalRecordNumber }}</span>
              </li>
            </ul>
          </div>
          <div v-if="patientsForList.length === 0" class="panel-empty">
            <p>今日您沒有負責的病人，或當天無排班資料。</p>
          </div>
        </div>
      </div>

      <!-- 中欄 -->
      <div class="message-panel">
        <div class="message-section patient-messages">
          <h2 class="panel-title">
            <i class="fas fa-user"></i>
            {{ selectedPatient ? `與 ${selectedPatient.name} 相關的留言` : '病人相關留言' }}
          </h2>
          <div v-if="isLoading.messages" class="panel-loading small">
            <div class="loading-spinner"></div>
          </div>
          <ul v-else-if="sortedSelectedPatientMessages.length > 0" class="message-list">
            <li
              v-for="msg in sortedSelectedPatientMessages"
              :key="msg.id"
              class="message-item"
              :class="{ 'is-completed': msg.status === 'completed' }"
            >
              <p class="item-content">{{ msg.content }}</p>
              <div class="item-footer">
                <small class="creator-info"
                  ><i class="fas fa-user-edit"></i> {{ msg.creator.name }} at
                  {{ formatTimestamp(msg.createdAt) }}</small
                >
                <div v-if="msg.status === 'pending'" class="item-actions">
                  <button
                    class="btn-action btn-complete"
                    @click="updateTaskStatus(msg.id, 'completed')"
                  >
                    <i class="fas fa-check"></i> 已讀
                  </button>
                </div>
                <div v-else class="completed-info">
                  <i class="fas fa-check-double"></i> 由 {{ msg.resolvedBy?.name }} 於
                  {{ formatTimestamp(msg.resolvedAt) }} 標示
                </div>
              </div>
            </li>
          </ul>
          <div v-else class="panel-empty small">
            <p>
              <i class="fas fa-inbox"></i>
              {{ selectedPatient ? '此病人尚無留言' : '請先從左側選擇病人' }}
            </p>
          </div>
        </div>
        <div class="message-section feed-messages">
          <h2 class="panel-title"><i class="fas fa-stream"></i> 我的病人資訊流</h2>
          <div v-if="isLoading.messages" class="panel-loading small">
            <div class="loading-spinner"></div>
          </div>
          <ul v-else-if="sortedFeedMessages.length > 0" class="message-list">
            <li
              v-for="msg in sortedFeedMessages"
              :key="msg.id"
              class="message-item"
              :class="{ 'is-completed': msg.status === 'completed' }"
            >
              <p class="item-content">
                <strong>{{ msg.patientName }}:</strong> {{ msg.content }}
              </p>
              <div class="item-footer">
                <small class="creator-info"
                  ><i class="fas fa-user-edit"></i> {{ msg.creator.name }} at
                  {{ formatTimestamp(msg.createdAt) }}</small
                >
                <div v-if="msg.status === 'pending'" class="item-actions">
                  <button
                    class="btn-action btn-complete"
                    @click="updateTaskStatus(msg.id, 'completed')"
                  >
                    <i class="fas fa-check"></i> 已讀
                  </button>
                </div>
                <div v-else class="completed-info">
                  <i class="fas fa-check-double"></i> 由 {{ msg.resolvedBy?.name }} 於
                  {{ formatTimestamp(msg.resolvedAt) }} 標示
                </div>
              </div>
            </li>
          </ul>
          <div v-else class="panel-empty small">
            <p><i class="fas fa-inbox"></i> 您的病人資訊流中沒有新留言</p>
          </div>
        </div>
      </div>

      <!-- 右欄 -->
      <div class="task-panel">
        <div class="task-section inbox-tasks">
          <h2 class="panel-title"><i class="fas fa-inbox"></i> 收件匣(交辦事項 to me)</h2>
          <div v-if="isLoading.tasks" class="panel-loading small">
            <div class="loading-spinner"></div>
          </div>
          <ul v-else-if="sortedMyTasks.length > 0" class="task-list">
            <li
              v-for="task in sortedMyTasks"
              :key="task.id"
              class="task-item"
              :class="{ 'is-completed': task.status === 'completed' }"
            >
              <p class="item-content">
                <strong
                  >{{ task.patientName }}
                  <span v-if="patientMap.get(task.patientId)" class="task-patient-mrn"
                    >({{ patientMap.get(task.patientId).medicalRecordNumber }})</span
                  >:</strong
                >
                {{ task.content }}
              </p>
              <div class="item-footer">
                <small class="creator-info"
                  ><i class="fas fa-user-edit"></i> from {{ task.creator.name }} at
                  {{ formatTimestamp(task.createdAt) }}</small
                >
                <div v-if="task.status === 'pending'" class="item-actions">
                  <button
                    class="btn-action btn-complete-task"
                    @click="updateTaskStatus(task.id, 'completed')"
                  >
                    <i class="fas fa-check"></i> 完成
                  </button>
                </div>
                <div v-else class="completed-info task">
                  <i class="fas fa-check-double"></i> 由 {{ task.resolvedBy?.name }} 於
                  {{ formatTimestamp(task.resolvedAt) }} 完成
                </div>
              </div>
            </li>
          </ul>
          <div v-else class="panel-empty small">
            <p><i class="fas fa-check-circle"></i> 沒有待處理的交辦事項</p>
          </div>
        </div>
        <div class="task-section sent-tasks">
          <h2 class="panel-title"><i class="fas fa-paper-plane"></i> 寄件匣(我的追蹤事項)</h2>
          <div v-if="isLoading.sentTasks" class="panel-loading small">
            <div class="loading-spinner"></div>
          </div>
          <ul v-else-if="mySentTasks.length > 0" class="task-list">
            <li v-for="task in mySentTasks" :key="task.id" class="task-item sent">
              <p class="item-content">
                <strong>To {{ getAssigneeName(task.assignee) }}:</strong> {{ task.content }}
              </p>
              <div class="item-footer">
                <small class="creator-info"
                  ><i class="fas fa-user"></i> patient: {{ task.patientName || 'N/A' }}</small
                >
                <div class="item-actions">
                  <span class="sent-status"><i class="far fa-clock"></i> 處理中...</span>
                </div>
              </div>
            </li>
          </ul>
          <div v-else class="panel-empty small">
            <p><i class="fas fa-check-circle"></i> 沒有追蹤中的事項</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ================== -->
    <!--    行動版容器      -->
    <!-- ================== -->
    <div class="mobile-container mobile-only">
      <div class="mobile-tabs">
        <button
          class="mobile-tab-btn"
          :class="{ active: activeMobileTab === 'patients' }"
          @click="activeMobileTab = 'patients'"
        >
          <i class="fas fa-user-friends"></i> 我的病人
        </button>
        <button
          class="mobile-tab-btn"
          :class="{ active: activeMobileTab === 'messages' }"
          @click="activeMobileTab = 'messages'"
        >
          <i class="fas fa-comment-dots"></i> 病人訊息
        </button>
        <button
          class="mobile-tab-btn"
          :class="{ active: activeMobileTab === 'tasks' }"
          @click="activeMobileTab = 'tasks'"
        >
          <i class="fas fa-clipboard-list"></i> 交辦事項
        </button>
      </div>

      <div class="mobile-content-area">
        <div v-show="activeMobileTab === 'patients'" class="patient-list-panel">
          <div v-if="isLoading.patients" class="panel-loading">
            <div class="loading-spinner"></div>
            <span>載入病人列表...</span>
          </div>
          <div v-else>
            <div
              v-for="(shiftPatients, shiftName) in groupedPatients"
              :key="shiftName"
              class="shift-group"
            >
              <h3 class="shift-title">{{ shiftName }} ({{ shiftPatients.length }}人)</h3>
              <ul class="patient-list">
                <li
                  v-for="patient in shiftPatients"
                  :key="patient.id"
                  class="patient-item"
                  :class="{ active: selectedPatient?.id === patient.id }"
                  @click="selectPatient(patient)"
                >
                  <span class="patient-name">{{ patient.name }}</span>
                  <span class="patient-mrn">{{ patient.medicalRecordNumber }}</span>
                </li>
              </ul>
            </div>
            <div v-if="patientsForList.length === 0" class="panel-empty">
              <p>今日您沒有負責的病人，或當天無排班資料。</p>
            </div>
          </div>
        </div>
        <div v-show="activeMobileTab === 'messages'" class="message-panel">
          <div class="message-section patient-messages">
            <h2 class="panel-title">
              <i class="fas fa-user"></i>
              {{ selectedPatient ? `與 ${selectedPatient.name} 相關的留言` : '病人相關留言' }}
            </h2>
            <div v-if="isLoading.messages" class="panel-loading small">
              <div class="loading-spinner"></div>
            </div>
            <ul v-else-if="sortedSelectedPatientMessages.length > 0" class="message-list">
              <li
                v-for="msg in sortedSelectedPatientMessages"
                :key="msg.id"
                class="message-item"
                :class="{ 'is-completed': msg.status === 'completed' }"
              >
                <p class="item-content">{{ msg.content }}</p>
                <div class="item-footer">
                  <small class="creator-info"
                    ><i class="fas fa-user-edit"></i> {{ msg.creator.name }} at
                    {{ formatTimestamp(msg.createdAt) }}</small
                  >
                  <div v-if="msg.status === 'pending'" class="item-actions">
                    <button
                      class="btn-action btn-complete"
                      @click="updateTaskStatus(msg.id, 'completed')"
                    >
                      <i class="fas fa-check"></i> 已讀
                    </button>
                  </div>
                  <div v-else class="completed-info">
                    <i class="fas fa-check-double"></i> 由 {{ msg.resolvedBy?.name }} 於
                    {{ formatTimestamp(msg.resolvedAt) }} 標示
                  </div>
                </div>
              </li>
            </ul>
            <div v-else class="panel-empty small">
              <p>
                <i class="fas fa-inbox"></i>
                {{ selectedPatient ? '此病人尚無留言' : '請先從左側選擇病人' }}
              </p>
            </div>
          </div>
          <div class="message-section feed-messages">
            <h2 class="panel-title"><i class="fas fa-stream"></i> 我的病人資訊流</h2>
            <div v-if="isLoading.messages" class="panel-loading small">
              <div class="loading-spinner"></div>
            </div>
            <ul v-else-if="sortedFeedMessages.length > 0" class="message-list">
              <li
                v-for="msg in sortedFeedMessages"
                :key="msg.id"
                class="message-item"
                :class="{ 'is-completed': msg.status === 'completed' }"
              >
                <p class="item-content">
                  <strong>{{ msg.patientName }}:</strong> {{ msg.content }}
                </p>
                <div class="item-footer">
                  <small class="creator-info"
                    ><i class="fas fa-user-edit"></i> {{ msg.creator.name }} at
                    {{ formatTimestamp(msg.createdAt) }}</small
                  >
                  <div v-if="msg.status === 'pending'" class="item-actions">
                    <button
                      class="btn-action btn-complete"
                      @click="updateTaskStatus(msg.id, 'completed')"
                    >
                      <i class="fas fa-check"></i> 已讀
                    </button>
                  </div>
                  <div v-else class="completed-info">
                    <i class="fas fa-check-double"></i> 由 {{ msg.resolvedBy?.name }} 於
                    {{ formatTimestamp(msg.resolvedAt) }} 標示
                  </div>
                </div>
              </li>
            </ul>
            <div v-else class="panel-empty small">
              <p><i class="fas fa-inbox"></i> 您的病人資訊流中沒有新留言</p>
            </div>
          </div>
        </div>
        <div v-show="activeMobileTab === 'tasks'" class="task-panel">
          <div class="task-section inbox-tasks">
            <h2 class="panel-title"><i class="fas fa-inbox"></i> 我的交辦事項 (收件匣)</h2>
            <div v-if="isLoading.tasks" class="panel-loading small">
              <div class="loading-spinner"></div>
            </div>
            <ul v-else-if="sortedMyTasks.length > 0" class="task-list">
              <li
                v-for="task in sortedMyTasks"
                :key="task.id"
                class="task-item"
                :class="{ 'is-completed': task.status === 'completed' }"
              >
                <p class="item-content">
                  <strong>{{ task.patientName || '無關聯病人' }}:</strong>
                  {{ task.content }}
                </p>
                <div class="item-footer">
                  <small class="creator-info"
                    ><i class="fas fa-user-edit"></i> from {{ task.creator.name }} at
                    {{ formatTimestamp(task.createdAt) }}</small
                  >
                  <div v-if="task.status === 'pending'" class="item-actions">
                    <button
                      class="btn-action btn-complete-task"
                      @click="updateTaskStatus(task.id, 'completed')"
                    >
                      <i class="fas fa-check"></i> 完成
                    </button>
                  </div>
                  <div v-else class="completed-info task">
                    <i class="fas fa-check-double"></i> 由 {{ task.resolvedBy?.name }} 於
                    {{ formatTimestamp(task.resolvedAt) }} 完成
                  </div>
                </div>
              </li>
            </ul>
            <div v-else class="panel-empty small">
              <p><i class="fas fa-check-circle"></i> 沒有待處理的交辦事項</p>
            </div>
          </div>
          <div class="task-section sent-tasks">
            <h2 class="panel-title"><i class="fas fa-paper-plane"></i> 我的追蹤事項 (寄件匣)</h2>
            <div v-if="isLoading.sentTasks" class="panel-loading small">
              <div class="loading-spinner"></div>
            </div>
            <ul v-else-if="mySentTasks.length > 0" class="task-list">
              <li v-for="task in mySentTasks" :key="task.id" class="task-item sent">
                <p class="item-content">
                  <strong>To {{ getAssigneeName(task.assignee) }}:</strong> {{ task.content }}
                </p>
                <div class="item-footer">
                  <small class="creator-info"
                    ><i class="fas fa-user"></i> patient: {{ task.patientName || 'N/A' }}</small
                  >
                  <div class="item-actions">
                    <span class="sent-status"><i class="far fa-clock"></i> 處理中...</span>
                  </div>
                </div>
              </li>
            </ul>
            <div v-else class="panel-empty small">
              <p><i class="fas fa-check-circle"></i> 沒有追蹤中的事項</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <TaskCreateDialog
      :is-visible="isCreateModalVisible"
      :all-patients="patientsForList"
      :preselected-patient="selectedPatient"
      @close="isCreateModalVisible = false"
      @submit="handleTaskCreated"
    />

    <button class="fab-mobile mobile-only" @click="openCreateModal" :disabled="isPageLocked">
      <i class="fas fa-plus"></i>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import {
  collection,
  query,
  where,
  onSnapshot,
  documentId,
  orderBy,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/composables/useFirebase'
import { queryWithInChunks } from '@/utils/firestoreUtils.js'
import ApiManager from '@/services/api_manager.js'
import TaskCreateDialog from '@/components/TaskCreateDialog.vue'

// --- Hooks ---
const route = useRoute()
const { currentUser, isPageLocked, hasPermission } = useAuth()
const userTitle = computed(() => currentUser.value?.title)
const userRole = computed(() => currentUser.value?.role)

// --- API & Services ---
const schedulesApi = ApiManager('schedules')
const assignmentsApi = ApiManager('nurse_assignments')

// --- State ---
const isLoading = ref({ patients: true, messages: true, tasks: true, sentTasks: true })
const patientsForList = ref([])
const selectedPatient = ref(null)
const myTasks = ref([])
const mySentTasks = ref([])
const allMessages = ref([])
const isCreateModalVisible = ref(false)
const allPatients = ref([]) // 儲存所有病人資料的快取
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))

// ✨ 核心修改 #1: 新增左欄頁籤狀態
const leftPanelActiveTab = ref('all') // 'all', 'early', 'noon', 'late'

let taskUnsubscribe = null
let sentTaskUnsubscribe = null
let messageUnsubscribe = null
const activeMobileTab = ref('patients')

// --- Computed Properties ---
const displayDate = computed(() => route.query.date || new Date().toISOString().slice(0, 10))
const weekdayDisplay = computed(() => {
  try {
    const date = new Date(displayDate.value)
    return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  } catch {
    return ''
  }
})

// ✨ 核心修改 #2: 重構 groupedPatients 來支援頁籤篩選
const filteredPatients = computed(() => {
  if (leftPanelActiveTab.value === 'all') {
    return patientsForList.value
  }
  return patientsForList.value.filter((p) => p.shift === leftPanelActiveTab.value)
})

const groupedPatients = computed(() => {
  const groups = { 早班: [], 午班: [], 晚班: [] }
  // 使用 filteredPatients 進行分組
  for (const patient of filteredPatients.value) {
    if (patient.shift === 'early') groups.早班.push(patient)
    else if (patient.shift === 'noon') groups.午班.push(patient)
    else if (patient.shift === 'late') groups.晚班.push(patient)
  }
  // 如果是篩選模式，只保留對應的組別
  if (leftPanelActiveTab.value !== 'all') {
    if (leftPanelActiveTab.value !== 'early') delete groups.早班
    if (leftPanelActiveTab.value !== 'noon') delete groups.午班
    if (leftPanelActiveTab.value !== 'late') delete groups.晚班
  }

  // 移除空的組別
  if (groups.早班.length === 0) delete groups.早班
  if (groups.午班.length === 0) delete groups.午班
  if (groups.晚班.length === 0) delete groups.晚班
  return groups
})

// ... 其餘 computed properties 保持不變 ...
const sortItems = (items) => {
  return [...items].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0)
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0)
    return dateB - dateA
  })
}
const sortedMyTasks = computed(() => sortItems(myTasks.value))
const sortedSelectedPatientMessages = computed(() => sortItems(selectedPatientMessages.value))
const sortedFeedMessages = computed(() => sortItems(feedMessages.value))
const selectedPatientMessages = computed(() => {
  if (!selectedPatient.value) return []
  return allMessages.value.filter((msg) => msg.patientId === selectedPatient.value.id)
})
const feedMessages = computed(() => {
  const myPatientIds = new Set(patientsForList.value.map((p) => p.id))
  return allMessages.value.filter((msg) => myPatientIds.has(msg.patientId))
})

// --- Methods ---

// ✨ 核心修改 #3: 修改 fetchMyPatients 來加入床號並排序
async function fetchMyPatients() {
  isLoading.value.patients = true
  patientsForList.value = []
  selectedPatient.value = null
  if (!userRole.value || !userTitle.value) {
    isLoading.value.patients = false
    return
  }

  try {
    const patientMap = new Map()
    const shouldSeeOnlyMyPatients = userRole.value === 'viewer' && userTitle.value === '護理師'
    const schedules = await schedulesApi.fetchAll([where('date', '==', displayDate.value)])
    if (schedules.length === 0) {
      isLoading.value.patients = false
      return
    }
    const scheduleData = schedules[0]?.schedule || {}

    // Helper function to extract bed number
    const getBedNumber = (shiftId) => {
      const parts = shiftId.split('-')
      if (parts[0] === 'peripheral') {
        return 1000 + parseInt(parts[1], 10) // 外圍床位排在後面
      }
      return parseInt(parts[1], 10)
    }

    if (shouldSeeOnlyMyPatients) {
      const assignments = await assignmentsApi.fetchAll([where('date', '==', displayDate.value)])
      if (assignments.length > 0) {
        const { names, teams } = assignments[0]
        if (names && teams) {
          for (const teamName in names) {
            if (names[teamName] === currentUser.value.name) {
              for (const key in teams) {
                const [patientId, shiftCode] = key.split('-')
                // 找到這個病人在當天排班的 shiftId 來取得床號
                const shiftId = Object.keys(scheduleData).find(
                  (sid) => scheduleData[sid].patientId === patientId && sid.endsWith(shiftCode),
                )
                if (shiftId) {
                  const teamAssignment = teams[key]
                  if (
                    teamAssignment.nurseTeam === teamName ||
                    teamAssignment.nurseTeamIn === teamName ||
                    teamAssignment.nurseTeamOut === teamName
                  ) {
                    if (!patientMap.has(patientId)) {
                      patientMap.set(patientId, {
                        id: patientId,
                        shift: shiftCode,
                        bed: getBedNumber(shiftId),
                      })
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else {
      for (const shiftId in scheduleData) {
        const slot = scheduleData[shiftId]
        if (slot?.patientId && !patientMap.has(slot.patientId)) {
          patientMap.set(slot.patientId, {
            id: slot.patientId,
            shift: shiftId.split('-').pop(),
            bed: getBedNumber(shiftId),
          })
        }
      }
    }

    if (patientMap.size > 0) {
      const idArray = Array.from(patientMap.keys())
      const patientDetails = await queryWithInChunks('patients', documentId(), idArray)

      patientsForList.value = patientDetails
        .map((p) => ({
          ...p,
          shift: patientMap.get(p.id)?.shift || 'unknown',
          bed: patientMap.get(p.id)?.bed || 9999,
        }))
        .sort((a, b) => {
          // 排序邏輯: 1. 班別 2. 床號
          const shiftOrder = { early: 1, noon: 2, late: 3 }
          if (a.shift !== b.shift) {
            return (shiftOrder[a.shift] || 99) - (shiftOrder[b.shift] || 99)
          }
          return a.bed - b.bed
        })
    }
  } catch (error) {
    console.error('獲取病人列表失敗:', error)
  } finally {
    isLoading.value.patients = false
  }
}

// ... 其餘所有 methods 保持不變 ...
function openCreateModal() {
  if (!currentUser.value) {
    return
  }
  const canPerformAction = hasPermission('viewer')
  if (!canPerformAction) {
    return
  }
  isCreateModalVisible.value = true
}
function formatTimestamp(ts) {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
const roleDisplayNames = {
  clerk: '書記',
  doctor: '醫師',
  np: '專科護理師',
  editor: '護理師組長',
  admin: '管理員',
}
function getAssigneeName(assignee) {
  if (!assignee) return '未知'
  if (assignee.type === 'role') {
    return roleDisplayNames[assignee.value] || assignee.value
  }
  return '特定使用者'
}
function listenToMyTasks() {
  if (taskUnsubscribe) taskUnsubscribe()
  isLoading.value.tasks = true
  if (!currentUser.value) {
    isLoading.value.tasks = false
    return
  }
  const myTargetAssigneeValues = []
  const titleToRoleValue = { 書記: 'clerk', 主治醫師: 'doctor', 專科護理師: 'np' }
  const titleBasedRole = titleToRoleValue[userTitle.value]
  if (titleBasedRole) myTargetAssigneeValues.push(titleBasedRole)
  if (userRole.value) myTargetAssigneeValues.push(userRole.value)
  const uniqueTargetValues = [...new Set(myTargetAssigneeValues)]
  if (uniqueTargetValues.length === 0) {
    myTasks.value = []
    isLoading.value.tasks = false
    return
  }
  const q = query(
    collection(db, 'tasks'),
    where('category', '==', 'task'),
    where('status', '==', 'pending'),
    where('assignee.type', '==', 'role'),
    where('assignee.value', 'in', uniqueTargetValues),
  )
  taskUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      myTasks.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      isLoading.value.tasks = false
    },
    (error) => {
      console.error('監聽交辦事項失敗:', error)
      isLoading.value.tasks = false
    },
  )
}
function listenToMySentTasks() {
  if (sentTaskUnsubscribe) sentTaskUnsubscribe()
  isLoading.value.sentTasks = true
  if (!currentUser.value) {
    isLoading.value.sentTasks = false
    return
  }
  const q = query(
    collection(db, 'tasks'),
    where('category', '==', 'task'),
    where('status', '==', 'pending'),
    where('creator.uid', '==', currentUser.value.uid),
    orderBy('createdAt', 'desc'),
  )
  sentTaskUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      mySentTasks.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      isLoading.value.sentTasks = false
    },
    (error) => {
      console.error('監聽寄件匣失敗:', error)
      isLoading.value.sentTasks = false
    },
  )
}
function listenToMessages() {
  if (messageUnsubscribe) messageUnsubscribe()
  isLoading.value.messages = true
  const q = query(
    collection(db, 'tasks'),
    where('category', '==', 'message'),
    where('status', '==', 'pending'),
    where('targetDate', '>=', displayDate.value),
    orderBy('targetDate', 'asc'),
    orderBy('createdAt', 'desc'),
  )
  messageUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      allMessages.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      isLoading.value.messages = false
    },
    (error) => {
      console.error('監聽留言失敗:', error)
      isLoading.value.messages = false
    },
  )
}
async function updateTaskStatus(taskId, newStatus) {
  if (!currentUser.value) return
  try {
    const taskRef = doc(db, 'tasks', taskId)
    await updateDoc(taskRef, {
      status: newStatus,
      resolvedBy: { uid: currentUser.value.uid, name: currentUser.value.name },
      resolvedAt: new Date(),
    })
  } catch (error) {
    console.error('更新任務狀態失敗:', error)
  }
}
function selectPatient(patient) {
  selectedPatient.value = patient
  if (window.innerWidth <= 992) {
    activeMobileTab.value = 'messages'
  }
}
function handleTaskCreated() {
  console.log('Task created successfully.')
}

onMounted(async () => {
  await useAuth().waitForAuthInit()
  await fetchAllPatientDataOnce()
  fetchMyPatients()
  listenToMyTasks()
  listenToMySentTasks()
  listenToMessages()
})
onUnmounted(() => {
  if (taskUnsubscribe) taskUnsubscribe()
  if (sentTaskUnsubscribe) sentTaskUnsubscribe()
  if (messageUnsubscribe) messageUnsubscribe()
})
watch(
  () => route.query.date,
  async (newDate, oldDate) => {
    if (newDate && newDate !== oldDate) {
      await fetchMyPatients()
      listenToMessages()
    }
  },
)
watch(
  () => currentUser.value,
  (newUser) => {
    if (newUser) {
      listenToMyTasks()
      listenToMySentTasks()
      listenToMessages()
    } else {
      if (taskUnsubscribe) taskUnsubscribe()
      if (sentTaskUnsubscribe) sentTaskUnsubscribe()
      if (messageUnsubscribe) messageUnsubscribe()
    }
  },
)
</script>

<style scoped>
/* 引入 Font Awesome */
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

/* ================================== */
/*         通用基礎樣式                */
/* ================================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  background-color: #f8f9fa;
  box-sizing: border-box;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid #dee2e6;
  flex-shrink: 0;
}
.header-content h1 {
  margin: 0;
  font-size: 2rem;
  color: #343a40;
}
.date-display {
  margin: 0;
  font-size: 1rem;
  color: #6c757d;
}
.header-actions .btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
}
.btn-primary {
  background-color: #007bff;
  color: white;
  border: 1px solid #007bff;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.25rem;
  padding: 1rem;
  margin: 0;
  border-bottom: 1px solid #e9ecef;
  flex-shrink: 0;
  background-color: #f8f9fa;
}
.panel-loading,
.panel-empty {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  color: #6c757d;
}
.panel-empty i {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  opacity: 0.7;
}
.panel-loading.small,
.panel-empty.small {
  padding: 1rem;
  font-size: 0.9rem;
}
.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
.item-content {
  margin: 0 0 0.5rem 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.item-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.creator-info {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #6c757d;
  font-size: 0.8rem;
}
.completed-info {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #15803d;
  font-style: italic;
  text-align: right;
}
.completed-info.task {
  color: #166534;
}
.item-actions .btn-action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
}
.btn-complete {
  background-color: #007bff;
}
.btn-complete-task {
  background-color: #f59e0b;
}
.message-item,
.task-item {
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  border-radius: 6px;
  transition: opacity 0.3s;
  flex-shrink: 0;
}
.message-item {
  background-color: #f0f9ff;
  border-left: 4px solid #0ea5e9;
}
.task-item {
  background-color: #fffbeb;
  border-left: 4px solid #f59e0b;
}
.task-item.sent {
  background-color: #f1f5f9;
  border-left-color: #64748b;
}
.sent-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #475569;
  font-weight: 500;
  font-style: italic;
}
.is-completed {
  opacity: 0.7;
  background-color: #f8fafc;
}
.is-completed .item-content {
  text-decoration: line-through;
}
.task-patient-mrn {
  color: #6c757d;
  font-weight: normal;
  font-size: 0.9em;
  margin-left: 0.25em;
}

/* ================================== */
/*       ✨ 桌面版樣式 ✨             */
/* ================================== */
.collaboration-container {
  display: none;
} /* 預設隱藏 */

@media (min-width: 993px) {
  .desktop-only {
    display: block;
  }
  /* ✨ 核心修正 #1: 強制隱藏所有 .mobile-only 元素 */
  .mobile-only {
    display: none !important;
  }

  .collaboration-container {
    display: grid !important;
    grid-template-columns: 280px 2fr 1.5fr;
    gap: 1.5rem;
    flex-grow: 1;
    min-height: 0;
  }
  .patient-list-panel,
  .message-panel,
  .task-panel {
    border: 1px solid #dee2e6;
    border-radius: 8px;
    display: flex !important;
    flex-direction: column;
    overflow: hidden;
    background-color: #ffffff;
  }
  .left-panel-tabs {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid #dee2e6;
    padding: 0.5rem 0.5rem 0;
    background-color: #ffffff;
  }
  .left-panel-tabs button {
    flex: 1;
    padding: 0.5rem;
    border: none;
    background: none;
    font-size: 0.9rem;
    font-weight: 600;
    color: #6c757d;
    cursor: pointer;
    border-radius: 4px 4px 0 0;
    border-bottom: 3px solid transparent;
  }
  .left-panel-tabs button.active {
    color: #007bff;
    background-color: #f8f9fa;
    border-bottom-color: #007bff;
  }
  .patient-list-scroll-area {
    flex-grow: 1;
    overflow-y: auto;
  }
  .patient-list,
  .message-list,
  .task-list {
    list-style: none;
    padding: 0;
    margin: 0;
    flex-grow: 1;
    overflow-y: auto;
  }
  .patient-list {
    padding: 0.5rem 0;
  }
  .shift-group {
    border-bottom: 1px solid #e9ecef;
  }
  .shift-group:last-child {
    border-bottom: none;
  }
  .shift-title {
    font-size: 1rem;
    font-weight: bold;
    color: #495057;
    padding: 0.75rem 1rem;
    background-color: #f8f9fa;
    margin: 0;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .patient-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #f1f3f5;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  .patient-item:last-child {
    border-bottom: none;
  }
  .patient-item:hover {
    background-color: #f8f9fa;
  }
  .patient-item.active {
    background-color: #e7f1ff;
    font-weight: bold;
    color: #0056b3;
  }
  .patient-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .patient-bed {
    font-size: 0.8rem;
    font-weight: bold;
    color: #007bff;
    background-color: #e7f1ff;
    border-radius: 4px;
    padding: 2px 6px;
    min-width: 30px;
    text-align: center;
  }
  .patient-name {
    font-size: 1rem;
  }
  .patient-mrn {
    font-size: 0.9rem;
    color: #6c757d;
  }
  .message-panel {
    padding: 0;
    background-color: transparent;
    border: none;
  }
  .message-section {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 8px;
  }
  .message-section.patient-messages {
    height: 33.33%;
    margin-bottom: 1.5rem;
  }
  .message-section.feed-messages {
    height: calc(66.67% - 1.5rem);
  }
  .message-list {
    padding: 1rem;
  }
  .task-panel {
    padding: 0;
    background-color: transparent;
    border: none;
  }
  .task-section {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 8px;
  }
  .task-section.inbox-tasks {
    height: 50%;
    margin-bottom: 1.5rem;
  }
  .task-section.sent-tasks {
    height: calc(50% - 1.5rem);
  }
  .task-list {
    padding: 1rem;
  }
}

/* ================================== */
/*       ✨ 行動版樣式 ✨             */
/* ================================== */
.mobile-container {
  display: none;
} /* 預設隱藏 */
@media (max-width: 992px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-only {
    display: block;
  }
  .page-container {
    padding: 0;
    position: relative;
  }
  .page-header {
    padding: 1rem;
    margin-bottom: 0;
  }
  .header-content h1 {
    font-size: 1.5rem;
  }
  .mobile-container {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-height: 0;
  }
  .mobile-tabs {
    display: flex;
    background-color: #ffffff;
    border-bottom: 1px solid #dee2e6;
    flex-shrink: 0;
  }
  .mobile-tab-btn {
    flex: 1;
    padding: 0.75rem 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    text-align: center;
    border: none;
    background: none;
    color: #6c757d;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .mobile-tab-btn.active {
    color: #007bff;
    border-bottom-color: #007bff;
  }
  .mobile-content-area {
    padding: 1rem;
    overflow-y: auto;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }
  .patient-list-panel,
  .message-panel,
  .task-panel {
    display: none;
    border-radius: 8px;
    border: 1px solid #dee2e6;
    background-color: #ffffff;
    flex-grow: 1;
    min-height: 0;
    flex-direction: column;
  }

  .patient-list-panel[style*='display: block;'],
  .message-panel[style*='display: block;'],
  .task-panel[style*='display: block;'] {
    display: flex !important;
  }

  .message-panel,
  .task-panel {
    gap: 1rem;
    padding: 0;
    background: transparent;
    border: none;
  }
  .message-section,
  .task-section {
    height: auto;
    flex: 1;
    min-height: 300px;
    margin: 0;
    border: 1px solid #dee2e6;
    border-radius: 8px;
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
}
</style>
