import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface DialysisOrderPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
}

export interface DialysisOrderData {
  dialysisMode: string;
  dialyzerType: string;
  bloodFlowRate: number;
  dialysateFlowRate: number;
  duration: number;
  dryWeight: number;
  ultrafiltrationGoal: number;
  anticoagulant: string;
  anticoagulantDose: string;
  dialysateCalcium: string;
  dialysatePotassium: string;
  vascularAccess: string;
  needleGauge: string;
  specialInstructions: string;
}

@Component({
  selector: 'app-dialysis-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dialysis-order-modal.component.html',
  styleUrl: './dialysis-order-modal.component.css'
})
export class DialysisOrderModalComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patient: DialysisOrderPatient | null = null;
  @Input() initialData: Partial<DialysisOrderData> | null = null;
  @Input() isEditing = false;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<DialysisOrderData>();

  formData: DialysisOrderData = this.getDefaultForm();

  dialysisModes = [
    { value: 'HD', label: 'HD (血液透析)' },
    { value: 'HDF', label: 'HDF (血液透析過濾)' },
    { value: 'HF', label: 'HF (血液過濾)' }
  ];

  dialyzerTypes = [
    { value: 'FX80', label: 'FX80' },
    { value: 'FX100', label: 'FX100' },
    { value: 'FX CorDiax 80', label: 'FX CorDiax 80' },
    { value: 'FX CorDiax 100', label: 'FX CorDiax 100' },
    { value: 'Polyflux 170H', label: 'Polyflux 170H' },
    { value: 'Polyflux 210H', label: 'Polyflux 210H' }
  ];

  anticoagulants = [
    { value: 'heparin', label: 'Heparin' },
    { value: 'lmwh', label: 'LMWH (低分子量肝素)' },
    { value: 'none', label: '無抗凝劑' },
    { value: 'citrate', label: '枸橼酸' }
  ];

  accessTypes = [
    { value: 'avf', label: 'AVF' },
    { value: 'avg', label: 'AVG' },
    { value: 'perm_cath', label: '永久導管' },
    { value: 'temp_cath', label: '臨時導管' }
  ];

  private getDefaultForm(): DialysisOrderData {
    return {
      dialysisMode: 'HD',
      dialyzerType: 'FX80',
      bloodFlowRate: 250,
      dialysateFlowRate: 500,
      duration: 240,
      dryWeight: 0,
      ultrafiltrationGoal: 0,
      anticoagulant: 'heparin',
      anticoagulantDose: '',
      dialysateCalcium: '2.5',
      dialysatePotassium: '2.0',
      vascularAccess: 'avf',
      needleGauge: '16G',
      specialInstructions: ''
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible) {
      if (this.initialData) {
        this.formData = { ...this.getDefaultForm(), ...this.initialData };
      } else {
        this.formData = this.getDefaultForm();
      }
    }
  }

  get isFormValid(): boolean {
    return !!(
      this.formData.dialysisMode &&
      this.formData.dialyzerType &&
      this.formData.bloodFlowRate > 0 &&
      this.formData.duration > 0
    );
  }

  onSave(): void {
    if (this.isFormValid) {
      this.saved.emit({ ...this.formData });
      this.closed.emit();
    }
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
