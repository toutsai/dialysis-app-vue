import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-vascular-access-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vascular-access-form.component.html',
  styleUrl: './vascular-access-form.component.css'
})
export class VascularAccessFormComponent implements OnChanges {
  @Input() type = 'current';
  @Input() date = '';
  @Input() eventId = '';
  @Input() initialData: any = null;
  @Input() masterPatient: any = null;
  @Output() updated = new EventEmitter<any>();

  isSaving = false;
  localData: any = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialData'] || changes['masterPatient'] || changes['type']) {
      this.initData();
    }
  }

  private initData(): void {
    if (this.initialData && this.initialData[this.type]) {
      this.localData = JSON.parse(JSON.stringify(this.initialData[this.type]));
    } else if (this.masterPatient?.vascularAccessInfo?.[this.type]) {
      this.localData = JSON.parse(JSON.stringify(this.masterPatient.vascularAccessInfo[this.type]));
    } else {
      this.localData = {
        isAutoCap: false, autoCapSide: '', autoCapSite: '',
        isManuCap: false, manuCapSide: '', manuCapSite: '',
        isPermCath: false, permCathSide: '', permCathSite: '',
        isDoubleLumen: false, dlSide: '', dlSite: '',
      };
    }
  }

  get sectionTitle(): string {
    return this.type === 'current' ? '目前使用血管通路' : '其他未使用血管通路';
  }

  async saveData(): Promise<void> {
    this.isSaving = true;
    try {
      const currentCompleteData = this.initialData || {};
      const newData = { ...currentCompleteData, [this.type]: this.localData };
      // kiditService.updateEventKiDitData would be called here
      this.updated.emit(newData);
    } catch (error) {
      console.error('儲存血管通路資料失敗:', error);
      alert('儲存失敗，請稍後再試');
    } finally {
      this.isSaving = false;
    }
  }
}
