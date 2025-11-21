<!-- src/components/kidit/VascularAccessForm.vue -->
<template>
  <div class="access-form" v-if="localData">
    <div class="form-section">
      <h4>{{ title }}</h4>

      <!-- 1. 自體動靜脈瘻管 -->
      <div class="form-row">
        <label>
          <input type="checkbox" v-model="localData.isAutoCap" /> 自體動靜脈瘻管 (AV-Fistula)
        </label>
        <div v-if="localData.isAutoCap" class="sub-options">
          <select v-model="localData.autoCapSide">
            <option value="">側別</option>
            <option value="L">左</option>
            <option value="R">右</option>
          </select>
          <select v-model="localData.autoCapSite">
            <option value="">部位</option>
            <option value="1">前臂</option>
            <option value="2">上臂</option>
            <option value="3">大腿</option>
          </select>
        </div>
      </div>

      <!-- 2. 人工動靜脈瘻管 -->
      <div class="form-row">
        <label>
          <input type="checkbox" v-model="localData.isManuCap" /> 人工動靜脈瘻管 (AV-Graft)
        </label>
        <div v-if="localData.isManuCap" class="sub-options">
          <select v-model="localData.manuCapSide">
            <option value="">側別</option>
            <option value="L">左</option>
            <option value="R">右</option>
          </select>
          <select v-model="localData.manuCapSite">
            <option value="">部位</option>
            <option value="1">前臂直型</option>
            <option value="2">前臂彎型</option>
            <option value="3">上臂</option>
            <option value="4">大腿</option>
          </select>
        </div>
      </div>

      <!-- 3. 長期導管 -->
      <div class="form-row">
        <label>
          <input type="checkbox" v-model="localData.isPermCath" /> 長期導管 (Perm Cath)
        </label>
        <div v-if="localData.isPermCath" class="sub-options">
          <select v-model="localData.permCathSide">
            <option value="">側別</option>
            <option value="L">左</option>
            <option value="R">右</option>
          </select>
          <select v-model="localData.permCathSite">
            <option value="">部位</option>
            <option value="1">頸靜脈</option>
            <option value="2">鎖骨下靜脈</option>
            <option value="3">股靜脈</option>
          </select>
        </div>
      </div>

      <!-- 4. 雙腔導管 (Double Lumen) -->
      <div class="form-row">
        <label>
          <input type="checkbox" v-model="localData.isDoubleLumen" /> 雙腔導管 (Double Lumen)
        </label>
        <div v-if="localData.isDoubleLumen" class="sub-options">
          <select v-model="localData.dlSide">
            <option value="">側別</option>
            <option value="L">左</option>
            <option value="R">右</option>
          </select>
          <select v-model="localData.dlSite">
            <option value="">部位</option>
            <option value="1">頸靜脈</option>
            <option value="2">鎖骨下靜脈</option>
            <option value="3">股靜脈</option>
          </select>
        </div>
      </div>

      <button class="save-btn" @click="saveData" :disabled="isSaving">
        {{ isSaving ? '儲存中...' : '儲存設定' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { kiditService } from '@/services/kiditService'

const props = defineProps({
  patient: Object,
  type: String, // 'current' 或 'unused'
})

const emit = defineEmits(['updated'])
const isSaving = ref(false)
const localData = ref({})

const title = props.type === 'current' ? '目前使用血管通路' : '其他未使用血管通路'

// 初始化資料：從 patient 物件中讀取，若無則給空物件
watch(
  () => props.patient,
  (newVal) => {
    if (newVal && newVal.vascularAccessInfo && newVal.vascularAccessInfo[props.type]) {
      localData.value = JSON.parse(JSON.stringify(newVal.vascularAccessInfo[props.type]))
    } else {
      // 預設空結構
      localData.value = {
        isAutoCap: false,
        autoCapSide: '',
        autoCapSite: '',
        isManuCap: false,
        manuCapSide: '',
        manuCapSite: '',
        isPermCath: false,
        permCathSide: '',
        permCathSite: '',
        isDoubleLumen: false,
        dlSide: '',
        dlSite: '',
      }
    }
  },
  { immediate: true },
)

async function saveData() {
  isSaving.value = true
  try {
    // 準備要更新到 Firestore 的完整結構
    // 注意：我們不能覆蓋掉另一個 type 的資料，所以要先讀取現有的 info
    const currentInfo = props.patient.vascularAccessInfo || {}

    const newInfo = {
      ...currentInfo,
      [props.type]: localData.value,
    }

    await kiditService.updatePatientAccessInfo(props.patient.id, newInfo)
    alert('儲存成功')
    emit('updated') // 通知父元件重新抓取病人資料
  } catch (error) {
    console.error(error)
    alert('儲存失敗')
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
.form-section {
  padding: 15px;
  background: #f9f9f9;
  border-radius: 8px;
}
.form-row {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #eee;
}
.sub-options {
  margin-left: 25px;
  margin-top: 5px;
  display: flex;
  gap: 10px;
}
select {
  padding: 4px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.save-btn {
  margin-top: 15px;
  padding: 8px 20px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.save-btn:disabled {
  background: #ccc;
}
</style>
