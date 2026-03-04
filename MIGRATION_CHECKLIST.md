# Vue → Angular 功能遷移對照檢查表

> 產生日期：2026-03-04
> 用途：逐項驗證 Angular 版本是否與原始 Vue 版本功能一致

---

## 1. 頁面 (Views → Features)

| # | Vue 檔案 | Angular 元件 | 路由 | 狀態 | 手動驗證項目 |
|---|----------|-------------|------|------|-------------|
| 1 | LoginView.vue | login.component | `/login` | ✅ 已遷移 | [ ] 登入/登出流程正常 [ ] Firebase Auth 正常 [ ] 錯誤提示正確 |
| 2 | CollaborationView.vue | collaboration.component | `/collaboration` | ✅ 已遷移 | [ ] 訊息列表顯示 [ ] 新增訊息 [ ] 即時通知 |
| 3 | ScheduleView.vue | schedule.component | `/schedule` | ✅ 已遷移 | [ ] 排程表顯示正確 [ ] 拖放功能 [ ] 班別切換 |
| 4 | WeeklyView.vue | weekly.component | `/weekly` | ✅ 已遷移 | [ ] 週排班表顯示 [ ] 日期導航 [ ] 列印功能 |
| 5 | BaseScheduleView.vue | base-schedule.component | `/base-schedule` | ✅ 已遷移 | [ ] 床位總覽 [ ] 三班顯示 [ ] 病人資訊正確 |
| 6 | PhysicianScheduleView.vue | physician-schedule.component | `/physician-schedule` | ✅ 已遷移 | [ ] 醫師排班表 [ ] 新增/編輯 [ ] 月份切換 |
| 7 | NursingScheduleView.vue | nursing-schedule.component | `/nursing-schedule` | ✅ 已遷移 | [ ] 護理排班 [ ] 分組管理 [ ] 職責分配 |
| 8 | ExceptionManagerView.vue | exception-manager.component | `/exception-manager` | ✅ 已遷移 | [ ] 調班記錄 [ ] 新增調班 [ ] 衝突偵測 |
| 9 | UpdateSchedulerView.vue | update-scheduler.component | `/update-scheduler` | ✅ 已遷移 | [ ] 預約變更列表 [ ] 新增預約 [ ] 狀態更新 |
| 10 | PatientsView.vue | patients.component | `/patients` | ✅ 已遷移 | [ ] 病人列表 [ ] 搜尋篩選 [ ] 新增/編輯/刪除 [ ] 歷史紀錄 |
| 11 | MyPatientsView.vue | my-patients.component | `/my-patients` | ✅ 已遷移 | [ ] 今日病人列表 [ ] 快速操作 [ ] 狀態標記 |
| 12 | StatsView.vue | stats.component | `/stats` | ✅ 已遷移 | [ ] 護理分組統計 [ ] 圖表顯示 [ ] 日期篩選 |
| 13 | MemoView.vue | memo.component | `/memo` | ✅ 已遷移 | [ ] 備忘錄列表 [ ] 新增/編輯 [ ] 交班紀錄 |
| 14 | DailyLogView.vue | daily-log.component | `/daily-log` | ✅ 已遷移 | [ ] 工作日誌 [ ] 紀錄新增 [ ] 團隊紀錄 |
| 15 | ReportingView.vue | reporting.component | `/reporting` | ✅ 已遷移 | [ ] 統計報表 [ ] 資料匯出 [ ] 圖表渲染 |
| 16 | LabReportView.vue | lab-reports.component | `/lab-reports` | ✅ 已遷移 | [ ] 檢驗報告列表 [ ] 匯入/匯出 [ ] 警示管理 |
| 17 | OrdersView.vue | orders.component | `/orders` | ✅ 已遷移 | [ ] 藥囑列表 [ ] 新增藥囑 [ ] 透析醫囑 |
| 18 | DraftOrdersView.vue | draft-orders.component | `/draft-orders` | ✅ 已遷移 | [ ] 草稿列表 [ ] 審核流程 |
| 19 | InventoryView.vue | inventory.component | `/inventory` | ✅ 已遷移 | [ ] 庫存列表 [ ] 進出貨管理 [ ] 庫存報表 |
| 20 | ConsumablesView.vue | consumables.component | `/consumables` | ✅ 已遷移 | [ ] 每月耗材 [ ] 統計計算 |
| 21 | UserManagementView.vue | user-management.component | `/user-management` | ✅ 已遷移 | [ ] 使用者列表 [ ] 角色管理 [ ] 新增/停用 |
| 22 | AccountSettingsView.vue | account-settings.component | `/account-settings` | ✅ 已遷移 | [ ] 個人設定 [ ] 密碼修改 |
| 23 | UsageGuideView.vue | usage-guide.component | `/usage-guide` | ✅ 已遷移 | [ ] 說明文件顯示 |
| 24 | PatientMovementReportView.vue | patient-movement-report.component | (子功能) | ✅ 已遷移 | [ ] 異動報告 [ ] 匯出功能 |
| 25 | HomeView.vue | (重導至 collaboration) | `/` → `/collaboration` | ✅ 已遷移 | [ ] 首頁重導向正確 |
| 26 | AboutView.vue | — | — | ⚠️ 未遷移 | 原始 Vue scaffolding 頁面，非業務功能 |

---

## 2. 共用元件 (Components)

| # | Vue 元件 | Angular 元件 | 狀態 | 驗證項目 |
|---|---------|-------------|------|---------|
| 1 | AlertDialog.vue | alert-dialog.component | ✅ | [ ] 警示彈窗正常顯示/關閉 |
| 2 | BedAssignmentDialog.vue | bed-assignment-dialog.component | ✅ | [ ] 床位分配正常 [ ] 病人選擇 |
| 3 | BedChangeDialog.vue | bed-change-dialog.component | ✅ | [ ] 換床操作 [ ] 衝突提示 |
| 4 | CRRTOrderModal.vue | crrt-order-modal.component | ✅ | [ ] CRRT 醫囑表單 [ ] 儲存 |
| 5 | ConditionRecordDisplayDialog.vue | condition-record-display-dialog.component | ✅ | [ ] 病情紀錄顯示 |
| 6 | ConditionRecordPanel.vue | condition-record-panel.component | ✅ 已修復 | [ ] 新增紀錄 [ ] **編輯紀錄** (已修復) [ ] 刪除紀錄 |
| 7 | ConfirmDialog.vue | confirm-dialog.component | ✅ | [ ] 確認彈窗 [ ] 取消/確定 |
| 8 | DailyDraftListDialog.vue | daily-draft-list-dialog.component | ✅ | [ ] 每日草稿列表 |
| 9 | DailyInjectionListDialog.vue | daily-injection-list-dialog.component | ✅ | [ ] 每日注射列表 |
| 10 | DailyRecordsSummaryDialog.vue | daily-records-summary-dialog.component | ✅ | [ ] 每日紀錄摘要 |
| 11 | DailyStaffDisplay.vue | daily-staff-display.component | ✅ | [ ] 當日人員顯示 |
| 12 | DialysisOrderModal.vue | dialysis-order-modal.component | ✅ | [ ] 透析醫囑表單 |
| 13 | ExceptionCreateDialog.vue | exception-create-dialog.component | ✅ | [ ] 新增調班 |
| 14 | HandoverNotesDialog.vue | handover-notes-dialog.component | ✅ | [ ] 交班筆記 |
| 15 | HolidayManager.vue | holiday-manager.component | ✅ | [ ] 假日管理 |
| 16 | IcuOrdersDialog.vue | icu-orders-dialog.component | ✅ | [ ] ICU 醫囑 |
| 17 | InpatientRoundsDialog.vue | inpatient-rounds-dialog.component | ✅ | [ ] 住院巡房 |
| 18 | InpatientSidebar.vue | inpatient-sidebar.component | ✅ | [ ] 住院側邊欄 |
| 19 | LabAlertDetailModal.vue | lab-alert-detail-modal.component | ✅ | [ ] 檢驗警示詳情 |
| 20 | LabMedCorrelationView.vue | lab-med-correlation-view.component | ✅ | [ ] 檢驗-藥物關聯 |
| 21 | MarqueeBanner.vue | marquee-banner.component | ✅ | [ ] 跑馬燈顯示 |
| 22 | MarqueeEditDialog.vue | marquee-edit-dialog.component | ✅ | [ ] 跑馬燈編輯 |
| 23 | MemoDisplayDialog.vue | memo-display-dialog.component | ✅ | [ ] 備忘錄顯示 |
| 24 | MemoPanel.vue | memo-panel.component | ✅ | [ ] 備忘錄面板 |
| 25 | MonthYearPicker.vue | month-year-picker.component | ✅ | [ ] 年月選擇器 |
| 26 | NewUpdateTypeDialog.vue | new-update-type-dialog.component | ✅ | [ ] 新增更新類型 |
| 27 | NursingGroupConfigDialog.vue | nursing-group-config-dialog.component | ✅ | [ ] 護理分組設定 |
| 28 | PatientActionModal.vue | patient-action-modal.component | ✅ | [ ] 病人操作 |
| 29 | PatientDetailModal.vue | patient-detail-modal.component | ✅ | [ ] 病人詳情 |
| 30 | PatientFormModal.vue | patient-form-modal.component | ✅ | [ ] 病人表單 |
| 31 | PatientHistoryModal.vue | patient-history-modal.component | ✅ | [ ] 病人歷史 |
| 32 | PatientImageUploader.vue | patient-image-uploader.component | ✅ | [ ] 圖片上傳 |
| 33 | PatientLabSummaryModal.vue | patient-lab-summary-modal.component | ✅ | [ ] 檢驗摘要 Modal |
| 34 | PatientLabSummaryPanel.vue | patient-lab-summary-panel.component | ✅ | [ ] 檢驗摘要面板 |
| 35 | PatientMessagesIcon.vue | patient-messages-icon.component | ✅ | [ ] 病人訊息圖示 |
| 36 | PatientSelectDialog.vue | patient-select-dialog.component | ✅ | [ ] 病人選擇器 |
| 37 | PatientUpdateSchedulerDialog.vue | patient-update-scheduler-dialog.component | ✅ | [ ] 病人更新排程 |
| 38 | PreparationPopover.vue | preparation-popover.component | ✅ | [ ] 準備 Popover |
| 39 | ScheduleTable.vue | schedule-table.component | ✅ | [ ] 排程表格 [ ] 拖放 [ ] 欄寬自適應 |
| 40 | SelectionDialog.vue | selection-dialog.component | ✅ | [ ] 選擇對話框 |
| 41 | StatsToolbar.vue | stats-toolbar.component | ✅ | [ ] 統計工具列 |
| 42 | SystemDiagnostic.vue | system-diagnostic.component | ✅ | [ ] 系統診斷 |
| 43 | TaskCreateDialog.vue | task-create-dialog.component | ✅ | [ ] 任務建立 |
| 44 | UserFormModal.vue | user-form-modal.component | ✅ | [ ] 使用者表單 |
| 45 | WardNumberBadge.vue | ward-number-badge.component | ✅ | [ ] 床號標籤 |
| 46 | WardNumberDialog.vue | ward-number-dialog.component | ✅ | [ ] 床號對話框 |
| 47 | HelloWorld.vue | — | ⚠️ 略過 | Vue scaffolding，非業務功能 |
| 48 | TheWelcome.vue | — | ⚠️ 略過 | Vue scaffolding，非業務功能 |
| 49 | WelcomeItem.vue | — | ⚠️ 略過 | Vue scaffolding，非業務功能 |

### KiDit 子元件

| # | Vue 元件 | Angular 元件 | 狀態 |
|---|---------|-------------|------|
| 1 | KiDitHistoryForm.vue | kidit-history-form.component | ✅ |
| 2 | KiDitPatientForm.vue | kidit-patient-form.component | ✅ |
| 3 | MovementDetailModal.vue | movement-detail-modal.component | ✅ |
| 4 | VascularAccessForm.vue | vascular-access-form.component | ✅ |

### Icons 子元件

| # | Vue 元件 | Angular 元件 | 狀態 |
|---|---------|-------------|------|
| 1 | IconCommunity.vue | icon-community.component | ✅ |
| 2 | IconDocumentation.vue | icon-documentation.component | ✅ |
| 3 | IconEcosystem.vue | icon-ecosystem.component | ✅ |
| 4 | IconSupport.vue | icon-support.component | ✅ |
| 5 | IconTooling.vue | icon-tooling.component | ✅ |

---

## 3. Composables → Services/Guards 對照

| # | Vue Composable | Angular 對應 | 狀態 | 說明 |
|---|---------------|-------------|------|------|
| 1 | useAuth.ts | auth.service.ts + auth.guard.ts | ✅ | 認證邏輯 + 路由守衛 |
| 2 | useFirebase.ts | firebase.service.ts | ✅ | Firebase 初始化 |
| 3 | useBreakpoints.js | (內嵌於各元件) | ✅ | 響應式斷點 |
| 4 | useCache.js | (內嵌於 services) | ✅ | 快取邏輯 |
| 5 | useErrorHandler.js | (內嵌於 services) | ✅ | 錯誤處理 |
| 6 | useGlobalNotifier.js | notification.service.ts | ✅ | 全域通知 |
| 7 | useGroupAssigner.js | (內嵌於 nursing-schedule) | ✅ | 分組指派 |
| 8 | useMyPatientList.js | (內嵌於 my-patients) | ✅ | 我的病人 |
| 9 | useNurseGroupSync.js | (內嵌於 nursing-schedule) | ✅ | 護理分組同步 |
| 10 | useRealtimeNotifications.js | notification.service.ts | ✅ | 即時通知 |
| 11 | useScheduleAnalysis.js | (內嵌於 schedule/stats) | ✅ | 排程分析 |
| 12 | useTeamAssigner.js | (內嵌於 nursing-schedule) | ✅ | 團隊分配 |
| 13 | useUserDirectory.js | user-directory.service.ts | ✅ | 使用者目錄 |

---

## 4. Stores → Services 對照

| # | Vue Store (Pinia) | Angular Service | 狀態 |
|---|------------------|----------------|------|
| 1 | archiveStore.ts | archive-store.service.ts | ✅ |
| 2 | medicationStore.ts | medication-store.service.ts | ✅ |
| 3 | patientStore.ts | patient-store.service.ts | ✅ |
| 4 | taskStore.ts | task-store.service.ts | ✅ |

---

## 5. Services 對照

| # | Vue Service | Angular Service | 狀態 |
|---|------------|----------------|------|
| 1 | api_manager.ts | api-manager.service.ts + api_manager.ts | ✅ |
| 2 | baseScheduleService.js | (保留原始) baseScheduleService.js | ✅ |
| 3 | kiditExportService.js | (保留原始) kiditExportService.js | ✅ |
| 4 | kiditService.js | (保留原始) kiditService.js | ✅ |
| 5 | nurseAssignmentsService.js | (保留原始) nurseAssignmentsService.js | ✅ |
| 6 | nursingDutyService.js | (保留原始) nursingDutyService.js | ✅ |
| 7 | nursingGroupConfigService.js | (保留原始) nursingGroupConfigService.js | ✅ |
| 8 | optimizedApiService.js | (保留原始) optimizedApiService.js | ✅ |
| 9 | scheduleService.js | (保留原始) scheduleService.js | ✅ |
| — | — | patient.service.ts | ✅ (新增) |

---

## 6. Utils / Constants / Data 對照

| 類別 | Vue 檔案 | Angular 檔案 | 狀態 |
|------|---------|-------------|------|
| Utils | dateUtils.js | dateUtils.js (保留原始) | ✅ |
| Utils | firestoreUtils.js | firestoreUtils.js (保留原始) | ✅ |
| Utils | kiditHelpers.js | kiditHelpers.js (保留原始) | ✅ |
| Utils | medicationUtils.js | medicationUtils.js (保留原始) | ✅ |
| Utils | sanitize.js | sanitize.js (保留原始) | ✅ |
| Utils | scheduleUtils.js | scheduleUtils.js (保留原始) | ✅ |
| Utils | taskHandlers.js | taskHandlers.js (保留原始) | ✅ |
| Constants | labAlertConstants.js | labAlertConstants.js (保留原始) | ✅ |
| Constants | medicationConstants.js | medicationConstants.js (保留原始) | ✅ |
| Constants | scheduleConstants.js | scheduleConstants.js (保留原始) | ✅ |
| Data | changelog.json | changelog.json (保留原始) | ✅ |

---

## 7. 其他架構項目

| 項目 | Vue 版本 | Angular 版本 | 狀態 |
|------|---------|-------------|------|
| 路由守衛 | router beforeEach | auth.guard.ts + admin.guard.ts | ✅ |
| 佈局元件 | MainLayout.vue | main-layout.component | ✅ |
| 自訂指令 | overlayClose.js | (內嵌於元件 HostListener) | ✅ |
| 環境變數 | .env.emulator / .env.production | environments/environment*.ts + .env | ✅ |
| Firebase 設定 | firebase.ts | firebase.ts + firebase.service.ts | ✅ |
| Firestore Rules | firestore.rules | firestore.rules (同一份) | ✅ |
| Cloud Functions | functions/ | functions/ (同一份) | ✅ |

---

## 8. 已知問題與修復狀態

| # | 問題 | 狀態 | 說明 |
|---|------|------|------|
| 1 | ConditionRecordPanel 缺少 updateRecord 方法 | ✅ 已修復 | 補上 updateDoc 邏輯及 expireAt 欄位 |
| 2 | handleFreqChange() 空方法 | ℹ️ 與 Vue 一致 | Vue 原版也是空方法 |
| 3 | weekly ngOnDestroy() 空方法 | ℹ️ 正常 | 生命週期 hook placeholder |
| 4 | Production build font inlining 403 | ⚠️ 環境限制 | 需配置 `optimization.fonts: false` 或確保網路可存取 Google Fonts |
| 5 | 大量 `any` 型別 (704 處) | ℹ️ 低優先 | 功能正常但型別安全性較低 |
| 6 | console.log 殘留 (228 處) | ℹ️ 低優先 | 不影響功能，正式環境建議移除 |

---

## 9. 測試驗證指引

### 手動測試流程
1. **登入流程**: 使用測試帳號登入，驗證角色權限
2. **首頁重導向**: 登入後自動導至 `/collaboration`
3. **側邊選單**: 所有選單項目都能正確導航
4. **每個頁面**: 按上方表格逐一驗證
5. **CRUD 操作**: 在病人管理、備忘錄等頁面測試新增/編輯/刪除
6. **對話框**: 確認所有 dialog/modal 能正確開啟和關閉
7. **資料匯出**: 測試 Excel/PDF 匯出功能
8. **響應式**: 在不同螢幕尺寸下驗證版面

### 自動化測試
參見 `src/app/**/*.spec.ts` 檔案中的單元測試。

---

## 總結

| 類別 | Vue 數量 | Angular 數量 | 覆蓋率 |
|------|---------|-------------|--------|
| 頁面 (Views) | 26 | 25 (+1 redirect) | **100%** (扣除 scaffolding) |
| 元件 (Components) | 49 | 82 | **100%** (含拆分後的子元件) |
| Composables/Services | 13 | 10 (已整合) | **100%** |
| Stores | 4 | 4 | **100%** |
| Services | 9 | 9 + 1 | **100%** |
| Utils | 7 | 7 | **100%** |
| Constants | 3 | 3 | **100%** |

**遷移完成度：100%** (所有業務功能已遷移)
