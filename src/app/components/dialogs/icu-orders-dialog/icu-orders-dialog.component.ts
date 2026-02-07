import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@services/auth.service';
import { formatDateToYYYYMMDD } from '@/utils/dateUtils';

@Component({
  selector: 'app-icu-orders-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './icu-orders-dialog.component.html',
  styleUrl: './icu-orders-dialog.component.css'
})
export class IcuOrdersDialogComponent implements OnChanges {
  private readonly auth = inject(AuthService);

  @Input() isVisible = false;
  @Input() targetDate = '';
  @Input() schedule: Record<string, any> = {};
  @Input() patientMap: Map<string, any> = new Map();
  @Input() isEditable = true;
  @Output() closeEvent = new EventEmitter<void>();
  @Output() openOrderModal = new EventEmitter<any>();
  @Output() openCrrtOrderModal = new EventEmitter<any>();
  @Output() saveAndPrint = new EventEmitter<{ localNotes: Record<string, string>; crrtEmergencyData: Record<string, any> }>();
  @Output() changeDateEvent = new EventEmitter<string>();

  localNotes: Record<string, string> = {};
  crrtEmergencyData: Record<string, { withdraw: string; note: string }> = {};

  get canEdit(): boolean {
    return this.isEditable && this.auth.canEditClinicalNotesAndOrders();
  }

  get allPeripheralPatients(): any[] {
    if (!this.schedule || !this.patientMap) return [];
    return Object.entries(this.schedule)
      .filter(([shiftId, slot]: [string, any]) => shiftId.startsWith('peripheral-') && slot?.patientId)
      .map(([shiftId, slot]: [string, any]) => {
        const patient = this.patientMap.get(slot.patientId);
        if (
          patient &&
          (patient.status === 'ipd' || patient.status === 'er') &&
          patient.mode !== 'CVVHDF'
        ) {
          return {
            ...patient,
            bedNum: `\u5916\u570d ${shiftId.split('-')[1]}`,
            shiftCode: shiftId.split('-')[2],
          };
        }
        return null;
      })
      .filter((p: any) => p !== null);
  }

  get cvvhPatients(): any[] {
    if (!this.patientMap) return [];
    return Array.from(this.patientMap.values()).filter((p: any) => p.mode === 'CVVHDF' && !p.isDeleted);
  }

  get earlyPeripheralPatients(): any[] {
    return this.sortPatients(this.allPeripheralPatients.filter((p: any) => p.shiftCode === 'early'));
  }

  get noonPeripheralPatients(): any[] {
    return this.sortPatients(this.allPeripheralPatients.filter((p: any) => p.shiftCode === 'noon'));
  }

  get latePeripheralPatients(): any[] {
    return this.sortPatients(this.allPeripheralPatients.filter((p: any) => p.shiftCode === 'late'));
  }

  navigateDate(days: number): void {
    if (!this.targetDate) return;
    const d = new Date(this.targetDate);
    d.setDate(d.getDate() + days);
    const newDate = formatDateToYYYYMMDD(d);
    this.changeDateEvent.emit(newDate);
  }

  updateLocalNote(patientId: string, value: string): void {
    this.localNotes[patientId] = value;
  }

  handleSaveAndPrint(): void {
    this.saveAndPrint.emit({
      localNotes: { ...this.localNotes },
      crrtEmergencyData: { ...this.crrtEmergencyData },
    });
  }

  getCRRTMode(patient: any): string {
    if (patient?.crrtOrders?.mode) {
      return patient.crrtOrders.mode;
    }
    return patient?.mode || 'CVVHDF';
  }

  getDehydrationRateDisplay(crrtOrders: any): string {
    if (!crrtOrders) return '____';
    if (crrtOrders.dehydrationRate !== undefined && crrtOrders.dehydrationRate !== null && crrtOrders.dehydrationRate !== '') {
      return `${crrtOrders.dehydrationRate} ml/hr`;
    }
    return '____';
  }

  formatDateTime(timestamp: any): string {
    if (!timestamp) return '';
    try {
      const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return d.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  updateEmergencyWithdraw(patientId: string, value: string): void {
    if (!this.crrtEmergencyData[patientId]) {
      this.crrtEmergencyData[patientId] = { withdraw: '', note: '' };
    }
    this.crrtEmergencyData[patientId].withdraw = value;
  }

  updateEmergencyNote(patientId: string, value: string): void {
    if (!this.crrtEmergencyData[patientId]) {
      this.crrtEmergencyData[patientId] = { withdraw: '', note: '' };
    }
    this.crrtEmergencyData[patientId].note = value;
  }

  sortPatients(patients: any[]): any[] {
    return [...patients].sort((a, b) => {
      const unitA = this.getUnitOrder(a.wardNumber);
      const unitB = this.getUnitOrder(b.wardNumber);
      if (unitA !== unitB) return unitA - unitB;
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB, 'zh-TW');
    });
  }

  getUnitOrder(wardNumber: string): number {
    if (!wardNumber) return 999;
    // Extract numeric ward number for ordering
    const match = wardNumber.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      // ICU wards typically have lower numbers
      return num;
    }
    return 500;
  }

  closeDialog(): void {
    this.closeEvent.emit();
  }

  handleOpenOrderModal(patient: any): void {
    if (this.canEdit) {
      this.openOrderModal.emit(patient);
    }
  }

  handleOpenCrrtOrderModal(patient: any): void {
    if (this.canEdit) {
      this.openCrrtOrderModal.emit(patient);
    }
  }

  printContent(): void {
    const printArea = document.getElementById('icu-orders-printable-area');
    if (!printArea) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('\u7121\u6cd5\u958b\u555f\u5217\u5370\u8996\u7a97\uff0c\u8acb\u6aa2\u67e5\u700f\u89bd\u5668\u5f48\u51fa\u8996\u7a97\u8a2d\u5b9a');
      return;
    }

    const css = document.querySelector('style[data-icu-print]')?.textContent || '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${this.targetDate} \u5916\u570d\u75c5\u623f\u900f\u6790\u91ab\u56d1\u55ae</title>
          <style>
            body { font-family: 'Microsoft JhengHei', sans-serif; margin: 0; padding: 20px; }
            .printable-header { text-align: center; margin-bottom: 20px; }
            .patient-order-card { border: 1px solid #000; margin-bottom: 10px; padding: 10px; page-break-inside: avoid; }
            .patient-header { display: flex; gap: 1rem; font-size: 0.9rem; margin-bottom: 0.5rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
            .order-details { font-size: 0.85rem; }
            .order-details div { margin-bottom: 2px; }
            .highlight-field { background-color: #fff3cd !important; padding: 2px 4px; }
            .notes-section { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #ccc; }
            .section-title { font-size: 1.1rem; border-bottom: 2px solid #333; padding-bottom: 5px; }
            .shift-group h4 { margin: 10px 0 5px; }
            .patient-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
            .no-patients-text { color: #6c757d; font-style: italic; }
            .crrt-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            .crrt-table th, .crrt-table td { border: 1px solid #333; padding: 6px 8px; font-size: 0.85rem; }
            .crrt-table th { background-color: #f0f0f0; }
            .emergency-content { display: flex; align-items: center; gap: 1rem; }
            .crrt-order-content { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
            .crrt-order-item { font-size: 0.8rem; }
            .order-label { font-weight: bold; margin-right: 4px; }
            .mobile-only { display: none !important; }
            .desktop-only { display: block !important; }
            .btn-edit-crrt, .btn-print, .btn-close, .header-actions { display: none !important; }
            .crrt-header-with-btn span { display: inline; }
            @media print { body { padding: 0; } .printable-header { font-size: 1.2rem; } }
            ${css}
          </style>
        </head>
        <body>
          ${printArea.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      // Initialize local notes and crrt emergency data from patients
      this.localNotes = {};
      this.crrtEmergencyData = {};

      this.allPeripheralPatients.forEach((p: any) => {
        this.localNotes[p.id] = p.icuNote || '';
      });

      this.cvvhPatients.forEach((p: any) => {
        this.crrtEmergencyData[p.id] = {
          withdraw: p.crrtEmergencyWithdraw || '',
          note: p.crrtEmergencyNote || '',
        };
      });
    }
  }
}
