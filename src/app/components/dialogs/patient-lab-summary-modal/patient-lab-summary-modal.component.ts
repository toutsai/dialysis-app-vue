import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LabSummaryPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
}

export interface LabCategory {
  name: string;
  items: LabItem[];
}

export interface LabItem {
  id: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: 'normal' | 'high' | 'low' | 'critical';
  date: string;
  trend?: 'up' | 'down' | 'stable';
}

@Component({
  selector: 'app-patient-lab-summary-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-lab-summary-modal.component.html',
  styleUrl: './patient-lab-summary-modal.component.css'
})
export class PatientLabSummaryModalComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patient: LabSummaryPatient | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saveRecord = new EventEmitter<void>();

  categories: LabCategory[] = [];
  isLoading = false;
  activeCategory = 'all';
  expandedCategories: Set<string> = new Set();

  predefinedCategories = ['腎功能', '電解質', '血液', '肝功能', '血脂肪', '甲狀腺', '鐵質', '其他'];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && this.patient) {
      this.loadLabData();
    }
  }

  private loadLabData(): void {
    this.isLoading = true;
    this.categories = [];
    this.expandedCategories = new Set(this.predefinedCategories);
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  toggleCategory(categoryName: string): void {
    if (this.expandedCategories.has(categoryName)) {
      this.expandedCategories.delete(categoryName);
    } else {
      this.expandedCategories.add(categoryName);
    }
  }

  isCategoryExpanded(categoryName: string): boolean {
    return this.expandedCategories.has(categoryName);
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      normal: '正常',
      high: '偏高',
      low: '偏低',
      critical: '危險'
    };
    return map[status] || status;
  }

  getTrendIcon(trend?: string): string {
    switch (trend) {
      case 'up': return '\u2191';
      case 'down': return '\u2193';
      case 'stable': return '\u2192';
      default: return '';
    }
  }

  getTrendClass(trend?: string): string {
    return trend ? `trend-${trend}` : '';
  }

  get abnormalCount(): number {
    let count = 0;
    for (const cat of this.categories) {
      for (const item of cat.items) {
        if (item.status !== 'normal') count++;
      }
    }
    return count;
  }

  onSaveRecord(): void {
    this.saveRecord.emit();
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onClose();
    }
  }
}
