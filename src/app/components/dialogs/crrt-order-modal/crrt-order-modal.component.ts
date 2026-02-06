import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CrrtPatient {
  id: string;
  name: string;
  medicalRecordNumber: string;
}

export interface CrrtOrderData {
  crrtMode: string;
  filterType: string;
  bloodFlowRate: number;
  replacementFluidRate: number;
  dialysateRate: number;
  ultrafiltrationRate: number;
  anticoagulant: string;
  anticoagulantDose: string;
  replacementFluidLocation: string;
  calciumReplacement: string;
  targetFluidBalance: number;
  vascularAccess: string;
  accessSite: string;
  specialInstructions: string;
}

@Component({
  selector: 'app-crrt-order-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crrt-order-modal.component.html',
  styleUrl: './crrt-order-modal.component.css'
})
export class CrrtOrderModalComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patient: CrrtPatient | null = null;
  @Input() initialData: Partial<CrrtOrderData> | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<CrrtOrderData>();

  formData: CrrtOrderData = this.getDefaultForm();

  crrtModes = [
    { value: 'CVVH', label: 'CVVH (持續靜脈-靜脈血液過濾)' },
    { value: 'CVVHD', label: 'CVVHD (持續靜脈-靜脈血液透析)' },
    { value: 'CVVHDF', label: 'CVVHDF (持續靜脈-靜脈血液透析過濾)' },
    { value: 'SCUF', label: 'SCUF (緩慢連續超濾)' }
  ];

  filterTypes = [
    { value: 'AN69', label: 'AN69' },
    { value: 'M100', label: 'M100' },
    { value: 'M150', label: 'M150' },
    { value: 'HF1400', label: 'HF1400' },
    { value: 'ST100', label: 'ST100' },
    { value: 'ST150', label: 'ST150' }
  ];

  anticoagulants = [
    { value: 'citrate', label: '枸橼酸抗凝' },
    { value: 'heparin', label: 'Heparin' },
    { value: 'none', label: '無抗凝劑' },
    { value: 'nafamostat', label: 'Nafamostat' }
  ];

  fluidLocations = [
    { value: 'pre', label: '前稀釋' },
    { value: 'post', label: '後稀釋' },
    { value: 'both', label: '前後稀釋' }
  ];

  private getDefaultForm(): CrrtOrderData {
    return {
      crrtMode: 'CVVHDF',
      filterType: 'M150',
      bloodFlowRate: 150,
      replacementFluidRate: 1000,
      dialysateRate: 1000,
      ultrafiltrationRate: 100,
      anticoagulant: 'citrate',
      anticoagulantDose: '',
      replacementFluidLocation: 'pre',
      calciumReplacement: '',
      targetFluidBalance: 0,
      vascularAccess: 'temp_cath',
      accessSite: '',
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
      this.formData.crrtMode &&
      this.formData.filterType &&
      this.formData.bloodFlowRate > 0
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
