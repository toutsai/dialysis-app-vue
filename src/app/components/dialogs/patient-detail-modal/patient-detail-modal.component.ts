import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@services/auth.service';
import { FirebaseService } from '@services/firebase.service';
import { TaskStoreService } from '@services/task-store.service';
import { httpsCallable } from 'firebase/functions';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getShiftDisplayName } from '@/constants/scheduleConstants';
import { formatDateToYYYYMMDD } from '@/utils/dateUtils';
import { ConditionRecordPanelComponent } from '../../condition-record-panel/condition-record-panel.component';
import { MemoPanelComponent } from '../../memo-panel/memo-panel.component';
import { PatientLabSummaryPanelComponent } from '../../patient-lab-summary-panel/patient-lab-summary-panel.component';
import { LabMedCorrelationViewComponent } from '../../lab-med-correlation-view/lab-med-correlation-view.component';

@Component({
  selector: 'app-patient-detail-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ConditionRecordPanelComponent,
    MemoPanelComponent,
    PatientLabSummaryPanelComponent,
    LabMedCorrelationViewComponent,
  ],
  templateUrl: './patient-detail-modal.component.html',
  styleUrl: './patient-detail-modal.component.css'
})
export class PatientDetailModalComponent implements OnChanges, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly firebase = inject(FirebaseService);
  private readonly taskStore = inject(TaskStoreService);

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  @Input() isVisible = false;
  @Input() patient: any = null;
  @Input() slotList: any[] = [];
  @Input() currentIndex = 0;
  @Input() currentDate = '';
  @Output() closeEvent = new EventEmitter<void>();
  @Output() recordUpdated = new EventEmitter<void>();
  @Output() switchPatientEvent = new EventEmitter<number>();

  activeTab = 'records';
  cameraState: 'idle' | 'streaming' | 'captured' | 'uploading' = 'idle';
  capturedImage: string | null = null;
  cameraStream: MediaStream | null = null;
  cameraErrorMessage = '';
  isUploading = false;
  driveFiles: any[] = [];
  isFetchingFiles = false;
  fetchError = '';
  hasSearched = false;
  dateFilterMode: 'recent' | 'custom' | 'all' = 'recent';
  customStartDate = '';
  customEndDate = '';
  isEditingFileName = false;
  editingFile: any = null;
  newFileName = '';
  isRenaming = false;
  renameError = '';

  get isLockedForThisUser(): boolean {
    return !this.auth.canEditClinicalNotesAndOrders();
  }

  get currentSlotInfo(): { bedNum: string; shift: string } {
    if (!this.slotList || this.slotList.length === 0) {
      return { bedNum: 'N/A', shift: '\u672a\u77e5' };
    }
    const currentSlot = this.slotList[this.currentIndex];
    if (!currentSlot || !currentSlot.shiftId) {
      return { bedNum: 'N/A', shift: '\u672a\u77e5' };
    }
    const shiftId = currentSlot.shiftId;
    const parts = shiftId.split('-');
    const shiftCode = parts[2];
    const bedNum = parts[0] === 'peripheral' ? `\u5916${parts[1]}` : parts[1];
    const shift = getShiftDisplayName(shiftCode);
    return { bedNum, shift };
  }

  get hasPendingMemosForPatient(): boolean {
    if (!this.patient?.id) return false;
    return this.taskStore.sortedFeedMessages().some(
      (msg: any) =>
        msg.patientId === this.patient.id &&
        msg.status === 'pending' &&
        msg.content &&
        !msg.content.startsWith('\u3010'),
    );
  }

  get filteredDriveFiles(): any[] {
    if (!this.driveFiles || this.driveFiles.length === 0) return [];

    if (this.dateFilterMode === 'all') {
      return this.driveFiles;
    }

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (this.dateFilterMode === 'recent') {
      startDate = this.getDefaultStartDate();
      endDate = new Date();
    } else if (this.dateFilterMode === 'custom') {
      startDate = this.customStartDate ? new Date(this.customStartDate) : null;
      endDate = this.customEndDate ? new Date(this.customEndDate) : null;
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
      }
    }

    return this.driveFiles.filter((file: any) => {
      const fileDate = new Date(file.createdTime);
      if (startDate && fileDate < startDate) return false;
      if (endDate && fileDate > endDate) return false;
      return true;
    });
  }

  handleClose(): void {
    this.stopCamera();
    this.activeTab = 'records';
    this.cameraState = 'idle';
    this.capturedImage = null;
    this.cameraErrorMessage = '';
    this.driveFiles = [];
    this.hasSearched = false;
    this.isEditingFileName = false;
    this.editingFile = null;
    this.closeEvent.emit();
  }

  async handleSaveConditionRecord(recordData: any): Promise<void> {
    try {
      const currentUser = this.auth.currentUser();
      if (!currentUser) return;
      await addDoc(collection(this.firebase.db, 'condition_records'), {
        patientId: this.patient.id,
        patientName: this.patient.name,
        content: recordData.content,
        authorName: currentUser.name || (currentUser as any).displayName || '',
        authorId: currentUser.uid,
        recordDate: this.currentDate || new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
      });
      this.recordUpdated.emit();
    } catch (err) {
      console.error('Failed to save condition record:', err);
    }
  }

  async handleSaveLabSummaryAsRecord(data: { patient: any; content: string }): Promise<void> {
    try {
      const currentUser = this.auth.currentUser();
      if (!currentUser) return;
      await addDoc(collection(this.firebase.db, 'condition_records'), {
        patientId: data.patient.id,
        patientName: data.patient.name,
        content: data.content,
        authorName: currentUser.name || (currentUser as any).displayName || '',
        authorId: currentUser.uid,
        recordDate: this.currentDate || new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
      });
      this.recordUpdated.emit();
    } catch (err) {
      console.error('Failed to save lab summary as record:', err);
    }
  }

  switchToPatient(newIndex: number): void {
    if (newIndex < 0 || newIndex >= this.slotList.length) return;
    this.stopCamera();
    this.cameraState = 'idle';
    this.capturedImage = null;
    this.cameraErrorMessage = '';
    this.driveFiles = [];
    this.hasSearched = false;
    this.switchPatientEvent.emit(newIndex);
  }

  getDefaultStartDate(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d;
  }

  async startCamera(): Promise<void> {
    this.cameraErrorMessage = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      this.cameraStream = stream;
      this.cameraState = 'streaming';
      // Wait for ViewChild to bind
      setTimeout(() => {
        if (this.videoPlayerRef?.nativeElement) {
          this.videoPlayerRef.nativeElement.srcObject = stream;
        }
      }, 100);
    } catch (err: any) {
      console.error('Camera error:', err);
      this.cameraErrorMessage = '\u7121\u6cd5\u958b\u555f\u76f8\u6a5f\uff1a' + (err.message || '\u672a\u77e5\u932f\u8aa4');
    }
  }

  stopCamera(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => track.stop());
      this.cameraStream = null;
    }
    this.cameraState = 'idle';
  }

  captureImage(): void {
    if (!this.videoPlayerRef?.nativeElement) return;
    const video = this.videoPlayerRef.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      this.capturedImage = canvas.toDataURL('image/jpeg', 0.8);
      this.stopCamera();
      this.cameraState = 'captured';
    }
  }

  retakePhoto(): void {
    this.capturedImage = null;
    this.startCamera();
  }

  async uploadToDrive(): Promise<void> {
    if (!this.capturedImage || !this.patient) return;
    this.isUploading = true;
    this.cameraState = 'uploading';
    this.cameraErrorMessage = '';
    try {
      const uploadFile = httpsCallable(this.firebase.functions, 'uploadFile');
      const result = await uploadFile({
        patientId: this.patient.id,
        patientName: this.patient.name,
        medicalRecordNumber: this.patient.medicalRecordNumber,
        imageData: this.capturedImage,
      });
      console.log('Upload success:', result.data);
      this.capturedImage = null;
      this.cameraState = 'idle';
      await this.fetchDriveFiles();
    } catch (err: any) {
      console.error('Upload error:', err);
      this.cameraErrorMessage = '\u4e0a\u50b3\u5931\u6557\uff1a' + (err.message || '\u672a\u77e5\u932f\u8aa4');
      this.cameraState = 'captured';
    } finally {
      this.isUploading = false;
    }
  }

  formatDateTime(isoString: string): string {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  async fetchDriveFiles(): Promise<void> {
    if (!this.patient) return;
    this.isFetchingFiles = true;
    this.fetchError = '';
    try {
      const getDriveFiles = httpsCallable(this.firebase.functions, 'getDriveFiles');
      const result: any = await getDriveFiles({
        patientId: this.patient.id,
        medicalRecordNumber: this.patient.medicalRecordNumber,
      });
      this.driveFiles = result.data?.files || [];
      this.hasSearched = true;
    } catch (err: any) {
      console.error('Fetch drive files error:', err);
      this.fetchError = '\u8b80\u53d6\u5f71\u50cf\u8cc7\u6599\u5931\u6557\uff1a' + (err.message || '\u672a\u77e5\u932f\u8aa4');
      this.driveFiles = [];
    } finally {
      this.isFetchingFiles = false;
    }
  }

  startEditFileName(file: any): void {
    this.editingFile = file;
    const nameWithoutExt = file.name?.replace(/\.[^.]+$/, '') || '';
    const ext = file.name?.match(/\.[^.]+$/)?.[0]?.substring(1) || '';
    this.editingFile.extension = ext;
    this.newFileName = nameWithoutExt;
    this.isEditingFileName = true;
    this.renameError = '';
  }

  cancelEditFileName(): void {
    this.isEditingFileName = false;
    this.editingFile = null;
    this.newFileName = '';
    this.renameError = '';
  }

  async saveFileName(): Promise<void> {
    if (!this.editingFile || !this.newFileName.trim()) {
      this.renameError = '\u6a94\u540d\u4e0d\u53ef\u70ba\u7a7a';
      return;
    }
    this.isRenaming = true;
    this.renameError = '';
    try {
      const fullName = this.editingFile.extension
        ? `${this.newFileName.trim()}.${this.editingFile.extension}`
        : this.newFileName.trim();

      const renameDriveFile = httpsCallable(this.firebase.functions, 'renameDriveFile');
      await renameDriveFile({
        fileId: this.editingFile.id,
        newName: fullName,
      });

      // Update local state
      const idx = this.driveFiles.findIndex((f: any) => f.id === this.editingFile.id);
      if (idx !== -1) {
        this.driveFiles[idx] = { ...this.driveFiles[idx], name: fullName };
        this.driveFiles = [...this.driveFiles];
      }
      this.cancelEditFileName();
    } catch (err: any) {
      console.error('Rename error:', err);
      this.renameError = '\u91cd\u65b0\u547d\u540d\u5931\u6557\uff1a' + (err.message || '\u672a\u77e5\u932f\u8aa4');
    } finally {
      this.isRenaming = false;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && this.patient) {
      // Auto-fetch drive files when imaging tab is the default or when re-opened
      if (this.activeTab === 'imaging') {
        this.fetchDriveFiles();
      }
    }
    if (changes['patient'] && this.patient) {
      this.driveFiles = [];
      this.hasSearched = false;
      if (this.activeTab === 'imaging' && this.isVisible) {
        this.fetchDriveFiles();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }
}
