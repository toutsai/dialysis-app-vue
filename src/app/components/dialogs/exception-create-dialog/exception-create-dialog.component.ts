import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '@services/firebase.service';
import { deleteDoc, doc } from 'firebase/firestore';

@Component({
  selector: 'app-exception-create-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exception-create-dialog.component.html',
  styleUrl: './exception-create-dialog.component.css'
})
export class ExceptionCreateDialogComponent implements OnChanges {
  private readonly firebase = inject(FirebaseService);

  @Input() isVisible = true;
  @Input() allPatients: any[] = [];
  @Input() isPageLocked = false;
  @Input() initialData: any = null;
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<string>();

  isPatientDialogVisible = false;
  isBedAssignmentVisible = false;
  isSubmitting = false;
  isFetchingSource = false;
  sourceScheduleMessage = '';
  dailyScheduleForSwap: any = null;
  isFetchingSwapSchedule = false;
  patientB_SwapSelection = '';
  bedAssignmentProps: any = null;

  formData: any = this.defaultFormData();

  readonly shifts = ['early', 'noon', 'late'];
  readonly bedLayout = [1,2,3,5,6,7,8,9,11,12,13,15,16,17,18,19,21,22,23,25,26,27,28,29,31,32,33,35,36,37,38,39,51,52,53,55,56,57,58,59,61,62,63,65];
  readonly freqMap: Record<string, number[]> = {
    '一三五': [0,2,4], '二四六': [1,3,5],
    '一四': [0,3], '二五': [1,4], '三六': [2,5],
    '一五': [0,4], '二六': [1,5],
    '每日': [0,1,2,3,4,5],
    '每周一': [0], '每周二': [1], '每周三': [2],
    '每周四': [3], '每周五': [4], '每周六': [5],
  };

  private defaultFormData(): any {
    return {
      id: null, patientId: '', patientName: '', type: null,
      date: '', startDate: '', endDate: '', reason: '',
      from: { sourceDate: '', bedNum: null, shiftCode: null },
      to: { goalDate: '', bedNum: null, shiftCode: null },
      patient1: null, patient2: null,
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      if (this.initialData) {
        this.formData = {
          ...this.defaultFormData(),
          ...JSON.parse(JSON.stringify(this.initialData)),
          reason: '',
          to: { goalDate: this.initialData?.to?.goalDate || '', bedNum: null, shiftCode: null },
        };
      } else {
        this.formData = this.defaultFormData();
      }
    }
  }

  get selectedPatientAsArray(): any[] {
    const p = this.allPatients.find(pt => pt.id === this.formData.patientId);
    return p ? [p] : [];
  }

  get isEditingMode(): boolean {
    return !!this.initialData;
  }

  get dialogTitle(): string {
    if (this.isEditingMode) return '解決排程衝突';
    const typeMap: Record<string, string> = { MOVE: '臨時調班', SUSPEND: '區間暫停', ADD_SESSION: '臨時加洗', SWAP: '同日互調' };
    const title = typeMap[this.formData.type] ? ` - ${typeMap[this.formData.type]}` : '';
    return `新增調班申請${title}`;
  }

  get sourceBedDisplay(): string {
    if (this.isFetchingSource) return '查詢中...';
    if (this.sourceScheduleMessage) return this.sourceScheduleMessage;
    if (this.formData.from.bedNum && this.formData.from.shiftCode) {
      const shiftMap: Record<string, string> = { early: '早', noon: '午', late: '晚' };
      return `${this.formData.from.bedNum}床 / ${shiftMap[this.formData.from.shiftCode] || this.formData.from.shiftCode}班`;
    }
    return '待查詢...';
  }

  get targetBedDisplay(): string {
    if (this.formData.to.bedNum && this.formData.to.shiftCode) {
      const shiftMap: Record<string, string> = { early: '早', noon: '午', late: '晚' };
      return `${this.formData.to.bedNum}床 / ${shiftMap[this.formData.to.shiftCode] || this.formData.to.shiftCode}班`;
    }
    return '點擊以選擇目標床位...';
  }

  get isFormValid(): boolean {
    if (!this.formData.type || !this.formData.patientId) return false;
    const hasReason = this.isEditingMode || !!this.formData.reason?.trim();
    switch (this.formData.type) {
      case 'MOVE': return !!(this.formData.from.bedNum && this.formData.to.bedNum && this.formData.to.goalDate && hasReason);
      case 'SUSPEND': return !!(this.formData.startDate && this.formData.endDate && this.formData.endDate >= this.formData.startDate && hasReason);
      case 'ADD_SESSION': return !!(this.formData.to.goalDate && this.formData.to.bedNum && hasReason);
      case 'SWAP': return !!(this.formData.date && this.formData.patient1 && this.formData.patient2 && hasReason);
      default: return false;
    }
  }

  onClose(): void {
    this.close.emit();
  }

  handlePatientSelected(event: any): void {
    const patient = this.allPatients.find(p => p.id === event.patientId);
    if (patient) {
      this.formData.patientId = patient.id;
      this.formData.patientName = patient.name;
    }
    this.isPatientDialogVisible = false;
  }

  submitForm(): void {
    if (!this.isFormValid) return;
    const dataToSubmit = JSON.parse(JSON.stringify(this.formData));
    this.submit.emit(dataToSubmit);
  }

  async handleDelete(): Promise<void> {
    if (!this.isEditingMode || !this.initialData?.id) return;
    this.isSubmitting = true;
    try {
      await deleteDoc(doc(this.firebase.db, 'schedule_exceptions', this.initialData.id));
      this.delete.emit(this.initialData.id);
    } catch (error) {
      console.error('撤銷申請失敗:', error);
    } finally {
      this.isSubmitting = false;
      this.onClose();
    }
  }

  handleTargetBedAssigned(event: any): void {
    this.formData.to.bedNum = event.bedNum;
    this.formData.to.shiftCode = event.shiftCode;
    this.isBedAssignmentVisible = false;
  }
}
