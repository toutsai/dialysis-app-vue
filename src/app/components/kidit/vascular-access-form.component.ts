import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface VascularAccessData {
  accessType: string;
  location: string;
  side: 'left' | 'right' | '';
  creationDate: string;
  surgeon: string;
  status: string;
  flowRate: number | null;
  lastAssessmentDate: string;
  complications: string[];
  needleSites: {
    arterial: string;
    venous: string;
  };
  interventions: InterventionRecord[];
  notes: string;
}

interface InterventionRecord {
  date: string;
  type: string;
  detail: string;
  outcome: string;
}

@Component({
  selector: 'app-vascular-access-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vascular-access-form.component.html',
  styleUrl: './vascular-access-form.component.css'
})
export class VascularAccessFormComponent implements OnInit, OnChanges {
  @Input() type: string = '';
  @Input() date: string = '';
  @Input() eventId: string = '';
  @Input() initialData: Partial<VascularAccessData> = {};
  @Input() masterPatient: any = null;
  @Output() updated = new EventEmitter<VascularAccessData>();

  formData: VascularAccessData = this.getDefaultFormData();
  showAddIntervention = false;
  newIntervention: InterventionRecord = this.getEmptyIntervention();

  accessTypes = ['AVF (自體瘻管)', 'AVG (人工血管)', 'DLC (雙腔導管)', 'Perm-cath (永久導管)'];
  locationOptions = ['前臂遠端', '前臂近端', '上臂', '大腿', '頸部右側', '頸部左側', '鎖骨下'];
  statusOptions = ['功能良好', '流量不足', '血栓', '感染', '狹窄', '已廢用'];
  complicationList = ['血栓', '狹窄', '感染', '假性動脈瘤', '竊血症候群', '高輸出量心衰', '出血', '手臂腫脹'];
  interventionTypes = ['PTA (氣球擴張)', '血栓清除', '修補手術', '導管更換', '導管拔除', 'Stent 置放'];

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
    this.formData = {
      ...defaults,
      ...this.initialData,
      complications: this.initialData.complications ? [...this.initialData.complications] : [],
      needleSites: { ...defaults.needleSites, ...this.initialData.needleSites },
      interventions: this.initialData.interventions
        ? this.initialData.interventions.map(i => ({ ...i }))
        : []
    };
  }

  getDefaultFormData(): VascularAccessData {
    return {
      accessType: '',
      location: '',
      side: '',
      creationDate: '',
      surgeon: '',
      status: '功能良好',
      flowRate: null,
      lastAssessmentDate: '',
      complications: [],
      needleSites: {
        arterial: '',
        venous: ''
      },
      interventions: [],
      notes: ''
    };
  }

  getEmptyIntervention(): InterventionRecord {
    return { date: '', type: '', detail: '', outcome: '' };
  }

  toggleComplication(item: string): void {
    const idx = this.formData.complications.indexOf(item);
    if (idx >= 0) {
      this.formData.complications.splice(idx, 1);
    } else {
      this.formData.complications.push(item);
    }
    this.onFieldChange();
  }

  isComplicationActive(item: string): boolean {
    return this.formData.complications.includes(item);
  }

  addIntervention(): void {
    if (!this.newIntervention.date || !this.newIntervention.type) return;
    this.formData.interventions.push({ ...this.newIntervention });
    this.newIntervention = this.getEmptyIntervention();
    this.showAddIntervention = false;
    this.onFieldChange();
  }

  removeIntervention(index: number): void {
    this.formData.interventions.splice(index, 1);
    this.onFieldChange();
  }

  onFieldChange(): void {
    this.updated.emit({
      ...this.formData,
      complications: [...this.formData.complications],
      needleSites: { ...this.formData.needleSites },
      interventions: this.formData.interventions.map(i => ({ ...i }))
    });
  }

  get isAVAccess(): boolean {
    return this.formData.accessType.startsWith('AVF') || this.formData.accessType.startsWith('AVG');
  }

  get isCatheter(): boolean {
    return this.formData.accessType.startsWith('DLC') || this.formData.accessType.startsWith('Perm');
  }
}
