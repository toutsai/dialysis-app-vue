import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '@services/firebase.service';
import { AuthService } from '@services/auth.service';
import { PatientStoreService } from '@services/patient-store.service';
import {
  collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc,
  doc, Timestamp, documentId, setDoc, getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { queryWithInChunks } from '@/utils/firestoreUtils';
import * as XLSX from 'xlsx';

const CATEGORY_NAMES: Record<string, string> = {
  artificialKidney: '人工腎臟',
  dialysateCa: '透析藥水CA',
  bicarbonateType: 'B液種類',
};

const SHIFT_MAP: Record<string, number> = { early: 0, noon: 1, late: 2 };
const SHIFT_INDEX_MAP: Record<number, string> = { 0: '早班', 1: '午班', 2: '晚班' };

const DEFAULT_ITEMS: Record<string, string[]> = {
  artificialKidney: ['15S', '17UX', '25H', '34', 'APS21S', 'BG1.8', 'CAT/2000', 'FX80', 'HI:23'],
  dialysateCa: ['2.5', '3.0', '3.5'],
  bicarbonateType: ['0_袋裝Bicarbonate 500mg', '1_瓶裝Bicarbonate 500mg', '2_Hemodialysis 5L B液'],
};

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css',
})
export class InventoryComponent implements OnInit {
  private readonly firebaseService = inject(FirebaseService);
  protected readonly authService = inject(AuthService);
  private readonly patientStore = inject(PatientStoreService);

  readonly CATEGORY_NAMES = CATEGORY_NAMES;
  readonly categoryKeys = Object.keys(CATEGORY_NAMES);

  activeTab = signal('items');

  // ==================== Tab 0: 品項設定 ====================
  inventoryItems = signal<any[]>([]);
  filteredInventoryItems = signal<any[]>([]);
  itemsLoading = signal(false);
  itemFilter = { category: '', search: '' };
  showItemModal = signal(false);
  editingItem = signal<any>(null);
  itemForm = {
    category: '',
    name: '',
    unitsPerBox: null as number | null,
    hospitalCode: '',
    brand: '',
    vendorPhone: '',
  };

  get isItemFormValid(): boolean {
    return !!(this.itemForm.category && this.itemForm.name);
  }

  // ==================== Tab 1: 進貨紀錄 ====================
  purchases = signal<any[]>([]);
  purchaseLoading = signal(false);
  purchaseFilter = {
    month: new Date().toISOString().slice(0, 7),
    category: '',
  };
  showPurchaseModal = signal(false);
  editingPurchase = signal<any>(null);
  purchaseForm = {
    date: new Date().toISOString().slice(0, 10),
    category: '',
    item: '',
    boxQuantity: 1,
  };

  get isPurchaseFormValid(): boolean {
    return !!(
      this.purchaseForm.date &&
      this.purchaseForm.category &&
      this.purchaseForm.item &&
      this.purchaseForm.boxQuantity > 0
    );
  }

  // ==================== Tab 2: 消耗紀錄 ====================
  consumptionSubTab = signal('query');
  consumptionLoading = signal(false);
  consumptionSearchPerformed = signal(false);
  rawConsumptionData = signal<any[]>([]);
  processedConsumptionData = signal<any[]>([]);
  groupSearchParams = {
    freq: 'other',
    shift: 'early',
    month: new Date().toISOString().slice(0, 7),
  };
  dynamicHeaders = signal<Record<string, string[]>>({
    artificialKidney: [],
    dialysateCa: [],
    bicarbonateType: [],
  });

  selectedFile = signal<File | null>(null);
  isUploading = signal(false);
  uploadResult = signal<any>(null);
  isDragOver = signal(false);

  summaryMonth = new Date().toISOString().slice(0, 7);
  summaryLoading = signal(false);
  summaryLoaded = signal(false);
  monthlySummaryData: Record<string, Record<string, number>> = {
    artificialKidney: {},
    dialysateCa: {},
    bicarbonateType: {},
  };

  get flattenedHeaders(): string[] {
    const h = this.dynamicHeaders();
    return [...h.artificialKidney, ...h.dialysateCa, ...h.bicarbonateType];
  }

  // ==================== Tab 3: 每月盤點 ====================
  monthlyLoading = signal(false);
  monthlyCalculated = signal(false);
  monthlyFilter: { countDate: string; startDate: string; endDate: string };
  monthlyInventory: Record<string, Record<string, any>> = {
    artificialKidney: {},
    dialysateCa: {},
    bicarbonateType: {},
  };

  // ==================== Tab 4: 每週訂單 ====================
  weeklyLoading = signal(false);
  weeklyDataLoaded = signal(false);
  weeklyFilter: { countDate: string; week: string };
  weeklyCount: Record<string, Record<string, number>> = {
    artificialKidney: {},
    dialysateCa: {},
    bicarbonateType: {},
  };
  weeklyCountBoxes: Record<string, Record<string, number>> = {
    artificialKidney: {},
    dialysateCa: {},
    bicarbonateType: {},
  };
  monthlyConsumptionForWeekly: Record<string, Record<string, number>> = {
    artificialKidney: {},
    dialysateCa: {},
    bicarbonateType: {},
  };

  get hasOrderData(): boolean {
    return Object.keys(this.weeklyCount).some(
      (category) => Object.keys(this.weeklyCount[category]).length > 0
    );
  }

  knownItems: Record<string, string[]> = {
    artificialKidney: [],
    dialysateCa: [],
    bicarbonateType: [],
  };

  constructor() {
    const defaults = this.getDefaultMonthlyDates();
    this.monthlyFilter = {
      countDate: defaults.countDate,
      startDate: defaults.firstDay,
      endDate: defaults.lastDay,
    };
    this.weeklyFilter = {
      countDate: this.getThisTuesday(),
      week: this.getISOWeek(new Date()),
    };
  }

  async ngOnInit(): Promise<void> {
    await this.patientStore.fetchPatientsIfNeeded();
    await this.initializeDefaultItems();
    await this.fetchInventoryItems();
    await this.fetchPurchases();
    await this.loadKnownItems();
  }

  // ==================== Tab 0 Methods ====================

  async fetchInventoryItems(): Promise<void> {
    this.itemsLoading.set(true);
    try {
      const db = this.firebaseService.db;
      const q = query(collection(db, 'inventory_items'), orderBy('category'), orderBy('name'));
      const snapshot = await getDocs(q);
      let results = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (this.itemFilter.category) {
        results = results.filter((item: any) => item.category === this.itemFilter.category);
      }

      this.inventoryItems.set(results);
      this.filteredInventoryItems.set(results);

      results.forEach((item: any) => {
        if (!this.knownItems[item.category].includes(item.name)) {
          this.knownItems[item.category].push(item.name);
        }
      });
    } catch (error) {
      console.error('載入品項設定失敗:', error);
      this.useDefaultItemsAsFallback();
    } finally {
      this.itemsLoading.set(false);
    }
  }

  private useDefaultItemsAsFallback(): void {
    const fallbackItems: any[] = [];
    let id = 1;
    for (const [category, items] of Object.entries(DEFAULT_ITEMS)) {
      for (const itemName of items) {
        fallbackItems.push({
          id: `default-${id++}`,
          category,
          name: itemName,
          unitsPerBox: null,
          hospitalCode: null,
          vendorPhone: null,
          createdBy: '系統預設',
        });
        if (!this.knownItems[category].includes(itemName)) {
          this.knownItems[category].push(itemName);
        }
      }
    }
    this.inventoryItems.set(fallbackItems);
    this.filteredInventoryItems.set(fallbackItems);
  }

  filterItems(): void {
    const search = this.itemFilter.search.toLowerCase();
    if (!search) {
      this.filteredInventoryItems.set(this.inventoryItems());
    } else {
      this.filteredInventoryItems.set(
        this.inventoryItems().filter(
          (item: any) =>
            item.name.toLowerCase().includes(search) ||
            (item.hospitalCode && item.hospitalCode.toLowerCase().includes(search))
        )
      );
    }
  }

  openItemModal(item: any = null): void {
    if (item) {
      this.editingItem.set(item);
      this.itemForm.category = item.category;
      this.itemForm.name = item.name;
      this.itemForm.unitsPerBox = item.unitsPerBox || null;
      this.itemForm.hospitalCode = item.hospitalCode || '';
      this.itemForm.brand = item.brand || '';
      this.itemForm.vendorPhone = item.vendorPhone || '';
    } else {
      this.editingItem.set(null);
      this.itemForm.category = '';
      this.itemForm.name = '';
      this.itemForm.unitsPerBox = null;
      this.itemForm.hospitalCode = '';
      this.itemForm.brand = '';
      this.itemForm.vendorPhone = '';
    }
    this.showItemModal.set(true);
  }

  closeItemModal(): void {
    this.showItemModal.set(false);
    this.editingItem.set(null);
  }

  async saveInventoryItem(): Promise<void> {
    if (!this.isItemFormValid) return;

    try {
      const db = this.firebaseService.db;
      const currentUser = this.authService.currentUser();
      const data: any = {
        category: this.itemForm.category,
        name: this.itemForm.name,
        unitsPerBox: this.itemForm.unitsPerBox || null,
        hospitalCode: this.itemForm.hospitalCode || null,
        brand: this.itemForm.brand || null,
        vendorPhone: this.itemForm.vendorPhone || null,
        updatedAt: Timestamp.now(),
        updatedBy: currentUser?.name || '未知',
      };

      const editing = this.editingItem();
      if (editing) {
        await updateDoc(doc(db, 'inventory_items', editing.id), data);
      } else {
        data.createdAt = Timestamp.now();
        data.createdBy = currentUser?.name || '未知';
        await addDoc(collection(db, 'inventory_items'), data);
      }

      if (!this.knownItems[this.itemForm.category].includes(this.itemForm.name)) {
        this.knownItems[this.itemForm.category].push(this.itemForm.name);
      }

      this.closeItemModal();
      await this.fetchInventoryItems();
      alert(editing ? '更新成功' : '新增成功');
    } catch (error: any) {
      console.error('儲存品項失敗:', error);
      alert('儲存失敗: ' + error.message);
    }
  }

  async deleteInventoryItem(id: string): Promise<void> {
    if (!confirm('確定要刪除此品項嗎？此操作不會影響已有的進貨和消耗紀錄。')) return;

    try {
      const db = this.firebaseService.db;
      await deleteDoc(doc(db, 'inventory_items', id));
      await this.fetchInventoryItems();
      alert('刪除成功');
    } catch (error: any) {
      console.error('刪除品項失敗:', error);
      alert('刪除失敗: ' + error.message);
    }
  }

  private async initializeDefaultItems(): Promise<void> {
    try {
      const db = this.firebaseService.db;
      const snapshot = await getDocs(collection(db, 'inventory_items'));
      if (snapshot.docs.length > 0) {
        console.log('品項已存在，跳過初始化');
        return;
      }

      console.log('初始化預設品項...');
      const batch: Promise<any>[] = [];

      for (const [category, items] of Object.entries(DEFAULT_ITEMS)) {
        for (const itemName of items) {
          batch.push(
            addDoc(collection(db, 'inventory_items'), {
              category,
              name: itemName,
              unitsPerBox: null,
              hospitalCode: null,
              vendorPhone: null,
              createdAt: Timestamp.now(),
              createdBy: '系統預設',
              updatedAt: Timestamp.now(),
              updatedBy: '系統預設',
            })
          );
        }
      }

      await Promise.all(batch);
      console.log('預設品項初始化完成');
    } catch (error) {
      console.error('初始化預設品項失敗（可能是權限問題，將使用備援品項）:', error);
      for (const [category, items] of Object.entries(DEFAULT_ITEMS)) {
        items.forEach((itemName) => {
          if (!this.knownItems[category].includes(itemName)) {
            this.knownItems[category].push(itemName);
          }
        });
      }
    }
  }

  // ==================== Tab 1 Methods ====================

  getUnitsPerBox(category: string, itemName: string): number {
    const item = this.inventoryItems().find(
      (i: any) => i.category === category && i.name === itemName
    );
    return item?.unitsPerBox || 1;
  }

  calculateUnits(category: string, itemName: string, boxQty: number): number {
    return boxQty * this.getUnitsPerBox(category, itemName);
  }

  calculateBoxes(category: string, itemName: string, units: number): string | number {
    const unitsPerBox = this.getUnitsPerBox(category, itemName);
    if (unitsPerBox <= 1) return units;
    return (units / unitsPerBox).toFixed(1);
  }

  calculateBoxesRounded(category: string, itemName: string, units: number): number {
    const unitsPerBox = this.getUnitsPerBox(category, itemName);
    if (unitsPerBox <= 1) return units;
    return Math.round(units / unitsPerBox);
  }

  async fetchPurchases(): Promise<void> {
    this.purchaseLoading.set(true);
    try {
      const db = this.firebaseService.db;
      const startDate = new Date(`${this.purchaseFilter.month}-01`);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);

      const q = query(
        collection(db, 'inventory_purchases'),
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<=', Timestamp.fromDate(endDate)),
        orderBy('date', 'desc')
      );

      const snapshot = await getDocs(q);
      let results = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (this.purchaseFilter.category) {
        results = results.filter((item: any) => item.category === this.purchaseFilter.category);
      }

      this.purchases.set(results);

      results.forEach((p: any) => {
        if (!this.knownItems[p.category].includes(p.item)) {
          this.knownItems[p.category].push(p.item);
        }
      });
    } catch (error) {
      console.error('載入進貨紀錄失敗:', error);
      alert('載入進貨紀錄失敗');
    } finally {
      this.purchaseLoading.set(false);
    }
  }

  openPurchaseModal(item: any = null): void {
    if (item) {
      this.editingPurchase.set(item);
      this.purchaseForm.date = this.formatDateForInput(item.date);
      this.purchaseForm.category = item.category;
      this.purchaseForm.item = item.item;
      this.purchaseForm.boxQuantity = item.boxQuantity || 1;
    } else {
      this.editingPurchase.set(null);
      this.purchaseForm.date = new Date().toISOString().slice(0, 10);
      this.purchaseForm.category = '';
      this.purchaseForm.item = '';
      this.purchaseForm.boxQuantity = 1;
    }
    this.showPurchaseModal.set(true);
  }

  closePurchaseModal(): void {
    this.showPurchaseModal.set(false);
    this.editingPurchase.set(null);
  }

  async savePurchase(): Promise<void> {
    if (!this.isPurchaseFormValid) return;

    try {
      const db = this.firebaseService.db;
      const currentUser = this.authService.currentUser();
      const unitsPerBox = this.getUnitsPerBox(this.purchaseForm.category, this.purchaseForm.item);
      const quantity = this.purchaseForm.boxQuantity * unitsPerBox;

      const data: any = {
        date: Timestamp.fromDate(new Date(this.purchaseForm.date)),
        category: this.purchaseForm.category,
        item: this.purchaseForm.item,
        boxQuantity: this.purchaseForm.boxQuantity,
        quantity,
        unitsPerBox,
        createdBy: currentUser?.name || '未知',
        updatedAt: Timestamp.now(),
      };

      const editing = this.editingPurchase();
      if (editing) {
        await updateDoc(doc(db, 'inventory_purchases', editing.id), data);
      } else {
        data.createdAt = Timestamp.now();
        await addDoc(collection(db, 'inventory_purchases'), data);
      }

      if (!this.knownItems[this.purchaseForm.category].includes(this.purchaseForm.item)) {
        this.knownItems[this.purchaseForm.category].push(this.purchaseForm.item);
      }

      this.closePurchaseModal();
      await this.fetchPurchases();
      alert(editing ? '更新成功' : '新增成功');
    } catch (error: any) {
      console.error('儲存進貨紀錄失敗:', error);
      alert('儲存失敗: ' + error.message);
    }
  }

  async deletePurchase(id: string): Promise<void> {
    if (!confirm('確定要刪除此筆進貨紀錄嗎？')) return;

    try {
      const db = this.firebaseService.db;
      await deleteDoc(doc(db, 'inventory_purchases', id));
      await this.fetchPurchases();
      alert('刪除成功');
    } catch (error: any) {
      console.error('刪除進貨紀錄失敗:', error);
      alert('刪除失敗: ' + error.message);
    }
  }

  getItemSuggestions(category: string): string[] {
    return category ? this.knownItems[category] || [] : [];
  }

  // ==================== Tab 2 Methods ====================

  formatShift(shiftIndex: number): string {
    return SHIFT_INDEX_MAP[shiftIndex] ?? '-';
  }

  async handleConsumptionSearch(): Promise<void> {
    this.consumptionLoading.set(true);
    this.consumptionSearchPerformed.set(true);
    this.rawConsumptionData.set([]);
    this.processedConsumptionData.set([]);
    this.dynamicHeaders.set({ artificialKidney: [], dialysateCa: [], bicarbonateType: [] });

    try {
      const shiftIndex = SHIFT_MAP[this.groupSearchParams.shift];
      const regularFreqs = ['一三五', '二四六'];
      const opdPatients = this.patientStore.opdPatients();

      const patientsInGroup = opdPatients.filter((p: any) => {
        const rule = p.scheduleRule;
        if (!rule) return false;
        const matchesShift = (rule as any).shiftIndex === shiftIndex;
        if (!matchesShift) return false;
        if (this.groupSearchParams.freq === 'other') {
          return !regularFreqs.includes((rule as any).freq);
        }
        return (rule as any).freq === this.groupSearchParams.freq;
      });

      const allPatientIdsInGroup = patientsInGroup.map((p: any) => p.id);

      if (allPatientIdsInGroup.length === 0) {
        this.consumptionLoading.set(false);
        return;
      }

      const reportMonth = this.groupSearchParams.month;
      const reportIdsForMonth = allPatientIdsInGroup.map((id: string) => `${reportMonth}_${id}`);
      const monthlyReports = await queryWithInChunks('consumables_reports', documentId() as any, reportIdsForMonth);
      this.rawConsumptionData.set(monthlyReports);

      const reportsMap = new Map(monthlyReports.map((r: any) => [r.patientId, r]));
      const headers: Record<string, Set<string>> = {
        artificialKidney: new Set(),
        dialysateCa: new Set(),
        bicarbonateType: new Set(),
      };

      for (const report of reportsMap.values()) {
        const data = (report as any).data || {};
        for (const category in headers) {
          if (data[category] && Array.isArray(data[category])) {
            data[category].forEach((item: any) => headers[category].add(item.item));
          }
        }
      }

      const newDynamicHeaders = {
        artificialKidney: [...headers.artificialKidney].sort(),
        dialysateCa: [...headers.dialysateCa].sort(),
        bicarbonateType: [...headers.bicarbonateType].sort(),
      };
      this.dynamicHeaders.set(newDynamicHeaders);

      for (const category of Object.keys(headers)) {
        headers[category].forEach((item) => {
          if (!this.knownItems[category].includes(item)) {
            this.knownItems[category].push(item);
          }
        });
      }

      const patientMap = this.patientStore.patientMap();
      const currentFlattenedHeaders = this.flattenedHeaders;

      const processed = allPatientIdsInGroup
        .map((patientId: string) => {
          const patient = patientMap.get(patientId);
          const report = reportsMap.get(patientId) as any;
          const consumables = report?.data || {};

          const consumableCounts: Record<string, number> = {};
          for (const header of currentFlattenedHeaders) {
            const dh = this.dynamicHeaders();
            for (const category in dh) {
              if (consumables[category] && Array.isArray(consumables[category])) {
                const foundItem = consumables[category].find((c: any) => c.item === header);
                if (foundItem) {
                  consumableCounts[header] = foundItem.count;
                  break;
                }
              }
            }
          }

          return {
            patientId,
            patientName: patient?.name || report?.patientName || '未知病人',
            medicalRecordNumber: patient?.medicalRecordNumber || report?.medicalRecordNumber || 'N/A',
            bedNum: (patient as any)?.scheduleRule?.bedNum || 'N/A',
            freq: (patient as any)?.scheduleRule?.freq || 'N/A',
            shiftIndex: (patient as any)?.scheduleRule?.shiftIndex,
            consumableCounts,
          };
        })
        .sort((a: any, b: any) =>
          String(a.bedNum).localeCompare(String(b.bedNum), undefined, { numeric: true })
        );

      this.processedConsumptionData.set(processed);
    } catch (error) {
      console.error('查詢耗材資料失敗:', error);
      alert('查詢耗材資料時發生錯誤');
    } finally {
      this.consumptionLoading.set(false);
    }
  }

  exportConsumablesToExcel(): void {
    const data = this.processedConsumptionData();
    if (!data || data.length === 0) {
      alert('沒有可匯出的資料。');
      return;
    }

    try {
      const { freq, shift, month } = this.groupSearchParams;
      const shiftNameMap: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' };
      const shiftName = shiftNameMap[shift] || shift;
      const title = `每月耗材總表: ${freq} / ${shiftName} / ${month}`;

      const headerRow1: string[] = ['頻率', '班別', '床號', '病歷號', '姓名'];
      const headerRow2: string[] = ['', '', '', '', ''];

      const dh = this.dynamicHeaders();
      for (const category in dh) {
        const items = dh[category];
        if (items && Array.isArray(items) && items.length > 0) {
          const categoryName = CATEGORY_NAMES[category];
          headerRow1.push(categoryName);
          for (let i = 1; i < items.length; i++) {
            headerRow1.push('');
          }
          items.forEach((item: string) => headerRow2.push(String(item || '')));
        }
      }

      const headers = this.flattenedHeaders;
      const dataRows = data.map((row: any) => {
        const dataRow: any[] = [
          row.freq || '-',
          this.formatShift(row.shiftIndex),
          row.bedNum || '',
          row.medicalRecordNumber || '',
          row.patientName || '',
        ];
        headers.forEach((header: string) => {
          const count = row.consumableCounts[header];
          dataRow.push(count !== undefined && count !== null ? count : '');
        });
        return dataRow;
      });

      const sheetData = [[title], [], headerRow1, headerRow2, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(sheetData, { skipHidden: true } as any);

      ws['!merges'] = [];
      const totalColumnCount = headers.length + 5;
      ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalColumnCount - 1 } });

      for (let i = 0; i < 5; i++) {
        ws['!merges'].push({ s: { r: 2, c: i }, e: { r: 3, c: i } });
      }

      let currentCol = 5;
      for (const category in dh) {
        const items = dh[category];
        if (items && Array.isArray(items) && items.length > 0) {
          ws['!merges'].push({
            s: { r: 2, c: currentCol },
            e: { r: 2, c: currentCol + items.length - 1 },
          });
          currentCol += items.length;
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '耗材總表');

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `耗材總表_${freq}_${shiftName}_${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('匯出 Excel 失敗:', error);
      alert('匯出 Excel 時發生錯誤');
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedFile.set(input.files[0]);
      this.uploadResult.set(null);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectedFile.set(files[0]);
      this.uploadResult.set(null);
    }
  }

  private toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).replace(/^data:(.*,)?/, ''));
      reader.onerror = (error) => reject(error);
    });
  }

  async handleUpload(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      alert('請先選擇一個檔案！');
      return;
    }
    this.isUploading.set(true);
    this.uploadResult.set(null);
    try {
      const fileContentBase64 = await this.toBase64(file);
      const processConsumables = httpsCallable(this.firebaseService.functions, 'processConsumables');
      const result = await processConsumables({
        fileName: file.name,
        fileContent: fileContentBase64,
      });
      this.uploadResult.set(result.data);
    } catch (error: any) {
      console.error('上傳處理失敗:', error);
      this.uploadResult.set({ message: `上傳失敗: ${error.message}`, errorCount: 1 });
    } finally {
      this.isUploading.set(false);
    }
  }

  async loadMonthlySummary(): Promise<void> {
    this.summaryLoading.set(true);
    this.summaryLoaded.set(false);

    for (const category of Object.keys(this.monthlySummaryData)) {
      this.monthlySummaryData[category] = {};
    }

    try {
      const consumption = await this.getMonthlyConsumption(this.summaryMonth);
      for (const category of Object.keys(this.monthlySummaryData)) {
        this.monthlySummaryData[category] = consumption[category] || {};
      }
      this.summaryLoaded.set(true);
    } catch (error: any) {
      console.error('載入當月總量失敗:', error);
      alert('載入失敗: ' + error.message);
    } finally {
      this.summaryLoading.set(false);
    }
  }

  getCategoryTotal(category: string): number {
    const data = this.monthlySummaryData[category] || {};
    return Object.values(data).reduce((sum, count) => sum + (count || 0), 0);
  }

  exportMonthlySummary(): void {
    const rows: any[][] = [['類別', '品項', '每箱數量', '當月消耗(個)', '當月消耗(箱)']];

    for (const category of Object.keys(CATEGORY_NAMES)) {
      const items = this.monthlySummaryData[category] || {};
      for (const [item, count] of Object.entries(items)) {
        rows.push([
          CATEGORY_NAMES[category],
          item,
          this.getUnitsPerBox(category, item),
          count,
          this.calculateBoxes(category, item, count),
        ]);
      }
    }

    rows.push([]);
    rows.push(['類別小計', '', '', '', '']);
    for (const category of Object.keys(CATEGORY_NAMES)) {
      rows.push([CATEGORY_NAMES[category], '合計', '', this.getCategoryTotal(category), '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '當月消耗總量');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `當月消耗總量_${this.summaryMonth}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  getSummaryItemKeys(category: string): string[] {
    return Object.keys(this.monthlySummaryData[category] || {});
  }

  // ==================== Tab 3 Methods ====================

  private getDefaultMonthlyDates(): { firstDay: string; lastDay: string; countDate: string } {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1).toISOString().slice(0, 10);
    const lastDay = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    const countDate = today.toISOString().slice(0, 10);
    return { firstDay, lastDay, countDate };
  }

  async calculateMonthlyInventory(): Promise<void> {
    this.monthlyLoading.set(true);
    this.monthlyCalculated.set(false);

    for (const category of Object.keys(this.monthlyInventory)) {
      this.monthlyInventory[category] = {};
    }

    try {
      const db = this.firebaseService.db;
      const startDate = new Date(this.monthlyFilter.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(this.monthlyFilter.endDate);
      endDate.setHours(23, 59, 59, 999);

      const prevDate = new Date(startDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevCountKey = prevDate.toISOString().slice(0, 7);

      const prevCountDoc = await getDoc(doc(db, 'inventory_counts', prevCountKey));
      const prevCounts = prevCountDoc.exists() ? (prevCountDoc.data() as any).counts || {} : {};

      const purchaseQuery = query(
        collection(db, 'inventory_purchases'),
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<=', Timestamp.fromDate(endDate))
      );
      const purchaseSnapshot = await getDocs(purchaseQuery);
      const purchaseData: Record<string, Record<string, number>> = {};
      purchaseSnapshot.docs.forEach((docSnap) => {
        const p = docSnap.data() as any;
        if (!purchaseData[p.category]) purchaseData[p.category] = {};
        purchaseData[p.category][p.item] = (purchaseData[p.category][p.item] || 0) + p.quantity;
      });

      const consumptionData = await this.getConsumptionByDateRange(startDate, endDate);

      const allItems = new Set<string>();
      for (const category of Object.keys(CATEGORY_NAMES)) {
        const sources = [
          Object.keys(prevCounts[category] || {}),
          Object.keys(purchaseData[category] || {}),
          Object.keys(consumptionData[category] || {}),
          this.knownItems[category],
        ];
        sources.forEach((items) => items.forEach((item) => allItems.add(`${category}:${item}`)));
      }

      allItems.forEach((key) => {
        const [category, item] = key.split(':');
        const previousStock = prevCounts[category]?.[item] || 0;
        const purchased = purchaseData[category]?.[item] || 0;
        const consumed = consumptionData[category]?.[item] || 0;
        const currentStock = previousStock + purchased - consumed;

        if (!this.monthlyInventory[category]) this.monthlyInventory[category] = {};
        this.monthlyInventory[category][item] = {
          previousStock,
          purchased,
          consumed,
          currentStock,
          adjustment: 0,
        };
      });

      this.monthlyCalculated.set(true);
    } catch (error: any) {
      console.error('計算庫存失敗:', error);
      alert('計算失敗: ' + error.message);
    } finally {
      this.monthlyLoading.set(false);
    }
  }

  private async getMonthlyConsumption(month: string): Promise<Record<string, Record<string, number>>> {
    const result: Record<string, Record<string, number>> = {
      artificialKidney: {},
      dialysateCa: {},
      bicarbonateType: {},
    };

    try {
      const db = this.firebaseService.db;
      const q = query(collection(db, 'consumables_reports'), where('reportMonth', '==', month));
      const snapshot = await getDocs(q);

      snapshot.docs.forEach((docSnap) => {
        const report = docSnap.data() as any;
        const data = report.data || {};
        for (const category of Object.keys(result)) {
          if (data[category] && Array.isArray(data[category])) {
            data[category].forEach((item: any) => {
              result[category][item.item] = (result[category][item.item] || 0) + (item.count || 0);
            });
          }
        }
      });
    } catch (error) {
      console.error('取得月消耗資料失敗:', error);
    }

    return result;
  }

  private async getConsumptionByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, Record<string, number>>> {
    const result: Record<string, Record<string, number>> = {
      artificialKidney: {},
      dialysateCa: {},
      bicarbonateType: {},
    };

    try {
      const db = this.firebaseService.db;
      const months: string[] = [];
      const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

      while (current <= end) {
        months.push(
          `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
        );
        current.setMonth(current.getMonth() + 1);
      }

      for (const month of months) {
        const q = query(
          collection(db, 'consumables_reports'),
          where('reportMonth', '==', month)
        );
        const snapshot = await getDocs(q);

        snapshot.docs.forEach((docSnap) => {
          const report = docSnap.data() as any;
          const data = report.data || {};
          for (const category of Object.keys(result)) {
            if (data[category] && Array.isArray(data[category])) {
              data[category].forEach((item: any) => {
                result[category][item.item] = (result[category][item.item] || 0) + (item.count || 0);
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('取得區間消耗資料失敗:', error);
    }

    return result;
  }

  async saveMonthlyCount(): Promise<void> {
    if (!this.monthlyCalculated()) return;

    try {
      const db = this.firebaseService.db;
      const currentUser = this.authService.currentUser();
      const counts: Record<string, Record<string, number>> = {};

      for (const category of Object.keys(this.monthlyInventory)) {
        counts[category] = {};
        for (const [item, data] of Object.entries(this.monthlyInventory[category])) {
          counts[category][item] = data.currentStock + (data.adjustment || 0);
        }
      }

      const countKey = this.monthlyFilter.countDate.slice(0, 7);

      await setDoc(doc(db, 'inventory_counts', countKey), {
        type: 'monthly',
        countDate: this.monthlyFilter.countDate,
        startDate: this.monthlyFilter.startDate,
        endDate: this.monthlyFilter.endDate,
        counts,
        createdBy: currentUser?.name || '未知',
        createdAt: Timestamp.now(),
      });

      alert('盤點結果已儲存');
    } catch (error: any) {
      console.error('儲存盤點結果失敗:', error);
      alert('儲存失敗: ' + error.message);
    }
  }

  getMonthlyInventoryEntries(category: string): { item: string; data: any }[] {
    const catData = this.monthlyInventory[category] || {};
    return Object.entries(catData).map(([item, data]) => ({ item, data }));
  }

  // ==================== Tab 4 Methods ====================

  private getThisTuesday(): string {
    const today = new Date();
    const day = today.getDay();
    if (day === 2) {
      return today.toISOString().slice(0, 10);
    }
    const tuesday = new Date(today);
    if (day > 2) {
      tuesday.setDate(today.getDate() - (day - 2));
    } else {
      tuesday.setDate(today.getDate() + (2 - day));
    }
    return tuesday.toISOString().slice(0, 10);
  }

  private getISOWeek(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  getItemsForCategory(category: string): string[] {
    return this.knownItems[category] || [];
  }

  calculateWeeklyUnits(category: string, item: string): number {
    const boxes = this.weeklyCountBoxes[category]?.[item] || 0;
    return boxes * this.getUnitsPerBox(category, item);
  }

  syncWeeklyCount(): void {
    for (const category of Object.keys(this.weeklyCountBoxes)) {
      for (const [item, boxes] of Object.entries(this.weeklyCountBoxes[category])) {
        const unitsPerBox = this.getUnitsPerBox(category, item);
        this.weeklyCount[category][item] = (boxes || 0) * unitsPerBox;
      }
    }
  }

  async loadWeeklyData(): Promise<void> {
    this.weeklyLoading.set(true);
    this.weeklyDataLoaded.set(false);

    for (const category of Object.keys(this.weeklyCount)) {
      this.weeklyCount[category] = {};
      this.weeklyCountBoxes[category] = {};
      this.monthlyConsumptionForWeekly[category] = {};
    }

    try {
      const db = this.firebaseService.db;

      const weeklyCountDoc = await getDoc(doc(db, 'inventory_counts', this.weeklyFilter.week));
      if (weeklyCountDoc.exists()) {
        const docData = weeklyCountDoc.data() as any;
        const data = docData.counts || {};
        const boxData = docData.countBoxes || {};

        for (const category of Object.keys(this.weeklyCount)) {
          this.weeklyCount[category] = { ...data[category] };
          if (boxData[category]) {
            this.weeklyCountBoxes[category] = { ...boxData[category] };
          } else {
            for (const [item, units] of Object.entries(data[category] || {}) as [string, number][]) {
              const unitsPerBox = this.getUnitsPerBox(category, item);
              this.weeklyCountBoxes[category][item] = unitsPerBox > 1 ? Math.round(units / unitsPerBox) : units;
            }
          }
        }
      }

      const actualMonth = new Date().toISOString().slice(0, 7);
      const consumption = await this.getMonthlyConsumption(actualMonth);
      for (const category of Object.keys(this.monthlyConsumptionForWeekly)) {
        this.monthlyConsumptionForWeekly[category] = consumption[category] || {};
      }

      for (const category of Object.keys(this.knownItems)) {
        this.knownItems[category].forEach((item) => {
          if (this.weeklyCount[category][item] === undefined) {
            this.weeklyCount[category][item] = 0;
          }
          if (this.weeklyCountBoxes[category][item] === undefined) {
            this.weeklyCountBoxes[category][item] = 0;
          }
        });
      }

      this.weeklyDataLoaded.set(true);
    } catch (error: any) {
      console.error('載入週資料失敗:', error);
      alert('載入失敗: ' + error.message);
    } finally {
      this.weeklyLoading.set(false);
    }
  }

  async saveWeeklyCount(): Promise<void> {
    this.syncWeeklyCount();

    try {
      const db = this.firebaseService.db;
      const currentUser = this.authService.currentUser();

      await setDoc(doc(db, 'inventory_counts', this.weeklyFilter.week), {
        type: 'weekly',
        week: this.weeklyFilter.week,
        countDate: this.weeklyFilter.countDate,
        counts: {
          artificialKidney: { ...this.weeklyCount.artificialKidney },
          dialysateCa: { ...this.weeklyCount.dialysateCa },
          bicarbonateType: { ...this.weeklyCount.bicarbonateType },
        },
        countBoxes: {
          artificialKidney: { ...this.weeklyCountBoxes.artificialKidney },
          dialysateCa: { ...this.weeklyCountBoxes.dialysateCa },
          bicarbonateType: { ...this.weeklyCountBoxes.bicarbonateType },
        },
        createdBy: currentUser?.name || '未知',
        createdAt: Timestamp.now(),
      });
      alert('週盤點已儲存');
    } catch (error: any) {
      console.error('儲存週盤點失敗:', error);
      alert('儲存失敗: ' + error.message);
    }
  }

  getWeeklyConsumption(category: string, item: string): number {
    const monthlyTotal = this.monthlyConsumptionForWeekly[category]?.[item] || 0;
    return Math.ceil(monthlyTotal / 4);
  }

  getSafetyStock(category: string, item: string): number {
    const weeklyConsumption = this.getWeeklyConsumption(category, item);
    return Math.ceil(weeklyConsumption * (9 / 7));
  }

  getOrderQuantity(category: string, item: string): number {
    const safetyStock = this.getSafetyStock(category, item);
    const currentStock = this.weeklyCount[category]?.[item] || 0;
    const weeklyConsumption = this.getWeeklyConsumption(category, item);
    const orderQty = safetyStock - currentStock + weeklyConsumption;
    return Math.max(0, orderQty);
  }

  exportWeeklyOrder(): void {
    const rows: any[][] = [
      ['類別', '品項', '每箱數量', '週二盤點(個)', '週二盤點(箱)', '預估週消耗(個)', '安全庫存(個)', '建議訂購(個)', '建議訂購(箱)'],
    ];

    for (const category of Object.keys(CATEGORY_NAMES)) {
      for (const item of this.getItemsForCategory(category)) {
        const orderQty = this.getOrderQuantity(category, item);
        const orderBoxes = this.calculateBoxesRounded(category, item, orderQty);
        if (orderQty > 0) {
          rows.push([
            CATEGORY_NAMES[category],
            item,
            this.getUnitsPerBox(category, item),
            this.weeklyCount[category]?.[item] || 0,
            this.calculateBoxes(category, item, this.weeklyCount[category]?.[item] || 0),
            this.getWeeklyConsumption(category, item),
            this.getSafetyStock(category, item),
            orderQty,
            orderBoxes,
          ]);
        }
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '訂單');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `每週訂單_${this.weeklyFilter.week}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  // ==================== Utility Methods ====================

  formatDate(timestamp: any): string {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('zh-TW');
  }

  private formatDateForInput(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toISOString().slice(0, 10);
  }

  private async loadKnownItems(): Promise<void> {
    try {
      const db = this.firebaseService.db;
      const q = query(collection(db, 'consumables_reports'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      snapshot.docs.slice(0, 50).forEach((docSnap) => {
        const report = docSnap.data() as any;
        const data = report.data || {};

        for (const category of Object.keys(this.knownItems)) {
          if (data[category] && Array.isArray(data[category])) {
            data[category].forEach((item: any) => {
              if (!this.knownItems[category].includes(item.item)) {
                this.knownItems[category].push(item.item);
              }
            });
          }
        }
      });

      for (const category of Object.keys(this.knownItems)) {
        this.knownItems[category].sort();
      }
    } catch (error) {
      console.error('載入已知品項失敗:', error);
    }
  }

  onModalOverlayClick(event: MouseEvent, modal: 'purchase' | 'item'): void {
    if (event.target === event.currentTarget) {
      if (modal === 'purchase') this.closePurchaseModal();
      else this.closeItemModal();
    }
  }
}
