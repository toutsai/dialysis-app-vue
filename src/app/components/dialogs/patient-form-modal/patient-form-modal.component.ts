import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-patient-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-form-modal.component.html',
  styleUrl: './patient-form-modal.component.css'
})
export class PatientFormModalComponent implements OnChanges {
  @Input() isModalVisible = true;
  @Input() patientData: any = {};
  @Input() patientType = '';
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<any>();

  form: any = {};

  readonly PHYSICIANS = ['\u5ED6\u4E01\u7469', '\u8521\u5B9C\u6F54', '\u8607\u54F2\u5F18', '\u8521\u4EA8\u653F'];
  readonly FREQ_OPTIONS = [
    '\u4E00\u4E09\u4E94', '\u4E8C\u56DB\u516D', '\u4E00\u56DB', '\u4E8C\u4E94', '\u4E09\u516D',
    '\u4E00\u4E94', '\u4E8C\u516D', '\u6BCF\u65E5',
    '\u6BCF\u5468\u4E00', '\u6BCF\u5468\u4E8C', '\u6BCF\u5468\u4E09', '\u6BCF\u5468\u56DB', '\u6BCF\u5468\u4E94', '\u6BCF\u5468\u516D',
    '\u81E8\u6642',
  ];
  readonly MODES = ['HD', 'SLED', 'CVVHDF', 'PP', 'DFPP', 'Lipid'];
  readonly VASC_ACCESSES = ['Double lumen', 'PERM', '\u5DE6\u624BAVF', '\u53F3\u624BAVF', '\u5DE6\u624BAVG', '\u53F3\u624BAVG'];
  readonly DISEASES = ['HIV', 'RPR', 'BC\u809D?', 'HBV', 'HCV', 'C\u809D\u6CBB\u7652', 'COVID', '\u9694\u96E2'];

  get isEditing(): boolean {
    return !!(this.form && this.form.id);
  }

  get patientTypeText(): string {
    const map: Record<string, string> = { ipd: '\u4F4F\u9662', opd: '\u9580\u8A3A', er: '\u6025\u8A3A' };
    return map[this.patientType] || '';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isModalVisible'] && this.isModalVisible) {
      document.body.classList.add('modal-open');
      const data = JSON.parse(JSON.stringify(this.patientData || {}));
      if (!data.id) {
        data.status = this.patientType;
        data.patientCategory = this.patientType === 'opd' ? 'opd_regular' : 'non_regular';
      }
      if (!data.patientCategory) data.patientCategory = 'opd_regular';
      data.diseases = data.diseases || [];
      data.patientStatus = data.patientStatus || {
        isFirstDialysis: { active: false, date: null },
        isPaused: { active: false, date: null },
        hasBloodDraw: { active: false, date: null },
      };
      data.hospitalInfo = data.hospitalInfo || { source: '', transferOut: '' };
      this.form = data;
    } else if (changes['isModalVisible'] && !this.isModalVisible) {
      document.body.classList.remove('modal-open');
    }
  }

  toggleDisease(disease: string): void {
    const index = (this.form.diseases || []).indexOf(disease);
    if (index > -1) {
      this.form.diseases.splice(index, 1);
    } else {
      this.form.diseases.push(disease);
    }
  }

  isDiseaseSelected(disease: string): boolean {
    return (this.form.diseases || []).includes(disease);
  }

  toggleStatus(key: string): void {
    if (this.form.patientStatus && this.form.patientStatus[key]) {
      const status = this.form.patientStatus[key];
      status.active = !status.active;
      if (!status.active) status.date = null;
    }
  }

  closeModal(): void {
    this.close.emit();
  }

  handleSave(): void {
    if (!this.form.name || !this.form.medicalRecordNumber) {
      alert('\u59D3\u540D\u548C\u75C5\u6B77\u865F\u70BA\u5FC5\u586B\u9805\uFF01');
      return;
    }
    this.save.emit(this.form);
  }
}
