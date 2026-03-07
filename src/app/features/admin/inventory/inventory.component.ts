import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';

interface InventoryItem {
  id: string; category: string; name: string; hospitalCode?: string;
  unitsPerBox?: number; brand?: string; vendorPhone?: string; [key: string]: any;
}
interface PurchaseRecord {
  id: string; date: string; category: string; item: string;
  boxQuantity: number; quantity: number; createdBy: string; [key: string]: any;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.css'
})
export class InventoryComponent implements OnInit {
  auth = inject(AuthService);
  private firestore = inject(Firestore);

  activeTab = 'items';
  CATEGORY_NAMES: Record<string, string> = { artificialKidney: '人工腎臟', dialysateCa: '透析藥水CA', bicarbonateType: 'B液種類' };
  categoryKeys = Object.keys(this.CATEGORY_NAMES);

  // Tab 0: Items
  inventoryItems: InventoryItem[] = [];
  filteredItems: InventoryItem[] = [];
  itemsLoading = false;
  itemCategoryFilter = '';
  showItemModal = false;
  editingItem: InventoryItem | null = null;
  itemForm: Record<string, any> = { category: '', name: '', hospitalCode: '', unitsPerBox: null, brand: '', vendorPhone: '' };

  // Tab 1: Purchase
  purchases: PurchaseRecord[] = [];
  purchaseLoading = false;
  purchaseFilter = { month: this.getCurrentMonth(), category: '' };
  showPurchaseModal = false;
  editingPurchase: PurchaseRecord | null = null;
  purchaseForm: Record<string, any> = { date: '', category: '', item: '', boxQuantity: 1 };

  // Tab 2: Consumption
  consumptionSubTab = 'query';
  groupSearchParams = { freq: '一三五', shift: 'early', month: this.getCurrentMonth() };
  consumptionLoading = false;
  consumptionSearchPerformed = false;
  processedConsumptionData: any[] = [];

  // Tab 3: Monthly
  monthlyFilter = { countDate: '', startDate: '', endDate: '' };
  monthlyLoading = false;
  monthlyCalculated = false;
  monthlyInventory: Record<string, Record<string, any>> = {};

  // Tab 4: Weekly
  weeklyFilter = { countDate: '', week: '' };
  weeklyLoading = false;
  weeklyDataLoaded = false;

  private getCurrentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  ngOnInit(): void { this.fetchInventoryItems(); }

  async fetchInventoryItems(): Promise<void> {
    this.itemsLoading = true;
    try {
      const q = query(collection(this.firestore, 'inventory_items'), orderBy('category'), orderBy('name'));
      const snapshot = await getDocs(q);
      let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem));
      if (this.itemCategoryFilter) items = items.filter(i => i.category === this.itemCategoryFilter);
      this.inventoryItems = items;
      this.filteredItems = items;
    } catch (e) { console.error('載入品項失敗:', e); }
    finally { this.itemsLoading = false; }
  }

  openItemModal(item?: InventoryItem): void {
    if (item) { this.editingItem = item; this.itemForm = { ...item }; }
    else { this.editingItem = null; this.itemForm = { category: '', name: '', hospitalCode: '', unitsPerBox: null, brand: '', vendorPhone: '' }; }
    this.showItemModal = true;
  }

  async saveInventoryItem(): Promise<void> {
    try {
      if (this.editingItem) {
        const { id, ...data } = this.itemForm;
        await updateDoc(doc(this.firestore, 'inventory_items', this.editingItem.id), data);
      } else {
        await addDoc(collection(this.firestore, 'inventory_items'), this.itemForm);
      }
      this.showItemModal = false;
      await this.fetchInventoryItems();
    } catch (e) { console.error('儲存品項失敗:', e); }
  }

  async deleteInventoryItem(id: string): Promise<void> {
    if (!confirm('確定要刪除此品項？')) return;
    try { await deleteDoc(doc(this.firestore, 'inventory_items', id)); await this.fetchInventoryItems(); }
    catch (e) { console.error('刪除品項失敗:', e); }
  }

  // Purchase tab
  async fetchPurchases(): Promise<void> {
    this.purchaseLoading = true;
    try {
      const constraints: any[] = [];
      if (this.purchaseFilter.month) {
        const [y, m] = this.purchaseFilter.month.split('-').map(Number);
        const start = `${y}-${String(m).padStart(2, '0')}-01`;
        const end = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
        constraints.push(where('date', '>=', start), where('date', '<=', end));
      }
      const q = query(collection(this.firestore, 'inventory_purchases'), ...constraints, orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseRecord));
      if (this.purchaseFilter.category) items = items.filter(i => i.category === this.purchaseFilter.category);
      this.purchases = items;
    } catch (e) { console.error('載入進貨紀錄失敗:', e); }
    finally { this.purchaseLoading = false; }
  }

  openPurchaseModal(item?: PurchaseRecord): void {
    if (item) { this.editingPurchase = item; this.purchaseForm = { ...item }; }
    else { this.editingPurchase = null; this.purchaseForm = { date: '', category: '', item: '', boxQuantity: 1 }; }
    this.showPurchaseModal = true;
  }

  async savePurchase(): Promise<void> {
    const currentUser = this.auth.currentUser;
    const data = {
      ...this.purchaseForm,
      quantity: (this.purchaseForm['boxQuantity'] || 0) * this.getUnitsPerBox(this.purchaseForm['category'], this.purchaseForm['item']),
      createdBy: currentUser?.name || '系統',
    };
    try {
      if (this.editingPurchase) {
        const updateData = { ...data };
        delete (updateData as any)['id'];
        await updateDoc(doc(this.firestore, 'inventory_purchases', this.editingPurchase.id), updateData);
      } else { await addDoc(collection(this.firestore, 'inventory_purchases'), data); }
      this.showPurchaseModal = false;
      await this.fetchPurchases();
    } catch (e) { console.error('儲存進貨紀錄失敗:', e); }
  }

  async deletePurchase(id: string): Promise<void> {
    if (!confirm('確定要刪除此進貨紀錄？')) return;
    try { await deleteDoc(doc(this.firestore, 'inventory_purchases', id)); await this.fetchPurchases(); }
    catch (e) { console.error('刪除進貨紀錄失敗:', e); }
  }

  getUnitsPerBox(category: string, itemName: string): number {
    const found = this.inventoryItems.find(i => i.category === category && i.name === itemName);
    return found?.unitsPerBox || 1;
  }

  getItemSuggestions(category: string): string[] {
    return this.inventoryItems.filter(i => i.category === category).map(i => i.name);
  }

  formatDate(dateStr: string): string { return dateStr || '-'; }

  filterByCategory(cat: string): void {
    this.itemCategoryFilter = cat;
    this.fetchInventoryItems();
  }

  // Consumption search placeholder
  async handleConsumptionSearch(): Promise<void> {
    this.consumptionLoading = true;
    this.consumptionSearchPerformed = true;
    // In production, this would query Firestore for consumption data
    setTimeout(() => { this.consumptionLoading = false; this.processedConsumptionData = []; }, 500);
  }

  // Monthly inventory placeholder
  async calculateMonthlyInventory(): Promise<void> {
    this.monthlyLoading = true;
    setTimeout(() => { this.monthlyLoading = false; this.monthlyCalculated = true; this.monthlyInventory = {}; }, 500);
  }

  // Weekly data placeholder
  async loadWeeklyData(): Promise<void> {
    this.weeklyLoading = true;
    setTimeout(() => { this.weeklyLoading = false; this.weeklyDataLoaded = true; }, 500);
  }
}
