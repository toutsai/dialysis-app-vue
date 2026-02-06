import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PatientActionInfo {
  id: string;
  name: string;
  bedNumber?: string;
  medicalRecordNumber?: string;
}

export interface PatientAction {
  key: string;
  label: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-patient-action-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-action-modal.component.html',
  styleUrl: './patient-action-modal.component.css'
})
export class PatientActionModalComponent {
  @Input() isVisible = false;
  @Input() patient: PatientActionInfo | null = null;
  @Input() hasMemo = false;
  @Output() closed = new EventEmitter<void>();
  @Output() selected = new EventEmitter<string>();

  get actions(): PatientAction[] {
    const list: PatientAction[] = [
      { key: 'detail', label: '查看詳情', icon: '📋', color: '#3498db' },
      { key: 'history', label: '歷史紀錄', icon: '📜', color: '#9b59b6' },
      { key: 'dialysisOrder', label: '透析醫囑', icon: '💉', color: '#1abc9c' },
      { key: 'labResult', label: '檢驗報告', icon: '🔬', color: '#e67e22' },
      { key: 'bedChange', label: '換床', icon: '🛏', color: '#f39c12' },
      { key: 'scheduleChange', label: '排程異動', icon: '📅', color: '#2ecc71' },
      { key: 'addTask', label: '新增任務', icon: '✅', color: '#e74c3c' }
    ];
    if (this.hasMemo) {
      list.push({ key: 'viewMemo', label: '查看備忘', icon: '📝', color: '#95a5a6' });
    }
    return list;
  }

  onAction(actionKey: string): void {
    this.selected.emit(actionKey);
    this.closed.emit();
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
