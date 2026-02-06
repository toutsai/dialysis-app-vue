import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ConditionRecord {
  id?: string;
  date: string;
  preWeight: number | null;
  postWeight: number | null;
  preBP: string;
  postBP: string;
  ufGoal: number | null;
  accessFlow: number | null;
  ktv: number | null;
  notes: string;
  symptoms: string[];
}

@Component({
  selector: 'app-condition-record-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './condition-record-panel.component.html',
  styleUrl: './condition-record-panel.component.css'
})
export class ConditionRecordPanelComponent {
  @Input() patient: any = null;
  @Input() currentDate: string = '';
  @Output() saveRecord = new EventEmitter<ConditionRecord>();

  record: ConditionRecord = this.createEmptyRecord();

  commonSymptoms: string[] = [
    '低血壓', '噁心', '嘔吐', '頭痛', '肌肉痙攣',
    '胸痛', '搔癢', '發燒', '血管通路問題', '出血'
  ];

  get weightChange(): string {
    if (this.record.preWeight != null && this.record.postWeight != null) {
      const diff = this.record.postWeight - this.record.preWeight;
      return diff.toFixed(1);
    }
    return '-';
  }

  createEmptyRecord(): ConditionRecord {
    return {
      date: this.currentDate || '',
      preWeight: null,
      postWeight: null,
      preBP: '',
      postBP: '',
      ufGoal: null,
      accessFlow: null,
      ktv: null,
      notes: '',
      symptoms: []
    };
  }

  toggleSymptom(symptom: string): void {
    const idx = this.record.symptoms.indexOf(symptom);
    if (idx >= 0) {
      this.record.symptoms.splice(idx, 1);
    } else {
      this.record.symptoms.push(symptom);
    }
  }

  isSymptomActive(symptom: string): boolean {
    return this.record.symptoms.includes(symptom);
  }

  onSave(): void {
    this.record.date = this.currentDate;
    this.saveRecord.emit({ ...this.record, symptoms: [...this.record.symptoms] });
  }

  onReset(): void {
    this.record = this.createEmptyRecord();
  }
}
