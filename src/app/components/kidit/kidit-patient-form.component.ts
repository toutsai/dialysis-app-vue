import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface PatientFormData {
  dryWeight: number | null;
  targetUF: number | null;
  dialyzerType: string;
  dialysisTime: number | null;
  bloodFlowRate: number | null;
  dialysateFlowRate: number | null;
  dialysateCa: string;
  dialysateK: string;
  anticoagulant: string;
  anticoagulantDose: string;
  vascularAccess: string;
  needleSize: string;
  preWeight: number | null;
  preBPSys: number | null;
  preBPDia: number | null;
  preHR: number | null;
  preTemp: number | null;
  notes: string;
}

@Component({
  selector: 'app-kidit-patient-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './kidit-patient-form.component.html',
  styleUrl: './kidit-patient-form.component.css'
})
export class KiditPatientFormComponent implements OnInit, OnChanges {
  @Input() date: string = '';
  @Input() eventId: string = '';
  @Input() initialData: Partial<PatientFormData> = {};
  @Input() masterPatient: any = null;
  @Output() updated = new EventEmitter<PatientFormData>();

  formData: PatientFormData = this.getDefaultFormData();

  dialyzerOptions = ['FX60', 'FX80', 'FX100', 'APS-15SA', 'APS-18SA', 'APS-21SA', 'PES-150', 'PES-170', 'PES-210'];
  anticoagulantOptions = ['Heparin', 'LMWH', 'Nafamostat', '無'];
  dialysateCaOptions = ['2.5', '3.0', '3.5'];
  dialysateKOptions = ['1.0', '2.0', '3.0'];
  accessOptions = ['AVF', 'AVG', 'DLC', 'Perm-cath'];
  needleSizeOptions = ['15G', '16G', '17G'];

  get estimatedUF(): string {
    if (this.formData.preWeight != null && this.formData.dryWeight != null) {
      const uf = this.formData.preWeight - this.formData.dryWeight;
      return uf > 0 ? uf.toFixed(1) : '0.0';
    }
    return '-';
  }

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
    this.formData = { ...defaults, ...this.initialData };

    if (this.masterPatient) {
      if (!this.formData.dryWeight && this.masterPatient.dryWeight) {
        this.formData.dryWeight = this.masterPatient.dryWeight;
      }
      if (!this.formData.dialyzerType && this.masterPatient.dialyzerType) {
        this.formData.dialyzerType = this.masterPatient.dialyzerType;
      }
      if (!this.formData.vascularAccess && this.masterPatient.vascularAccess) {
        this.formData.vascularAccess = this.masterPatient.vascularAccess;
      }
      if (!this.formData.anticoagulant && this.masterPatient.anticoagulant) {
        this.formData.anticoagulant = this.masterPatient.anticoagulant;
      }
    }
  }

  getDefaultFormData(): PatientFormData {
    return {
      dryWeight: null,
      targetUF: null,
      dialyzerType: '',
      dialysisTime: 4,
      bloodFlowRate: 250,
      dialysateFlowRate: 500,
      dialysateCa: '3.0',
      dialysateK: '2.0',
      anticoagulant: '',
      anticoagulantDose: '',
      vascularAccess: '',
      needleSize: '16G',
      preWeight: null,
      preBPSys: null,
      preBPDia: null,
      preHR: null,
      preTemp: null,
      notes: ''
    };
  }

  onFieldChange(): void {
    this.updated.emit({ ...this.formData });
  }

  onPreWeightChange(): void {
    if (this.formData.preWeight != null && this.formData.dryWeight != null) {
      const uf = this.formData.preWeight - this.formData.dryWeight;
      this.formData.targetUF = uf > 0 ? parseFloat(uf.toFixed(1)) : 0;
    }
    this.onFieldChange();
  }
}
