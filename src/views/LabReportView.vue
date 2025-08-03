<!-- 檔案路徑: src/views/LabReportView.vue -->
<template>
  <div class="page-container">
    <header class="page-header">
      <h1>檢驗報告管理</h1>
      <p class="page-description">
        上傳批次檢驗報告 Excel 檔案，系統將自動解析並存入對應病人的歷史紀錄中。
      </p>
    </header>

    <main class="page-main-content">
      <div class="upload-section">
        <h2>步驟一：上傳 Excel 檔案</h2>
        <div class="upload-box">
          <input
            type="file"
            @change="handleFileSelect"
            accept=".xlsx, .xls"
            class="file-input"
            :disabled="isUploading"
          />
          <button @click="handleUpload" :disabled="!selectedFile || isUploading" class="upload-btn">
            <span v-if="isUploading">處理中...</span>
            <span v-else>上傳並處理</span>
          </button>
        </div>
        <div v-if="selectedFile" class="file-info">
          已選擇檔案：<strong>{{ selectedFile.name }}</strong>
        </div>
      </div>

      <!-- ✨ 結果顯示區塊 -->
      <div class="results-section">
        <h2>步驟二：檢視處理結果</h2>

        <!-- 上傳中狀態 -->
        <div v-if="isUploading" class="processing-state">
          <div class="loading-spinner"></div>
          <p>正在解析與匯入資料，請稍候...</p>
        </div>

        <!-- 成功結果 -->
        <div v-if="uploadResult" class="result-box success">
          <h3>{{ uploadResult.message }}</h3>
          <p>成功匯入: {{ uploadResult.processedCount }} 筆</p>
          <p>失敗: {{ uploadResult.errorCount }} 筆</p>
          <div v-if="uploadResult.errorCount > 0" class="error-details">
            <h4>失敗詳情：</h4>
            <ul>
              <li v-for="(err, index) in uploadResult.errors" :key="index">
                病歷號 [{{ err.row['病歷號'] || '未提供' }}]: {{ err.reason }}
              </li>
            </ul>
          </div>
        </div>

        <!-- 失敗結果 -->
        <div v-if="uploadError" class="result-box error">
          <h3>上傳失敗</h3>
          <p>{{ uploadError }}</p>
        </div>

        <!-- 初始狀態 -->
        <div v-if="!isUploading && !uploadResult && !uploadError" class="placeholder-text">
          上傳檔案後，這裡會顯示匯入的結果報告。
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getFunctions, httpsCallable } from 'firebase/functions'

const selectedFile = ref(null)
const isUploading = ref(false)
const uploadResult = ref(null)
const uploadError = ref(null)

function handleFileSelect(event) {
  selectedFile.value = event.target.files[0]
  uploadResult.value = null // 清除上次的結果
  uploadError.value = null
}

// ✨ 核心功能：讀取檔案並呼叫後端函式
async function handleUpload() {
  if (!selectedFile.value) {
    alert('請先選擇一個檔案！')
    return
  }

  isUploading.value = true
  uploadResult.value = null
  uploadError.value = null

  try {
    // 1. 將檔案讀取為 Base64 字串
    //    Base64 是一種將二進位檔案轉換為純文字的方式，非常適合透過網路傳輸
    const fileContentBase64 = await toBase64(selectedFile.value)

    // 2. 準備呼叫後端雲端函式
    const functions = getFunctions()
    const processLabReport = httpsCallable(functions, 'processLabReport')

    // 3. 呼叫函式，並將檔案名稱和內容傳過去
    const result = await processLabReport({
      fileName: selectedFile.value.name,
      fileContent: fileContentBase64,
    })

    // 4. 顯示成功結果
    uploadResult.value = result.data
  } catch (error) {
    console.error('上傳處理失敗:', error)
    uploadError.value = error.message || '發生未知錯誤，請檢查主控台。'
  } finally {
    isUploading.value = false
  }
}

// ✨ 輔助函式：將 File 物件轉換為 Base64 字串
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      // FileReader 讀取的結果會是 "data:[MIME type];base64,[BASE64_STRING]"
      // 我們只需要逗號後面的部分
      const encoded = reader.result.toString().replace(/^data:(.*,)?/, '')
      if (encoded.length % 4 > 0) {
        encoded += '='.repeat(4 - (encoded.length % 4))
      }
      resolve(encoded)
    }
    reader.onerror = (error) => reject(error)
  })
}
</script>

<style scoped>
.page-container {
  padding: 1rem;
}
.page-header {
  margin-bottom: 1.5rem;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 1rem;
}
h1 {
  font-size: 2rem;
  margin: 0;
}
.page-description {
  font-size: 1rem;
  color: #6c757d;
}
.page-main-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.upload-section,
.results-section {
  background-color: #fff;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}
h2 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #005a9c;
}
.upload-box {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.file-info {
  margin-top: 1rem;
  color: #495057;
}
.placeholder-text {
  color: #adb5bd;
  text-align: center;
  padding: 2rem;
}
</style>
