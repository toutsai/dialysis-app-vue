# Vue → Angular 遷移審計報告

> 審計日期：2026-03-04
> 審計方式：逐檔比對 Vue (main branch git history) 與 Angular 原始碼邏輯

---

## 1. Build & 測試狀態

| 項目 | 狀態 | 說明 |
|------|------|------|
| `ng build` | **通過** | 已修復 tsconfig.app.json 排除 spec 檔案 |
| Jest tests | **165/165 通過** | dateUtils, scheduleUtils, migration-parity |
| Angular 元件單元測試 | **0%** | 80 元件 + 10 services 無測試 |

---

## 2. 嚴重遺漏 — 核心 Composable 未移植

以下 Vue composable 包含核心業務邏輯，在 Angular 版本中僅為 **空殼/placeholder**。

### 2.1 `useTeamAssigner.js` — 每日病人自動分組引擎 (131 行) — **CRITICAL**

**Vue 原始邏輯：** 完整的三步驟分配演算法
- 步驟一：優先分配（B肝→G組、住院/急診→H/I/J 輪流分配、容量限制）
- 步驟二：A組特殊處理（病人>36時 OPD 病人填入，容量 2）
- 步驟三：剩餘病人平均分配到常規組（自動阻擋K組、計算 baseSize + remainder）

**Angular 現狀** (`schedule.component.ts:1122-1129`)：
```typescript
private executeAutoAssignment(): void {
    // Placeholder: auto assignment logic uses distributePatients from useTeamAssigner
    this.showAlert('操作成功', '四個班次的自動分組已全部完成！');
    // ← 實際上什麼都沒做，只顯示成功訊息
}
```

**影響：** 按下「自動分組」按鈕會假裝成功但不分配任何病人。

### 2.2 `useGroupAssigner.js` — 護理月班表分組引擎 (1162 行) — **CRITICAL**

**Vue 原始邏輯：** 系統中最複雜的業務邏輯
- `assignGroupsForDays()` — 逐日分配：
  - 74/L 固定 A 組、816 固定外圍
  - 75 班輪流 F/J 組
  - 住院組限制（每週最多 2 天、不連續）
  - 夜班組長限制 (`cannotBeNightLeader`)
  - 夜班組別限制 (`nightShiftRestrictions`)
  - 311C 固定 C 組
  - 待命 75 規則（不相鄰、每週最多 2 次）
  - 排除新進護理師
- `generateGroupAssignments()` — 整月初始分組生成（含跨月週次處理）
- `redistributeRemainingWeeks()` — 重新分配未確認週次

**Angular 現狀** (`nursing-schedule.component.ts`)：
- `enterGroupEditMode()` 有註解 `"would need to be implemented"` — **未實作**
- `redistributeRemainingWeeks()` 只顯示成功訊息 — **空殼**
- `getAvailableGroups()` 部分實作，但缺少 `nightShiftRestrictions` 過濾

**影響：** 無法自動產生護理月排班分組，必須逐一手動指定。

### 2.3 `useMyPatientList.js` — 我的病人清單 (249 行) — **CRITICAL**

**Vue 原始邏輯：**
- 從 `nurse_assignments` + `schedules` 交叉比對當日護理師負責的病人
- 判斷角色：主責(main)、上針(noonOn)、收針(noonOff)、晚收(lateOff)
- 加入準備資訊（AK、透析液 Ca、Heparin、血流量、血管通路）
- 加入注射藥物、備忘錄
- 依床號排序、自動重建（watchEffect）

**Angular 現狀** (`my-patients.component.ts:244`)：
```typescript
// Placeholder: actual fetch logic from useMyPatientList composable
console.log(`fetchMyPatientData for user=${userId}, date=${targetDate}`);
```

**影響：** 「我的病人」頁面永遠空白，無法顯示護理師當日負責的病人清單。

### 2.4 `useNurseGroupSync.js` — 護理師姓名自動帶入 (149 行) — **HIGH**

**Vue 原始邏輯：**
- `getNurseAssignmentsForDate()` — 從月班表讀取每日護理師組別對應
- `autoFillNurseNames()` — 自動填入護理師姓名到分組記錄（清除舊資料再寫入）
- `hasNamesDifference()` — 比較姓名差異

**Angular 現狀：** 完全沒有對應實作。

**影響：** 每日分組統計不會自動帶入護理師姓名。

### 2.5 `useScheduleAnalysis.js` — 排程分析 — **MEDIUM**

**Vue 原始邏輯：**
- `getDailyUnassignedPatients()` — 應排但未排的病人
- `getDailyTemporaryPatients()` — 非常規排程的臨時病人

**Angular 現狀：** `scheduledPatientIds` 有實作，但以上兩個分析函數未移植。

---

## 3. 護理班表額外遺漏

| 項目 | 嚴重度 | 說明 |
|------|--------|------|
| 職責/規則 tab `loadData()` | HIGH | 資料硬編碼，未連接 `nursingDutyService.js` 的 `fetchDuties()` |
| 職責/規則 tab `saveData()` | HIGH | 有 `// API call would go here` 但未實作 Firestore 儲存 |
| `nightShiftRestrictions` 過濾 | MEDIUM | 設定可儲存但 `getAvailableGroups()` 的 dropdown 未使用 |
| 即時同步 (onSnapshot) | LOW | Vue 版有即時更新，Angular 版需手動重載 |

---

## 4. 已正確移植的部分

### 4.1 共用 Services & Utils（完全一致）

| 檔案 | 狀態 |
|------|------|
| `nurseAssignmentsService.js` | **共用** — Vue/Angular 使用同一份 |
| `nursingGroupConfigService.js` | **共用** — 包含分組產生、設定 CRUD、驗證 |
| `nursingDutyService.js` | **共用** — 但 Angular 元件未呼叫 |
| `optimizedApiService.js` | **共用** |
| `scheduleUtils.js` | **共用** |
| `scheduleConstants.js` | **共用** |
| `dateUtils.js` | **共用** |
| `medicationUtils.js` | **共用** |

### 4.2 已正確移植的元件

| 元件 | 狀態 | 備註 |
|------|------|------|
| Schedule Table (排程表格) | **完整** | 拖放、B肝床位、欄寬偵測 |
| Base Schedule (床位總覽) | **完整** | 拖放、衝突偵測、頻率檢查、Excel 匯出 |
| Stats (分組統計) | **完整** | 跨組拖放、任務顏色、Excel 匯出 |
| Reporting (報表) | **完整** | 日/月/年/人力四種報表 + Excel |
| Nursing Group Config Dialog | **完整** | 設定 CRUD、驗證、限制管理 |
| 手動分組編輯 UI | **完整** | 下拉選單、衝突檢查、待命 75 切換 |
| 班表儲存（週存/月存/班別存） | **完整** | |
| 分組統計面板 | **部分** | 簡化版，缺 processingOrder 排序 |

### 4.3 共用 Angular Services

| Service | 狀態 |
|---------|------|
| `auth.service.ts` | 已實作 |
| `firebase.service.ts` | 已實作 |
| `api-manager.service.ts` | 已實作 |
| `patient.service.ts` | 已實作 |
| `patient-store.service.ts` | 已實作 |
| `archive-store.service.ts` | 已實作 |
| `medication-store.service.ts` | 已實作 |
| `task-store.service.ts` | 已實作 |
| `user-directory.service.ts` | 已實作 |
| `notification.service.ts` | 已實作 |

---

## 5. 程式碼品質問題

| 問題 | 嚴重度 | 位置 |
|------|--------|------|
| `scheduleService.js` 是死碼 | LOW | 引用不存在的 Vue composables，無 Angular 元件使用 |
| `baseScheduleService.js` 是死碼 | LOW | 功能已內嵌到 Angular 元件 |
| `effectiveStatsData` 是 getter 非 computed | MEDIUM | `stats.component.ts` — 每次存取重新計算 |
| 3 個未使用的 @Output | LOW | `schedule-table.component.ts` — cellClick/cellDrop/cellContextMenu |
| 704 處 `any` 型別 | LOW | 功能正常但型別安全性較低 |
| 228 處 `console.log` 殘留 | LOW | 不影響功能 |

---

## 6. 遺漏邏輯行數估計

| Composable | Vue 原始行數 | 影響範圍 |
|------------|-------------|---------|
| `useGroupAssigner.js` | ~1,162 行 | 護理月班表自動分組 |
| `useMyPatientList.js` | ~249 行 | 我的病人頁面 |
| `useNurseGroupSync.js` | ~149 行 | 護理師姓名自動帶入 |
| `useTeamAssigner.js` | ~131 行 | 每日病人自動分組 |
| `useScheduleAnalysis.js` | ~100 行 | 未排/臨時病人分析 |
| 護理職責 CRUD 連接 | ~30 行 | nursingDutyService 呼叫 |
| **合計** | **~1,821 行** | |

---

## 7. 建議修復優先順序

| 優先度 | 項目 | 原因 |
|--------|------|------|
| **P0** | 移植 `useTeamAssigner` | 每日排班必用，自動分組完全無效 |
| **P0** | 移植 `useMyPatientList` | 護理師每日工作必看頁面 |
| **P0** | 移植 `useGroupAssigner` | 護理月班表分組的核心演算法 |
| **P1** | 移植 `useNurseGroupSync` | 分組統計需要自動帶入護理師姓名 |
| **P1** | 連接護理職責 CRUD | `nursingDutyService` 已有但未呼叫 |
| **P1** | 套用 `nightShiftRestrictions` | 設定已可儲存但未生效 |
| **P2** | 移植 `useScheduleAnalysis` | 輔助功能 |
| **P2** | 清理死碼 | scheduleService.js, baseScheduleService.js |
| **P2** | 修復 CRRT Modal 按鈕失效 | `(click)="handleSave"` 缺少括號 |
| **P2** | Dialysis Modal 時區問題 | effectiveDate 用 UTC 而非本地時區 |
| **P3** | Stats getter 改 computed | 效能優化 |
| **P3** | MedicationStore 增量快取 | 缺少 Vue 版的增量快取和去重邏輯 |
| **P3** | 補寫單元測試 | 0% → 目標至少 Services 有測試 |

---

## 8. 醫囑/藥物模組比對

### 8.1 已正確移植

| 元件 | 狀態 | 備註 |
|------|------|------|
| Orders (醫囑查詢/上傳) | **完整** | 群組/個人查詢、Excel 匯出、上傳 |
| Draft Orders (草稿醫囑) | **完整** | 分群顯示、批次確認 |
| Dialysis Order Modal (透析醫囑) | **大致完整** | 表單、歷史紀錄、刪除 |
| CRRT Order Modal (CRRT 醫囑) | **大致完整** | 表單、計算公式 |
| medicationUtils.js / medicationConstants.js | **共用** | 未修改 |

### 8.2 發現的問題

| 問題 | 嚴重度 | 位置 | 說明 |
|------|--------|------|------|
| CRRT Modal 按鈕失效 | **HIGH** | `crrt-order-modal.component.html` | `(click)="closeModal"` 和 `(click)="handleSave"` 缺少 `()` 括號，按鈕不會觸發 |
| CRRT Modal auth 未等待 | MEDIUM | `crrt-order-modal.component.ts` | 缺少 `waitForAuthInit()` 呼叫，醫師欄位可能為空 |
| Dialysis Modal 時區差異 | MEDIUM | `dialysis-order-modal.component.ts` | `effectiveDate` 和 `formatDate()` 使用 UTC `.toISOString()` 而非本地時區 |
| MedicationStore 增量快取遺失 | MEDIUM | `medication-store.service.ts` | Vue 版逐筆檢查已快取的 patientId 再取新的，Angular 全部重取 |
| MedicationStore 去重遺失 | MEDIUM | `medication-store.service.ts` | 缺少 `patientId-orderCode` 去重邏輯 |
| MedicationStore 資料來源 | LOW | `medication-store.service.ts` | Vue 用 Cloud Function `getDailyInjections`，Angular 直接查 Firestore |
| Dialysis Modal 刪除錯誤處理 | LOW | `dialysis-order-modal.component.ts` | 缺少 permission-denied / not-found 分類提示 |
| 藥物代碼不一致 (既有) | LOW | 多處 | `ICAC` 單位 mcg vs amp、`OCAA` 名稱 Pro-Cal vs Pro-Ca — 非遷移問題 |

---

## 9. 總結

**遷移結構完成度：100%** — 所有頁面、元件、路由、服務的 *架構* 已就位。

**遷移邏輯完成度：約 85%** — 5 個核心 Vue composable (~1,821 行業務邏輯) 需要補上：
- 3 個 CRITICAL（自動分組、月班表分組、我的病人）
- 1 個 HIGH（護理師姓名同步）
- 1 個 MEDIUM（排程分析）

另有醫囑模組若干中等問題（CRRT 按鈕失效、時區差異、快取策略）。

這些遺漏集中在 **「自動化分配」** 和 **「資料聚合」** 兩類功能。手動操作（手動指定組別、手動拖放、手動儲存）皆已正常運作。
