import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface HistoryFormData {
  chiefComplaint: string;
  presentIllness: string;
  pastHistory: string[];
  familyHistory: string;
  allergies: string[];
  medications: string;
  dialysisHistory: {
    startDate: string;
    initialCause: string;
    previousModality: string;
    previousAccessHistory: string;
  };
  comorbidities: string[];
  surgicalHistory: string;
  socialHistory: {
    smoking: string;
    alcohol: string;
    occupation: string;
  };
}

@Component({
  selector: 'app-kidit-history-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './kidit-history-form.component.html',
  styleUrl: './kidit-history-form.component.css'
})
export class KiditHistoryFormComponent implements OnInit, OnChanges {
  @Input() date: string = '';
  @Input() eventId: string = '';
  @Input() initialData: Partial<HistoryFormData> = {};
  @Input() masterPatient: any = null;
  @Output() updated = new EventEmitter<HistoryFormData>();

  formData: HistoryFormData = this.getDefaultFormData();

  commonPastHistory = [
    '高血壓', '糖尿病', '心臟病', '腦中風', 'B型肝炎',
    'C型肝炎', '痛風', '甲狀腺疾病', '腎結石', '多囊腎'
  ];

  commonAllergies = ['Penicillin', 'Sulfa', 'NSAID', 'Contrast', 'Latex', 'Shellfish'];

  commonComorbidities = [
    '冠心病', '心衰竭', '周邊血管疾病', '糖尿病視網膜病變',
    '糖尿病神經病變', '繼發性副甲狀腺亢進', '腎性骨病變'
  ];

  smokingOptions = ['從未', '已戒菸', '目前吸菸'];
  alcoholOptions = ['無', '偶爾', '經常'];
  modalityOptions = ['HD', 'PD (CAPD)', 'PD (APD)', '腎移植', '無'];

  causeOptions = [
    '糖尿病腎病變', '高血壓腎硬化', '慢性腎絲球腎炎',
    '多囊腎', '阻塞性腎病變', '狼瘡腎炎', '其他'
  ];

  ngOnInit(): void {
    this.applyInitialData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialData'] || changes['masterPatient']) {
      this.applyInitialData();
    }
  }

  private applyInitialData(): void {
    const defaults = this.getDefaultFormData();
    this.formData = {
      ...defaults,
      ...this.initialData,
      pastHistory: this.initialData.pastHistory || defaults.pastHistory,
      allergies: this.initialData.allergies || defaults.allergies,
      comorbidities: this.initialData.comorbidities || defaults.comorbidities,
      dialysisHistory: { ...defaults.dialysisHistory, ...this.initialData.dialysisHistory },
      socialHistory: { ...defaults.socialHistory, ...this.initialData.socialHistory }
    };
  }

  getDefaultFormData(): HistoryFormData {
    return {
      chiefComplaint: '',
      presentIllness: '',
      pastHistory: [],
      familyHistory: '',
      allergies: [],
      medications: '',
      dialysisHistory: {
        startDate: '',
        initialCause: '',
        previousModality: '',
        previousAccessHistory: ''
      },
      comorbidities: [],
      surgicalHistory: '',
      socialHistory: {
        smoking: '從未',
        alcohol: '無',
        occupation: ''
      }
    };
  }

  toggleArrayItem(arr: string[], item: string): void {
    const idx = arr.indexOf(item);
    if (idx >= 0) {
      arr.splice(idx, 1);
    } else {
      arr.push(item);
    }
    this.onFieldChange();
  }

  isItemActive(arr: string[], item: string): boolean {
    return arr.includes(item);
  }

  onFieldChange(): void {
    this.updated.emit({
      ...this.formData,
      pastHistory: [...this.formData.pastHistory],
      allergies: [...this.formData.allergies],
      comorbidities: [...this.formData.comorbidities],
      dialysisHistory: { ...this.formData.dialysisHistory },
      socialHistory: { ...this.formData.socialHistory }
    });
  }
}
