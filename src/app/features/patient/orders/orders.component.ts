import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css'
})
export class OrdersComponent implements OnInit {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);

  activeTab: 'query' | 'upload' = 'query';
  searchType: 'group' | 'individual' = 'group';
  isLoading = false;
  searchPerformed = false;
  searchResult: any[] = [];

  groupSearchParams = { freq: '一三五', shift: 'early', month: this.formatMonth(new Date()) };
  individualSearchTerm = '';
  individualSearchYear = new Date().getFullYear();

  selectedFile: File | null = null;
  isUploading = false;
  uploadResult: any = null;
  isDragOver = false;

  private ordersApi = this.apiManager.getCollection<any>('medication_orders');
  private baseSchedulesApi = this.apiManager.getCollection<any>('base_schedules');

  readonly INJECTION_MEDS = [
    { code: 'INES2', tradeName: 'NESP', unit: 'mcg' },
    { code: 'IREC1', tradeName: 'Recormon', unit: 'KIU' },
    { code: 'IFER2', tradeName: 'Fe-back', unit: 'mg' },
    { code: 'ICAC', tradeName: 'Cacare', unit: 'amp' },
    { code: 'IPAR1', tradeName: 'Parsabiv', unit: 'mg' },
  ];
  readonly ORAL_MEDS = [
    { code: 'OCAL1', tradeName: 'A-Cal', unit: '顆' },
    { code: 'OCAA', tradeName: 'Pro-Cal', unit: '顆' },
    { code: 'OFOS4', tradeName: 'Lanclean', unit: '顆' },
    { code: 'OALK1', tradeName: 'Alkantin', unit: '顆' },
    { code: 'OVAF', tradeName: 'Vafseo', unit: '顆' },
    { code: 'OORK', tradeName: 'Orkedia', unit: '顆' },
    { code: 'OUCA1', tradeName: 'U-Ca', unit: '顆' },
  ];
  get allMedications() { return [...this.INJECTION_MEDS, ...this.ORAL_MEDS]; }

  readonly SHIFT_MAP: Record<string, string> = { '0': '早班', '1': '午班', '2': '晚班' };

  async ngOnInit(): Promise<void> {
    await this.patientState.fetchPatientsIfNeeded();
  }

  async handleSearch(): Promise<void> {
    this.isLoading = true;
    this.searchPerformed = true;
    this.searchResult = [];
    try {
      if (this.searchType === 'group') await this.searchGroupOrders();
      else await this.searchIndividualOrders();
    } catch (err) { console.error('查詢藥囑失敗:', err); }
    finally { this.isLoading = false; }
  }

  private async searchGroupOrders(): Promise<void> {
    const records = await this.ordersApi.fetchAll();
    const monthKey = this.groupSearchParams.month;
    const patientMap = new Map<string, any>();
    (records || []).forEach((r: any) => {
      const uploadMonth = r.uploadTimestamp?.slice?.(0, 7) || '';
      if (uploadMonth !== monthKey) return;
      if (!patientMap.has(r.patientId)) {
        patientMap.set(r.patientId, { patientId: r.patientId, patientName: r.patientName || '未知', freq: r.freq || '-', bedNum: r.bedNum || '-', shiftIndex: r.shiftIndex, orders: {} });
      }
      const pData = patientMap.get(r.patientId);
      pData.orders[r.orderCode] = r;
    });
    this.searchResult = Array.from(patientMap.values())
      .sort((a, b) => String(a.bedNum).localeCompare(String(b.bedNum), undefined, { numeric: true }));
  }

  private async searchIndividualOrders(): Promise<void> {
    const term = this.individualSearchTerm.trim().toLowerCase();
    if (!term) return;
    const records = await this.ordersApi.fetchAll();
    const yearStr = String(this.individualSearchYear);
    const monthly = new Map<string, any>();
    for (let i = 1; i <= 12; i++) {
      const key = `${yearStr}-${String(i).padStart(2, '0')}`;
      monthly.set(key, { month: key, orders: {} });
    }
    (records || []).filter((r: any) =>
      ((r.patientName || '').toLowerCase().includes(term) || (r.medicalRecordNumber || '').includes(term)) &&
      (r.uploadTimestamp || '').startsWith(yearStr)
    ).forEach((r: any) => {
      const month = r.uploadTimestamp?.slice?.(0, 7);
      if (month && monthly.has(month)) monthly.get(month).orders[r.orderCode] = r;
    });
    this.searchResult = Array.from(monthly.values()).sort((a, b) => b.month.localeCompare(a.month));
  }

  formatShift(shiftIndex: number | undefined): string { return this.SHIFT_MAP[String(shiftIndex)] ?? 'N/A'; }

  formatOrderCell(order: any): string {
    if (!order?.dose) return '-';
    const med = this.allMedications.find(m => m.code === order.orderCode);
    const unit = med?.unit ? ` ${med.unit}` : '';
    const details = order.orderType === 'injection' ? (order.note || '') : (order.frequency || '');
    return details ? `${order.dose}${unit} (${details})` : `${order.dose}${unit}`;
  }

  changeYear(offset: number): void {
    this.individualSearchYear += offset;
    if (this.individualSearchTerm.trim()) this.handleSearch();
  }

  handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
    this.uploadResult = null;
  }

  private formatMonth(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
