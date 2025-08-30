<template>
  <div class="page-container collaboration-view">
    <!-- 使用了新的 header 結構，與調班管理頁面同步 -->
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">訊息中心</h1>
          <button class="btn btn-primary" :disabled="isPageLocked" @click="openCreateModal">
            <i class="fas fa-plus"></i> 新增交辦/留言
          </button>
        </div>
        <!-- 如果右側有其他按鈕可以放在這裡 -->
      </div>
      <p class="page-description">顯示日期: {{ displayDate }} ({{ weekdayDisplay }})</p>
    </header>

    <!-- ================== -->
    <!--    桌面版容器      -->
    <!-- ================== -->
    <div class="collaboration-container desktop-only">
      <!-- 左欄 -->
      <div class="patient-list-panel">
        <div v-if="isNurseStaff" class="left-panel-main-tabs">
          <button
            :class="{ active: mainPatientViewTab === 'my' }"
            @click="mainPatientViewTab = 'my'"
          >
            我的病人
          </button>
          <button
            :class="{ active: mainPatientViewTab === 'all' }"
            @click="mainPatientViewTab = 'all'"
          >
            全部病人
          </button>
        </div>

        <div v-if="!isNurseStaff || mainPatientViewTab === 'all'" class="left-panel-shift-tabs">
          <button :class="{ active: shiftFilterTab === 'all' }" @click="shiftFilterTab = 'all'">
            全部
          </button>
          <button :class="{ active: shiftFilterTab === 'early' }" @click="shiftFilterTab = 'early'">
            早班
          </button>
          <button :class="{ active: shiftFilterTab === 'noon' }" @click="shiftFilterTab = 'noon'">
            午班
          </button>
          <button :class="{ active: shiftFilterTab === 'late' }" @click="shiftFilterTab = 'late'">
            晚班
          </button>
        </div>

        <div v-if="isLoading.patients" class="panel-loading">
          <div class="loading-spinner"></div>
          <span>載入病人列表...</span>
        </div>
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
          <div
            v-if="Object.keys(groupedPatients).length === 0 && !isLoading.patients"
            class="panel-empty"
          >
            <p>此條件下無病人資料。</p>
          </div>
        </div>
      </div>

      <!-- 中欄 -->
      <div class="message-panel">
        <!-- ==================================================== -->
        <!-- ✨ 每日公告欄 ✨ -->
        <!-- ==================================================== -->
        <div class="message-section bulletin-board-section">
          <h2 class="panel-title"><i class="fas fa-bullhorn"></i> 每日公告</h2>
          <div v-if="isLoading.bulletin" class="panel-loading small">
            <div class="loading-spinner"></div>
          </div>
          <div v-else class="bulletin-content">
            <!-- 1. 同步前一天的工作日誌 -->
            <div v-if="yesterdaysLogItems.length > 0" class="bulletin-group">
              <h3 class="bulletin-group-title">昨日工作日誌同步事項</h3>
              <ul class="bulletin-list">
                <li
                  v-for="(item, index) in yesterdaysLogItems"
                  :key="`log-${index}`"
                  class="log-item"
                >
                  {{ item }}
                </li>
              </ul>
            </div>

            <!-- 2. 顯示本日手動新增的公告 -->
            <div class="bulletin-group">
              <h3 class="bulletin-group-title">本日新增公告</h3>
              <ul v-if="todaysAnnouncements.length > 0" class="bulletin-list">
                <li v-for="item in todaysAnnouncements" :key="item.id" class="announcement-item">
                  <p class="item-content">{{ item.content }}</p>
                  <div class="item-footer">
                    <div class="item-meta">
                      <small class="creator-info"
                        ><i class="fas fa-user-edit"></i> {{ item.creator.name }} 於
                        {{ formatTimestamp(item.createdAt) }}</small
                      >
                    </div>
                  </div>
                </li>
              </ul>
              <div v-else class="panel-empty small" style="padding: 1rem 0">
                <p>尚無本日公告</p>
              </div>
            </div>

            <!-- 3. 手動輸入新公告的區域 -->
            <div class="announcement-input-area" v-if="canPostAnnouncement">
              <textarea
                v-model="newAnnouncementText"
                placeholder="在此輸入想公布的事情..."
                rows="3"
              ></textarea>
              <button @click="handleSaveAnnouncement" :disabled="!newAnnouncementText.trim()">
                發布公告
              </button>
            </div>
          </div>
        </div>
        <div class="message-section feed-messages">
          <h2 class="panel-title"><i class="fas fa-stream"></i> 病人留言板</h2>
          <div v-if="isLoading.messages" class="panel-loading small">
            <div class="loading-spinner"></div>
          </div>
          <ul v-else-if="sortedFeedMessages.length > 0" class="message-list">
            <!-- ✨ [核心修改] 開始 ✨ -->
            <li
              v-for="msg in sortedFeedMessages"
              :key="msg.id"
              class="message-item"
              :class="{
                'is-completed': msg.status === 'completed',
                'is-future-message': msg.status === 'pending' && msg.targetDate > displayDate,
              }"
            >
              <p class="item-content">
                <strong>{{ msg.patientName }}:</strong> {{ msg.content }}
              </p>
              <div class="item-footer">
                <div class="item-meta">
                  <small v-if="msg.targetDate" class="target-date-info">
                    <i class="fas fa-calendar-alt"></i>
                    <!-- 增加 "預" 標記 -->
                    <span v-if="msg.targetDate > displayDate" class="future-tag">預</span>
                    關聯 {{ msg.targetDate.slice(5).replace('-', '/') }}
                  </small>
                  <small class="creator-info"
                    ><i class="fas fa-user-edit"></i> {{ msg.creator.name }} 於
                    {{ formatTimestamp(msg.createdAt) }}</small
                  >
                </div>
                <div v-if="msg.status === 'pending'" class="item-actions">
                  <!-- 使用 :disabled 和 :title 來控制按鈕狀態 -->
                  <button
                    class="btn-action btn-complete"
                    @click="updateTaskStatus(msg.id, 'completed')"
                    :disabled="displayDate < msg.targetDate"
                    :title="
                      displayDate < msg.targetDate
                        ? `此留言需在 ${msg.targetDate} 才能標示已讀`
                        : '標示為已讀'
                    "
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
            <!-- ✨ [核心修改] 結束 ✨ -->
          </ul>
          <div v-else class="panel-empty small">
            <p><i class="fas fa-inbox"></i> 您的病人資訊流中沒有新留言</p>
          </div>
        </div>
      </div>

      <!-- 右欄 -->
      <div class="task-panel">
        <div class="task-section inbox-tasks">
          <h2 class="panel-title"><i class="fas fa-inbox"></i> 收件匣(給我的交辦事項)</h2>
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
          <ul v-else-if="sortedMySentTasks.length > 0" class="task-list">
            <li
              v-for="task in sortedMySentTasks"
              :key="task.id"
              class="task-item sent"
              :class="{ 'is-completed': task.status === 'completed' }"
            >
              <p class="item-content">
                <strong>To {{ getAssigneeName(task.assignee) }}:</strong> {{ task.content }}
              </p>
              <div class="item-footer">
                <small class="creator-info"
                  ><i class="fas fa-user"></i> patient: {{ task.patientName || 'N/A' }}</small
                >
                <div class="item-actions">
                  <span v-if="task.status === 'pending'" class="sent-status">
                    <i class="far fa-clock"></i> 處理中...
                  </span>
                  <div v-else class="completed-info">
                    <i class="fas fa-check-double"></i> 由 {{ task.resolvedBy?.name }} 完成
                  </div>
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
          <!-- 行動版 左欄 -->
          <div v-if="isNurseStaff" class="left-panel-main-tabs">
            <button
              :class="{ active: mainPatientViewTab === 'my' }"
              @click="mainPatientViewTab = 'my'"
            >
              我的病人
            </button>
            <button
              :class="{ active: mainPatientViewTab === 'all' }"
              @click="mainPatientViewTab = 'all'"
            >
              全部病人
            </button>
          </div>
          <div v-if="!isNurseStaff || mainPatientViewTab === 'all'" class="left-panel-shift-tabs">
            <button :class="{ active: shiftFilterTab === 'all' }" @click="shiftFilterTab = 'all'">
              全部
            </button>
            <button
              :class="{ active: shiftFilterTab === 'early' }"
              @click="shiftFilterTab = 'early'"
            >
              早班
            </button>
            <button :class="{ active: shiftFilterTab === 'noon' }" @click="shiftFilterTab = 'noon'">
              午班
            </button>
            <button :class="{ active: shiftFilterTab === 'late' }" @click="shiftFilterTab = 'late'">
              晚班
            </button>
          </div>
          <div v-if="isLoading.patients" class="panel-loading">
            <div class="loading-spinner"></div>
            <span>載入病人列表...</span>
          </div>
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
            <div
              v-if="Object.keys(groupedPatients).length === 0 && !isLoading.patients"
              class="panel-empty"
            >
              <p>此條件下無病人資料。</p>
            </div>
          </div>
        </div>
        <div v-show="activeMobileTab === 'messages'" class="message-panel">
          <!-- ==================================================== -->
          <!-- ✨ 行動版 中欄 (已更新為新版公告欄) ✨ -->
          <!-- ==================================================== -->

          <!-- 每日公告欄 (與桌面版結構相同) -->
          <div class="message-section bulletin-board-section">
            <h2 class="panel-title"><i class="fas fa-bullhorn"></i> 每日公告</h2>
            <div v-if="isLoading.bulletin" class="panel-loading small">
              <div class="loading-spinner"></div>
            </div>
            <div v-else class="bulletin-content">
              <!-- 1. 同步前一天的工作日誌 -->
              <div v-if="yesterdaysLogItems.length > 0" class="bulletin-group">
                <h3 class="bulletin-group-title">昨日工作日誌同步事項</h3>
                <ul class="bulletin-list">
                  <li
                    v-for="(item, index) in yesterdaysLogItems"
                    :key="`log-mobile-${index}`"
                    class="log-item"
                  >
                    {{ item }}
                  </li>
                </ul>
              </div>

              <!-- 2. 顯示本日手動新增的公告 -->
              <div class="bulletin-group">
                <h3 class="bulletin-group-title">本日新增公告</h3>
                <ul v-if="todaysAnnouncements.length > 0" class="bulletin-list">
                  <li v-for="item in todaysAnnouncements" :key="item.id" class="announcement-item">
                    <p class="item-content">{{ item.content }}</p>
                    <div class="item-footer">
                      <div class="item-meta">
                        <small class="creator-info"
                          ><i class="fas fa-user-edit"></i> {{ item.creator.name }} 於
                          {{ formatTimestamp(item.createdAt) }}</small
                        >
                      </div>
                    </div>
                  </li>
                </ul>
                <div v-else class="panel-empty small" style="padding: 1rem 0">
                  <p>尚無本日公告</p>
                </div>
              </div>

              <!-- 3. 手動輸入新公告的區域 (有權限才顯示) -->
              <div class="announcement-input-area" v-if="canPostAnnouncement">
                <textarea
                  v-model="newAnnouncementText"
                  placeholder="在此輸入想公布的事情..."
                  rows="3"
                ></textarea>
                <button @click="handleSaveAnnouncement" :disabled="!newAnnouncementText.trim()">
                  發布公告
                </button>
              </div>
            </div>
          </div>

          <!-- 病人留言板 (與桌面版結構相同) -->
          <div class="message-section feed-messages">
            <h2 class="panel-title"><i class="fas fa-stream"></i> 病人留言板</h2>
            <div v-if="isLoading.messages" class="panel-loading small">
              <div class="loading-spinner"></div>
            </div>
            <ul v-else-if="sortedFeedMessages.length > 0" class="message-list">
              <!-- ✨ [核心修改] 行動版也同步修改 ✨ -->
              <li
                v-for="msg in sortedFeedMessages"
                :key="msg.id"
                class="message-item"
                :class="{
                  'is-completed': msg.status === 'completed',
                  'is-future-message': msg.status === 'pending' && msg.targetDate > displayDate,
                }"
              >
                <p class="item-content">
                  <strong>{{ msg.patientName }}:</strong> {{ msg.content }}
                </p>
                <div class="item-footer">
                  <div class="item-meta">
                    <small v-if="msg.targetDate" class="target-date-info">
                      <i class="fas fa-calendar-alt"></i>
                      <span v-if="msg.targetDate > displayDate" class="future-tag">預</span>
                      關聯 {{ msg.targetDate.slice(5).replace('-', '/') }}
                    </small>
                    <small class="creator-info"
                      ><i class="fas fa-user-edit"></i> {{ msg.creator.name }} 於
                      {{ formatTimestamp(msg.createdAt) }}</small
                    >
                  </div>
                  <div v-if="msg.status === 'pending'" class="item-actions">
                    <button
                      class="btn-action btn-complete"
                      @click="updateTaskStatus(msg.id, 'completed')"
                      :disabled="displayDate < msg.targetDate"
                      :title="
                        displayDate < msg.targetDate
                          ? `此留言需在 ${msg.targetDate} 才能標示已讀`
                          : '標示為已讀'
                      "
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
          <!-- 行動版 右欄 -->
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
            <ul v-else-if="sortedMySentTasks.length > 0" class="task-list">
              <li
                v-for="task in sortedMySentTasks"
                :key="task.id"
                class="task-item sent"
                :class="{ 'is-completed': task.status === 'completed' }"
              >
                <p class="item-content">
                  <strong>To {{ getAssigneeName(task.assignee) }}:</strong> {{ task.content }}
                </p>
                <div class="item-footer">
                  <small class="creator-info"
                    ><i class="fas fa-user"></i> patient: {{ task.patientName || 'N/A' }}</small
                  >
                  <div class="item-actions">
                    <span v-if="task.status === 'pending'" class="sent-status">
                      <i class="far fa-clock"></i> 處理中...
                    </span>
                    <div v-else class="completed-info">
                      <i class="fas fa-check-double"></i> 由 {{ task.resolvedBy?.name }} 完成
                    </div>
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
      :all-patients="patientStore.allPatients"
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
  doc,
  updateDoc,
  setDoc,
  arrayUnion,
} from 'firebase/firestore'
import { db } from '@/composables/useFirebase'
import ApiManager from '@/services/api_manager.js'
import TaskCreateDialog from '@/components/TaskCreateDialog.vue'
import { usePatientStore } from '@/stores/patientStore.js'

const route = useRoute()
const { currentUser, isPageLocked, hasPermission } = useAuth()
const userTitle = computed(() => currentUser.value?.title)
const userRole = computed(() => currentUser.value?.role)

const patientStore = usePatientStore()

const schedulesApi = ApiManager('schedules')
const assignmentsApi = ApiManager('nurse_assignments')
const logsApi = ApiManager('daily_logs')

const isLoading = ref({
  patients: true,
  messages: true,
  tasks: true,
  sentTasks: true,
  bulletin: true,
})
const allDailyPatients = ref([])
const myAssignedPatients = ref([])
const selectedPatient = ref(null)
const myTasks = ref([])
const mySentTasks = ref([])
const allMessages = ref([])
const isCreateModalVisible = ref(false)

const yesterdaysLogItems = ref([])
const todaysAnnouncements = ref([])
const newAnnouncementText = ref('')

const patientMap = computed(() => patientStore.patientMap)

const mainPatientViewTab = ref('my')
const shiftFilterTab = ref('all')

let taskUnsubscribe = null
let sentTaskUnsubscribe = null
let messageUnsubscribe = null
let bulletinUnsubscribe = null
const activeMobileTab = ref('patients')

const isNurseStaff = computed(() => ['護理師', '護理師組長'].includes(userTitle.value))
const canPostAnnouncement = computed(() => {
  if (!currentUser.value) return false
  // 只有 admin 或 editor 角色可以發布
  return ['admin', 'editor'].includes(currentUser.value.role)
})
const patientsForList = computed(() => {
  return mainPatientViewTab.value === 'my' && isNurseStaff.value
    ? myAssignedPatients.value
    : allDailyPatients.value
})
const filteredByShiftPatients = computed(() => {
  if (shiftFilterTab.value === 'all') {
    return patientsForList.value
  }
  return patientsForList.value.filter((p) => p.shift === shiftFilterTab.value)
})
const groupedPatients = computed(() => {
  const groups = { 早班: [], 午班: [], 晚班: [] }
  let patientsToGroup = []
  if (isNurseStaff.value) {
    patientsToGroup =
      mainPatientViewTab.value === 'my' ? myAssignedPatients.value : filteredByShiftPatients.value
  } else {
    patientsToGroup = filteredByShiftPatients.value
  }
  if (!Array.isArray(patientsToGroup)) return {}
  for (const patient of patientsToGroup) {
    if (patient.shift === 'early') groups.早班.push(patient)
    else if (patient.shift === 'noon') groups.午班.push(patient)
    else if (patient.shift === 'late') groups.晚班.push(patient)
  }
  if (groups.早班.length === 0) delete groups.早班
  if (groups.午班.length === 0) delete groups.午班
  if (groups.晚班.length === 0) delete groups.晚班
  return groups
})

const getLocalDateString = (date) => {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

const displayDate = computed(() => route.query.date || getLocalDateString(new Date()))

const weekdayDisplay = computed(() => {
  if (!displayDate.value) return ''
  try {
    const d = new Date(displayDate.value + 'T00:00:00')
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  } catch {
    return ''
  }
})

function listenToBulletinData(dateStr) {
  if (bulletinUnsubscribe) bulletinUnsubscribe()
  isLoading.value.bulletin = true
  yesterdaysLogItems.value = []
  todaysAnnouncements.value = []

  const today = new Date(dateStr + 'T00:00:00')
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const yesterdayStr = getLocalDateString(yesterday)

  logsApi
    .fetchById(yesterdayStr)
    .then((log) => {
      if (log && log.handoverNotes && typeof log.handoverNotes === 'string') {
        const notes = log.handoverNotes
          .split(/[\d]+\.\s*/)
          .map((item) => item.trim())
          .filter((item) => item)
        yesterdaysLogItems.value = notes
      }
    })
    .catch((err) => {
      // console.log("找不到昨日日誌:", err.message);
    })

  const todayLogRef = doc(db, 'daily_logs', dateStr)
  bulletinUnsubscribe = onSnapshot(
    todayLogRef,
    (docSnap) => {
      if (docSnap.exists() && docSnap.data().announcements) {
        todaysAnnouncements.value = docSnap
          .data()
          .announcements.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      } else {
        todaysAnnouncements.value = []
      }
      isLoading.value.bulletin = false
    },
    (error) => {
      console.error('監聽本日公告失敗:', error)
      isLoading.value.bulletin = false
    },
  )
}

async function handleSaveAnnouncement() {
  if (!newAnnouncementText.value.trim() || !currentUser.value) return

  const dateStr = displayDate.value
  const logDocRef = doc(db, 'daily_logs', dateStr)

  const newAnnouncement = {
    id: Date.now().toString(),
    content: newAnnouncementText.value.trim(),
    creator: {
      uid: currentUser.value.uid,
      name: currentUser.value.name,
    },
    createdAt: new Date(),
  }

  try {
    await setDoc(
      logDocRef,
      {
        announcements: arrayUnion(newAnnouncement),
      },
      { merge: true },
    )
    newAnnouncementText.value = ''
  } catch (error) {
    console.error('發布公告失敗:', error)
    alert('發布公告失敗，請檢查網路連線或聯繫管理員。')
  }
}

const sortItems = (items) => {
  if (!Array.isArray(items)) return []
  return [...items].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    const dateA = a.resolvedAt?.toDate() || a.createdAt?.toDate() || new Date(0)
    const dateB = b.resolvedAt?.toDate() || b.createdAt?.toDate() || new Date(0)
    return dateB - dateA
  })
}

const sortedMyTasks = computed(() => sortItems(myTasks.value))
const sortedSelectedPatientMessages = computed(() => sortItems(selectedPatientMessages.value))
const sortedFeedMessages = computed(() => sortItems(feedMessages.value))
const sortedMySentTasks = computed(() => sortItems(mySentTasks.value))

const selectedPatientMessages = computed(() => {
  if (!selectedPatient.value || !Array.isArray(allMessages.value)) return []
  return allMessages.value.filter((msg) => msg.patientId === selectedPatient.value.id)
})
const feedMessages = computed(() => {
  if (!Array.isArray(patientsForList.value) || !Array.isArray(allMessages.value)) return []
  const myPatientIds = new Set(patientsForList.value.map((p) => p.id))
  return allMessages.value.filter((msg) => myPatientIds.has(msg.patientId))
})

async function loadAndProcessDataForDate(date) {
  isLoading.value = {
    patients: true,
    messages: true,
    tasks: true,
    sentTasks: true,
    bulletin: true,
  }
  allDailyPatients.value = []
  myAssignedPatients.value = []
  selectedPatient.value = null

  if (!currentUser.value) {
    Object.keys(isLoading.value).forEach((k) => (isLoading.value[k] = false))
    return
  }

  try {
    await patientStore.fetchPatientsIfNeeded()
    const schedules = await schedulesApi.fetchAll([where('date', '==', date)])
    if (schedules.length === 0 || !schedules[0].schedule) {
      isLoading.value.patients = false
      return
    }
    const scheduleData = schedules[0].schedule
    const allPatientIdsInSchedule = Array.from(
      new Set(
        Object.values(scheduleData)
          .map((s) => s.patientId)
          .filter(Boolean),
      ),
    )

    if (allPatientIdsInSchedule.length === 0) {
      isLoading.value.patients = false
      return
    }

    const assignments = await assignmentsApi.fetchAll([where('date', '==', date)])
    const localPatientMap = patientStore.patientMap
    const getBedNumber = (shiftId) => {
      const parts = shiftId.split('-')
      return parts[0] === 'peripheral' ? 1000 + parseInt(parts[1], 10) : parseInt(parts[1], 10)
    }

    const tempAllDaily = []
    for (const shiftId in scheduleData) {
      const slot = scheduleData[shiftId]
      if (slot?.patientId && localPatientMap.has(slot.patientId)) {
        const patientDetail = localPatientMap.get(slot.patientId)
        tempAllDaily.push({
          ...patientDetail,
          shift: shiftId.split('-').pop(),
          bed: getBedNumber(shiftId),
        })
      }
    }

    const sortLogic = (a, b) => {
      const shiftOrder = { early: 1, noon: 2, late: 3 }
      if (a.shift !== b.shift) return (shiftOrder[a.shift] || 99) - (shiftOrder[b.shift] || 99)
      return a.bed - b.bed
    }
    allDailyPatients.value = tempAllDaily.sort(sortLogic)

    if (isNurseStaff.value && assignments.length > 0 && assignments[0].teams) {
      const { names, teams } = assignments[0]
      const myAssignedIds = new Set()
      if (names && teams) {
        for (const teamName in names) {
          if (names[teamName] === currentUser.value.name) {
            for (const key in teams) {
              const [patientId] = key.split('-')
              const teamAssignment = teams[key]
              if (
                teamAssignment.nurseTeam === teamName ||
                teamAssignment.nurseTeamIn === teamName ||
                teamAssignment.nurseTeamOut === teamName
              ) {
                myAssignedIds.add(patientId)
              }
            }
          }
        }
      }
      myAssignedPatients.value = allDailyPatients.value.filter((p) => myAssignedIds.has(p.id))
    }
  } catch (error) {
    console.error('獲取病人列表失敗:', error)
  } finally {
    isLoading.value.patients = false
  }
}

function openCreateModal() {
  if (!currentUser.value) return
  const canPerformAction = hasPermission('viewer')
  if (!canPerformAction) {
    console.warn('Permission denied.')
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
    hour12: false,
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
    where('status', 'in', ['pending', 'completed']),
    where('assignee.type', '==', 'role'),
    where('assignee.value', 'in', uniqueTargetValues),
  )
  taskUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      myTasks.value = filterByStatusAndDate(snapshot.docs)
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
    where('status', 'in', ['pending', 'completed']),
    where('creator.uid', '==', currentUser.value.uid),
  )
  sentTaskUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      mySentTasks.value = filterByStatusAndDate(snapshot.docs)
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
    where('status', 'in', ['pending', 'completed']),
    where('targetDate', '>=', displayDate.value),
  )
  messageUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      allMessages.value = filterByStatusAndDate(snapshot.docs)
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
function filterByStatusAndDate(docs) {
  const fiveDaysAgo = new Date()
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
  const results = []
  for (const doc of docs) {
    const data = { id: doc.id, ...doc.data() }
    if (data.status === 'pending') {
      results.push(data)
    } else if (data.status === 'completed' && data.resolvedAt) {
      const resolvedDate = data.resolvedAt.toDate
        ? data.resolvedAt.toDate()
        : new Date(data.resolvedAt)
      if (resolvedDate >= fiveDaysAgo) {
        results.push(data)
      }
    }
  }
  return results
}
onMounted(async () => {
  await useAuth().waitForAuthInit()
  await loadAndProcessDataForDate(displayDate.value)
  listenToBulletinData(displayDate.value)
  listenToMyTasks()
  listenToMySentTasks()
  listenToMessages()
})
onUnmounted(() => {
  if (taskUnsubscribe) taskUnsubscribe()
  if (sentTaskUnsubscribe) sentTaskUnsubscribe()
  if (messageUnsubscribe) messageUnsubscribe()
  if (bulletinUnsubscribe) bulletinUnsubscribe()
})
watch(
  () => route.query.date,
  async (newDate, oldDate) => {
    if (newDate && newDate !== oldDate) {
      await loadAndProcessDataForDate(newDate)
      listenToBulletinData(newDate)
      listenToMessages()
    }
  },
)
watch(
  () => currentUser.value,
  (newUser) => {
    if (newUser) {
      loadAndProcessDataForDate(displayDate.value)
      listenToBulletinData(displayDate.value)
      listenToMyTasks()
      listenToMySentTasks()
      listenToMessages()
    } else {
      if (taskUnsubscribe) taskUnsubscribe()
      if (sentTaskUnsubscribe) sentTaskUnsubscribe()
      if (messageUnsubscribe) messageUnsubscribe()
      if (bulletinUnsubscribe) bulletinUnsubscribe()
    }
  },
)
</script>

<style scoped>
/* 引入 Font Awesome */
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

/* ✨ --- 【修改後的新標頭樣式】 --- ✨ */
.page-header {
  border-bottom: 2px solid #dee2e6;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  flex-shrink: 0; /* 確保 header 在 flex 佈局中不被壓縮 */
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 1.5rem; /* 在標題和按鈕之間增加間距 */
}

.page-title {
  /* 取代了舊的 header-content h1 */
  font-size: 32px;
  font-weight: 700;
  color: #343a40;
  margin: 0;
}

.page-description {
  /* 取代了舊的 date-display */
  margin-top: 0.5rem;
  font-size: 1rem;
  color: #6c757d;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
.btn-primary:hover {
  background-color: #0069d9;
}

/* ================================== */
/*         通用基礎樣式 (保留部分)      */
/* ================================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0.5rem;
  background-color: #f8f9fa;
  box-sizing: border-box;
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

/* ... (以下為您所有其他的既有樣式，它們都是正確的，應予以保留) ... */
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
.desktop-only {
  display: block;
}
.mobile-only {
  display: none;
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
.left-panel-main-tabs,
.left-panel-shift-tabs {
  display: flex;
  flex-shrink: 0;
}
.left-panel-main-tabs {
  border-bottom: 1px solid #dee2e6;
  padding: 0.5rem;
}
.left-panel-main-tabs button {
  flex: 1;
  padding: 0.6rem;
  border: 1px solid #007bff;
  color: #007bff;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
}
.left-panel-main-tabs button:first-child {
  border-radius: 6px 0 0 6px;
}
.left-panel-main-tabs button:last-child {
  border-radius: 0 6px 6px 0;
  border-left: none;
}
.left-panel-main-tabs button.active {
  background-color: #007bff;
  color: white;
}
.left-panel-shift-tabs {
  border-bottom: 1px solid #dee2e6;
  padding: 0.5rem 0.5rem 0;
  background-color: #ffffff;
}
.left-panel-shift-tabs button {
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
.left-panel-shift-tabs button.active {
  color: #007bff;
  background-color: #f8f9fa;
  border-bottom-color: #007bff;
}

/* ================================== */
/*       ✨ 桌面版樣式 ✨             */
/* ================================== */
@media (min-width: 993px) {
  .collaboration-container {
    display: grid;
    grid-template-columns: 280px 2fr 1.5fr;
    gap: 1.5rem;
    flex-grow: 1;
    min-height: 0;
  }
  .patient-list-panel,
  .message-panel,
  .task-panel {
    display: flex !important;
    flex-direction: column;
    overflow: hidden;
    background-color: #ffffff;
  }
  .message-list,
  .task-list {
    flex-grow: 1;
    overflow-y: auto;
  }
  .patient-list {
    padding: 0.5rem 0;
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
  .message-section.bulletin-board-section {
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
/*       ✨ 行動版樣式 (已修正) ✨     */
/* ================================== */
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
  /* ✨ 修正行動版 header，讓其與桌面版新樣式協作 */
  .page-header {
    padding: 1rem;
    margin-bottom: 0;
  }
  .page-title {
    font-size: 1.5rem;
  }
  .page-description {
    margin-top: 0.5rem;
    font-size: 0.9rem;
  }
  /* 隱藏桌面版的按鈕 */
  .toolbar-left .btn-primary {
    display: none;
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
  }

  .mobile-content-area > div[style*='display: none;'] {
    display: none !important;
  }

  .patient-list-panel,
  .message-panel,
  .task-panel {
    border-radius: 8px;
    border: 1px solid #dee2e6;
    background-color: #ffffff;
    flex-grow: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
    display: flex;
    flex-direction: column;
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
/* ================================== */
/*       ✨ 公告欄新增樣式 ✨         */
/* ================================== */
.bulletin-board-section .panel-title {
  background-color: #fffbe6; /* 淡黃色背景 */
  color: #b45309;
}

.bulletin-content {
  flex-grow: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.bulletin-group-title {
  font-size: 0.9rem;
  font-weight: bold;
  color: #4b5563;
  margin: 0 0 0.5rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.bulletin-list {
  list-style-type: decimal; /* 顯示 1. 2. 3. */
  padding-left: 1.5rem;
  margin: 0;
}

.log-item,
.announcement-item {
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.log-item {
  color: #374151;
}

.announcement-item .item-content {
  margin-bottom: 0.25rem;
}

.announcement-input-area {
  margin-top: auto; /* 將輸入區推到底部 */
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.announcement-input-area textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.95rem;
  resize: vertical;
}

.announcement-input-area button {
  align-self: flex-end; /* 按鈕靠右 */
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  background-color: #f97316; /* 橘色 */
  color: white;
  font-weight: bold;
  cursor: pointer;
}

.announcement-input-area button:disabled {
  background-color: #d1d5db;
  cursor: not-allowed;
}

.item-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: flex-start;
}

.target-date-info {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: bold;
  color: #0d6efd; /* 醒目的藍色 */
  background-color: #e7f1ff; /* 淡藍色背景 */
  padding: 2px 6px;
  border-radius: 4px;
}
/* 未來留言的特殊樣式 */
.message-item.is-future-message {
  background-color: #fefce8; /* 淡黃色背景 */
  border-left-color: #facc15; /* 醒目的黃色邊框 */
}

/* 當按鈕被禁用時的樣式 */
.item-actions .btn-action:disabled {
  background-color: #adb5bd; /* 灰色背景 */
  cursor: not-allowed; /* 顯示禁止游標 */
  opacity: 0.7;
}

/* "預" 標記的樣式 */
.future-tag {
  display: inline-block;
  background-color: #fb923c; /* 橘色 */
  color: white;
  font-size: 0.7rem;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 4px;
  margin-right: 4px;
  vertical-align: middle;
}
</style>
