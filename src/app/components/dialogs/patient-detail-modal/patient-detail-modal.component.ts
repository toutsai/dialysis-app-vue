import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PatientDetail {
  id: string;
  name: string;
  medicalRecordNumber: string;
  gender: string;
  birthDate: string;
  bloodType: string;
  phone: string;
  emergencyContact: string;
  emergencyPhone: string;
  address: string;
  dialysisStartDate: string;
  vascularAccess: string;
  primaryDiagnosis: string;
  allergies: string;
  notes: string;
  bedNumber?: string;
  wardNumber?: string;
  doctor?: string;
  nurse?: string;
  schedule?: { day: string; shift: string }[];
  labResults?: { name: string; value: string; date: string; status: string }[];
  medications?: { name: string; dose: string; frequency: string }[];
}

@Component({
  selector: 'app-patient-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-detail-modal.component.html',
  styleUrl: './patient-detail-modal.component.css'
})
export class PatientDetailModalComponent {
  @Input() isVisible = false;
  @Input() patient: PatientDetail | null = null;
  @Input() currentDate: string = new Date().toISOString().split('T')[0];
  @Output() closed = new EventEmitter<void>();

  activeTab = 'info';

  tabs = [
    { key: 'info', label: '基本資料' },
    { key: 'dialysis', label: '透析資訊' },
    { key: 'lab', label: '檢驗結果' },
    { key: 'medications', label: '用藥紀錄' },
    { key: 'notes', label: '備註' }
  ];

  switchTab(tabKey: string): void {
    this.activeTab = tabKey;
  }

  getGenderLabel(gender: string): string {
    return gender === 'male' ? '男' : gender === 'female' ? '女' : gender;
  }

  getAccessLabel(access: string): string {
    const map: Record<string, string> = {
      avf: '動靜脈瘻管 (AVF)',
      avg: '人工血管 (AVG)',
      perm_cath: '永久性導管',
      temp_cath: '臨時導管',
      pd_catheter: '腹膜透析導管'
    };
    return map[access] || access;
  }

  getLabStatusClass(status: string): string {
    switch (status) {
      case 'high': return 'status-high';
      case 'low': return 'status-low';
      case 'critical': return 'status-critical';
      default: return 'status-normal';
    }
  }

  onClose(): void {
    this.activeTab = 'info';
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onClose();
    }
  }
}
