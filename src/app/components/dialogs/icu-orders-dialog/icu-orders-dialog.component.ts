import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface IcuPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
  bedNumber: string;
}

export interface IcuOrder {
  id: string;
  category: string;
  orderContent: string;
  frequency: string;
  startDate: string;
  status: string;
  orderedBy: string;
}

export interface IcuOrderFormData {
  category: string;
  orderContent: string;
  frequency: string;
  startDate: string;
  duration: string;
  notes: string;
}

@Component({
  selector: 'app-icu-orders-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './icu-orders-dialog.component.html',
  styleUrl: './icu-orders-dialog.component.css'
})
export class IcuOrdersDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patient: IcuPatient | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<IcuOrderFormData>();

  existingOrders: IcuOrder[] = [];
  isLoading = false;
  showNewOrderForm = false;

  newOrder: IcuOrderFormData = this.getDefaultOrder();

  categories = [
    { value: 'medication', label: '藥物' },
    { value: 'fluid', label: '輸液' },
    { value: 'monitoring', label: '監測' },
    { value: 'ventilator', label: '呼吸器' },
    { value: 'nutrition', label: '營養' },
    { value: 'lab', label: '檢驗' },
    { value: 'procedure', label: '處置' },
    { value: 'nursing', label: '護理' }
  ];

  frequencies = [
    { value: 'stat', label: 'STAT' },
    { value: 'qd', label: 'QD' },
    { value: 'bid', label: 'BID' },
    { value: 'tid', label: 'TID' },
    { value: 'qid', label: 'QID' },
    { value: 'q4h', label: 'Q4H' },
    { value: 'q6h', label: 'Q6H' },
    { value: 'q8h', label: 'Q8H' },
    { value: 'q12h', label: 'Q12H' },
    { value: 'prn', label: 'PRN' },
    { value: 'continuous', label: '持續' }
  ];

  private getDefaultOrder(): IcuOrderFormData {
    return {
      category: 'medication',
      orderContent: '',
      frequency: 'qd',
      startDate: new Date().toISOString().split('T')[0],
      duration: '',
      notes: ''
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      this.loadOrders();
      this.showNewOrderForm = false;
      this.newOrder = this.getDefaultOrder();
    }
  }

  private loadOrders(): void {
    this.isLoading = true;
    this.existingOrders = [];
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  getCategoryLabel(value: string): string {
    const found = this.categories.find(c => c.value === value);
    return found ? found.label : value;
  }

  toggleNewOrderForm(): void {
    this.showNewOrderForm = !this.showNewOrderForm;
    if (this.showNewOrderForm) {
      this.newOrder = this.getDefaultOrder();
    }
  }

  get isNewOrderValid(): boolean {
    return !!(this.newOrder.orderContent.trim() && this.newOrder.category);
  }

  onSaveOrder(): void {
    if (this.isNewOrderValid) {
      this.saved.emit({ ...this.newOrder });
      this.showNewOrderForm = false;
      this.newOrder = this.getDefaultOrder();
    }
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.onClose();
    }
  }
}
