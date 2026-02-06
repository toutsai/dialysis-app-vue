import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface LabValue {
  name: string;
  code: string;
  value: number | string;
  unit: string;
  refMin: number;
  refMax: number;
  date: string;
}

interface LabCategory {
  label: string;
  items: LabValue[];
}

@Component({
  selector: 'app-patient-lab-summary-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-lab-summary-panel.component.html',
  styleUrl: './patient-lab-summary-panel.component.css'
})
export class PatientLabSummaryPanelComponent implements OnChanges {
  @Input() patient: any = null;
  @Output() saveRecord = new EventEmitter<any>();

  categories: LabCategory[] = [];
  selectedCategory: string = '';

  labDefinitions: { category: string; items: { name: string; code: string; unit: string; refMin: number; refMax: number }[] }[] = [
    {
      category: '腎功能',
      items: [
        { name: 'BUN', code: 'BUN', unit: 'mg/dL', refMin: 7, refMax: 20 },
        { name: 'Creatinine', code: 'CRE', unit: 'mg/dL', refMin: 0.6, refMax: 1.2 },
        { name: 'eGFR', code: 'EGFR', unit: 'mL/min', refMin: 90, refMax: 120 },
        { name: '尿酸', code: 'UA', unit: 'mg/dL', refMin: 2.6, refMax: 7.2 }
      ]
    },
    {
      category: '電解質',
      items: [
        { name: '鈉', code: 'NA', unit: 'mEq/L', refMin: 136, refMax: 145 },
        { name: '鉀', code: 'K', unit: 'mEq/L', refMin: 3.5, refMax: 5.0 },
        { name: '鈣', code: 'CA', unit: 'mg/dL', refMin: 8.5, refMax: 10.5 },
        { name: '磷', code: 'P', unit: 'mg/dL', refMin: 2.5, refMax: 4.5 }
      ]
    },
    {
      category: '血液',
      items: [
        { name: '血紅素', code: 'HB', unit: 'g/dL', refMin: 12, refMax: 16 },
        { name: '血比容', code: 'HCT', unit: '%', refMin: 36, refMax: 48 },
        { name: '白蛋白', code: 'ALB', unit: 'g/dL', refMin: 3.5, refMax: 5.0 },
        { name: '鐵蛋白', code: 'FERR', unit: 'ng/mL', refMin: 200, refMax: 500 }
      ]
    },
    {
      category: '肝功能',
      items: [
        { name: 'GOT', code: 'GOT', unit: 'U/L', refMin: 0, refMax: 40 },
        { name: 'GPT', code: 'GPT', unit: 'U/L', refMin: 0, refMax: 40 }
      ]
    }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patient'] && this.patient) {
      this.buildCategories();
      if (this.labDefinitions.length > 0 && !this.selectedCategory) {
        this.selectedCategory = this.labDefinitions[0].category;
      }
    }
  }

  buildCategories(): void {
    const labData = this.patient?.labData || {};

    this.categories = this.labDefinitions.map(def => ({
      label: def.category,
      items: def.items.map(item => {
        const record = labData[item.code];
        return {
          name: item.name,
          code: item.code,
          value: record?.value ?? '-',
          unit: item.unit,
          refMin: item.refMin,
          refMax: item.refMax,
          date: record?.date || ''
        };
      })
    }));
  }

  selectCategory(label: string): void {
    this.selectedCategory = label;
  }

  getSelectedItems(): LabValue[] {
    const cat = this.categories.find(c => c.label === this.selectedCategory);
    return cat?.items || [];
  }

  getStatus(item: LabValue): string {
    if (typeof item.value !== 'number') return 'unknown';
    if (item.value < item.refMin) return 'low';
    if (item.value > item.refMax) return 'high';
    return 'normal';
  }

  getStatusLabel(item: LabValue): string {
    const status = this.getStatus(item);
    const labels: Record<string, string> = { low: '偏低', high: '偏高', normal: '正常', unknown: '-' };
    return labels[status];
  }

  getRefRange(item: LabValue): string {
    return `${item.refMin} - ${item.refMax}`;
  }
}
