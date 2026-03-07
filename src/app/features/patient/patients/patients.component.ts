import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { PatientStateService, Patient } from '../../../core/states/patient.state';
import { ApiManagerService } from '../../../core/services/api/api-manager.service';
import { AlertDialogComponent } from '../../../shared/components/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SelectionDialogComponent, SelectionOption } from '../../../shared/components/selection-dialog/selection-dialog.component';

type PatientTab = 'opd' | 'ipd' | 'er' | 'deleted';

@Component({
  selector: 'app-patients',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent, ConfirmDialogComponent, SelectionDialogComponent],
  templateUrl: './patients.component.html',
  styleUrl: './patients.component.css'
})
export class PatientsComponent implements OnInit {
  auth = inject(AuthService);
  patientState = inject(PatientStateService);
  private apiManager = inject(ApiManagerService);

  activeTab: PatientTab = 'opd';
  searchTerm = '';
  isLoading = false;

  // Dialog states
  isAlertVisible = false;
  alertTitle = '';
  alertMessage = '';
  isConfirmVisible = false;
  confirmMessage = '';
  isDeleteDialogVisible = false;
  patientToDeleteId: string | null = null;

  deleteReasons: SelectionOption[] = [
    { value: '死亡', text: '死亡' },
    { value: '轉外院透析', text: '轉外院透析' },
    { value: '轉PD', text: '轉PD' },
    { value: '腎臟移植', text: '腎臟移植' },
    { value: '轉安寧', text: '轉安寧' },
    { value: '腎功能恢復不須透析', text: '腎功能恢復不須透析' },
    { value: '出院', text: '出院' },
    { value: '結束治療', text: '結束治療' },
  ];

  freqColorMap: Record<string, string> = {
    '一三五': 'freq-blue', '二四六': 'freq-green', '一四': 'freq-orange',
    '二五': 'freq-orange', '三六': 'freq-orange', '每日': 'freq-purple',
    '臨時': 'freq-red', '未設定': 'freq-grey',
  };

  get isPageLocked(): boolean { return !this.auth.hasPermission('editor'); }
  get isDeleteLocked(): boolean { return this.isPageLocked || this.auth.currentUser?.role === 'contributor'; }

  get allPatients(): Patient[] { return this.patientState.allPatients; }

  get displayedPatients(): Patient[] {
    let patients: Patient[];
    if (this.activeTab === 'deleted') {
      patients = this.allPatients.filter(p => p.isDeleted);
    } else {
      patients = this.allPatients.filter(p => p.status === this.activeTab && !p.isDeleted);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      patients = patients.filter(p =>
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.medicalRecordNumber && p.medicalRecordNumber.includes(term))
      );
    }
    return patients;
  }

  get tabCounts(): Record<string, number> {
    const all = this.allPatients;
    return {
      opd: all.filter(p => p.status === 'opd' && !p.isDeleted).length,
      ipd: all.filter(p => p.status === 'ipd' && !p.isDeleted).length,
      er: all.filter(p => p.status === 'er' && !p.isDeleted).length,
      deleted: all.filter(p => p.isDeleted).length,
    };
  }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    await this.patientState.fetchPatientsIfNeeded();
    this.isLoading = false;
  }

  setTab(tab: PatientTab): void {
    this.activeTab = tab;
    this.searchTerm = '';
  }

  openDeleteDialog(patientId: string): void {
    if (this.isDeleteLocked) {
      this.showAlert('操作失敗', '權限不足：您的角色無法刪除病人資料。');
      return;
    }
    this.patientToDeleteId = patientId;
    this.isDeleteDialogVisible = true;
  }

  handleDeleteReasonSelected(reason: string): void {
    this.isDeleteDialogVisible = false;
    // TODO: Implement delete with reason logic and Firestore update
    console.log(`Delete patient ${this.patientToDeleteId} with reason: ${reason}`);
    this.patientToDeleteId = null;
  }

  showAlert(title: string, message: string): void {
    this.alertTitle = title;
    this.alertMessage = message;
    this.isAlertVisible = true;
  }
}
