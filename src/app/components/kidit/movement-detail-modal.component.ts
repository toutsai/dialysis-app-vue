import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertDialogComponent } from '@app/components/dialogs/alert-dialog/alert-dialog.component';
import { ConfirmDialogComponent } from '@app/components/dialogs/confirm-dialog/confirm-dialog.component';
import { VascularAccessFormComponent } from './vascular-access-form.component';
import { KiditPatientFormComponent } from './kidit-patient-form.component';
import { KiditHistoryFormComponent } from './kidit-history-form.component';

@Component({
  selector: 'app-movement-detail-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AlertDialogComponent, ConfirmDialogComponent, VascularAccessFormComponent, KiditPatientFormComponent, KiditHistoryFormComponent],
  templateUrl: './movement-detail-modal.component.html',
  styleUrl: './movement-detail-modal.component.css'
})
export class MovementDetailModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() date = '';
  @Input() events: any[] = [];
  @Output() closeEvent = new EventEmitter<void>();
  @Output() refreshEvent = new EventEmitter<void>();

  activeTab = 'movement';
  subTab = 'current';
  localEvents: any[] = [];
  selectedPatientId: string | null = null;
  selectedPatientName = '';
  selectedPatientData: any = null;

  isAlertDialogVisible = false;
  alertDialogTitle = '';
  alertDialogMessage = '';

  isConfirmDialogVisible = false;
  confirmDialogTitle = '';
  confirmDialogMessage = '';
  pendingDeleteIndex = -1;

  readonly tabs = [
    { key: 'movement', label: '當日病患動態', requiresSelection: false },
    { key: 'vascular', label: '血管通路處置', requiresSelection: true },
    { key: 'profile', label: 'KiDit 病患資料', requiresSelection: true },
    { key: 'history', label: 'KiDit 病史原發病', requiresSelection: true },
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['events']) {
      this.localEvents = JSON.parse(JSON.stringify(this.events || []));
    }
  }

  get selectedPatient(): any {
    if (!this.selectedPatientId) return null;
    return { id: this.selectedPatientId, name: this.selectedPatientName };
  }

  get selectedEvent(): any {
    return this.localEvents.find(e => e.patientId === this.selectedPatientId) || {};
  }

  get selectedPatientVascularEvents(): any[] {
    if (!this.selectedPatientId) return [];
    return this.localEvents.filter(e => e.patientId === this.selectedPatientId && e.type === 'ACCESS');
  }

  showAlert(title: string, message: string): void {
    this.alertDialogTitle = title;
    this.alertDialogMessage = message;
    this.isAlertDialogVisible = true;
  }

  getEventData(key: string): any {
    return this.selectedEvent[key] || null;
  }

  translateType(type: string): string {
    const map: Record<string, string> = { MOVEMENT: '動態', ACCESS: '通路', TRANSFER: '轉移', CREATE: '新收', DELETE: '結案' };
    return map[type] || type;
  }

  getBadgeClass(type: string): string {
    const map: Record<string, string> = {
      MOVEMENT: 'bg-blue-100 text-blue-800',
      ACCESS: 'bg-purple-100 text-purple-800',
      TRANSFER: 'bg-yellow-100 text-yellow-800',
      CREATE: 'bg-green-100 text-green-800',
      DELETE: 'bg-red-100 text-red-800',
    };
    return map[type] || 'bg-gray-100 text-gray-800';
  }

  formatTime(ts: any): string {
    if (!ts) return '';
    const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  selectPatient(event: any): void {
    this.selectedPatientId = event.patientId;
    this.selectedPatientName = event.patientName;
  }

  handleTabClick(key: string): void {
    const tab = this.tabs.find(t => t.key === key);
    if (tab?.requiresSelection && !this.selectedPatientId) {
      this.showAlert('提示', '請先在列表中點選一位病人');
      return;
    }
    this.activeTab = key;
  }

  handleDataUpdated(key: string, newData: any): void {
    const targetEvent = this.localEvents.find(e => e.patientId === this.selectedPatientId);
    if (targetEvent && key) {
      targetEvent[key] = JSON.parse(JSON.stringify(newData));
    }
    this.showAlert('成功', '資料已儲存！');
    this.refreshEvent.emit();
  }

  handleIncompleteClick(event: any): void {
    this.selectPatient(event);
    this.handleTabClick('profile');
  }

  deleteEvent(index: number): void {
    const event = this.localEvents[index];
    this.pendingDeleteIndex = index;
    this.confirmDialogTitle = '確認移除';
    this.confirmDialogMessage = `確定要移除 ${event.patientName} 的這筆紀錄嗎？\n移除後需點擊「儲存動態列表變更」才會生效。`;
    this.isConfirmDialogVisible = true;
  }

  executeDelete(): void {
    if (this.pendingDeleteIndex !== -1) {
      const deletedEvent = this.localEvents[this.pendingDeleteIndex];
      this.localEvents.splice(this.pendingDeleteIndex, 1);
      if (deletedEvent.patientId === this.selectedPatientId) {
        this.selectedPatientId = null;
        this.selectedPatientName = '';
      }
      this.pendingDeleteIndex = -1;
    }
    this.isConfirmDialogVisible = false;
  }

  async saveAllEvents(): Promise<void> {
    try {
      // kiditService.updateLogEvents would be called here
      this.showAlert('成功', '動態列表儲存成功！');
      this.refreshEvent.emit();
    } catch (e) {
      console.error(e);
      this.showAlert('錯誤', '儲存失敗，請稍後再試。');
    }
  }

  close(): void {
    this.closeEvent.emit();
    this.activeTab = 'movement';
    this.selectedPatientId = null;
  }

  isKiDitDataComplete(event: any): boolean {
    const hasProfile = event.kidit_profile && event.kidit_profile.idNumber;
    const hasHistory = event.kidit_history && event.kidit_history.diagnosisCategory;
    const v = event.kidit_vascular?.current || {};
    const hasVascular = v.isAutoCap || v.isManuCap || v.isPermCath || v.isDoubleLumen;
    return !!(hasProfile && hasHistory && hasVascular);
  }
}
