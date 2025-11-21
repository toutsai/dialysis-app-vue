<template>
  <div class="kidit-form-container" v-if="formData">
    <!-- 區塊 1: 身分與基本資料 -->
    <div class="form-section">
      <h4 class="section-title">基本身分資料</h4>
      <div class="form-grid">
        <div class="form-group">
          <label>01 姓名</label>
          <input type="text" v-model="formData.name" disabled class="input-disabled" />
        </div>

        <div class="form-group">
          <label>04 身分證號</label>
          <input type="text" v-model="formData.idNumber" placeholder="10碼" />
        </div>

        <div class="form-group">
          <label>08 病歷號</label>
          <input type="text" v-model="formData.medicalRecordNumber" placeholder="10碼" />
        </div>

        <div class="form-group">
          <label>02 病患類別</label>
          <select v-model="formData.patientCategory">
            <option
              v-for="opt in KIDIT_OPTIONS.patientCategory"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>03 生日 (西元)</label>
          <input type="date" v-model="formData.birthDate" />
          <small class="roc-date" v-if="formData.birthDate">
            民國: {{ toRocDate(formData.birthDate) }}
          </small>
        </div>

        <div class="form-group">
          <label>05 性別</label>
          <select v-model="formData.gender">
            <option v-for="opt in KIDIT_OPTIONS.gender" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>15 血型</label>
          <select v-model="formData.bloodType">
            <option v-for="opt in KIDIT_OPTIONS.bloodType" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>17 原住民</label>
          <select v-model="formData.isIndigenous">
            <option v-for="opt in KIDIT_OPTIONS.yesNo" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>18 福保身分</label>
          <select v-model="formData.isWelfare">
            <option v-for="opt in KIDIT_OPTIONS.yesNo" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>16 重大傷病卡號</label>
          <input type="text" v-model="formData.catastrophicCardNo" placeholder="10碼" />
        </div>
      </div>
    </div>

    <!-- 區塊 2: 聯絡與社會資料 -->
    <div class="form-section">
      <h4 class="section-title">聯絡與社會資料</h4>
      <div class="form-grid">
        <div class="form-group full-width">
          <label>10 地址</label>
          <input type="text" v-model="formData.address" placeholder="最多80字" />
        </div>

        <div class="form-group">
          <label>07 電話</label>
          <input type="text" v-model="formData.phone" placeholder="最多25碼" />
        </div>

        <div class="form-group">
          <label>06 婚姻</label>
          <select v-model="formData.maritalStatus">
            <option v-for="opt in KIDIT_OPTIONS.maritalStatus" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>11 教育程度</label>
          <select v-model="formData.education">
            <option v-for="opt in KIDIT_OPTIONS.education" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>12 職業</label>
          <select v-model="formData.occupation">
            <option v-for="opt in KIDIT_OPTIONS.occupation" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>13 連絡人</label>
          <input type="text" v-model="formData.contactPerson" placeholder="姓名" />
        </div>

        <div class="form-group">
          <label>14 關係</label>
          <select v-model="formData.relationship">
            <option v-for="opt in KIDIT_OPTIONS.relation" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- 區塊 3: 透析與病史資料 -->
    <div class="form-section">
      <h4 class="section-title">透析與病史資料</h4>
      <div class="form-grid">
        <div class="form-group">
          <label>09 透析代號</label>
          <input type="text" v-model="formData.dialysisCode" placeholder="10碼" />
        </div>

        <div class="form-group span-2">
          <label>19 狀態</label>
          <select v-model="formData.status">
            <option v-for="opt in KIDIT_OPTIONS.status" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>20 首次治療日期</label>
          <input type="date" v-model="formData.firstDialysisDate" />
        </div>

        <div class="form-group">
          <label>21 本院開始治療日期</label>
          <input type="date" v-model="formData.hospitalStartDate" />
        </div>

        <div class="form-group">
          <label>22 原發病大類</label>
          <select v-model="formData.diagnosisCategory">
            <option
              v-for="opt in KIDIT_OPTIONS.diagnosisCategory"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="form-group span-2">
          <label>23 原發病細類</label>
          <!-- 這裡如果選項太多，也可以考慮改成帶搜尋功能的 Select -->
          <select v-model="formData.diagnosisSubcategory">
            <option value="">請選擇</option>
            <option
              v-for="opt in KIDIT_OPTIONS.diagnosisSubcategory"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.value }} - {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="save-btn" @click="saveData" :disabled="isSaving">
        <i class="fas fa-save"></i> {{ isSaving ? '儲存中...' : '儲存 KiDit 資料' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { kiditService } from '@/services/kiditService'
import { KIDIT_OPTIONS, toRocDate } from '@/utils/kiditHelpers'

const props = defineProps({
  patient: Object,
})

const emit = defineEmits(['updated'])
const isSaving = ref(false)
const formData = ref({})

// 初始化資料：優先讀取 kiditProfile，若無則嘗試從病患基本資料帶入
watch(
  () => props.patient,
  (newVal) => {
    if (newVal) {
      const k = newVal.kiditProfile || {}

      formData.value = {
        // 基本資料
        name: newVal.name || '',
        idNumber: k.idNumber || newVal.idNumber || '',
        medicalRecordNumber: k.medicalRecordNumber || newVal.medicalRecordNumber || '',
        patientCategory: k.patientCategory || '00', // 預設健保
        birthDate: k.birthDate || newVal.birthDate || '',
        gender: k.gender || (newVal.gender === '男' ? '1' : '2'),
        bloodType: k.bloodType || '',
        isIndigenous: k.isIndigenous || 'N', // 預設否
        isWelfare: k.isWelfare || 'N', // 預設否
        catastrophicCardNo: k.catastrophicCardNo || '',

        // 聯絡資料
        address: k.address || '',
        phone: k.phone || '',
        maritalStatus: k.maritalStatus || '',
        education: k.education || '',
        occupation: k.occupation || '',
        contactPerson: k.contactPerson || '',
        relationship: k.relationship || '',

        // 透析病史
        dialysisCode: k.dialysisCode || '',
        status: k.status || '1', // 預設長期血液透析
        firstDialysisDate: k.firstDialysisDate || '',
        hospitalStartDate: k.hospitalStartDate || '',
        diagnosisCategory: k.diagnosisCategory || '',
        diagnosisSubcategory: k.diagnosisSubcategory || '',
      }
    }
  },
  { immediate: true },
)

async function saveData() {
  isSaving.value = true
  try {
    // 儲存到 kiditProfile 欄位
    await kiditService.updatePatientAccessInfo(props.patient.id, {
      kiditProfile: formData.value,
    })
    alert('KiDit 資料已儲存！')
    emit('updated')
  } catch (error) {
    console.error(error)
    alert('儲存失敗')
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
.kidit-form-container {
  padding: 10px;
  max-height: 70vh;
  overflow-y: auto;
}

.form-section {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.section-title {
  margin: 0 0 15px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #3498db;
  color: #2c3e50;
  font-size: 1.1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 15px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.full-width {
  grid-column: 1 / -1;
}

.span-2 {
  grid-column: span 2;
}

label {
  font-size: 0.85rem;
  color: #666;
  font-weight: 600;
}

input,
select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95rem;
}

input:focus,
select:focus {
  border-color: #3498db;
  outline: none;
}

.input-disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
  color: #888;
}

.roc-date {
  font-size: 0.8rem;
  color: #e67e22;
  text-align: right;
}

.actions {
  text-align: right;
  padding-top: 10px;
  border-top: 1px solid #eee;
}

.save-btn {
  background: #27ae60;
  color: white;
  border: none;
  padding: 10px 25px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 0.2s;
}

.save-btn:hover {
  background: #219150;
}

.save-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .span-2 {
    grid-column: 1 / -1;
  }
}
</style>
