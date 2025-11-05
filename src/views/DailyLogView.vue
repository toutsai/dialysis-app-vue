<!-- 檔案路徑: src/views/DailyLogView.vue (✨ 最終整合版 ✨) -->
<template>
  <div class="log-page-container" id="pdf-export-area">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在載入 {{ selectedDate }} 的日誌與排班資料...</p>
    </div>

    <header class="log-page-header">
      <div class="header-left">
        <h1>工作日誌</h1>

        <div class="date-navigator">
          <button @click="changeDate(-1)">❮ 上一日</button>

          <div class="date-display-wrapper">
            <input type="date" v-model="selectedDate" class="hidden-date-input" />
            <span class="current-date-text" @click="triggerDateInput">{{
              selectedDateDisplay
            }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
          </div>

          <button @click="changeDate(1)">下一日 ❯</button>
          <button @click="goToToday">今日</button>
        </div>
        <button
          class="btn btn-handover"
          @click="isHandoverDialogVisible = true"
          :disabled="isPageLocked"
        >
          <i class="fas fa-clipboard-list"></i> 組長交班
        </button>
      </div>
      <div class="header-right">
        <span class="status-indicator">{{ statusText }}</span>
        <button @click="exportToPDF" class="export-pdf-btn" :disabled="isLoading">匯出 PDF</button>
      </div>
    </header>

    <main class="log-page-main">
      <!-- ================================== -->
      <!-- ✨ 桌面版容器 ✨ -->
      <!-- ================================== -->
      <div class="desktop-only">
        <!-- 營運統計 -->
        <section class="log-section">
          <div class="section-header">
            <h2>營運統計</h2>
            <button @click="syncStatsWithSchedule" class="sync-stats-btn">
              <i class="fas fa-sync-alt"></i> 更新各班病人人數
            </button>
          </div>

          <div class="stats-grid">
            <!-- Grid Headers -->
            <div class="grid-header cell-item">項目</div>
            <div class="grid-header cell-category">班別</div>
            <div class="grid-header cell-shift">第一班 (7-12)</div>
            <div class="grid-header cell-shift">第二班 (12-3)</div>
            <div class="grid-header cell-shift">第三班 (3-11)</div>
            <div class="grid-header cell-total">合計</div>

            <!-- 洗腎中心床位 -->
            <div class="cell-item rowspan-4">洗腎中心床位 (限44床)</div>
            <div class="cell-category">門診</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.early.opd }}</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.noon.opd }}</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.late.opd }}</div>
            <div class="cell-total">
              {{
                (dailyLog.stats.main_beds.early.opd || 0) +
                (dailyLog.stats.main_beds.noon.opd || 0) +
                (dailyLog.stats.main_beds.late.opd || 0)
              }}
            </div>

            <div class="cell-category">住院</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.early.ipd }}</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.noon.ipd }}</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.late.ipd }}</div>
            <div class="cell-total">
              {{
                (dailyLog.stats.main_beds.early.ipd || 0) +
                (dailyLog.stats.main_beds.noon.ipd || 0) +
                (dailyLog.stats.main_beds.late.ipd || 0)
              }}
            </div>

            <div class="cell-category">急診</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.early.er }}</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.noon.er }}</div>
            <div class="cell-data">{{ dailyLog.stats.main_beds.late.er }}</div>
            <div class="cell-total">
              {{
                (dailyLog.stats.main_beds.early.er || 0) +
                (dailyLog.stats.main_beds.noon.er || 0) +
                (dailyLog.stats.main_beds.late.er || 0)
              }}
            </div>

            <div class="cell-category">HDR開床數 (A)</div>
            <div class="cell-data total-a">{{ dailyLog.stats.main_beds.early.total }}</div>
            <div class="cell-data total-a">{{ dailyLog.stats.main_beds.noon.total }}</div>
            <div class="cell-data total-a">{{ dailyLog.stats.main_beds.late.total }}</div>
            <div class="cell-total total-a">
              {{
                (dailyLog.stats.main_beds.early.total || 0) +
                (dailyLog.stats.main_beds.noon.total || 0) +
                (dailyLog.stats.main_beds.late.total || 0)
              }}
            </div>

            <!-- 急重症床位 -->
            <div class="cell-item rowspan-2">急重症 (外圍)</div>
            <div class="cell-category">加護病房+RCC (B)</div>
            <div class="cell-data">{{ dailyLog.stats.peripheral_beds.early.ipd }}</div>
            <div class="cell-data">{{ dailyLog.stats.peripheral_beds.noon.ipd }}</div>
            <div class="cell-data">{{ dailyLog.stats.peripheral_beds.late.ipd }}</div>
            <div class="cell-total">
              {{
                (dailyLog.stats.peripheral_beds.early.ipd || 0) +
                (dailyLog.stats.peripheral_beds.noon.ipd || 0) +
                (dailyLog.stats.peripheral_beds.late.ipd || 0)
              }}
            </div>

            <div class="cell-category">急診 (C)</div>
            <div class="cell-data">{{ dailyLog.stats.peripheral_beds.early.er }}</div>
            <div class="cell-data">{{ dailyLog.stats.peripheral_beds.noon.er }}</div>
            <div class="cell-data">{{ dailyLog.stats.peripheral_beds.late.er }}</div>
            <div class="cell-total">
              {{
                (dailyLog.stats.peripheral_beds.early.er || 0) +
                (dailyLog.stats.peripheral_beds.noon.er || 0) +
                (dailyLog.stats.peripheral_beds.late.er || 0)
              }}
            </div>

            <!-- 總人次 -->
            <div class="cell-item">總人次</div>
            <div class="cell-category">(A)+(B)+(C)</div>
            <div class="cell-data total-final">{{ totalPatients.early }}</div>
            <div class="cell-data total-final">{{ totalPatients.noon }}</div>
            <div class="cell-data total-final">{{ totalPatients.late }}</div>
            <div class="cell-total total-final">
              {{ totalPatients.early + totalPatients.noon + totalPatients.late }}
            </div>

            <!-- 病人照護 -->
            <div class="cell-item rowspan-3">病人照護</div>
            <div class="cell-category">ON D/L 病患</div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.onDL.early" />
            </div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.onDL.noon" />
            </div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.onDL.late" />
            </div>
            <div class="cell-total">-</div>

            <div class="cell-category">AK 凝固更換病患</div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.akChange.early" />
            </div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.akChange.noon" />
            </div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.akChange.late" />
            </div>
            <div class="cell-total">-</div>

            <div class="cell-category">預約未到病患</div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.noShow.early" />
            </div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.noShow.noon" />
            </div>
            <div class="cell-input">
              <input type="text" v-model="dailyLog.stats.patient_care.noShow.late" />
            </div>
            <div class="cell-total">-</div>

            <!-- 護理人力總計列 -->
            <div class="cell-item">護理人力</div>
            <div class="cell-category">
              <button @click="toggleStaffingDetails" class="toggle-details-btn">
                {{ isStaffingDetailsVisible ? '收合計' : '展開計算' }}
                <i
                  class="fas"
                  :class="isStaffingDetailsVisible ? 'fa-chevron-up' : 'fa-chevron-down'"
                ></i>
              </button>
            </div>
            <div class="cell-data total-final">{{ calculatedStaffingTotals.early.toFixed(3) }}</div>
            <div class="cell-data total-final">{{ calculatedStaffingTotals.noon.toFixed(3) }}</div>
            <div class="cell-data total-final">{{ calculatedStaffingTotals.late.toFixed(3) }}</div>
            <div class="cell-total total-final">
              {{ calculatedStaffingTotals.total.toFixed(3) }}
            </div>

            <!-- 護理人力計算明細 (條件渲染) -->
            <template v-if="isStaffingDetailsVisible">
              <!-- 子標題列 -->
              <div class="cell-item nested-header"></div>
              <div class="cell-category nested-header label-count-header">
                <span>班別</span>
                <span>人數</span>
              </div>
              <div class="nested-header">第一班 比例</div>
              <div class="nested-header">第二班 比例</div>
              <div class="nested-header">第三班 比例</div>
              <div class="nested-header">操作</div>

              <!-- 明細項目 v-for -->
              <template v-for="(item, index) in dailyLog.stats.staffing.details" :key="item.id">
                <div class="cell-item nested-item"></div>
                <div class="cell-category nested-item label-count-cell">
                  <input
                    type="text"
                    v-model="item.label"
                    placeholder="項目名稱"
                    class="label-input"
                  />
                  <input type="number" min="0" v-model.number="item.count" class="count-input" />
                </div>
                <div class="cell-input nested-item">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    v-model.number="item.ratio1"
                    :disabled="item.isLocked"
                  />
                </div>
                <div class="cell-input nested-item">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    v-model.number="item.ratio2"
                    :disabled="item.isLocked"
                  />
                </div>
                <div class="cell-input nested-item">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    v-model.number="item.ratio3"
                    :disabled="item.isLocked"
                  />
                </div>
                <div class="cell-input nested-item action-cell">
                  <button @click="deleteStaffingRow(index)" class="delete-btn mini">移除</button>
                </div>
              </template>

              <!-- 調整時數行 -->
              <div class="cell-item nested-item deduction-row"></div>
              <div class="cell-category nested-item deduction-row">
                調整時數 (加班+/早退-)[會自動幫忙乘0.125]
              </div>
              <div class="cell-input nested-item deduction-row">
                <input
                  type="number"
                  step="0.01"
                  v-model.number="dailyLog.stats.staffing.adjustments.shift1"
                  placeholder="例: +2 或 -1.5小時"
                />
              </div>
              <div class="cell-input nested-item deduction-row">
                <input
                  type="number"
                  step="0.01"
                  v-model.number="dailyLog.stats.staffing.adjustments.shift2"
                  placeholder="例: +2 或 -1.5小時"
                />
              </div>
              <div class="cell-input nested-item deduction-row">
                <input
                  type="number"
                  step="0.01"
                  v-model.number="dailyLog.stats.staffing.adjustments.shift3"
                  placeholder="例: +2 或 -1.5小時"
                />
              </div>
              <div class="cell-input nested-item deduction-row"></div>

              <!-- 新增按鈕行 -->
              <div class="cell-item nested-item"></div>
              <div class="add-row-cell">
                <button @click="addStaffingRow" class="add-row-btn-header">新增計算項目</button>
              </div>
            </template>

            <!-- 護病比 -->
            <div class="cell-item">護病比</div>
            <div class="cell-category">總人次 / 護理人力</div>
            <div class="cell-data">{{ nursePatientRatios.early }}</div>
            <div class="cell-data">{{ nursePatientRatios.noon }}</div>
            <div class="cell-data">{{ nursePatientRatios.late }}</div>
            <div class="cell-total">{{ nursePatientRatios.total }}</div>
          </div>
        </section>

        <!-- 病人動態表 -->
        <section class="log-section">
          <div class="section-header">
            <h2>病人動態表</h2>
            <button @click="addRow('patientMovements')" class="add-row-btn-header">
              新增手動動態
            </button>
          </div>
          <div v-if="dailyLog.patientMovements.length > 0" class="dynamic-table-container">
            <table class="dynamic-table">
              <thead>
                <tr>
                  <th class="col-type">類型</th>
                  <th class="col-name">姓名</th>
                  <th class="col-mrn">病歷號</th>
                  <th class="col-bed">床號</th>
                  <th class="col-date">住院日</th>
                  <th class="col-date">出院日</th>
                  <th class="col-physician">會診醫師</th>
                  <th class="col-reason-wide">住院原因</th>
                  <th class="col-remarks-wide">備註</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, index) in dailyLog.patientMovements"
                  :key="item.id"
                  :class="{ 'is-edited-row': isRowInEditMode(item) }"
                >
                  <td class="col-type">
                    <select v-if="isRowInEditMode(item)" v-model="item.type" class="type-select">
                      <option value="手動">手動</option>
                      <option value="首透">首透</option>
                      <option value="暫停透析">暫停透析</option>
                      <option value="刪除排程">刪除排程</option>
                      <option value="更改模式">更改模式</option>
                      <option value="更改頻率">更改頻率</option>
                      <option value="轉常規門診">轉常規門診</option>
                      <option value="其他">其他</option>
                    </select>
                    <span v-else :class="['movement-type-badge', `type-${item.type || '手動'}`]">
                      {{ item.type || '手動' }}
                    </span>
                  </td>
                  <td class="col-name">
                    <div class="autocomplete-wrapper">
                      <!-- ✅ [核心修正] 將遺失的事件監聽器加回來 -->
                      <input
                        type="text"
                        :ref="(el) => (inputRefs[`movements-${index}`] = el)"
                        v-model="item.name"
                        :disabled="!isRowInEditMode(item)"
                        @input="handlePatientSearch(index, 'movements')"
                        @focus="showAutocomplete($event, index, 'movements')"
                        @blur="hideAutocomplete"
                        placeholder="搜尋病人..."
                      />
                    </div>
                  </td>
                  <td class="col-mrn">
                    <input
                      type="text"
                      v-model="item.medicalRecordNumber"
                      :disabled="!isRowInEditMode(item)"
                    />
                  </td>
                  <td class="col-bed">
                    <div
                      class="bed-change-cell"
                      :class="{
                        'is-clickable':
                          isRowInEditMode(item) &&
                          ['ipd', 'er'].includes(patientMap.get(item.patientId)?.status),
                      }"
                      @click="isRowInEditMode(item) && promptWardNumber(index)"
                    >
                      {{
                        patientMap.get(item.patientId)?.wardNumber ||
                        (isRowInEditMode(item) ? '點擊設定' : '-')
                      }}
                    </div>
                  </td>
                  <td class="col-date">
                    <input
                      type="date"
                      v-model="item.admissionDate"
                      :disabled="!isRowInEditMode(item)"
                    />
                  </td>
                  <td class="col-date">
                    <input
                      type="date"
                      v-model="item.dischargeDate"
                      :disabled="!isRowInEditMode(item)"
                    />
                  </td>
                  <td class="col-physician">
                    <input
                      type="text"
                      v-model="item.physician"
                      :disabled="!isRowInEditMode(item)"
                    />
                  </td>
                  <td class="col-reason-wide">
                    <input type="text" v-model="item.reason" :disabled="!isRowInEditMode(item)" />
                  </td>
                  <td class="col-remarks-wide">
                    <input type="text" v-model="item.remarks" :disabled="!isRowInEditMode(item)" />
                  </td>
                  <td class="col-actions">
                    <button
                      v-if="!isRowInEditMode(item)"
                      @click="unlockMovement(item)"
                      class="edit-btn"
                    >
                      編輯
                    </button>
                    <div v-else class="action-buttons-group">
                      <button @click="saveMovement(item)" class="save-btn">儲存</button>
                      <button @click="deleteRow(index, 'patientMovements')" class="delete-btn">
                        移除
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 血管通路阻塞 -->
        <section class="log-section">
          <div class="section-header">
            <h2>血管通路阻塞</h2>
            <button @click="addRow('vascularAccessLog')" class="add-row-btn-header">
              新增處置
            </button>
          </div>
          <div v-if="dailyLog.vascularAccessLog.length > 0" class="dynamic-table-container">
            <table class="dynamic-table">
              <thead>
                <tr>
                  <th class="col-name">姓名</th>
                  <th class="col-mrn">病歷號</th>
                  <th class="col-date">日期</th>
                  <th class="col-interventions-wide">處置</th>
                  <th class="col-location">處置院所</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in dailyLog.vascularAccessLog" :key="item.id">
                  <td class="col-name">
                    <div class="autocomplete-wrapper">
                      <input
                        type="text"
                        :ref="(el) => (inputRefs[`vascular-${index}`] = el)"
                        v-model="item.name"
                        @input="handlePatientSearch(index, 'vascular')"
                        @focus="showAutocomplete($event, index, 'vascular')"
                        @blur="hideAutocomplete"
                        placeholder="搜尋病人..."
                      />
                    </div>
                  </td>
                  <td class="col-mrn"><input type="text" v-model="item.medicalRecordNumber" /></td>
                  <td class="col-date"><input type="date" v-model="item.date" /></td>
                  <td class="col-interventions-wide">
                    <div class="checkbox-group">
                      <label
                        ><input
                          type="checkbox"
                          value="PTA"
                          v-model="item.interventions"
                        />PTA</label
                      >
                      <label
                        ><input
                          type="checkbox"
                          value="新建"
                          v-model="item.interventions"
                        />新建</label
                      >
                      <label
                        ><input
                          type="checkbox"
                          value="重建"
                          v-model="item.interventions"
                        />重建</label
                      >
                      <label
                        ><input
                          type="checkbox"
                          value="清血塊"
                          v-model="item.interventions"
                        />清血塊</label
                      >
                      <label
                        ><input
                          type="checkbox"
                          value="PERM-Cath"
                          v-model="item.interventions"
                        />PERM-Cath</label
                      >
                      <label
                        ><input
                          type="checkbox"
                          value="例行返診"
                          v-model="item.interventions"
                        />例行返診</label
                      >
                    </div>
                  </td>
                  <td class="col-location"><input type="text" v-model="item.location" /></td>
                  <td class="col-actions">
                    <button @click="deleteRow(index, 'vascularAccessLog')" class="delete-btn">
                      移除
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 其他事項 -->
        <section class="log-section">
          <h2>其他事項</h2>
          <div class="autoresize-textarea-wrapper">
            <textarea
              v-model="dailyLog.otherNotes"
              ref="otherNotesTextarea"
              class="handover-textarea"
              rows="1"
              placeholder="請輸入其他事項..."
              @input="handleTextareaInput"
            ></textarea>
            <div class="notes-display-for-pdf">{{ dailyLog.otherNotes }}</div>
          </div>
        </section>

        <!-- 簽核 -->
        <footer class="log-page-footer">
          <div class="leader-signature-grid">
            <div class="leader-title">組長簽核</div>
            <div class="signature-slot">
              <span class="shift-label">第一班：</span>
              <div v-if="dailyLog.leader.early.name" class="signature-display">
                <div class="signature-info">
                  <span class="leader-name leader-stamp">{{ dailyLog.leader.early.name }}</span>
                  <span class="signature-time">{{
                    formatSignTime(dailyLog.leader.early.signedAt)
                  }}</span>
                </div>
                <div class="signature-actions">
                  <button
                    @click="signAsLeader('early')"
                    class="action-text-btn edit-btn"
                    title="修正或更新簽核"
                  >
                    修正
                  </button>
                  <button
                    @click="unsignLeader('early')"
                    class="action-text-btn unsign-btn"
                    title="撤銷簽核"
                  >
                    撤銷
                  </button>
                </div>
              </div>
              <button v-else @click="signAsLeader('early')" class="sign-btn">簽核</button>
            </div>
            <div class="signature-slot">
              <span class="shift-label">第二班：</span>
              <div v-if="dailyLog.leader.noon.name" class="signature-display">
                <div class="signature-info">
                  <span class="leader-name leader-stamp">{{ dailyLog.leader.noon.name }}</span>
                  <span class="signature-time">{{
                    formatSignTime(dailyLog.leader.noon.signedAt)
                  }}</span>
                </div>
                <div class="signature-actions">
                  <button
                    @click="signAsLeader('noon')"
                    class="action-text-btn edit-btn"
                    title="修正或更新簽核"
                  >
                    修正
                  </button>
                  <button
                    @click="unsignLeader('noon')"
                    class="action-text-btn unsign-btn"
                    title="撤銷簽核"
                  >
                    撤銷
                  </button>
                </div>
              </div>
              <button v-else @click="signAsLeader('noon')" class="sign-btn">簽核</button>
            </div>
            <div class="signature-slot">
              <span class="shift-label">第三班：</span>
              <div v-if="dailyLog.leader.late.name" class="signature-display">
                <span class="leader-name leader-stamp">{{ dailyLog.leader.late.name }}</span>
                <span class="signature-time">{{
                  formatSignTime(dailyLog.leader.late.signedAt)
                }}</span>
                <div class="signature-actions">
                  <button
                    @click="signAsLeader('late')"
                    class="action-text-btn edit-btn"
                    title="修正或更新簽核"
                  >
                    修正
                  </button>
                  <button
                    @click="unsignLeader('late')"
                    class="action-text-btn unsign-btn"
                    title="撤銷簽核"
                  >
                    撤銷
                  </button>
                </div>
              </div>
              <button v-else @click="signAsLeader('late')" class="sign-btn">簽核</button>
            </div>
          </div>
        </footer>
      </div>

      <!-- ================================== -->
      <!-- ✨ 全新的行動版容器 ✨ -->
      <!-- ================================== -->
      <div class="mobile-only">
        <!-- 行動版：營運統計 -->
        <div class="mobile-section-card">
          <h2 class="mobile-section-title">營運統計</h2>
          <div class="mobile-stats-container">
            <!-- 總人次 -->
            <div class="stat-highlight-card">
              <div class="stat-value">
                {{ totalPatients.early + totalPatients.noon + totalPatients.late }}
              </div>
              <div class="stat-label">總人次</div>
            </div>
            <!-- HDR 開床數 -->
            <div class="stat-card">
              <div class="stat-value">
                {{
                  dailyLog.stats.main_beds.early.total +
                  dailyLog.stats.main_beds.noon.total +
                  dailyLog.stats.main_beds.late.total
                }}
              </div>
              <div class="stat-label">HDR開床數 (A)</div>
            </div>
            <!-- 加護病房+RCC -->
            <div class="stat-card">
              <div class="stat-value">
                {{
                  dailyLog.stats.peripheral_beds.early.ipd +
                  dailyLog.stats.peripheral_beds.noon.ipd +
                  dailyLog.stats.peripheral_beds.late.ipd
                }}
              </div>
              <div class="stat-label">加護病房+RCC (B)</div>
            </div>
            <!-- 急診 -->
            <div class="stat-card">
              <div class="stat-value">
                {{
                  dailyLog.stats.peripheral_beds.early.er +
                  dailyLog.stats.peripheral_beds.noon.er +
                  dailyLog.stats.peripheral_beds.late.er
                }}
              </div>
              <div class="stat-label">急診 (C)</div>
            </div>
          </div>
          <!-- 病人照護文字顯示 -->
          <div class="mobile-text-stats">
            <div class="text-stat-item">
              <strong>ON D/L:</strong>
              <span>{{
                [
                  dailyLog.stats.patient_care.onDL.early,
                  dailyLog.stats.patient_care.onDL.noon,
                  dailyLog.stats.patient_care.onDL.late,
                ]
                  .filter(Boolean)
                  .join(', ') || '無'
              }}</span>
            </div>
            <div class="text-stat-item">
              <strong>AK 更換:</strong>
              <span>{{
                [
                  dailyLog.stats.patient_care.akChange.early,
                  dailyLog.stats.patient_care.akChange.noon,
                  dailyLog.stats.patient_care.akChange.late,
                ]
                  .filter(Boolean)
                  .join(', ') || '無'
              }}</span>
            </div>
            <div class="text-stat-item">
              <strong>預約未到:</strong>
              <span>{{
                [
                  dailyLog.stats.patient_care.noShow.early,
                  dailyLog.stats.patient_care.noShow.noon,
                  dailyLog.stats.patient_care.noShow.late,
                ]
                  .filter(Boolean)
                  .join(', ') || '無'
              }}</span>
            </div>
          </div>
        </div>

        <!-- 行動版：病人動態表 -->
        <div class="mobile-section-card">
          <h2 class="mobile-section-title">病人動態表</h2>
          <div v-if="dailyLog.patientMovements.length > 0" class="log-entry-list">
            <div v-for="item in dailyLog.patientMovements" :key="item.id" class="log-entry-card">
              <div class="entry-header">
                <strong>{{ item.name }}</strong> ({{ item.medicalRecordNumber }})
                <span v-if="item.type" :class="['movement-type-badge', `type-${item.type}`]">
                  {{ item.type }}
                </span>
              </div>
              <div class="entry-body">
                <div><strong>會診醫師:</strong> {{ item.physician || 'N/A' }}</div>
                <div><strong>住院原因:</strong> {{ item.reason || 'N/A' }}</div>
                <div><strong>備註:</strong> {{ item.remarks || 'N/A' }}</div>
              </div>
            </div>
          </div>
          <p v-else class="no-data-text">本日無病人動態</p>
        </div>

        <!-- 行動版：血管通路阻塞 -->
        <div class="mobile-section-card">
          <h2 class="mobile-section-title">血管通路阻塞</h2>
          <div v-if="dailyLog.vascularAccessLog.length > 0" class="log-entry-list">
            <div v-for="item in dailyLog.vascularAccessLog" :key="item.id" class="log-entry-card">
              <div class="entry-header">
                <strong>{{ item.name }}</strong> ({{ item.medicalRecordNumber }})
              </div>
              <div class="entry-body">
                <div><strong>處置:</strong> {{ item.interventions.join(', ') || 'N/A' }}</div>
                <div><strong>院所:</strong> {{ item.location || 'N/A' }}</div>
              </div>
            </div>
          </div>
          <p v-else class="no-data-text">本日無血管通路處置記錄</p>
        </div>

        <!-- 其他事項 -->
        <div class="mobile-section-card">
          <h2 class="mobile-section-title">其他事項</h2>
          <p v-if="dailyLog.otherNotes" class="handover-notes-display">
            {{ dailyLog.otherNotes }}
          </p>
          <p v-else class="no-data-text">無其他事項</p>
        </div>

        <!-- 行動版：組長簽核 -->
        <div class="mobile-section-card">
          <h2 class="mobile-section-title">組長簽核</h2>
          <div class="mobile-signatures">
            <div class="signature-item">
              <strong>第一班:</strong>
              <span :class="{ signed: dailyLog.leader.early.name }">{{
                dailyLog.leader.early.name || '未簽核'
              }}</span>
            </div>
            <div class="signature-item">
              <strong>第二班:</strong>
              <span :class="{ signed: dailyLog.leader.noon.name }">{{
                dailyLog.leader.noon.name || '未簽核'
              }}</span>
            </div>
            <div class="signature-item">
              <strong>第三班:</strong>
              <span :class="{ signed: dailyLog.leader.late.name }">{{
                dailyLog.leader.late.name || '未簽核'
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </main>

    <ul v-if="isAutocompleteVisible" class="global-autocomplete-results" :style="autocompleteStyle">
      <li
        v-for="p in patientSearchResults"
        :key="p.id"
        @mousedown.prevent="selectPatient(p, activeSearch.index, activeSearch.type)"
      >
        {{ p.name }} ({{ p.medicalRecordNumber }})
      </li>
      <li v-if="patientSearchResults.length === 0" class="no-results">無符合結果</li>
    </ul>

    <WardNumberDialog
      :is-visible="isWardDialogVisible"
      :current-value="
        currentEditingMovementIndex > -1
          ? patientMap.get(dailyLog.patientMovements[currentEditingMovementIndex].patientId)
              ?.wardNumber
          : ''
      "
      @confirm="handleWardNumberConfirm"
      @cancel="handleWardNumberCancel"
    />
    <ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
    <HandoverNotesDialog
      :is-visible="isHandoverDialogVisible"
      :initial-notes="handoverNotes"
      :target-date="selectedDate"
      @close="isHandoverDialogVisible = false"
      @notes-updated="onNotesUpdated"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js'
import { where } from 'firebase/firestore'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'
import WardNumberDialog from '@/components/WardNumberDialog.vue'
import { updatePatient as optimizedUpdatePatient } from '@/services/optimizedApiService.js'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import HandoverNotesDialog from '@/components/HandoverNotesDialog.vue'
import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

const patientStore = usePatientStore()
const { allPatients, patientMap } = storeToRefs(patientStore)

const dailyLogsApi = ApiManager('daily_logs')
const schedulesApi = ApiManager('schedules')

const isLoading = ref(false)
const selectedDate = ref(formatDate(new Date()))
const hasUnsavedChanges = ref(false)
const { currentUser, canEditSchedules } = useAuth()
const isPageLocked = computed(() => !canEditSchedules.value)
const otherNotesTextarea = ref(null)
const isWardDialogVisible = ref(false)
const currentEditingMovementIndex = ref(-1)
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const currentSchedule = ref({})
const isHandoverDialogVisible = ref(false)
const handoverNotes = ref('')
const isStaffingDetailsVisible = ref(false)
const newMovementId = ref(null)

const initialLogState = () => ({
  id: null,
  date: selectedDate.value,
  stats: {
    main_beds: {
      early: { opd: 0, ipd: 0, er: 0, total: 0 },
      noon: { opd: 0, ipd: 0, er: 0, total: 0 },
      late: { opd: 0, ipd: 0, er: 0, total: 0 },
    },
    peripheral_beds: {
      early: { ipd: 0, er: 0, total: 0 },
      noon: { ipd: 0, er: 0, total: 0 },
      late: { ipd: 0, er: 0, total: 0 },
    },
    patient_care: {
      onDL: { early: '', noon: '', late: '' },
      akChange: { early: '', noon: '', late: '' },
      noShow: { early: '', noon: '', late: '' },
    },
    staffing: {
      details: [
        {
          id: Date.now() + 1,
          label: '7-4(洗腎室)',
          count: 0,
          ratio1: 1,
          ratio2: 1,
          ratio3: 0,
          isLocked: true,
        },
        {
          id: Date.now() + 2,
          label: '7-5(洗腎室)',
          count: 0,
          ratio1: 1,
          ratio2: 1,
          ratio3: 0.25,
          isLocked: true,
        },
        {
          id: Date.now() + 3,
          label: '8-16(ICU)',
          count: 0,
          ratio1: 1,
          ratio2: 1,
          ratio3: 0,
          isLocked: true,
        },
        {
          id: Date.now() + 4,
          label: '12-8',
          count: 0,
          ratio1: 0,
          ratio2: 0.375,
          ratio3: 0.625,
          isLocked: true,
        },
        {
          id: Date.now() + 5,
          label: '3-11(夜班)',
          count: 0,
          ratio1: 0,
          ratio2: 0,
          ratio3: 1,
          isLocked: true,
        },
      ],
      adjustments: { shift1: null, shift2: null, shift3: null },
      early: 0,
      noon: 0,
      late: 0,
    },
  },
  patientMovements: [],
  vascularAccessLog: [],
  handoverNotes: '',
  otherNotes: '',
  leader: {
    early: { userId: null, name: null, signedAt: null },
    noon: { userId: null, name: null, signedAt: null },
    late: { userId: null, name: null, signedAt: null },
  },
})

const dailyLog = reactive(initialLogState())
const activeSearch = ref({ type: null, index: -1 })
const patientSearchResults = ref([])
const inputRefs = reactive({})
const isAutocompleteVisible = ref(false)
const autocompleteStyle = reactive({ top: '0px', left: '0px', width: '0px' })

const selectedDateDisplay = computed(() => {
  const d = new Date(selectedDate.value)
  if (isNaN(d.getTime())) return selectedDate.value
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}/${month}/${day}`
})

const weekdayDisplay = computed(() => {
  try {
    const d = new Date(selectedDate.value)
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  } catch {
    return ''
  }
})

const statusText = computed(() => {
  if (hasUnsavedChanges.value) {
    return '有未儲存的變更'
  }
  const isSigned = Object.values(dailyLog.leader).some((l) => l && l.userId)
  return isSigned ? '變更已儲存' : '尚未簽核'
})

const totalPatients = computed(() => {
  const shifts = ['early', 'noon', 'late']
  const totals = { early: 0, noon: 0, late: 0 }
  shifts.forEach((shift) => {
    totals[shift] =
      (dailyLog.stats.main_beds[shift]?.total || 0) +
      (dailyLog.stats.peripheral_beds[shift]?.total || 0)
  })
  return totals
})

const calculatedStaffingTotals = computed(() => {
  const totals = { early: 0, noon: 0, late: 0, total: 0 }
  const staffingData = dailyLog.stats.staffing

  if (staffingData && Array.isArray(staffingData.details)) {
    staffingData.details.forEach((item) => {
      const count = Number(item.count) || 0
      totals.early += count * (Number(item.ratio1) || 0)
      totals.noon += count * (Number(item.ratio2) || 0)
      totals.late += count * (Number(item.ratio3) || 0)
    })
  }

  if (staffingData) {
    const adjustments = staffingData.adjustments || staffingData.deductions || {}
    totals.early += (Number(adjustments.shift1) || 0) * 0.125
    totals.noon += (Number(adjustments.shift2) || 0) * 0.125
    totals.late += (Number(adjustments.shift3) || 0) * 0.125
  }

  totals.early = Math.max(0, totals.early)
  totals.noon = Math.max(0, totals.noon)
  totals.late = Math.max(0, totals.late)
  totals.total = totals.early + totals.noon + totals.late

  return totals
})

watch(
  calculatedStaffingTotals,
  (newTotals) => {
    if (dailyLog.stats.staffing) {
      dailyLog.stats.staffing.early = newTotals.early
      dailyLog.stats.staffing.noon = newTotals.noon
      dailyLog.stats.staffing.late = newTotals.late
    }
  },
  { deep: true, immediate: true },
)

function toggleStaffingDetails() {
  isStaffingDetailsVisible.value = !isStaffingDetailsVisible.value
}

function addStaffingRow() {
  dailyLog.stats.staffing.details.push({
    id: Date.now(),
    label: '',
    count: 0,
    ratio1: 0,
    ratio2: 0,
    ratio3: 0,
    isLocked: false,
  })
}

function deleteStaffingRow(index) {
  dailyLog.stats.staffing.details.splice(index, 1)
}

const nursePatientRatios = computed(() => {
  const calculateRatio = (patients, staff) => {
    if (!staff || staff === 0) {
      return 'N/A'
    }
    return (patients / staff).toFixed(2)
  }

  const totalStaff =
    (dailyLog.stats.staffing.early || 0) +
    (dailyLog.stats.staffing.noon || 0) +
    (dailyLog.stats.staffing.late || 0)

  const totalPatientCount =
    totalPatients.value.early + totalPatients.value.noon + totalPatients.value.late

  return {
    early: calculateRatio(totalPatients.value.early, dailyLog.stats.staffing.early),
    noon: calculateRatio(totalPatients.value.noon, dailyLog.stats.staffing.noon),
    late: calculateRatio(totalPatients.value.late, dailyLog.stats.staffing.late),
    total: calculateRatio(totalPatientCount, totalStaff),
  }
})

function formatDate(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function saveLog(options = {}) {
  const { successMessage = '日誌已儲存！', showSuccessAlert = true } = options

  if (isLoading.value) return
  isLoading.value = true

  dailyLog.patientMovements = dailyLog.patientMovements.filter(
    (item) => item.name || item.medicalRecordNumber,
  )
  dailyLog.vascularAccessLog = dailyLog.vascularAccessLog.filter(
    (item) => item.name || item.medicalRecordNumber,
  )

  try {
    const dataToSave = JSON.parse(JSON.stringify(dailyLog))

    if (dataToSave.stats?.staffing) {
      if (dataToSave.stats.staffing.deductions) {
        dataToSave.stats.staffing.adjustments = dataToSave.stats.staffing.deductions
        delete dataToSave.stats.staffing.deductions
      }
      if (!dataToSave.stats.staffing.adjustments) {
        dataToSave.stats.staffing.adjustments = { shift1: null, shift2: null, shift3: null }
      }
    }

    if (dailyLog.id) {
      await dailyLogsApi.update(dailyLog.id, dataToSave)
    } else {
      const docId = selectedDate.value
      await dailyLogsApi.save(docId, dataToSave)
      dailyLog.id = docId
    }
    hasUnsavedChanges.value = false

    if (showSuccessAlert) {
      showAlert('操作成功', successMessage)
    }
  } catch (error) {
    console.error('儲存日誌失敗:', error)
    showAlert('儲存失敗', '儲存日誌時發生錯誤')
  } finally {
    isLoading.value = false
  }
}

async function loadDailyLog(dateStr) {
  isLoading.value = true
  hasUnsavedChanges.value = false
  Object.assign(dailyLog, initialLogState(), { date: dateStr })
  currentSchedule.value = {}
  handoverNotes.value = ''
  newMovementId.value = null // 切換日期時清除新行標記

  try {
    await patientStore.fetchPatientsIfNeeded()

    const today = new Date(dateStr)
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const dayBeforeYesterday = new Date(today)
    dayBeforeYesterday.setDate(today.getDate() - 2)

    const yesterdayStr = formatDate(yesterday)
    const dayBeforeYesterdayStr = formatDate(dayBeforeYesterday)

    const [logResult, yesterdayLogResult, dayBeforeYesterdayLogResult, scheduleData] =
      await Promise.all([
        dailyLogsApi.fetchById(dateStr),
        dailyLogsApi.fetchById(yesterdayStr),
        dailyLogsApi.fetchById(dayBeforeYesterdayStr),
        schedulesApi.fetchAll([where('date', '==', dateStr)]),
      ])

    if (logResult) {
      const mergedLog = { ...initialLogState(), ...logResult }

      if (mergedLog.handoverNotes && typeof mergedLog.otherNotes === 'undefined') {
        mergedLog.otherNotes = mergedLog.handoverNotes
        mergedLog.handoverNotes = ''
      }

      if (logResult.stats && (!logResult.stats.staffing || !logResult.stats.staffing.details)) {
        const oldStaffingData = logResult.stats.staffing || {}
        const newStaffingStructure = initialLogState().stats.staffing
        const oldTotal =
          (oldStaffingData.early || 0) + (oldStaffingData.noon || 0) + (oldStaffingData.late || 0)

        if (oldTotal > 0) {
          newStaffingStructure.details = [
            {
              id: Date.now(),
              label: '舊日誌人力總計',
              count: 1,
              ratio1: oldStaffingData.early || 0,
              ratio2: oldStaffingData.noon || 0,
              ratio3: oldStaffingData.late || 0,
            },
          ]
        } else {
          newStaffingStructure.details = initialLogState().stats.staffing.details
        }
        logResult.stats.staffing = newStaffingStructure
      }

      if (logResult.stats?.staffing) {
        if (logResult.stats.staffing.deductions && !logResult.stats.staffing.adjustments) {
          logResult.stats.staffing.adjustments = logResult.stats.staffing.deductions
        }
        if (!logResult.stats.staffing.adjustments) {
          logResult.stats.staffing.adjustments = { shift1: null, shift2: null, shift3: null }
        }
      }

      Object.assign(dailyLog, mergedLog)
      handoverNotes.value = dailyLog.handoverNotes || ''
    } else {
      let inheritedHandoverNotes = ''
      if (yesterdayLogResult?.handoverNotes) {
        inheritedHandoverNotes = yesterdayLogResult.handoverNotes
      } else if (dayBeforeYesterdayLogResult?.handoverNotes) {
        inheritedHandoverNotes = dayBeforeYesterdayLogResult.handoverNotes
      }
      handoverNotes.value = inheritedHandoverNotes
      dailyLog.handoverNotes = inheritedHandoverNotes
      dailyLog.otherNotes = ''
    }

    if (scheduleData.length > 0) {
      currentSchedule.value = scheduleData[0].schedule || {}
      if (!logResult) {
        calculateStatsFromSchedule(scheduleData[0])
      }
    }
  } catch (error) {
    console.error('載入日誌失敗:', error)
    showAlert('載入失敗', '載入日誌時發生錯誤')
  } finally {
    isLoading.value = false
    await nextTick()
    handleTextareaInput()
  }
}

function calculateStatsFromSchedule(scheduleRecord) {
  const newStats = {
    main_beds: {
      early: { opd: 0, ipd: 0, er: 0, total: 0 },
      noon: { opd: 0, ipd: 0, er: 0, total: 0 },
      late: { opd: 0, ipd: 0, er: 0, total: 0 },
    },
    peripheral_beds: {
      early: { ipd: 0, er: 0, total: 0 },
      noon: { ipd: 0, er: 0, total: 0 },
      late: { ipd: 0, er: 0, total: 0 },
    },
  }
  if (!scheduleRecord || !scheduleRecord.schedule) {
    dailyLog.stats.main_beds = newStats.main_beds
    dailyLog.stats.peripheral_beds = newStats.peripheral_beds
    return
  }
  for (const shiftKey in scheduleRecord.schedule) {
    const slotData = scheduleRecord.schedule[shiftKey]
    if (!slotData?.patientId) continue
    const patient = patientMap.value.get(slotData.patientId)
    if (!patient) continue
    const shiftCode = shiftKey.split('-').pop()
    const isPeripheral = shiftKey.startsWith('peripheral')

    if (['early', 'noon', 'late'].includes(shiftCode)) {
      if (isPeripheral) {
        newStats.peripheral_beds[shiftCode].total++
        if (patient.status === 'ipd') newStats.peripheral_beds[shiftCode].ipd++
        else if (patient.status === 'er') newStats.peripheral_beds[shiftCode].er++
      } else {
        newStats.main_beds[shiftCode].total++
        if (patient.status === 'opd') newStats.main_beds[shiftCode].opd++
        else if (patient.status === 'ipd') newStats.main_beds[shiftCode].ipd++
        else if (patient.status === 'er') newStats.main_beds[shiftCode].er++
      }
    }
  }
  dailyLog.stats.main_beds = newStats.main_beds
  dailyLog.stats.peripheral_beds = newStats.peripheral_beds
}
async function syncStatsWithSchedule() {
  showConfirm(
    '確認同步人數',
    '此操作將會用最新的「每日排程表」資料覆蓋上方的「洗腎中心床位」與「急重症床位」統計。您手動填寫的其他欄位（如病人照護、護理人力）將不受影響。確定要繼續嗎？',
    async () => {
      isLoading.value = true
      try {
        const scheduleData = await schedulesApi.fetchAll([where('date', '==', selectedDate.value)])
        if (scheduleData.length > 0) {
          calculateStatsFromSchedule(scheduleData[0])
          hasUnsavedChanges.value = true
          showAlert('同步成功', '人數統計已更新，請記得儲存變更！')
        } else {
          showAlert('同步失敗', `找不到 ${selectedDate.value} 的排班資料。`)
        }
      } catch (error) {
        console.error('同步排班統計失敗:', error)
        showAlert('同步失敗', '同步人數統計時發生錯誤。')
      } finally {
        isLoading.value = false
      }
    },
  )
}
function changeDate(days) {
  const newDate = new Date(selectedDate.value)
  newDate.setDate(newDate.getDate() + days)
  selectedDate.value = formatDate(newDate)
}
function goToToday() {
  selectedDate.value = formatDate(new Date())
}
function triggerDateInput() {
  document.querySelector('.hidden-date-input').showPicker()
}
function addRow(targetArrayKey) {
  if (newMovementId.value) {
    showAlert('提示', '請先儲存目前新增的動態，再新增下一筆。')
    return
  }
  const newId = Date.now()
  if (targetArrayKey === 'patientMovements') {
    dailyLog.patientMovements.push({
      id: newId,
      type: '手動',
      name: '',
      medicalRecordNumber: '',
      bedChange: '',
      admissionDate: '',
      dischargeDate: '',
      physician: '',
      reason: '',
      remarks: '',
    })
    newMovementId.value = newId
  } else if (targetArrayKey === 'vascularAccessLog') {
    dailyLog.vascularAccessLog.push({
      id: newId,
      name: '',
      medicalRecordNumber: '',
      date: selectedDate.value,
      interventions: [],
      location: '',
    })
  }
}
function deleteRow(index, targetArrayKey) {
  const item = dailyLog[targetArrayKey][index]
  showConfirm('確認移除', '您確定要移除這一行嗎？', () => {
    if (item.id === newMovementId.value) {
      newMovementId.value = null
    }
    dailyLog[targetArrayKey].splice(index, 1)
  })
}
async function saveMovement(item) {
  if (!item.name) {
    showAlert('資料不完整', '請至少填寫病人姓名。')
    return
  }

  if (item.isEdited && item.originalType) {
    item.originalAutoId = item.id
    item.id = `edited_${item.id}`
    item.type = '手動'
  }

  if (item.id === newMovementId.value) {
    newMovementId.value = null
  }
  item.isEdited = false

  await saveJustMovements()
}
async function saveJustMovements() {
  isLoading.value = true
  try {
    const docId = selectedDate.value
    const dataToUpdate = {
      patientMovements: JSON.parse(JSON.stringify(dailyLog.patientMovements)),
    }

    if (dailyLog.id) {
      await dailyLogsApi.update(docId, dataToUpdate)
    } else {
      await dailyLogsApi.save(docId, dataToUpdate)
      dailyLog.id = docId
    }
    hasUnsavedChanges.value = false
    showAlert('操作成功', '病人動態已更新！')
  } catch (error) {
    console.error('儲存病人動態失敗:', error)
    showAlert('儲存失敗', '更新病人動態時發生錯誤。')
  } finally {
    isLoading.value = false
  }
}
function handlePatientSearch(index, type) {
  const targetArray = type === 'movements' ? dailyLog.patientMovements : dailyLog.vascularAccessLog
  const query = targetArray[index].name.toLowerCase()
  if (!query) {
    patientSearchResults.value = []
    return
  }
  patientSearchResults.value = allPatients.value.filter(
    (p) => p.name.toLowerCase().includes(query) || p.medicalRecordNumber.includes(query),
  )
}
function showAutocomplete(event, index, type) {
  activeSearch.value = { type, index }
  handlePatientSearch(index, type)
  const inputElement = event.target
  const rect = inputElement.getBoundingClientRect()
  autocompleteStyle.top = `${rect.bottom + window.scrollY}px`
  autocompleteStyle.left = `${rect.left + window.scrollX}px`
  autocompleteStyle.width = `${rect.width}px`
  isAutocompleteVisible.value = true
}
function hideAutocomplete() {
  setTimeout(() => {
    isAutocompleteVisible.value = false
  }, 200)
}
function selectPatient(patient, index, type) {
  const targetArray = type === 'movements' ? dailyLog.patientMovements : dailyLog.vascularAccessLog
  targetArray[index].name = patient.name
  targetArray[index].patientId = patient.id
  targetArray[index].medicalRecordNumber = patient.medicalRecordNumber
  if (type === 'movements') {
    targetArray[index].admissionDate = patient.admissionDate || ''
    targetArray[index].physician = patient.physician || ''
    let foundBed = ''
    if (currentSchedule.value) {
      for (const shiftKey in currentSchedule.value) {
        const slot = currentSchedule.value[shiftKey]
        if (slot.patientId === patient.id) {
          const parts = shiftKey.split('-')
          foundBed = parts[0] === 'peripheral' ? `外圍${parts[1]}` : parts[1]
          break
        }
      }
    }
    targetArray[index].bedChange = foundBed
  }
  isAutocompleteVisible.value = false
}
async function signAsLeader(shift) {
  if (!currentUser.value) return
  const performSign = async (isOverride = false) => {
    dailyLog.leader[shift] = {
      userId: currentUser.value.uid,
      name: currentUser.value.name,
      signedAt: new Date().toISOString(),
    }
    const successMsg = isOverride ? '覆蓋簽核成功！日誌已更新。' : '簽核成功！日誌已儲存。'
    await saveLog({ successMessage: successMsg })
  }

  const existingLeader = dailyLog.leader[shift]
  let confirmMsg = `您確定要以「${currentUser.value.name}」的名義簽核此班別，並儲存所有變更嗎？`
  let confirmTitle = '確認簽核'
  if (existingLeader?.userId && existingLeader.userId !== currentUser.value.uid) {
    confirmTitle = '覆蓋簽核'
    confirmMsg = `此班別已由 ${existingLeader.name} 簽核。\n\n` + confirmMsg
  } else if (existingLeader?.userId && !hasUnsavedChanges.value) {
    showAlert('提示', '您已簽核，且日誌無未儲存的變更。')
    return
  } else if (hasUnsavedChanges.value) {
    confirmTitle = '更新簽核並儲存'
  }
  showConfirm(confirmTitle, confirmMsg, performSign)
}
function formatSignTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}
async function unsignLeader(shift) {
  if (!currentUser.value) return
  const performUnsign = async () => {
    dailyLog.leader[shift] = { userId: null, name: null, signedAt: null }
    await saveLog({ successMessage: '撤銷簽核成功！日誌已更新。' })
  }

  if (dailyLog.leader[shift]?.userId) {
    if (
      dailyLog.leader[shift]?.userId === currentUser.value.uid ||
      currentUser.value.role === 'admin'
    ) {
      showConfirm(
        '撤銷簽核',
        `您確定要撤銷 ${dailyLog.leader[shift].name} 的簽核並儲存變更嗎？`,
        performUnsign,
      )
    } else {
      showAlert('權限不足', '您沒有權限撤銷其他人的簽核。')
    }
  }
}
function showConfirm(title, message, onConfirmCallback) {
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  confirmAction.value = onConfirmCallback
  isConfirmDialogVisible.value = true
}
function handleConfirm() {
  if (typeof confirmAction.value === 'function') {
    confirmAction.value()
  }
  handleCancel()
}
function handleCancel() {
  isConfirmDialogVisible.value = false
  confirmDialogTitle.value = ''
  confirmDialogMessage.value = ''
  confirmAction.value = null
}
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}
function promptWardNumber(index) {
  const patientId = dailyLog.patientMovements[index]?.patientId
  if (!patientId) {
    showAlert('操作失敗', '請先透過「姓名」欄位選擇一位病人，才能設定床號。')
    return
  }
  const patient = patientMap.value.get(patientId)
  if (!patient || !['ipd', 'er'].includes(patient.status)) {
    showAlert(
      '提示',
      `病人「${patient.name}」目前的狀態是「${patient.status === 'opd' ? '門診' : '未知'}」，無法設定住院床號。`,
    )
    return
  }
  currentEditingMovementIndex.value = index
  isWardDialogVisible.value = true
}
async function handleWardNumberConfirm(newWardNumber) {
  const index = currentEditingMovementIndex.value
  if (index < 0) return
  const patientId = dailyLog.patientMovements[index]?.patientId
  if (!patientId) return
  try {
    await optimizedUpdatePatient(patientId, { wardNumber: newWardNumber })
    await patientStore.forceRefreshPatients()
    showAlert('操作成功', '住院床號已更新！')
  } catch (error) {
    console.error('更新住院床號失敗:', error)
    showAlert('操作失敗', '更新住院床號時發生錯誤。')
  } finally {
    handleWardNumberCancel()
  }
}
function handleWardNumberCancel() {
  isWardDialogVisible.value = false
  currentEditingMovementIndex.value = -1
}
function handleTextareaInput() {
  const textareas = [otherNotesTextarea.value]
  textareas.forEach((textarea) => {
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  })
}
async function exportToPDF() {
  if (isLoading.value) {
    showAlert('提示', '目前正在載入資料，請稍後再試。')
    return
  }
  if (hasUnsavedChanges.value) {
    await saveLog({ showSuccessAlert: false })
  }
  const originalLoadingText = document.querySelector('.loading-overlay p')?.textContent || ''
  const loadingOverlay = document.querySelector('.loading-overlay')
  const loadingTextElement = document.querySelector('.loading-overlay p')
  if (loadingOverlay) {
    if (loadingTextElement) {
      loadingTextElement.textContent = '正在準備匯出 PDF，請稍候...'
    }
    isLoading.value = true
  }
  await nextTick()
  try {
    const exportArea = document.getElementById('pdf-export-area')
    if (!exportArea) {
      showAlert('錯誤', '找不到要匯出的內容！')
      return
    }
    exportArea.classList.add('pdf-export-mode')
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const canvas = await html2canvas(exportArea, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      ignoreElements: (element) =>
        element.classList.contains('header-right') || element.classList.contains('loading-overlay'),
    })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = canvas.width
    const imgHeight = canvas.height
    const ratio = imgWidth / pdfWidth
    const scaledHeight = imgHeight / ratio
    let heightLeft = scaledHeight
    let position = 0
    const margin = 10
    pdf.addImage(
      imgData,
      'JPEG',
      margin,
      position + margin,
      pdfWidth - margin * 2,
      scaledHeight - margin * 2,
    )
    heightLeft -= pdfHeight - margin * 2
    while (heightLeft > 0) {
      position -= pdfHeight - margin * 2
      pdf.addPage()
      pdf.addImage(
        imgData,
        'JPEG',
        margin,
        position + margin,
        pdfWidth - margin * 2,
        scaledHeight - margin * 2,
      )
      heightLeft -= pdfHeight - margin * 2
    }
    pdf.save(`血液透析中心工作日誌_${selectedDate.value}.pdf`)
  } catch (error) {
    console.error('匯出 PDF 失敗:', error)
    showAlert('錯誤', '匯出 PDF 時發生錯誤，請檢查主控台訊息。')
  } finally {
    const exportArea = document.getElementById('pdf-export-area')
    if (exportArea) {
      exportArea.classList.remove('pdf-export-mode')
    }
    if (loadingTextElement) {
      loadingTextElement.textContent = originalLoadingText
    }
    isLoading.value = false
  }
}
function onNotesUpdated(newNotes) {
  handoverNotes.value = newNotes
  dailyLog.handoverNotes = newNotes
  hasUnsavedChanges.value = true
  isHandoverDialogVisible.value = false
}

function isRowInEditMode(item) {
  if (item.id === newMovementId.value) {
    return true
  }
  if (item.isEdited) {
    return true
  }
  return false
}

function unlockMovement(item) {
  item.isEdited = true
}

onMounted(async () => {
  await loadDailyLog(selectedDate.value)
})
watch(selectedDate, (newDate) => {
  if (newDate) {
    loadDailyLog(newDate)
  }
})
watch(
  dailyLog,
  () => {
    if (isLoading.value) return
    hasUnsavedChanges.value = true
  },
  { deep: true },
)
</script>

<style scoped>
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

.btn-handover {
  background-color: #ffc107;
  color: #212529;
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}

.btn-handover:hover:not(:disabled) {
  background-color: #e0a800;
}

.btn-handover i {
  margin-right: 0.5rem;
}

/* 頁面與標題 */
.log-page-container {
  padding: 0.5rem;
  background-color: #f8f9fa;
}
.log-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid #dee2e6;
  flex-wrap: wrap;
  gap: 1rem;
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
h1 {
  font-size: 2rem;
  margin: 0;
  color: #343a40;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.date-navigator button {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border: 1px solid #6c757d;
  background-color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}
.date-navigator button:hover {
  background-color: #e9ecef;
}
.date-display-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: #fff;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0 10px;
  height: 45px;
  cursor: pointer;
}
.hidden-date-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.current-date-text {
  font-size: 1.5rem;
  font-weight: bold;
  color: #343a40;
  white-space: nowrap;
}
.weekday-display {
  font-size: 1.5rem;
  font-weight: bold;
  color: #007bff;
}
.status-indicator {
  font-style: italic;
  color: #6c757d;
  font-weight: 500;
}
.export-pdf-btn {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  background-color: #17a2b8;
  color: white;
  border-color: #17a2b8;
}
.export-pdf-btn:hover:not(:disabled) {
  background-color: #138496;
}
.export-pdf-btn:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.7;
}

/* 主要內容區 */
.log-page-main {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.log-section {
  background-color: #fff;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.section-header h2 {
  margin: 0;
  padding: 0;
  border: none;
  font-size: 1.5rem;
  color: #495057;
}
.sync-stats-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  background-color: #6c757d;
  color: white;
  border: 1px solid #6c757d;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.sync-stats-btn:hover {
  background-color: #5a6268;
}
.sync-stats-btn .fa-sync-alt {
  animation: none;
}
.sync-stats-btn:active .fa-sync-alt {
  animation: spin 1s linear infinite;
}
.add-row-btn-header {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  background-color: #007bff;
  color: white;
  border: 1px solid #007bff;
  border-radius: 6px;
  cursor: pointer;
}

/* 統計表格 */
.stats-grid {
  display: grid;
  grid-template-columns: 140px 220px repeat(3, 1fr) 120px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
}
.stats-grid > div {
  padding: 0.75rem;
  border-bottom: 1px solid #e9ecef;
  border-right: 1px solid #e9ecef;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stats-grid > div:last-child {
  border-right: none;
}
.stats-grid tr > td:last-child {
  border-right: none;
}
.stats-grid > div:nth-child(6n) {
  border-right: none;
}
.stats-grid .grid-header {
  font-weight: bold;
  background-color: #f8f9fa;
}
.cell-item {
  font-weight: 500;
  background-color: #f8f9fa;
  justify-content: flex-start;
}
.cell-category {
  justify-content: flex-start;
}
.rowspan-2 {
  grid-row: span 2;
}
.rowspan-3 {
  grid-row: span 3;
}
.rowspan-4 {
  grid-row: span 4;
}
.cell-data {
  font-size: 1.2rem;
  font-weight: bold;
}
.total-a {
  background-color: #fffbe3;
}
.total-final {
  background-color: #e3fafc;
  font-size: 1.3rem;
}
.cell-input input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  text-align: center;
  font-size: 1.1rem;
}

/* 護理人力整合表格樣式 */
.toggle-details-btn {
  background: none;
  border: 1px solid #ced4da;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  color: #495057;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s;
}
.toggle-details-btn:hover {
  background-color: #e9ecef;
}
.nested-header {
  background-color: #f8f9fa;
  font-size: 0.9rem;
  font-weight: 500;
  color: #495057;
  padding: 0.5rem;
}
.cell-item.nested-header {
  background-color: #f0f2f5;
}
.label-count-header {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
.label-count-header span:first-child {
  flex-grow: 1;
  text-align: left;
}
.label-count-header span:last-child {
  width: 60px;
  text-align: center;
}
.nested-item {
  background-color: #fff;
  padding: 0.4rem;
}
.cell-item.nested-item {
  background-color: #f0f2f5;
}
.cell-category.nested-item {
  justify-content: flex-start;
}
.label-count-cell {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.label-count-cell .label-input {
  flex-grow: 1;
}
.label-count-cell .count-input {
  width: 60px;
  flex-shrink: 0;
}
.nested-item input {
  width: 100%;
  padding: 0.4rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  text-align: center;
  font-size: 1rem;
}
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}
.delete-btn.mini {
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
  flex-shrink: 0;
}
.deduction-row {
  background-color: #fffbe3 !important;
  font-weight: 500;
  font-style: italic;
  color: #6c757d;
}
.deduction-row.cell-category {
  justify-content: center;
}
.add-row-cell {
  grid-column: 2 / -1;
  justify-content: flex-end !important;
  padding: 0.5rem !important;
  background-color: #f0f2f5;
}

/* ================================== */
/* ✅ [核心優化區塊] 病人動態表 & 通路表 */
/* ================================== */
.dynamic-table-container {
  width: 100%;
  overflow-x: auto;
}
.dynamic-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed; /* 讓寬度設定更可控 */
}
.dynamic-table th,
.dynamic-table td {
  border: 1px solid #dee2e6;
  padding: 0.5rem 0.75rem; /* 微調 padding */
  text-align: left;
  vertical-align: middle;
  font-size: 0.95rem; /* 微調字體大小 */
  white-space: nowrap; /* ✅ 關鍵：防止內容換行 */
}
.dynamic-table th {
  background-color: #f8f9fa;
  font-weight: 500;
  text-align: center;
}
.dynamic-table input[type='text'],
.dynamic-table input[type='date'] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid transparent;
  border-radius: 4px;
  transition: border-color 0.2s;
  font-size: inherit; /* ✅ 讓 input 字體與 td 一致 */
}
.dynamic-table input:focus {
  outline: none;
  border-color: #80bdff;
}
/* 讓可變寬度欄位內容可以換行 */
.dynamic-table .col-reason-wide,
.dynamic-table .col-remarks-wide {
  white-space: normal;
}
/* 讓 input 在可變寬度欄位中也能正常顯示 */
.dynamic-table .col-reason-wide input,
.dynamic-table .col-remarks-wide input {
  white-space: normal;
}
/* 欄位寬度設定 */
.dynamic-table .col-type {
  width: 90px;
}
.dynamic-table .col-name {
  width: 100px;
}
.dynamic-table .col-mrn {
  width: 100px;
}
.dynamic-table .col-bed {
  width: 90px;
}
.dynamic-table .col-date {
  width: 160px;
}
.dynamic-table .col-physician {
  width: 90px;
}
.dynamic-table .col-actions {
  width: 150px; /* ✅ 增加寬度以容納兩個按鈕 */
}
.dynamic-table .col-interventions-wide {
  width: 380px;
}
.dynamic-table .col-location {
  width: 120px;
}
/* `col-reason-wide` 和 `col-remarks-wide` 不設寬度，讓它們自動分配 */

.delete-btn,
.save-btn,
.edit-btn {
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  white-space: nowrap; /* 確保按鈕文字不換行 */
}
.delete-btn {
  background-color: #dc3545;
  color: white;
}
.delete-btn:hover {
  background-color: #c82333;
}
.edit-btn {
  background-color: #ffc107;
  color: #212529;
}
.save-btn {
  background-color: #007bff;
  color: white;
}
.save-btn:hover {
  background-color: #0056b3;
}
.action-buttons-group {
  display: flex;
  gap: 0.5rem; /* 按鈕之間的間距 */
  justify-content: center;
}

.bed-change-cell {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  box-sizing: border-box;
  border-radius: 4px;
  background-color: #f8f9fa;
  border: 1px dashed transparent;
  color: #495057;
  font-weight: 500;
  transition: all 0.2s;
}
.bed-change-cell.is-clickable {
  cursor: pointer;
  border-color: #ced4da;
}
.bed-change-cell.is-clickable:hover {
  border-color: #007bff;
  background-color: #e7f1ff;
  color: #0056b3;
}
.autocomplete-wrapper {
  position: relative;
}
:deep(.global-autocomplete-results) {
  position: fixed;
  max-height: 200px;
  overflow-y: auto;
  background-color: #fff;
  border: 1px solid #ced4da;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  list-style: none;
  padding: 0;
  margin: 0;
  z-index: 1000;
  border-radius: 4px;
}
:deep(.global-autocomplete-results li) {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
:deep(.global-autocomplete-results li:hover) {
  background-color: #e9ecef;
}
:deep(.global-autocomplete-results .no-results) {
  padding: 0.5rem 0.75rem;
  color: #6c757d;
  cursor: default;
}
.checkbox-group {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.autoresize-textarea-wrapper {
  position: relative;
}
.handover-textarea {
  width: 100%;
  padding: 1rem;
  font-size: 1.1rem;
  line-height: 1.6;
  border: 1px solid #ced4da;
  border-radius: 6px;
  resize: none;
  overflow-y: hidden;
  min-height: 50px;
  box-sizing: border-box;
}
.log-page-footer {
  margin-top: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e9ecef;
}
.leader-signature-grid {
  display: grid;
  grid-template-columns: 140px repeat(3, 1fr);
  align-items: center;
  gap: 1.5rem;
  max-width: 900px;
}
.leader-title {
  font-size: 1.2rem;
  font-weight: 500;
  color: #495057;
  justify-self: start;
}
.signature-slot {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}
.shift-label {
  font-size: 1.1rem;
  color: #495057;
  font-weight: 500;
  white-space: nowrap;
}
.sign-btn {
  width: 100px;
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  background-color: #007bff;
  color: white;
  border: 1px solid #007bff;
}
.sign-btn:hover {
  background-color: #0056b3;
}
.signature-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 45px;
  padding: 4px 8px;
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  gap: 0.5rem;
  min-width: 160px;
}
.signature-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.leader-name {
  font-size: 1.1rem;
  font-weight: bold;
}
.leader-stamp {
  font-family: 'KaiTi', '標楷體', serif;
  color: #c82333;
  border: 2px solid #c82333;
  border-radius: 8px;
  padding: 2px 8px;
  letter-spacing: 2px;
  font-weight: bold;
  transform: rotate(-5deg);
  user-select: none;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
}
.signature-time {
  font-size: 0.8rem;
  color: #6c757d;
  font-weight: 500;
  align-self: flex-end;
  padding-bottom: 2px;
}
.signature-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.loading-spinner {
  border: 8px solid #f3f3f3;
  border-top: 8px solid #007bff;
  border-radius: 50%;
  width: 60px;
  height: 60px;
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
.notes-display-for-pdf {
  display: none;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 1.1rem;
  line-height: 1.6;
  padding: 1rem;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  min-height: 50px;
  word-break: break-word;
}
.pdf-export-mode .handover-textarea {
  display: none;
}
.pdf-export-mode .notes-display-for-pdf {
  display: block;
}
.pdf-export-mode .log-page-header {
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
  border: none;
}
.pdf-export-mode .log-section {
  padding: 1rem;
  margin-bottom: 1rem !important;
  box-shadow: none;
  border: 1px solid #dee2e6;
}
.pdf-export-mode h2 {
  margin-bottom: 1rem;
  font-size: 1.3rem;
  padding-bottom: 0.5rem;
}
.pdf-export-mode .stats-grid {
  grid-template-columns: 120px 140px repeat(3, 1fr) 80px;
}
.pdf-export-mode .stats-grid > div {
  padding: 0.5rem;
}
.pdf-export-mode .dynamic-table th,
.pdf-export-mode .dynamic-table td {
  padding: 0.4rem;
}
.pdf-export-mode .dynamic-table input {
  padding: 0.3rem;
  font-size: 0.9rem;
  background-color: #f8f9fa;
}
.pdf-export-mode .add-row-btn-header {
  display: none;
}
.pdf-export-mode .leader-signature-grid {
  gap: 1rem;
}
.pdf-export-mode .sign-btn,
.pdf-export-mode .unsign-btn,
.pdf-export-mode .edit-btn {
  box-shadow: none;
  border-width: 1px;
}
.mobile-only {
  display: none;
}
.desktop-only {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* 病人動態相關 CSS */
.movement-type-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: bold;
  color: white;
  white-space: nowrap;
}
.movement-type-badge.type-新增 {
  background-color: #28a745;
}
.movement-type-badge.type-刪除 {
  background-color: #dc3545;
}
.movement-type-badge.type-轉移 {
  background-color: #17a2b8;
}
.movement-type-badge.type-復原 {
  background-color: #ffc107;
  color: #212529;
}
.movement-type-badge.type-編輯 {
  background-color: #6c757d;
}
.movement-type-badge.type-更改頻率 {
  background-color: #15990e8b;
}
.movement-type-badge.type-更改模式 {
  background-color: #1090f2;
}
.movement-type-badge.type-手動 {
  background-color: #6c757d;
}
.movement-type-badge.type-首透 {
  background-color: #fd7e14;
}
.movement-type-badge.type-暫停透析 {
  background-color: #6610f2;
}
.movement-type-badge.type-刪除排程 {
  background-color: #e83e8c;
}
.movement-type-badge.type-轉常規門診 {
  background-color: #df3bb6;
}
.movement-type-badge.type-其他 {
  background-color: #adb5bd;
}

.dynamic-table input:read-only,
.dynamic-table input:disabled {
  background-color: #f8f9fa;
  cursor: default;
  border-color: transparent;
  color: #495057;
}

.dynamic-table tr.is-edited-row {
  background-color: #fffbe3;
}

/* 下拉選單的樣式 */
.type-select {
  width: 100%;
  padding: 0.4rem;
  border: 1px solid #007bff;
  border-radius: 4px;
  background-color: #e7f1ff;
  font-weight: 500;
}

/* 行動版 */
@media (max-width: 992px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-only {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .log-page-header {
    flex-direction: column;
    align-items: flex-start;
  }
  h1 {
    font-size: 1.5rem;
  }
  .date-navigator {
    width: 100%;
    justify-content: space-between;
  }
  .current-date-text,
  .weekday-display {
    font-size: 1.2rem;
  }
}

.mobile-section-card {
  background-color: #fff;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.mobile-section-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e9ecef;
}

/* 營運統計 */
.mobile-stats-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.stat-card,
.stat-highlight-card {
  padding: 1rem;
  border-radius: 6px;
  text-align: center;
}

.stat-card {
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
}

.stat-highlight-card {
  grid-column: 1 / -1; /* 佔滿整行 */
  background-color: #e3fafc;
  border: 1px solid #a5f3fc;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: bold;
  color: #007bff;
}

.stat-highlight-card .stat-value {
  color: #0891b2;
}

.stat-label {
  font-size: 0.9rem;
  color: #6c757d;
  font-weight: 500;
}

.mobile-text-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.95rem;
  background-color: #f8f9fa;
  padding: 0.75rem;
  border-radius: 6px;
}
.text-stat-item span {
  color: #343a40;
}

/* 病人動態、血管通路 */
.log-entry-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.log-entry-card {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  overflow: hidden;
}

.entry-header {
  padding: 0.5rem 0.75rem;
  background-color: #f8f9fa;
  font-size: 1rem;
  font-weight: 500;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.entry-body {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.entry-body strong {
  color: #495057;
}

.no-data-text {
  color: #6c757d;
  font-style: italic;
  padding: 1rem 0;
  text-align: center;
}

/* 其他事項 */
.handover-notes-display {
  white-space: pre-wrap;
  background-color: #f8f9fa;
  padding: 0.75rem;
  border-radius: 6px;
  line-height: 1.6;
}

/* 簽核 */
.mobile-signatures {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 1rem;
}
.signature-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f1f3f5;
}
.signature-item:last-child {
  border-bottom: none;
}
.signature-item .signed {
  font-weight: bold;
  color: #16a34a; /* 綠色 */
}
</style>
style>
