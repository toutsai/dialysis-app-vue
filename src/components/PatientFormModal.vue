<form id="patient-form">
            <input type="hidden" id="patient-id">
            <input type="hidden" id="patient-type">
            <div class="form-grid">
                <div class="form-field"><label for="name">姓名</label><input type="text" id="name" required></div>
                <div class="form-field"><label for="medical-record-number">病歷號</label><input type="text" id="medical-record-number" required></div>
                <div class="form-field"><label id="physician-label">醫師</label><select id="physician"></select></div>
                <div class="form-field"><label for="frequency">透析頻率</label><select id="frequency"></select></div>
                <div class="form-field"><label for="mode">透析模式</label><select id="mode"></select></div>

                <div class="form-field opd-field"><label for="vasc-access">目前血管通路</label><select id="vasc-access"></select></div>
                <div class="form-field opd-field"><label for="first-dialysis-date">首次透析日期</label><input type="date" id="first-dialysis-date"></div>
                <div class="form-field opd-field"><label for="access-creation-date">通路建立日期</label><input type="date" id="access-creation-date"></div>

                <fieldset class="form-group form-field-full ipd-field">
                    <legend>狀態標記</legend>
                    <div class="checkbox-container">
                        <div class="checkbox-group"><input type="checkbox" id="is-first-dialysis"><label for="is-first-dialysis">首透</label></div>
                        <div class="checkbox-group"><input type="checkbox" id="is-discontinued"><label for="is-discontinued">中止透析</label></div>
                    </div>
                </fieldset>

                <fieldset class="form-group form-field-full"><legend>須注意疾病</legend><div id="disease-checkboxes" class="checkbox-container"></div></fieldset>
                <div class="form-field form-field-full"><label for="remarks">備註</label><textarea id="remarks" rows="3"></textarea></div>
            </div>
            <div class="modal-footer"><button type="submit">儲存</button></div>
        </form>

        <style>
        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5); align-items: center; justify-content: center; }
        .modal-content { background-color: #fefefe; padding: 20px; border: 1px solid #888; width: 90%; max-width: 700px; border-radius: 8px; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
        .modal-header h2 { margin: 0; }
        .close-button { color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .form-field { display: flex; flex-direction: column; }
        .form-field.hidden { display: none; }
        .form-field label { margin-bottom: 5px; font-weight: bold; }
        .form-field input, .form-field select, .form-field textarea { padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 100%; box-sizing: border-box; }
        .form-field-full { grid-column: 1 / -1; }
        .form-group { border: 1px solid #e0e0e0; padding: 15px; border-radius: 5px; margin-top: 10px; }
        .form-group legend { padding: 0 10px; font-weight: bold; color: #333; }
        .checkbox-container { display: flex; flex-wrap: wrap; gap: 20px; }
        .checkbox-group { display: flex; align-items: center; gap: 5px; }
        .checkbox-group input[type="checkbox"] { width: auto; height: 1.2em; width: 1.2em; }
        .checkbox-group label { font-weight: normal; margin-bottom: 0; }
        .modal-footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: right; }
        #delete-reason-dialog { border: 1px solid #ccc; border-radius: 8px; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
        #delete-reason-dialog::backdrop { background-color: rgba(0,0,0,0.5); }
        #delete-reason-dialog h3 { margin-top: 0; }
        #delete-reason-dialog .button-group { display: flex; flex-direction: column; gap: 10px; margin-top: 15px; }
        #delete-reason-dialog button { width: 100%; padding: 10px; font-size: 1em; }
        <script>

<script setup>
import { ref, watch } from 'vue';

// 1. 定義 props 和 emits
const props = defineProps({
  patientData: Object, // 接收傳入的病人資料，如果是新增則為 null
  patientType: String, // 'ipd' 或 'opd'
  isModalVisible: Boolean
});

const emit = defineEmits(['close', 'save']);

// 2. 定義表單的內部狀態
const form = ref({});

// 3. 監聽 props 的變化，當傳入新的病人資料時，更新表單
watch(() => props.patientData, (newData) => {
  form.value = { ...newData } || {};
}, { immediate: true });

// 4. 定義儲存方法
function handleSave() {
  // 呼叫 emit，將表單資料傳遞給父元件
  emit('save', form.value);
}
<script>
