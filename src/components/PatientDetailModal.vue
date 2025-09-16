<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container large">
      <div class="modal-header">
        <h2>{{ patient?.name }} - 詳細資料</h2>
        <button @click="handleClose" class="close-btn">×</button>
      </div>

      <!-- 頁籤導覽列 -->
      <div class="tabs-navigation">
        <button :class="{ active: activeTab === 'records' }" @click="activeTab = 'records'">
          病情紀錄
        </button>
        <button :class="{ active: activeTab === 'memos' }" @click="activeTab = 'memos'">
          <span v-if="hasPendingMemosForPatient" class="memo-indicator">!</span>
          查看備忘
        </button>
        <!-- ✨ 1. 新增影像上傳頁籤 -->
        <button :class="{ active: activeTab === 'imaging' }" @click="activeTab = 'imaging'">
          影像上傳
        </button>
        <button :class="{ active: activeTab === 'labs' }" @click="activeTab = 'labs'">
          檢驗報告
        </button>
      </div>

      <!-- 頁籤內容 -->
      <div class="modal-body">
        <!-- 病情紀錄頁籤 -->
        <div v-show="activeTab === 'records'" class="tab-panel">
          <ConditionRecordPanel
            v-if="patient"
            :patient="patient"
            :current-date="currentDate"
            @save="handleSaveConditionRecord"
            @update="handleUpdateConditionRecord"
            @delete="handleDeleteConditionRecord"
          />
        </div>

        <!-- 備忘頁籤 -->
        <div v-show="activeTab === 'memos'" class="tab-panel">
          <MemoPanel v-if="patient" :patient-id="patient.id" />
        </div>

        <!-- ✨ 2. 新增影像上傳頁籤的內容面板 -->
        <div v-show="activeTab === 'imaging'" class="tab-panel image-uploader-panel">
          <div class="image-uploader">
            <!-- 階段一：初始狀態，顯示拍照按鈕 -->
            <button v-if="cameraState === 'idle'" @click="startCamera" class="btn-primary">
              <i class="fas fa-camera"></i> 開啟相機拍照
            </button>

            <!-- 階段二：相機開啟狀態 -->
            <div v-if="cameraState === 'streaming'" class="camera-view">
              <video ref="videoPlayer" autoplay playsinline class="video-preview"></video>
              <div class="camera-controls">
                <button @click="captureImage" class="btn-capture" title="拍照">
                  <i class="fas fa-circle"></i>
                </button>
                <button @click="stopCamera" class="btn-cancel">取消</button>
              </div>
            </div>

            <!-- 階段三：照片預覽與上傳狀態 -->
            <div
              v-if="cameraState === 'captured' || cameraState === 'uploading'"
              class="preview-view"
            >
              <img :src="capturedImage" alt="Captured image preview" class="image-preview" />
              <div class="preview-controls">
                <button @click="uploadToDrive" :disabled="isUploading" class="btn-success">
                  <i v-if="isUploading" class="fas fa-spinner fa-spin"></i>
                  {{ isUploading ? '上傳中...' : '確認上傳' }}
                </button>
                <button @click="retakePhoto" :disabled="isUploading" class="btn-secondary">
                  重新拍照
                </button>
              </div>
            </div>

            <!-- 錯誤訊息顯示 -->
            <div v-if="cameraErrorMessage" class="error-message">
              {{ cameraErrorMessage }}
            </div>
          </div>
        </div>

        <!-- 檢驗報告頁籤 -->
        <div v-show="activeTab === 'labs'" class="tab-panel">
          <PatientLabSummaryPanel
            v-if="patient"
            :patient="patient"
            @save-record="handleSaveLabSummaryAsRecord"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useRealtimeNotifications } from '@/composables/useRealtimeNotifications.js'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js'
import { useTaskStore } from '@/stores/taskStore.js'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/composables/useFirebase.js'

// 引入 "內容面板" 元件
import ConditionRecordPanel from './ConditionRecordPanel.vue'
import MemoPanel from './MemoPanel.vue'
import PatientLabSummaryPanel from './PatientLabSummaryPanel.vue'

// --- Props & Emits ---
const props = defineProps({
  isVisible: Boolean,
  patient: Object,
  currentDate: Date,
})
const emit = defineEmits(['close', 'record-updated'])

// --- Component State ---
const activeTab = ref('records')
const { addLocalNotification } = useRealtimeNotifications()
const conditionRecordsApi = ApiManager('condition_records')
const auth = useAuth()
const taskStore = useTaskStore()

// --- Computed Properties ---
const hasPendingMemosForPatient = computed(() => {
  if (!props.patient?.id) return false
  return taskStore.sortedFeedMessages.some(
    (msg) =>
      msg.patientId === props.patient.id &&
      msg.status === 'pending' &&
      msg.content &&
      !msg.content.startsWith('【'),
  )
})

// --- Methods ---
function handleClose() {
  stopCamera() // ✨ 關閉 Modal 時確保相機也關閉
  emit('close')
}
async function handleSaveConditionRecord(recordData) {
  /* ... 保持不變 ... */
}
async function handleUpdateConditionRecord({ id, content }) {
  /* ... 保持不變 ... */
}
async function handleDeleteConditionRecord(recordId) {
  /* ... 保持不變 ... */
}
async function handleSaveLabSummaryAsRecord({ patient, content }) {
  /* ... 保持不變 ... */
}

// ✨ 3. 加入所有影像上傳相關的狀態和函式
// --- Camera & Upload State ---
const cameraState = ref('idle') // 'idle', 'streaming', 'captured', 'uploading'
const videoPlayer = ref(null)
const capturedImage = ref(null)
const cameraStream = ref(null)
const cameraErrorMessage = ref('')
const isUploading = ref(false)

// --- Camera & Upload Methods ---

async function startCamera() {
  cameraErrorMessage.value = ''
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      cameraStream.value = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      cameraState.value = 'streaming'
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (videoPlayer.value) {
        videoPlayer.value.srcObject = cameraStream.value
      }
    } catch (error) {
      console.error('相機啟動失敗:', error)
      cameraErrorMessage.value = `無法開啟相機: ${error.message}`
      cameraState.value = 'idle'
    }
  } else {
    cameraErrorMessage.value = '您的瀏覽器不支援相機功能。'
  }
}

function stopCamera() {
  if (cameraStream.value) {
    cameraStream.value.getTracks().forEach((track) => track.stop())
  }
  cameraStream.value = null
  // 只有在串流中才改回 idle，避免覆蓋 captured 狀態
  if (cameraState.value === 'streaming') {
    cameraState.value = 'idle'
  }
}

function captureImage() {
  const canvas = document.createElement('canvas')
  if (videoPlayer.value) {
    canvas.width = videoPlayer.value.videoWidth
    canvas.height = videoPlayer.value.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(videoPlayer.value, 0, 0, canvas.width, canvas.height)

    capturedImage.value = canvas.toDataURL('image/jpeg')
    stopCamera()
    cameraState.value = 'captured'
  }
}

function retakePhoto() {
  capturedImage.value = null
  startCamera()
}

async function uploadToDrive() {
  if (!capturedImage.value || !props.patient) return

  isUploading.value = true
  cameraState.value = 'uploading'
  cameraErrorMessage.value = ''

  try {
    const base64String = capturedImage.value.split(',')[1]

    const date = new Date()
    const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`
    const timeStr = `${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`

    const fileName = `[${props.patient.medicalRecordNumber}]_${props.patient.name}_${dateStr}_${timeStr}.jpg`

    const payload = {
      fileName: fileName,
      fileContentBase64: base64String,
      mimeType: 'image/jpeg',
    }

    const uploadFileToDrive = httpsCallable(functions, 'uploadFileToDrive')
    const result = await uploadFileToDrive(payload)

    console.log('上傳成功:', result.data)
    addLocalNotification(`影像 "${result.data.file.name}" 上傳成功！`, 'success')

    cameraState.value = 'idle'
    capturedImage.value = null
  } catch (error) {
    console.error('上傳失敗:', error)
    cameraErrorMessage.value = `上傳失敗: ${error.message}`
    cameraState.value = 'captured' // 失敗後回到預覽狀態
  } finally {
    isUploading.value = false
  }
}

// --- Watcher ---
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      activeTab.value = hasPendingMemosForPatient.value ? 'memos' : 'records'
    } else {
      // 當 Modal 關閉時，確保相機也關閉
      stopCamera()
    }
  },
)
</script>

<style scoped>
/* ... (您現有的 .modal-overlay, .modal-container 等樣式保持不變) ... */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.modal-container {
  background-color: #f8f9fa;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 1100px;
  height: 90vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #6c757d;
}
.close-btn:hover {
  color: #343a40;
}

.tabs-navigation {
  display: flex;
  background-color: #e9ecef;
  padding: 0.5rem 1.5rem 0 1.5rem;
  flex-shrink: 0;
  gap: 0.5rem;
}
.tabs-navigation button {
  padding: 0.75rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 500;
  border: 1px solid transparent;
  border-bottom: none;
  background-color: transparent;
  color: #6c757d;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  transition: all 0.2s;
  position: relative;
}
.tabs-navigation button.active {
  background-color: #fff;
  color: #007bff;
  border-color: #dee2e6;
}
.memo-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 10px;
  height: 10px;
  background-color: #dc3545;
  border-radius: 50%;
  border: 2px solid #e9ecef;
}
.tabs-navigation button.active .memo-indicator {
  border-color: #fff;
}

.modal-body {
  flex-grow: 1;
  overflow: hidden;
  background-color: #fff;
  padding: 1.5rem;
  display: flex;
}

.tab-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* ✨ 5. 加入影像上傳面板和其內部元件的樣式 */
.image-uploader-panel {
  align-items: center; /* 讓內容垂直置中 */
  justify-content: center; /* 讓內容水平置中 */
}

.image-uploader {
  width: 100%;
  max-width: 600px; /* 給一個最大寬度，避免在寬螢幕上過大 */
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  gap: 1rem;
  background-color: #f9f9f9;
}

.camera-view,
.preview-view {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.video-preview,
.image-preview {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background-color: #000;
}

.camera-controls,
.preview-controls {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.image-uploader button {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.image-uploader button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-capture {
  background-color: #dc3545;
  color: white;
  border-radius: 50%;
  width: 60px;
  height: 60px;
  font-size: 1.5rem;
  justify-content: center;
  border: 4px solid white;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
}
.btn-capture:hover:not(:disabled) {
  background-color: #b02a37;
}

.btn-cancel {
  background-color: #6c757d;
  color: white;
}
.btn-cancel:hover:not(:disabled) {
  background-color: #5a6268;
}

.btn-success {
  background-color: #28a745;
  color: white;
}
.btn-success:hover:not(:disabled) {
  background-color: #218838;
}

.btn-secondary {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
}
.btn-secondary:hover:not(:disabled) {
  background-color: #e2e6ea;
}

.error-message {
  color: #dc3545;
  font-weight: 500;
  margin-top: 0.5rem;
}

@media (max-width: 992px) {
  .modal-body {
    overflow-y: auto;
  }
}
</style>
